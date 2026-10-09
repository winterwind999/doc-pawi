import type { DbExecutor } from '../types';

export interface ActivitySummary {
  records: number;
  documents: number;
  conversations: number;
  activeMedications: number;
  ongoingTreatments: number;
  dosesTakenLast7Days: number;
  dosesSkippedLast7Days: number;
  pendingProposals: number;
  doctors: number;
  hmos: number;
  demoRows: number;
}

/** Counts used by Home. `sinceLocal` is the local `YYYY-MM-DDT00:00` lower bound for dose stats. */
export async function getActivitySummary(db: DbExecutor, profileId: string, sinceLocal: string) {
  const row = await db.get<ActivitySummary>(
    `SELECT
       (SELECT COUNT(*) FROM medical_records WHERE profile_id = ?1) AS records,
       (SELECT COUNT(*) FROM medical_documents WHERE profile_id = ?1) AS documents,
       (SELECT COUNT(*) FROM conversations WHERE profile_id = ?1) AS conversations,
       (SELECT COUNT(*) FROM medications WHERE profile_id = ?1 AND status = 'active') AS activeMedications,
       (SELECT COUNT(*) FROM treatments WHERE profile_id = ?1 AND status = 'ongoing') AS ongoingTreatments,
       (SELECT COUNT(*) FROM dose_events WHERE profile_id = ?1 AND status = 'taken' AND scheduled_for >= ?2) AS dosesTakenLast7Days,
       (SELECT COUNT(*) FROM dose_events WHERE profile_id = ?1 AND status = 'skipped' AND scheduled_for >= ?2) AS dosesSkippedLast7Days,
       (SELECT COUNT(*) FROM record_proposals WHERE profile_id = ?1 AND status = 'pending') AS pendingProposals,
       (SELECT COUNT(*) FROM doctors WHERE profile_id = ?1) AS doctors,
       (SELECT COUNT(*) FROM hmos WHERE profile_id = ?1) AS hmos,
       ((SELECT COUNT(*) FROM medical_records WHERE profile_id = ?1 AND source_type = 'demo')
        + (SELECT COUNT(*) FROM treatments WHERE profile_id = ?1 AND source_type = 'demo')
        + (SELECT COUNT(*) FROM medications WHERE profile_id = ?1 AND source_type = 'demo')
        + (SELECT COUNT(*) FROM doctors WHERE profile_id = ?1 AND source_type = 'demo')
        + (SELECT COUNT(*) FROM hmos WHERE profile_id = ?1 AND source_type = 'demo')) AS demoRows`,
    [profileId, sinceLocal],
  );
  return row!;
}
