import { Hono } from 'hono';

const app = new Hono();

app.get('/', (c) => {
  c.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  return c.json({ profile: c.get('aboutStore').get() });
});

export const aboutRoutes = app;
