import { Hono } from 'hono';
import { rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSqliteDatabase } from './sqliteDatabase.mjs';
import { createImageStore } from './imageStore.mjs';
import { imagesRoutes } from './routes/images.mjs';

let tempDir;
let store;
let app;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'kitepop-image-routes-'));
  const database = await createSqliteDatabase({ dbPath: join(tempDir, 'blog.sqlite') });
  store = createImageStore({ database, imageDir: join(tempDir, 'images') });
  app = new Hono();
  app.use('*', async (c, next) => {
    c.set('imageStore', store);
    await next();
  });
  app.route('/api/images', imagesRoutes);
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe('image raw route', () => {
  it('serves stored image bytes through GET and headers only through HEAD', async () => {
    const image = await store.saveImage({
      originalName: 'cover.jpg',
      contentType: 'image/jpeg',
      buffer: Buffer.from('jpeg-bytes')
    });

    const getResponse = await app.request(`/api/images/raw/${image.id}`);
    expect(getResponse.status).toBe(200);
    expect(getResponse.headers.get('content-type')).toBe('image/jpeg');
    expect(getResponse.headers.get('content-length')).toBe('10');
    expect(await getResponse.text()).toBe('jpeg-bytes');

    const headResponse = await app.request(`/api/images/raw/${image.id}`, { method: 'HEAD' });
    expect(headResponse.status).toBe(200);
    expect(headResponse.headers.get('content-type')).toBe('image/jpeg');
    expect(headResponse.headers.get('content-length')).toBe('10');
    expect(await headResponse.text()).toBe('');
  });
});
