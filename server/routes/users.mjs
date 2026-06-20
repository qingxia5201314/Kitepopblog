import { Hono } from 'hono';

const app = new Hono();

app.post('/register', async (c) => {
  const userStore = c.get('userStore');
  try {
    const body = await c.req.json();
    return c.json({ ok: true, ...userStore.register(body) }, 201);
  } catch (error) {
    return c.json({ ok: false, message: error?.message || '注册失败' }, 400);
  }
});

app.post('/login', async (c) => {
  const userStore = c.get('userStore');
  try {
    const body = await c.req.json();
    return c.json({ ok: true, ...userStore.login(body) });
  } catch (error) {
    return c.json({ ok: false, message: error?.message || '登录失败' }, 401);
  }
});

app.get('/me', (c) => {
  const userStore = c.get('userStore');
  const user = userStore.verify(c.req.header('Authorization') || '');
  return c.json(user ? { ok: true, user } : { ok: false, message: 'Unauthorized' }, user ? 200 : 401);
});

export const usersRoutes = app;
