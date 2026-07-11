import { useCallback, useEffect, useState } from 'react';
import { PostRevision, PostRevisionComparison } from '../../../lib/blog';
import { compareRevision, deleteRevision, listRevisions, restoreRevision } from '../api/editorWorkflowApi';

export function useRevisionHistory(postId: string | null, token: string) {
  const [revisions, setRevisions] = useState<PostRevision[]>([]);
  const [comparison, setComparison] = useState<PostRevisionComparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    if (!postId || !token) return setRevisions([]);
    setLoading(true); setError('');
    try { setRevisions(await listRevisions(postId, token)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '版本加载失败'); }
    finally { setLoading(false); }
  }, [postId, token]);

  useEffect(() => { void reload(); }, [reload]);

  return {
    revisions, comparison, loading, error, reload,
    compare: async (revisionId: string) => setComparison(await compareRevision(postId!, revisionId, token)),
    restore: (revisionId: string) => restoreRevision(postId!, revisionId, token),
    remove: async (revisionId: string) => { await deleteRevision(postId!, revisionId, token); await reload(); },
    closeComparison: () => setComparison(null)
  };
}
