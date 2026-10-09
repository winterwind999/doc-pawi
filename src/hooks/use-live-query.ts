import { useEffect, useState } from 'react';

import type { Db } from '@/lib/db/types';
import { useSession } from '@/stores/session-store';

export interface LiveQuery<T> {
  data: T | undefined;
  error: Error | null;
  loading: boolean;
  refresh: () => void;
}

/**
 * Runs a read-only query against the unlocked profile database and re-runs it whenever any
 * committed write bumps the session's data version (see createDb `onWrite`), or `deps` change.
 */
export function useLiveQuery<T>(
  query: (db: Db, profileId: string) => Promise<T>,
  deps: readonly unknown[] = [],
): LiveQuery<T> {
  const db = useSession((s) => s.db);
  const profileId = useSession((s) => s.activeProfileId);
  const version = useSession((s) => s.dataVersion);
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<{ data: T | undefined; error: Error | null; loading: boolean }>({
    data: undefined,
    error: null,
    loading: true,
  });

  useEffect(() => {
    if (!db || !profileId) return;
    let cancelled = false;
    query(db, profileId).then(
      (data) => {
        if (!cancelled) setState({ data, error: null, loading: false });
      },
      (error: Error) => {
        if (!cancelled) setState((s) => ({ ...s, error, loading: false }));
      },
    );
    return () => {
      cancelled = true;
    };
    // `query` is intentionally excluded: callers pass the values it closes over in `deps`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, profileId, version, nonce, ...deps]);

  return { ...state, refresh: () => setNonce((n) => n + 1) };
}
