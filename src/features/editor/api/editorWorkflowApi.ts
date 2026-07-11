import { BlogPost, PostRevision, PostRevisionComparison } from '../../../lib/blog';

function headers(token: string, json = false): HeadersInit {
  return { ...(json ? { 'content-type': 'application/json' } : {}), Authorization: `Bearer ${token}` };
}

async function parse<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || '后台操作失败');
  return body as T;
}

const revisionBase = (postId: string) => `/api/admin/posts/${encodeURIComponent(postId)}/revisions`;

export async function listRevisions(postId: string, token: string) {
  const payload = await parse<{ revisions?: PostRevision[] }>(await fetch(revisionBase(postId), { headers: headers(token) }));
  return Array.isArray(payload.revisions) ? payload.revisions : [];
}

export async function compareRevision(postId: string, revisionId: string, token: string) {
  return parse<PostRevisionComparison>(await fetch(`${revisionBase(postId)}/${encodeURIComponent(revisionId)}/compare`, { headers: headers(token) }));
}

export async function restoreRevision(postId: string, revisionId: string, token: string) {
  return (await parse<{ post: BlogPost }>(await fetch(`${revisionBase(postId)}/${encodeURIComponent(revisionId)}/restore`, {
    method: 'POST', headers: headers(token)
  }))).post;
}

export async function deleteRevision(postId: string, revisionId: string, token: string) {
  await parse(await fetch(`${revisionBase(postId)}/${encodeURIComponent(revisionId)}`, { method: 'DELETE', headers: headers(token) }));
}

export async function schedulePost(postId: string, scheduledAt: string, token: string) {
  return (await parse<{ post: BlogPost }>(await fetch(`/api/admin/posts/${encodeURIComponent(postId)}/schedule`, {
    method: 'PUT', headers: headers(token, true), body: JSON.stringify({ scheduledAt })
  }))).post;
}

export async function cancelSchedule(postId: string, token: string) {
  return (await parse<{ post: BlogPost }>(await fetch(`/api/admin/posts/${encodeURIComponent(postId)}/schedule`, {
    method: 'DELETE', headers: headers(token)
  }))).post;
}

export async function retrySchedule(postId: string, token: string) {
  return (await parse<{ post: BlogPost }>(await fetch(`/api/admin/posts/${encodeURIComponent(postId)}/schedule/retry`, {
    method: 'POST', headers: headers(token)
  }))).post;
}
