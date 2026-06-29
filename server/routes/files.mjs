import { Hono } from 'hono';
import { createReadStream } from 'node:fs';
import { isAdmin } from '../middleware/auth.mjs';
import { createRawFileHeaders } from '../fileDownloadHeaders.mjs';
import { parseMultipartFile } from '../utils/multipart.mjs';

const app = new Hono();
export const DEFAULT_FILE_UPLOAD_LIMIT_BYTES = 0;

export function getFileUploadLimitBytes(env = process.env) {
  return Number(env.FILE_UPLOAD_LIMIT || DEFAULT_FILE_UPLOAD_LIMIT_BYTES);
}

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
app.get('/raw/:id', (c) => {
  const fileService = c.get('fileService');
  const id = c.req.param('id');
  const token = c.req.query('token') || '';
  const file = fileService.getFileForToken(id, token);

  if (!file) {
    return c.json({ ok: false, message: 'File not found' }, 404);
  }

  const headers = createRawFileHeaders(file);
  const stream = createReadStream(file.filePath);

  return new Response(stream, {
    headers: new Headers(headers)
  });
});

// Admin only routes
app.get('/', (c) => {
  if (!isAdmin(c)) {
    return c.json({ ok: false, message: 'Unauthorized' }, 401);
  }

  const fileService = c.get('fileService');
  const folderId = c.req.query('folderId') || '';

  try {
    return c.json(publicFolderView(fileService.listFolder(folderId)));
  } catch (error) {
    return c.json({ ok: false, message: error instanceof Error ? error.message : 'Folder not found' }, 404);
  }
});

app.post('/', async (c) => {
  if (!isAdmin(c)) {
    return c.json({ ok: false, message: 'Unauthorized' }, 401);
  }

  const fileService = c.get('fileService');
  const fileUploadLimitBytes = getFileUploadLimitBytes();

  try {
    const buffer = await c.req.arrayBuffer();

    // Check size limit
    if (fileUploadLimitBytes > 0 && buffer.byteLength > fileUploadLimitBytes) {
      return c.json({ ok: false, message: 'Request body too large' }, 413);
    }

    const contentType = c.req.header('content-type') || '';
    const upload = parseMultipartFile(Buffer.from(buffer), contentType);
    const file = await fileService.saveFile(upload);
    return c.json({ file: publicFile(file) }, 201);
  } catch (error) {
    return c.json({ ok: false, message: error instanceof Error ? error.message : 'Upload failed' }, 400);
  }
});

app.post('/:id/link', (c) => {
  if (!isAdmin(c)) {
    return c.json({ ok: false, message: 'Unauthorized' }, 401);
  }

  const fileService = c.get('fileService');
  const id = c.req.param('id');
  const link = fileService.createAccessLink(id);
  return c.json(link ? { link } : { ok: false, message: 'File not found' }, link ? 200 : 404);
});

app.delete('/:id', async (c) => {
  if (!isAdmin(c)) {
    return c.json({ ok: false, message: 'Unauthorized' }, 401);
  }

  const fileService = c.get('fileService');
  const id = c.req.param('id');
  const removed = await fileService.removeFile(id);
  return c.json(removed ? { ok: true } : { ok: false, message: 'File not found' }, removed ? 200 : 404);
});

export const filesRoutes = app;
