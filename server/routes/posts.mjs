import { Hono } from 'hono';
import { isAdmin } from '../middleware/auth.mjs';

const app = new Hono();

app.get('/', (c) => {
  const store = c.get('store');
  const admin = isAdmin(c);
  const includeDrafts = c.req.query('includeDrafts') === '1' && admin;
  return c.json({ posts: store.list({ includeDrafts }) });
});

app.post('/', async (c) => {
  const store = c.get('store');
  if (!isAdmin(c)) {
    return c.json({ ok: false, message: 'Unauthorized' }, 401);
  }

  try {
    const body = await c.req.json();
    return c.json({ post: store.create(body) }, 201);
  } catch {
    return c.json({ ok: false, message: 'Invalid request body' }, 400);
  }
});

app.get('/:id', (c) => {
  const store = c.get('store');
  const id = c.req.param('id');
  // GET on individual post - this is handled via /:id/comments endpoint
  // If direct access is needed, add it here
  return c.json({ ok: false, message: 'Not found' }, 404);
});

app.put('/:id', async (c) => {
  const store = c.get('store');
  if (!isAdmin(c)) {
    return c.json({ ok: false, message: 'Unauthorized' }, 401);
  }

  const id = c.req.param('id');
  try {
    const body = await c.req.json();
    const post = store.update(id, body);
    return c.json(post ? { post } : { ok: false, message: 'Post not found' }, post ? 200 : 404);
  } catch {
    return c.json({ ok: false, message: 'Invalid request body' }, 400);
  }
});

app.delete('/:id', (c) => {
  const store = c.get('store');
  if (!isAdmin(c)) {
    return c.json({ ok: false, message: 'Unauthorized' }, 401);
  }

  const id = c.req.param('id');
  const removed = store.remove(id);
  return c.json(removed ? { ok: true } : { ok: false, message: 'Post not found' }, removed ? 200 : 404);
});

// Comments endpoints
app.get('/:postId/comments', (c) => {
  const store = c.get('store');
  const postId = c.req.param('postId');
  return c.json({ comments: store.listComments(postId) });
});

app.post('/:postId/comments', async (c) => {
  const store = c.get('store');
  const userStore = c.get('userStore');
  const postId = c.req.param('postId');
  const user = userStore.verify(c.req.header('Authorization') || '');
  if (!user) {
    return c.json({ ok: false, message: '请先登录后再评论' }, 401);
  }

  try {
    const body = await c.req.json();
    const comment = store.createComment(postId, body, user);
    return c.json(comment ? { comment } : { ok: false, message: 'Post not found' }, comment ? 201 : 404);
  } catch (error) {
    return c.json({ ok: false, message: error?.message || 'Invalid request body' }, 400);
  }
});

app.put('/:postId/comments/:commentId', async (c) => {
  const store = c.get('store');
  const userStore = c.get('userStore');
  const postId = c.req.param('postId');
  const commentId = c.req.param('commentId');
  const user = userStore.verify(c.req.header('Authorization') || '');
  if (!user) {
    return c.json({ ok: false, message: 'Unauthorized' }, 401);
  }

  try {
    const body = await c.req.json();
    const comment = store.updateComment(commentId, body, user);
    return c.json(comment ? { comment } : { ok: false, message: 'Forbidden' }, comment ? 200 : 403);
  } catch (error) {
    return c.json({ ok: false, message: error?.message || 'Invalid request body' }, 400);
  }
});

app.delete('/:postId/comments/:commentId', (c) => {
  const store = c.get('store');
  const userStore = c.get('userStore');
  const postId = c.req.param('postId');
  const commentId = c.req.param('commentId');
  const user = userStore.verify(c.req.header('Authorization') || '');
  if (!user) {
    return c.json({ ok: false, message: 'Unauthorized' }, 401);
  }

  const removed = store.removeComment(commentId, user);
  return c.json(removed ? { ok: true } : { ok: false, message: 'Forbidden' }, removed ? 200 : 403);
});

export const postsRoutes = app;
