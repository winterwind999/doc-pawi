import { z } from 'zod';

import { todayLocal } from '../dates';
import {
  EVENT_TYPES,
  RECORD_CATEGORIES,
  TREATMENT_KINDS,
  TREATMENT_STATUSES,
  type RecordProposalRow,
} from '../db/models';
import { setDocumentStatus } from '../db/repositories/documents';
import { getProposal, listProposalsForDocument, resolveProposal } from '../db/repositories/proposals';
import { insertRecord } from '../db/repositories/records';
import { findTreatmentByTitle, getTreatment, insertEvent, insertTreatment } from '../db/repositories/treatments';
import type { Db, DbExecutor } from '../db/types';
import { parseJson } from '../json';
import { recordInputSchema, treatmentEventInputSchema, treatmentInputSchema } from '../validation/schemas';

/**
 * Proposal payloads are what the AI (chat tools or document extraction) suggests and what the
 * user edits on a proposal card. They are validated again with the domain schemas at confirm time.
 */
const nullableString = z.string().nullish().transform((v) => v ?? null);

export const recordProposalPayloadSchema = z.object({
  kind: z.literal('medical_record'),
  record: z.object({
    category: z.enum(RECORD_CATEGORIES),
    title: z.string(),
    event_date: nullableString,
    summary: nullableString,
    facility: nullableString,
    structured_data: z.record(z.string(), z.unknown()).default({}),
  }),
  /** Field names the AI could not ground in the source text (shown as "verify"). */
  unverified_fields: z.array(z.string()).default([]),
  /** Validation notes produced when the model's values were corrected or removed. */
  warnings: z.array(z.string()).default([]),
});

export const eventProposalPayloadSchema = z.object({
  kind: z.literal('treatment_event'),
  treatment: z.object({
    title: z.string(),
    kind: z.enum(TREATMENT_KINDS),
    existing_treatment_id: nullableString,
    new_status: z.enum(TREATMENT_STATUSES).optional(),
  }),
  event: z.object({
    title: z.string(),
    event_type: z.enum(EVENT_TYPES),
    status: z.enum(['completed', 'scheduled']),
    scheduled_date: nullableString,
    completed_date: nullableString,
    facility: nullableString,
    notes: nullableString,
  }),
  unverified_fields: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
});

export const proposalPayloadSchema = z.discriminatedUnion('kind', [
  recordProposalPayloadSchema,
  eventProposalPayloadSchema,
]);
export type ProposalPayload = z.output<typeof proposalPayloadSchema>;
export type RecordProposalPayload = z.output<typeof recordProposalPayloadSchema>;
export type EventProposalPayload = z.output<typeof eventProposalPayloadSchema>;

export function readProposalPayload(row: RecordProposalRow): ProposalPayload | null {
  const parsed = proposalPayloadSchema.safeParse(parseJson<unknown>(row.payload, null));
  return parsed.success ? parsed.data : null;
}

export class ProposalAlreadyResolvedError extends Error {
  constructor() {
    super('This suggestion was already confirmed or rejected.');
  }
}

export type ConfirmResult =
  | { type: 'medical_record'; id: string }
  | { type: 'treatment_event'; id: string; treatmentId: string; createdTreatment: boolean };

/**
 * Confirms a pending proposal: validates the (possibly user-edited) payload with the domain
 * schemas, writes the record or event, and marks the proposal confirmed — all in one transaction.
 * Throws a ZodError for invalid input (nothing is written).
 */
export async function confirmProposal(
  db: Db,
  args: { profileId: string; proposalId: string; editedPayload?: unknown },
): Promise<ConfirmResult> {
  const proposal = await getProposal(db, args.proposalId);
  if (!proposal || proposal.status !== 'pending') throw new ProposalAlreadyResolvedError();
  const payload = proposalPayloadSchema.parse(
    args.editedPayload ?? parseJson<unknown>(proposal.payload, null),
  );
  const sourceType = proposal.origin === 'document' ? 'document' : 'ai_chat';

  if (payload.kind === 'medical_record') {
    const input = recordInputSchema.parse(payload.record);
    return db.transaction(async (tx) => {
      const record = await insertRecord(tx, {
        profileId: args.profileId,
        input,
        sourceType,
        documentId: proposal.document_id,
      });
      if (
        !(await resolveProposal(tx, proposal.id, {
          status: 'confirmed',
          payload,
          resultType: 'medical_record',
          resultId: record.id,
        }))
      ) {
        throw new ProposalAlreadyResolvedError();
      }
      if (proposal.document_id) await setDocumentStatus(tx, proposal.document_id, 'confirmed');
      return { type: 'medical_record', id: record.id };
    });
  }

  // Validate the event before touching the database; the treatment id is resolved inside the transaction.
  const eventInput = treatmentEventInputSchema.parse({
    ...payload.event,
    treatment_id: payload.treatment.existing_treatment_id || 'pending',
  });
  const today = todayLocal();
  const treatmentInput = treatmentInputSchema.parse({
    title: payload.treatment.title,
    kind: payload.treatment.kind,
    status:
      payload.treatment.new_status ?? (payload.event.status === 'scheduled' ? 'planned' : 'completed'),
    start_date: eventInput.completed_date ?? eventInput.scheduled_date ?? today,
    facility: eventInput.facility,
  });

  return db.transaction(async (tx) => {
    const { treatmentId, created } = await resolveTreatment(tx, args.profileId, payload, treatmentInput, sourceType);
    const event = await insertEvent(tx, {
      profileId: args.profileId,
      input: { ...eventInput, treatment_id: treatmentId },
      sourceType,
    });
    if (
      !(await resolveProposal(tx, proposal.id, {
        status: 'confirmed',
        payload,
        resultType: 'treatment_event',
        resultId: event.id,
      }))
    ) {
      throw new ProposalAlreadyResolvedError();
    }
    if (proposal.document_id) await setDocumentStatus(tx, proposal.document_id, 'confirmed');
    return { type: 'treatment_event', id: event.id, treatmentId, createdTreatment: created };
  });
}

async function resolveTreatment(
  tx: DbExecutor,
  profileId: string,
  payload: EventProposalPayload,
  treatmentInput: z.output<typeof treatmentInputSchema>,
  sourceType: 'document' | 'ai_chat',
) {
  if (payload.treatment.existing_treatment_id) {
    const existing = await getTreatment(tx, payload.treatment.existing_treatment_id);
    if (existing && existing.profile_id === profileId) return { treatmentId: existing.id, created: false };
  }
  const byTitle = await findTreatmentByTitle(tx, profileId, payload.treatment.title);
  if (byTitle) return { treatmentId: byTitle.id, created: false };
  const created = await insertTreatment(tx, { profileId, input: treatmentInput, sourceType });
  return { treatmentId: created.id, created: true };
}

/** Rejects a pending proposal. Nothing is written to records. */
export async function rejectProposal(db: Db, proposalId: string) {
  return db.transaction(async (tx) => {
    const proposal = await getProposal(tx, proposalId);
    if (!proposal || proposal.status !== 'pending') throw new ProposalAlreadyResolvedError();
    await resolveProposal(tx, proposalId, { status: 'rejected' });
    if (proposal.document_id) {
      const siblings = await listProposalsForDocument(tx, proposal.document_id);
      if (siblings.every((p) => p.status === 'rejected')) {
        await setDocumentStatus(tx, proposal.document_id, 'rejected');
      }
    }
  });
}
