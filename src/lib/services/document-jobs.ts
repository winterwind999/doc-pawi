import { create } from 'zustand';

import { currentModelMetadata, useModelStore } from '@/stores/model-store';

import type { Db } from '../db/types';
import { analyzeDocument, extractDocumentText } from './document-service';

/**
 * Runs the document pipeline outside any screen so it continues while the user navigates.
 * Progress is persisted in `medical_documents.processing_status`; this store only tracks which
 * documents have a job in flight and its start time (for elapsed-time display).
 */
interface DocumentJobs {
  running: Record<string, { step: 'ocr' | 'ai'; startedAt: number }>;
  lastError: Record<string, string | undefined>;
}

export const useDocumentJobs = create<DocumentJobs>()(() => ({ running: {}, lastError: {} }));

function setRunning(documentId: string, step: 'ocr' | 'ai' | null) {
  useDocumentJobs.setState((s) => {
    const running = { ...s.running };
    if (step) running[documentId] = { step, startedAt: Date.now() };
    else delete running[documentId];
    return { running };
  });
}

function setError(documentId: string, message: string | undefined) {
  useDocumentJobs.setState((s) => ({ lastError: { ...s.lastError, [documentId]: message } }));
}

export async function runOcr(db: Db, profileId: string, documentId: string) {
  if (useDocumentJobs.getState().running[documentId]) return null;
  setError(documentId, undefined);
  setRunning(documentId, 'ocr');
  try {
    return await extractDocumentText(db, profileId, documentId);
  } catch (e) {
    setError(documentId, (e as Error).message);
    return null;
  } finally {
    setRunning(documentId, null);
  }
}

export async function runAnalysis(db: Db, profileId: string, documentId: string) {
  if (useDocumentJobs.getState().running[documentId]) return null;
  setError(documentId, undefined);
  setRunning(documentId, 'ai');
  try {
    return await analyzeDocument(db, {
      profileId,
      documentId,
      complete: (request) => useModelStore.getState().complete('document', request),
      modelMetadata: currentModelMetadata(),
    });
  } catch (e) {
    setError(documentId, (e as Error).message);
    return null;
  } finally {
    setRunning(documentId, null);
  }
}

/** OCR, then AI analysis when a verified model is available. */
export async function runFullPipeline(db: Db, profileId: string, documentId: string) {
  const text = await runOcr(db, profileId, documentId);
  if (!text) return;
  const models = useModelStore.getState();
  if (models.files[models.selectedModelId]?.verified) {
    await runAnalysis(db, profileId, documentId);
  }
}
