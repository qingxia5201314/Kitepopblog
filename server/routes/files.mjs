import { Hono } from 'hono';
import { readFile } from 'node:fs/promises';
import { isAdmin } from '../middleware/auth.mjs';
import { createRawFileHeaders } from '../fileDownloadHeaders.mjs';
import { parseMultipartFile } from '../utils/multipart.mjs';

const app = new Hono();

function publicFolder(folder) {
  return folder ? {
    id: folder.id,
    name: folder.name,
    parentId: folder.parentId,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt
  } : null;
}

function publicFile(file) {
  return {
    id: file.id,
    originalName: file.originalName,
    contentType: file.contentType,
    sizeBytes: file.sizeBytes,
    uploadedAt: file.uploadedAt,
    folderId: file.folderId || ''
  };
}

function publicFolderView(view) {
  return {
    folder: publicFolder(view.folder),
    breadcrumbs: view.breadcrumbs.map(publicFolder),
    folders: view.folders.map(publicFolder),
    files: view.files.map(publicFile)
  };
}

// Public: raw file download with token
app.get('/raw/:id', async (c) => {
  const fileStore = c.get('fileStore');
  const id = c.req.param('id');
  const token = c.req.query('token') || '';
  const file = fileStore.getFileForToken(id, token);

  if (!file) {
    return c.json({ ok: false, message: 'File not found' }, 404);
  }

  const headers = createRawFileHeaders(file);
  const buffer = await readFile(file.filePath);

  return new Response(buffer, {
    headers: new Headers(headers)
  });
});

// Admin only routes
app.get('/', (c) => {
  if (!isAdmin(c)) {
    return c.json({ ok: false, message: 'Unauthorized' }, 401);
  }

  const fileStore = c.get('fileStore');
  const folderId = c.req.query('folderId') || '';

  try {
    return c.json(publicFolderView(fileStore.listFolder(folderId)));
  } catch (error) {
    return c.json({ ok: false, message: error instanceof Error ? error.message : 'Folder not found' }, 404);
  }
});

app.post('/', async (c) => {
  if (!isAdmin(c)) {
    return c.json({ ok: false, message: 'Unauthorized' }, 401);
  }

  const fileStore = c.get('fileStore');
  const fileUploadLimitBytes = Number(process.env.FILE_UPLOAD_LIMIT || 50 * 1024 * 1024);

  try {
    const buffer = await c.req.arrayBuffer();

    // Check size limit
    if (fileUploadLimitBytes > 0 && buffer.byteLength > fileUploadLimitBytes) {
      return c.json({ ok: false, message: 'Request body too large' }, 413);
    }

    const contentType = c.req.header('content-type') || '';
    const upload = parseMultipartFile(Buffer.from(buffer), contentType);
    const file = await fileStore.saveFile(upload);
    return c.json({ file: publicFile(file) }, 201);
  } catch (error) {
    return c.json({ ok: false, message: error instanceof Error ? error.message : 'Upload failed' }, 400);
  }
});

app.post('/:id/link', (c) => {
  if (!isAdmin(c)) {
    return c.json({ ok: false, message: 'Unauthorized' }, 401);
  }

  const fileStore = c.get('fileStore');
  const id = c.req.param('id');
  const link = fileStore.createAccessLink(id);
  return c.json(link ? { link } : { ok: false, message: 'File not found' }, link ? 200 : 404);
});

app.delete('/:id', async (c) => {
  if (!isAdmin(c)) {
    return c.json({ ok: false, message: 'Unauthorized' }, 401);
  }

  const fileStore = c.get('fileStore');
  const id = c.req.param('id');
  const removed = await fileStore.removeFile(id);
  return c.json(removed ? { ok: true } : { ok: false, message: 'File not found' }, removed ? 200 : 404);
});

export const filesRoutes = app;
