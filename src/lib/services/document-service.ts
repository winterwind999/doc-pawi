import { Directory, File, Paths } from 'expo-file-system';

import { buildExtractionMessages } from '../ai/prompts';
import { checkGrounding, EXTRACTION_JSON_SCHEMA, extractionToProposal, parseExtraction } from '../ai/extraction';
import type { CompletionRequest, CompletionResult } from '../ai/llm-types';
import type { DocumentMimeType, MedicalDocumentRow } from '../db/models';
import {
  deleteDocumentRow,
  getDocument,
  insertDocument,
  saveDocumentSummary,
  saveExtractedText,
  setDocumentStatus,
} from '../db/repositories/documents';
import { deletePendingDocumentProposals, insertProposal } from '../db/repositories/proposals';
import type { Db } from '../db/types';
import { newId } from '../ids';
import { DocPawiNative, toNativePath } from '../native';
import { vaultKeyAlias } from '../security/profile-registry';

export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
export const MAX_PDF_PAGES = 5;

const EXTENSION_MIME: Record<string, DocumentMimeType> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

export const SUPPORTED_DOCUMENT_TYPES = Object.values(EXTENSION_MIME);

export function resolveMimeType(name: string | null | undefined, mime: string | null | undefined): DocumentMimeType | null {
  const normalized = mime?.toLowerCase().split(';')[0].trim();
  if (normalized && (SUPPORTED_DOCUMENT_TYPES as string[]).includes(normalized)) return normalized as DocumentMimeType;
  if (normalized === 'image/jpg') return 'image/jpeg';
  const ext = name?.split('.').pop()?.toLowerCase();
  return ext ? (EXTENSION_MIME[ext] ?? null) : null;
}

export class UnsupportedDocumentError extends Error {}

export function vaultDirectory(profileId: string) {
  return new Directory(Paths.document, 'vault', profileId);
}

function isInsideCache(uri: string) {
  return uri.startsWith(Paths.cache.uri);
}

export interface ImportSource {
  uri: string;
  name: string;
  mimeType?: string | null;
  size?: number | null;
}

/**
 * Encrypts the selected file into the profile's vault and records it. When the picker left a
 * plaintext copy in the app cache, that copy is deleted after encryption.
 */
export async function importDocument(
  db: Db,
  profileId: string,
  source: ImportSource,
  sourceType: 'user' | 'demo' = 'user',
): Promise<MedicalDocumentRow> {
  const mimeType = resolveMimeType(source.name, source.mimeType);
  if (!mimeType) {
    throw new UnsupportedDocumentError('Unsupported file type. Doc Pawi supports JPEG, PNG, and WebP images and PDF files.');
  }
  if (source.size && source.size > MAX_DOCUMENT_BYTES) {
    throw new UnsupportedDocumentError('This file is larger than the 25 MB limit.');
  }
  const id = newId();
  const dir = vaultDirectory(profileId);
  dir.create({ intermediates: true, idempotent: true });
  const target = new File(dir, `${id}.dpv`);
  const targetPath = toNativePath(target.uri);
  const { size, sha256 } = await DocPawiNative.encryptToVault(source.uri, targetPath, vaultKeyAlias(profileId));
  try {
    const doc = await insertDocument(db, {
      id,
      profileId,
      displayName: source.name,
      mimeType,
      privateFilePath: targetPath,
      fileSize: size,
      sha256,
      sourceType,
    });
    return doc!;
  } catch (error) {
    if (target.exists) target.delete();
    throw error;
  } finally {
    if (sourceType === 'user' && isInsideCache(source.uri)) {
      try {
        const plaintext = new File(source.uri);
        if (plaintext.exists) plaintext.delete();
      } catch {
        // Cache cleanup is best-effort; Android also clears the cache under storage pressure.
      }
    }
  }
}

