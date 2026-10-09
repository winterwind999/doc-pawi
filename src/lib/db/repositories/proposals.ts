import { nowIso } from '../../dates';
import { newId } from '../../ids';
import type { ProposalStatus, ProposalType, RecordProposalRow } from '../models';
import type { DbExecutor } from '../types';

export async function insertProposal(
  db: DbExecutor,
  args: {
    profileId: string;
    origin: 'chat' | 'document';
    proposalType: ProposalType;
    payload: unknown;
    conversationId?: string | null;
    messageId?: string | null;
    documentId?: string | null;
  },
) {
  const row: RecordProposalRow = {
    id: newId(),
    profile_id: args.profileId,
    origin: args.origin,
    proposal_type: args.proposalType,
    conversation_id: args.conversationId ?? null,
    message_id: args.messageId ?? null,
    document_id: args.documentId ?? null,
    payload: JSON.stringify(args.payload),
    status: 'pending',
    result_entity_type: null,
    result_entity_id: null,
    created_at: nowIso(),
    resolved_at: null,
  };
  await db.run(
    `INSERT INTO record_proposals (id, profile_id, origin, proposal_type, conversation_id, message_id, document_id,
       payload, status, result_entity_type, result_entity_id, created_at, resolved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, ?, NULL)`,
    [
      row.id,
      row.profile_id,
      row.origin,
      row.proposal_type,
      row.conversation_id,
      row.message_id,
      row.document_id,
      row.payload,
      row.created_at,
    ],
  );
  return row;
}

export async function getProposal(db: DbExecutor, proposalId: string) {
  return db.get<RecordProposalRow>('SELECT * FROM record_proposals WHERE id = ?', [proposalId]);
}

export async function listProposalsForConversation(db: DbExecutor, conversationId: string) {
  return db.all<RecordProposalRow>(
    'SELECT * FROM record_proposals WHERE conversation_id = ? ORDER BY created_at',
    [conversationId],
  );
}

export async function listProposalsForDocument(db: DbExecutor, documentId: string) {
  return db.all<RecordProposalRow>(
    'SELECT * FROM record_proposals WHERE document_id = ? ORDER BY created_at',
    [documentId],
  );
}

export async function countPendingProposals(db: DbExecutor, profileId: string) {
  const row = await db.get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM record_proposals WHERE profile_id = ? AND status = 'pending'",
    [profileId],
  );
  return row?.n ?? 0;
}

/** Marks a pending proposal resolved. Returns false if it was already resolved (prevents double-saves). */
export async function resolveProposal(
  db: DbExecutor,
  proposalId: string,
  args: { status: Exclude<ProposalStatus, 'pending'>; payload?: unknown; resultType?: string; resultId?: string },
) {
  const result = await db.run(
    `UPDATE record_proposals SET status = ?, payload = COALESCE(?, payload), result_entity_type = ?,
       result_entity_id = ?, resolved_at = ? WHERE id = ? AND status = 'pending'`,
    [
      args.status,
      args.payload === undefined ? null : JSON.stringify(args.payload),
      args.resultType ?? null,
      args.resultId ?? null,
      nowIso(),
      proposalId,
    ],
  );
  return result.changes === 1;
}

/** Removes pending document proposals before re-running extraction. */
export async function deletePendingDocumentProposals(db: DbExecutor, documentId: string) {
  await db.run("DELETE FROM record_proposals WHERE document_id = ? AND status = 'pending'", [documentId]);
}
