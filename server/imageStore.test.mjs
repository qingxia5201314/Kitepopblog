import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSqliteDatabase } from './sqliteDatabase.mjs';
import { createImageStore } from './imageStore.mjs';

let tempDir;
let store;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'kitepop-images-'));
  const database = await createSqliteDatabase({ dbPath: join(tempDir, 'blog.sqlite') });
  store = createImageStore({ database, imageDir: join(tempDir, 'images') });
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe('image store', () => {
  it('stores public image bytes and returns stable raw URLs without file extensions', async () => {
    const image = await store.saveImage({
      originalName: '../../cover.png',
      contentType: 'image/png',
      buffer: Buffer.from('png-bytes')
    });

    expect(image.originalName).toBe('cover.png');
    expect(image.contentType).toBe('image/png');
    expect(image.sizeBytes).toBe(9);
    expect(image.path).toMatch(/^\/api\/images\/raw\/img-/);
    expect(image.path).not.toContain('.png');
    expect(existsSync(image.filePath)).toBe(true);
    await expect(readFile(image.filePath, 'utf8')).resolves.toBe('png-bytes');
    expect(store.listImages()).toMatchObject([
      {
        id: image.id,
        originalName: 'cover.png',
        contentType: 'image/png',
        path: image.path
      }
    ]);
    expect(store.getImage(image.id)).toMatchObject({ id: image.id, originalName: 'cover.png' });
  });

  it('rejects non-image uploads and removes image files from disk', async () => {
    expect(() =>
      store.validateImageUpload({
        originalName: 'shell.php',
        contentType: 'application/x-php',
        buffer: Buffer.from('<?php echo 1;')
      })
    ).toThrow('Only PNG, JPEG, GIF, and WebP images are allowed');

    const image = await store.saveImage({
      originalName: 'photo.webp',
      contentType: 'image/webp',
      buffer: Buffer.from('webp')
    });

    expect(await store.removeImage(image.id)).toBe(true);
    expect(store.getImage(image.id)).toBeNull();
    expect(existsSync(image.filePath)).toBe(false);
  });
});
