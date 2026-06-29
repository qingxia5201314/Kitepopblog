import { Hono } from 'hono';
import { rm, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSqliteDatabase } from './sqliteDatabase.mjs';
import { createFileStore } from './fileStore.mjs';
import { createFileService } from './services/fileService.mjs';
import { filesRoutes } from './routes/files.mjs';

let tempDir;
let store;
let app;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'kitepop-file-range-'));
  const database = await createSqliteDatabase({ dbPath: join(tempDir, 'blog.sqlite') });
  store = createFileStore({ database, uploadDir: join(tempDir, 'uploads') });
  const fileService = createFileService({ fileStore: store });
  app = new Hono();
  app.use('*', async (c, next) => {
    c.set('fileService', fileService);
    await next();
  });
  app.route('/api/files', filesRoutes);
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe('file raw route range responses', () => {
  it('serves partial content when a range header is provided', async () => {
    const file = await store.saveFile({
      originalName: 'lesson.mp4',
      contentType: 'video/mp4',
      buffer: Buffer.from('0123456789')
    });
    await writeFile(file.filePath, Buffer.from('0123456789'));
    const link = store.createAccessLink(file.id);

    const response = await app.request(`/api/files/raw/${file.id}?token=${link.token}`, {
      headers: { Range: 'bytes=2-5' }
    });

    expect(response.status).toBe(206);
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(response.headers.get('content-range')).toBe('bytes 2-5/10');
    expect(await response.text()).toBe('2345');
  });
});
