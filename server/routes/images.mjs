import { Hono } from 'hono';
import { createReadStream } from 'node:fs';
import { isAdmin } from '../middleware/auth.mjs';
import { createRawFileHeaders } from '../fileDownloadHeaders.mjs';
import { parseMultipartFile } from '../utils/multipart.mjs';

const app = new Hono();

function publicImage(image) {
  return {
    id: image.id,
    originalName: image.originalName,
    contentType: image.contentType,
    sizeBytes: image.sizeBytes,
    uploadedAt: image.uploadedAt,
    path: image.path
  };
}

// Public: raw image download
app.get('/raw/:id', (c) => {
  const imageStore = c.get('imageStore');
  const id = c.req.param('id');
  const image = imageStore.getImage(id);

  if (!image) {
    return c.json({ ok: false, message: 'Image not found' }, 404);
  }

  const headers = createRawFileHeaders(image);
  const stream = createReadStream(image.filePath);

  return new Response(stream, {
    headers: new Headers(headers)
  });
});

// Admin only routes
app.get('/', (c) => {
  if (!isAdmin(c)) {
    return c.json({ ok: false, message: 'Unauthorized' }, 401);
  }

  const imageStore = c.get('imageStore');
  return c.json({ images: imageStore.listImages().map(publicImage) });
});

app.post('/', async (c) => {
  if (!isAdmin(c)) {
    return c.json({ ok: false, message: 'Unauthorized' }, 401);
  }

  const imageStore = c.get('imageStore');
  const imageUploadLimitBytes = Number(process.env.IMAGE_UPLOAD_LIMIT || 0);

  try {
    const buffer = await c.req.arrayBuffer();

    // Check size limit
    if (imageUploadLimitBytes > 0 && buffer.byteLength > imageUploadLimitBytes) {
      return c.json({ ok: false, message: 'Request body too large' }, 413);
    }

    const contentType = c.req.header('content-type') || '';
    const upload = parseMultipartFile(Buffer.from(buffer), contentType);
    const image = await imageStore.saveImage(upload);
    return c.json({ image: publicImage(image) }, 201);
  } catch (error) {
    return c.json({ ok: false, message: error instanceof Error ? error.message : 'Image upload failed' }, 400);
  }
});

app.delete('/:id', async (c) => {
  if (!isAdmin(c)) {
    return c.json({ ok: false, message: 'Unauthorized' }, 401);
  }

  const imageStore = c.get('imageStore');
  const id = c.req.param('id');
  const removed = await imageStore.removeImage(id);
  return c.json(removed ? { ok: true } : { ok: false, message: 'Image not found' }, removed ? 200 : 404);
});

export const imagesRoutes = app;