/** Step 1: on-device OCR. */
export async function extractDocumentText(db: Db, profileId: string, documentId: string) {
  const doc = await getDocument(db, documentId);
  if (!doc) throw new Error('Document not found.');
  await setDocumentStatus(db, documentId, 'extracting_text');
  try {
    const result = await DocPawiNative.recognizeText(doc.private_file_path, doc.mime_type, vaultKeyAlias(profileId), MAX_PDF_PAGES);
    const text = result.text.trim();
    if (!text) {
      await setDocumentStatus(
        db,
        documentId,
        'failed',
        'No readable text was found. Try a sharper, well-lit photo with the page filling the frame.',
      );
      return null;
    }
    const note = result.truncated ? `\n\n[Only the first ${result.pages.length} of ${result.pageCount} pages were processed.]` : '';
    await saveExtractedText(db, documentId, { text: text + note, engine: result.engine, pageCount: result.pageCount });
    return text;
  } catch (error) {
    await setDocumentStatus(db, documentId, 'failed', `Text recognition failed: ${(error as Error).message}`);
    throw error;
  }
}

export type CompleteFn = (request: CompletionRequest) => Promise<CompletionResult>;

/** Step 2: local LLM summary + field extraction → validated, grounded proposal awaiting review. */
export async function analyzeDocument(
  db: Db,
  args: { profileId: string; documentId: string; complete: CompleteFn; modelMetadata: object },
) {
  const doc = await getDocument(db, args.documentId);
  if (!doc?.extracted_text) throw new Error('Extract the text before analyzing the document.');
  await setDocumentStatus(db, doc.id, 'analyzing');
  let result: CompletionResult;
  try {
    result = await args.complete({
      messages: buildExtractionMessages(doc.extracted_text),
      maxTokens: 900,
      temperature: 0.1,
      jsonSchema: EXTRACTION_JSON_SCHEMA,
    });
  } catch (error) {
    await setDocumentStatus(db, doc.id, 'text_extracted', `AI analysis did not finish: ${(error as Error).message}`);
    throw error;
  }
  const extraction = parseExtraction(result.text);
  if (!extraction) {
    await setDocumentStatus(
      db,
      doc.id,
      'text_extracted',
      'The local model returned output that could not be validated. Retry the analysis or add the record manually.',
    );
    return null;
  }
  const grounding = checkGrounding(extraction, doc.extracted_text);
  const payload = extractionToProposal(extraction, grounding, doc.display_name);
  await db.transaction(async (tx) => {
    await deletePendingDocumentProposals(tx, doc.id);
    await insertProposal(tx, {
      profileId: args.profileId,
      origin: 'document',
      proposalType: 'medical_record',
      payload: { ...payload, model: { ...args.modelMetadata, timings: result.timings } },
      documentId: doc.id,
    });
    await saveDocumentSummary(tx, doc.id, extraction.summary || 'No summary was generated.');
  });
  return { extraction, grounding, payload };
}

/** Deletes the document row (records keep their data, unlinked) and then its encrypted file. */
export async function deleteDocument(db: Db, documentId: string) {
  const doc = await getDocument(db, documentId);
  if (!doc) return;
  await db.transaction((tx) => deleteDocumentRow(tx, documentId));
  try {
    const file = new File(`file://${doc.private_file_path}`);
    if (file.exists) file.delete();
  } catch {
    // The row is gone; an orphaned ciphertext file is unreadable without the row and is removed with the vault.
  }
}

/** Decrypts a document into the private cache for in-app viewing. Callers delete it afterwards. */
export async function decryptForViewing(profileId: string, doc: MedicalDocumentRow) {
  const ext = doc.mime_type === 'application/pdf' ? 'pdf' : doc.mime_type.split('/')[1];
  const dir = new Directory(Paths.cache, 'view');
  dir.create({ intermediates: true, idempotent: true });
  const out = new File(dir, `${doc.id}.${ext}`);
  await DocPawiNative.decryptFromVault(doc.private_file_path, toNativePath(out.uri), vaultKeyAlias(profileId));
  return out;
}

export function clearViewCache() {
  try {
    const dir = new Directory(Paths.cache, 'view');
    if (dir.exists) dir.delete();
  } catch {
    // best-effort
  }
}
