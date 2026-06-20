import { Hono } from 'hono';
import { verifyAdminPassword } from '../auth.mjs';
import { requireAccounting, getAccountingAuth } from '../middleware/auth.mjs';

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
      return c.json({ ok: false, message: '记账口令不正确' }, 401);
    }
    const accountingSessions = c.get('accountingSessions');
    return c.json({ ok: true, ...accountingSessions.issue() });
  } catch {
    return c.json({ ok: false, message: 'Invalid request body' }, 400);
  }
});

app.get('/session', requireAccounting, (c) => {
  return c.json({ ok: true });
});

app.get('/month', requireAccounting, (c) => {
  const accountingStore = c.get('accountingStore');
  return c.json(accountingStore.getMonthData({
    month: c.req.query('month') || undefined,
    type: c.req.query('type') || 'all',
    category: c.req.query('category') || 'all'
  }));
});

app.post('/entries', requireAccounting, async (c) => {
  const accountingStore = c.get('accountingStore');
  try {
    const body = await c.req.json();
    return c.json({ entry: accountingStore.createEntry(body) }, 201);
  } catch (error) {
    return c.json({ ok: false, message: error instanceof Error ? error.message : 'Invalid request body' }, 400);
  }
});

app.put('/entries/:id', requireAccounting, async (c) => {
  const accountingStore = c.get('accountingStore');
  const id = c.req.param('id');
  try {
    const body = await c.req.json();
    const entry = accountingStore.updateEntry(id, body);
    return c.json(entry ? { entry } : { ok: false, message: 'Entry not found' }, entry ? 200 : 404);
  } catch (error) {
    return c.json({ ok: false, message: error instanceof Error ? error.message : 'Invalid request body' }, 400);
  }
});

app.delete('/entries/:id', requireAccounting, (c) => {
  const accountingStore = c.get('accountingStore');
  const id = c.req.param('id');
  const removed = accountingStore.removeEntry(id);
  return c.json(removed ? { ok: true } : { ok: false, message: 'Entry not found' }, removed ? 200 : 404);
});

app.post('/categories', requireAccounting, async (c) => {
  const accountingStore = c.get('accountingStore');
  try {
    const body = await c.req.json();
    return c.json({ category: accountingStore.createCategory(body) }, 201);
  } catch (error) {
    return c.json({ ok: false, message: error instanceof Error ? error.message : 'Invalid request body' }, 400);
  }
});

app.put('/categories/:id', requireAccounting, async (c) => {
  const accountingStore = c.get('accountingStore');
  const id = c.req.param('id');
  try {
    const body = await c.req.json();
    const category = accountingStore.updateCategory(id, body);
    return c.json(category ? { category } : { ok: false, message: 'Category not found' }, category ? 200 : 404);
  } catch (error) {
    return c.json({ ok: false, message: error instanceof Error ? error.message : 'Category update failed' }, 400);
  }
});

app.delete('/categories/:id', requireAccounting, (c) => {
  const accountingStore = c.get('accountingStore');
  const id = c.req.param('id');
  try {
    const removed = accountingStore.removeCategory(id);
    return c.json(removed ? { ok: true } : { ok: false, message: 'Category not found' }, removed ? 200 : 404);
  } catch (error) {
    return c.json({ ok: false, message: error instanceof Error ? error.message : 'Category delete failed' }, 400);
  }
});

app.put('/settings', requireAccounting, async (c) => {
  const accountingStore = c.get('accountingStore');
  try {
    const body = await c.req.json();
    accountingStore.updateSettings(body);
    return c.json(accountingStore.getMonthData({ month: body.month }));
  } catch (error) {
    return c.json({ ok: false, message: error instanceof Error ? error.message : 'Invalid request body' }, 400);
  }
});

export const accountingRoutes = app;
