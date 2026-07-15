import { Hono } from 'hono';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { requireAdmin } from '../middleware/auth.mjs';
import { createPartialContentHeaders, createRawFileHeaders } from '../fileDownloadHeaders.mjs';
import { parseMultipartFile } from '../utils/multipart.mjs';

const app = new Hono();
export const DEFAULT_FILE_UPLOAD_LIMIT_BYTES = 0;

export function getFileUploadLimitBytes(env = process.env) {
  return Number(env.FILE_UPLOAD_LIMIT || DEFAULT_FILE_UPLOAD_LIMIT_BYTES);
}

function parseRangeHeader(rangeHeader, fileSize) {
  if (!rangeHeader || !rangeHeader.startsWith('bytes=')) return null;

  const [rawStart, rawEnd] = rangeHeader.slice(6).split('-', 2);
  if (rawStart === '' && rawEnd === '') return null;

  if (rawStart === '') {
    const suffixLength = Number(rawEnd);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    const start = Math.max(fileSize - suffixLength, 0);
    return { start, end: Math.max(fileSize - 1, 0) };
  }

  const start = Number(rawStart);
  const end = rawEnd ? Number(rawEnd) : fileSize - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start < 0 || end < start || start >= fileSize) return null;

  return { start, end: Math.min(end, fileSize - 1) };
}

function publicFolder(folder) {
  return folder
    ? {
        id: folder.id,
        name: folder.name,
        parentId: folder.parentId,
        createdAt: folder.createdAt,
        updatedAt: folder.updatedAt
      }
    : null;
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

app.get('/raw/:id', async (c) => {
  const fileService = c.get('fileService');
  const id = c.req.param('id');
  const token = c.req.query('token') || '';
  const file = fileService.getFileForToken(id, token);

  if (!file) {
    return c.json({ ok: false, message: 'File not found' }, 404);
  }

  const fileStats = await stat(file.filePath);
  const sizedFile = { ...file, sizeBytes: fileStats.size };
  const range = parseRangeHeader(c.req.header('range') || '', fileStats.size);
  const headers = range
    ? createPartialContentHeaders(sizedFile, range)
    : createRawFileHeaders(sizedFile);
  const stream = range
    ? createReadStream(file.filePath, { start: range.start, end: range.end })
    : createReadStream(file.filePath);

  return new Response(stream, {
    status: range ? 206 : 200,
    headers: new Headers(headers)
  });
});

app.get('/', requireAdmin, (c) => {
  const fileService = c.get('fileService');
  const folderId = c.req.query('folderId') || '';

  try {
    return c.json(publicFolderView(fileService.listFolder(folderId)));
  } catch (error) {
    return c.json(
      { ok: false, message: error instanceof Error ? error.message : 'Folder not found' },
      404
    );
  }
});

app.post('/', requireAdmin, async (c) => {
  const fileService = c.get('fileService');
  const fileUploadLimitBytes = getFileUploadLimitBytes();

  try {
    const buffer = await c.req.arrayBuffer();

    if (fileUploadLimitBytes > 0 && buffer.byteLength > fileUploadLimitBytes) {
      return c.json({ ok: false, message: 'Request body too large' }, 413);
    }

    const contentType = c.req.header('content-type') || '';
    const upload = parseMultipartFile(Buffer.from(buffer), contentType);
    const file = await fileService.saveFile(upload);
    return c.json({ file: publicFile(file) }, 201);
  } catch (error) {
    return c.json(
      { ok: false, message: error instanceof Error ? error.message : 'Upload failed' },
      400
    );
  }
});

app.post('/:id/link', requireAdmin, (c) => {
  const fileService = c.get('fileService');
  const id = c.req.param('id');
  const link = fileService.createAccessLink(id);
  return c.json(link ? { link } : { ok: false, message: 'File not found' }, link ? 200 : 404);
});

app.post('/:id/preview-link', requireAdmin, (c) => {
  const fileService = c.get('fileService');
  const id = c.req.param('id');
  const link = fileService.createPreviewLink(id);
  return c.json(link ? { link } : { ok: false, message: 'File not found' }, link ? 200 : 404);
});

app.delete('/:id', requireAdmin, async (c) => {
  const fileService = c.get('fileService');
  const id = c.req.param('id');
  const removed = await fileService.removeFile(id);
  return c.json(removed ? { ok: true } : { ok: false, message: 'File not found' }, removed ? 200 : 404);
});

export const filesRoutes = app;
