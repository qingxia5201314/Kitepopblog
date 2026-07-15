import { Hono } from 'hono';
import { rm, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSqliteDatabase } from './sqliteDatabase.mjs';
import { createFileStore } from './fileStore.mjs';
import { createFileService } from './services/fileService.mjs';
import { filesRoutes } from './routes/files.mjs';
import { folderRoutes } from './routes/folders.mjs';

const reader = { id: 'reader-1', permission: 'reader' };
const admin = { id: 'admin-1', permission: 'admin' };

let tempDir;
let store;
let fileService;
let authSession;
let app;

beforeEach(async () => {
  authSession = null;
  tempDir = await mkdtemp(join(tmpdir(), 'kitepop-file-range-'));
  const database = await createSqliteDatabase({ dbPath: join(tempDir, 'blog.sqlite') });
  store = createFileStore({ database, uploadDir: join(tempDir, 'uploads') });
  fileService = createFileService({ fileStore: store });
  app = new Hono();
  app.use('*', async (c, next) => {
    c.set('authSession', authSession);
    c.set('fileStore', store);
    c.set('fileService', fileService);
    await next();
  });
  app.route('/api/files', filesRoutes);
  app.route('/api/file-folders', folderRoutes);
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

describe('file management authorization', () => {
  it('rejects anonymous and reader folder listings, then allows an administrator', async () => {
    expect((await app.request('/api/files')).status).toBe(401);

    authSession = { user: reader };
    expect((await app.request('/api/files')).status).toBe(403);

    authSession = { user: admin };
    const response = await app.request('/api/files');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ folders: [], files: [] });
  });

  it.each(['link', 'preview-link'])('keeps %s generation admin-only', async (linkType) => {
    const file = await store.saveFile({
      originalName: 'notes.txt',
      contentType: 'text/plain',
      buffer: Buffer.from('notes')
    });
    const path = `/api/files/${file.id}/${linkType}`;

    expect((await app.request(path, { method: 'POST' })).status).toBe(401);
    authSession = { user: reader };
    expect((await app.request(path, { method: 'POST' })).status).toBe(403);
    authSession = { user: admin };
    const response = await app.request(path, { method: 'POST' });
    expect(response.status).toBe(200);
    expect((await response.json()).link).toHaveProperty('token');
  });
});

describe('folder management authorization', () => {
  it('rejects anonymous and reader creates, then allows an administrator', async () => {
    const request = () => app.request('/api/file-folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Projects' })
    });

    expect((await request()).status).toBe(401);
    authSession = { user: reader };
    expect((await request()).status).toBe(403);
    authSession = { user: admin };
    const response = await request();
    expect(response.status).toBe(201);
    expect((await response.json()).folder).toMatchObject({ name: 'Projects' });
  });
});
