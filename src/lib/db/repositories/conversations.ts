import { nowIso } from '../../dates';
import { newId } from '../../ids';
import type { ConversationRow, MessageAttachmentRow, MessageRole, MessageRow, MessageStatus } from '../models';
import type { Db, DbExecutor } from '../types';

export interface ConversationListItem extends ConversationRow {
  message_count: number;
  last_message: string | null;
}

export async function listConversations(db: DbExecutor, profileId: string) {
  return db.all<ConversationListItem>(
    `SELECT c.*,
       (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count,
       (SELECT m.content FROM messages m WHERE m.conversation_id = c.id
          ORDER BY m.created_at DESC, m.rowid DESC LIMIT 1) AS last_message
     FROM conversations c
     WHERE c.profile_id = ?
     ORDER BY c.updated_at DESC`,
    [profileId],
  );
}

export async function getConversation(db: DbExecutor, conversationId: string) {
  return db.get<ConversationRow>('SELECT * FROM conversations WHERE id = ?', [conversationId]);
}

export async function createConversation(db: DbExecutor, profileId: string, title = 'New conversation') {
  const now = nowIso();
  const row: ConversationRow = { id: newId(), profile_id: profileId, title, created_at: now, updated_at: now };
  await db.run(
    'INSERT INTO conversations (id, profile_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [row.id, row.profile_id, row.title, row.created_at, row.updated_at],
  );
  return row;
}

export async function renameConversation(db: DbExecutor, conversationId: string, title: string) {
  await db.run('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?', [
    title.trim().slice(0, 80) || 'Conversation',
    nowIso(),
    conversationId,
  ]);
}

export async function touchConversation(db: DbExecutor, conversationId: string) {
  await db.run('UPDATE conversations SET updated_at = ? WHERE id = ?', [nowIso(), conversationId]);
}

/** Deletes a conversation; messages and its pending chat proposals cascade. Confirmed records remain. */
export async function deleteConversation(db: DbExecutor, conversationId: string) {
  await db.run('DELETE FROM conversations WHERE id = ?', [conversationId]);
}

export async function deleteAllConversations(db: Db, profileId: string) {
  return db.transaction(async (tx) => {
    const result = await tx.run('DELETE FROM conversations WHERE profile_id = ?', [profileId]);
    return result.changes;
  });
}

export async function listMessages(db: DbExecutor, conversationId: string) {
  return db.all<MessageRow>(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, rowid ASC',
    [conversationId],
  );
}

/** Attachments of every message in a conversation, in attachment order, with document names. */
export async function listMessageAttachments(db: DbExecutor, conversationId: string) {
  return db.all<MessageAttachmentRow>(
    `SELECT a.message_id, a.document_id, a.position, d.display_name
     FROM message_attachments a
     JOIN messages m ON m.id = a.message_id
     JOIN medical_documents d ON d.id = a.document_id
     WHERE m.conversation_id = ?
     ORDER BY a.message_id, a.position`,
    [conversationId],
  );
}

export async function insertMessage(
  db: DbExecutor,
  args: {
    conversationId: string;
    role: MessageRole;
    content: string;
    status?: MessageStatus;
    /** Processed documents attached to a user message, in the order the user picked them. */
    attachmentDocumentIds?: readonly string[];
    modelMetadata?: unknown;
  },
) {
  const row: MessageRow = {
    id: newId(),
    conversation_id: args.conversationId,
    role: args.role,
    content: args.content,
    status: args.status ?? 'complete',
    attachment_document_id: null,
    model_metadata: args.modelMetadata === undefined ? null : JSON.stringify(args.modelMetadata),
    created_at: nowIso(),
  };
  await db.run(
    `INSERT INTO messages (id, conversation_id, role, content, status, attachment_document_id, model_metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.conversation_id,
      row.role,
      row.content,
      row.status,
      row.attachment_document_id,
      row.model_metadata,
      row.created_at,
    ],
  );
  const attachments = [...new Set(args.attachmentDocumentIds ?? [])];
  for (const [position, documentId] of attachments.entries()) {
    await db.run('INSERT INTO message_attachments (message_id, document_id, position) VALUES (?, ?, ?)', [
      row.id,
      documentId,
      position,
    ]);
  }
  await touchConversation(db, args.conversationId);
  return row;
}

export async function updateMessage(
  db: DbExecutor,
  messageId: string,
  patch: { content: string; status: MessageStatus; modelMetadata?: unknown },
) {
  await db.run('UPDATE messages SET content = ?, status = ?, model_metadata = ? WHERE id = ?', [
    patch.content,
    patch.status,
    patch.modelMetadata === undefined ? null : JSON.stringify(patch.modelMetadata),
    messageId,
  ]);
}

/** Marks assistant messages left in `generating` (e.g. app killed mid-generation) as stopped. */
export async function recoverInterruptedMessages(db: DbExecutor) {
  await db.run(
    "UPDATE messages SET status = 'stopped' WHERE status = 'generating'",
  );
}
