import { nowIso } from '../../dates';
import type { DocumentMimeType, DocumentStatus, MedicalDocumentRow } from '../models';
import type { DbExecutor } from '../types';

export async function listDocuments(db: DbExecutor, profileId: string, limit = 200) {
  return db.all<MedicalDocumentRow>(
    'SELECT * FROM medical_documents WHERE profile_id = ? ORDER BY imported_at DESC LIMIT ?',
    [profileId, limit],
  );
}

export async function getDocument(db: DbExecutor, documentId: string) {
  return db.get<MedicalDocumentRow>('SELECT * FROM medical_documents WHERE id = ?', [documentId]);
}

export async function insertDocument(
  db: DbExecutor,
  args: {
    id: string;
    profileId: string;
    displayName: string;
    mimeType: DocumentMimeType;
    privateFilePath: string;
    fileSize: number;
    sha256: string;
    sourceType?: 'user' | 'demo';
  },
) {
  const now = nowIso();
  await db.run(
    `INSERT INTO medical_documents (id, profile_id, display_name, mime_type, private_file_path, file_size,
       sha256, encryption, imported_at, processing_status, source_type, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'aes-256-gcm', ?, 'imported', ?, ?, ?)`,
    [
      args.id,
      args.profileId,
      args.displayName.trim().slice(0, 160) || 'Document',
      args.mimeType,
      args.privateFilePath,
      args.fileSize,
      args.sha256,
      now,
      args.sourceType ?? 'user',
      now,
      now,
    ],
  );
  return getDocument(db, args.id);
}

export async function setDocumentStatus(
  db: DbExecutor,
  documentId: string,
  status: DocumentStatus,
  errorMessage: string | null = null,
) {
  await db.run(
    'UPDATE medical_documents SET processing_status = ?, error_message = ?, updated_at = ? WHERE id = ?',
    [status, errorMessage, nowIso(), documentId],
  );
}

export async function saveExtractedText(
  db: DbExecutor,
  documentId: string,
  args: { text: string; engine: string; pageCount: number },
) {
  await db.run(
    `UPDATE medical_documents SET extracted_text = ?, ocr_engine = ?, page_count = ?,
       processing_status = 'text_extracted', error_message = NULL, updated_at = ? WHERE id = ?`,
    [args.text, args.engine, args.pageCount, nowIso(), documentId],
  );
}

export async function saveDocumentSummary(db: DbExecutor, documentId: string, summary: string) {
  await db.run(
    `UPDATE medical_documents SET summary = ?, processing_status = 'ready_for_review', error_message = NULL,
       updated_at = ? WHERE id = ?`,
    [summary, nowIso(), documentId],
  );
}

export async function renameDocument(db: DbExecutor, documentId: string, name: string) {
  await db.run('UPDATE medical_documents SET display_name = ?, updated_at = ? WHERE id = ?', [
    name.trim().slice(0, 160) || 'Document',
    nowIso(),
    documentId,
  ]);
}

/**
 * Deletes the document row. Records created from it keep their data but lose the link
 * (`document_id` → NULL); pending proposals for it cascade. The caller deletes the encrypted file
 * after the transaction commits.
 */
export async function deleteDocumentRow(db: DbExecutor, documentId: string) {
  await db.run('DELETE FROM medical_documents WHERE id = ?', [documentId]);
}

/** Resets documents stuck in a processing state (e.g. the app was closed mid-run). */
export async function recoverInterruptedDocuments(db: DbExecutor) {
  await db.run(
    `UPDATE medical_documents SET processing_status = 'failed',
       error_message = 'Processing was interrupted. Tap Retry to process again.'
     WHERE processing_status IN ('extracting_text', 'analyzing')`,
  );
}
