import { Hono } from 'hono';
import { verifyAdminPassword } from '../auth.mjs';
import { isAdmin, requireAdmin } from '../middleware/auth.mjs';

const app = new Hono();

app.post('/login', async (c) => {
  const adminPassword = c.get('adminPassword');

  if (!adminPassword) {
    return c.json({ ok: false, message: '服务端未配置 ADMIN_PASSWORD' }, 503);
  }

  try {
    const body = await c.req.json();
    const ok = verifyAdminPassword(String(body.password || ''), adminPassword);
    if (!ok) {
      return c.json({ ok }, 401);
    }
    const sessions = c.get('sessions');
    const session = sessions.issue();
    return c.json(typeof session === 'string' ? { ok, token: session } : { ok, ...session });
  } catch {
    return c.json({ ok: false, message: 'Invalid request body' }, 400);
  }
});

app.get('/session', (c) => {
  const sessions = c.get('sessions');
  const token = c.req.header('Authorization') || '';
  const ok = sessions.verify(token);
  return c.json({ ok }, ok ? 200 : 401);
});

// User CRUD (admin only)
app.get('/users', requireAdmin, (c) => {
  const userStore = c.get('userStore');
  return c.json({ users: userStore.listUsers() });
});

app.post('/users', requireAdmin, async (c) => {
  const userStore = c.get('userStore');
  try {
    const body = await c.req.json();
    return c.json({ user: userStore.createUser(body) }, 201);
  } catch (error) {
    return c.json({ ok: false, message: error?.message || 'User create failed' }, 400);
  }
});

app.put('/users/:id', requireAdmin, async (c) => {
  const userStore = c.get('userStore');
  const id = c.req.param('id');
  try {
    const body = await c.req.json();
    const user = userStore.updateUser(id, body);
    return c.json(user ? { user } : { ok: false, message: 'User not found' }, user ? 200 : 404);
  } catch (error) {
    return c.json({ ok: false, message: error?.message || 'User update failed' }, 400);
  }
});

app.delete('/users/:id', requireAdmin, (c) => {
  const userStore = c.get('userStore');
  const id = c.req.param('id');
  const removed = userStore.removeUser(id);
  return c.json(removed ? { ok: true } : { ok: false, message: 'User not found' }, removed ? 200 : 404);
});

export const adminRoutes = app;
