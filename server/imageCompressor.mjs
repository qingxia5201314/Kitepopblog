/**
 * Permanent in-article image compression.
 *
 * Every image that reaches the blog through the upload pipeline is
 * re-encoded to WebP at a visually-lossless quality. This is the single
 * choke point that both the hexo-admin paste flow and the plain
 * `/api/files` upload flow go through, so the optimization is permanent.
 *
 * Design rules (all of them are "fail open") :
 *   - Only raster images are considered. Video / audio / office documents
 *     and every other content type pass through byte-for-byte.
 *   - Animated images (multi-frame GIF/WebP/APNG) are never touched, because
 *     re-encoding them would silently drop the animation.
 *   - If the WebP result is not meaningfully smaller than the original, the
 *     original bytes are kept. This prevents making already-optimized images
 *     bigger, which is the classic recompression trap.
 *   - Any error at all returns the original bytes. Uploads must never fail
 *     because compression failed.
 */

import sharp from 'sharp';

/** Quality for the WebP re-encode. 80 measured visually lossless on this blog's images. */
const WEBP_QUALITY = 80;
/** libvips effort: 5 is a good time/size tradeoff and stays fast on 1 vCPU of headroom. */
const WEBP_EFFORT = 5;
/** Refuse to buffer anything larger than this; such uploads are not article images. */
const MAX_PIXELS_TO_PROCESS = 80_000_000;
/**
 * Only replace the original when the WebP is at least this much smaller.
 * A 5% win is not worth the re-encode risk; 15%+ is a real page-weight win.
 */
const MIN_SAVING_RATIO = 0.85;

/** Content types we are willing to re-encode. SVG is deliberately excluded: it is vector. */
const COMPRESSIBLE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']);

function isCompressibleType(contentType) {
  const normalized = String(contentType || '').split(';')[0].trim().toLowerCase();
  return COMPRESSIBLE_TYPES.has(normalized);
}

/**
 * Re-encode an image buffer to WebP when that makes it smaller.
 *
 * @param {Buffer} buffer     the uploaded image bytes
 * @param {string} contentType the declared upload content type
 * @returns {Promise<{buffer: Buffer, contentType: string, compressed: boolean, reason: string}>}
 */
export async function compressArticleImage(buffer, contentType) {
  const passthrough = (reason) => ({ buffer, contentType, compressed: false, reason });

  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return passthrough('empty');
  if (!isCompressibleType(contentType)) return passthrough('not-a-raster-image');

  try {
    const image = sharp(buffer, { animated: false, failOn: 'none' });
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) return passthrough('no-dimensions');
    if (metadata.width * metadata.height > MAX_PIXELS_TO_PROCESS) return passthrough('too-large');
    // Multi-frame input (animated GIF/WebP, APNG) is left alone on purpose.
    if (Number(metadata.pages || 1) > 1) return passthrough('animated');

    const webp = await sharp(buffer, { animated: false, failOn: 'none' })
      // Honour EXIF orientation and bake it into the pixels, then drop metadata
      // so the derivative carries no stale camera/GPS information.
      .rotate()
      .webp({ quality: WEBP_QUALITY, effort: WEBP_EFFORT })
      .toBuffer();

    if (!webp.length) return passthrough('empty-output');
    if (webp.length > buffer.length * MIN_SAVING_RATIO) {
      return passthrough(`no-gain (${Math.round((webp.length / buffer.length) * 100)}%)`);
    }

    return {
      buffer: webp,
      contentType: 'image/webp',
      compressed: true,
      reason: `webp q${WEBP_QUALITY}: ${buffer.length} -> ${webp.length} bytes`
    };
  } catch (error) {
    // Never let a compression problem break an upload.
    return passthrough(`error: ${error instanceof Error ? error.message : 'unknown'}`);
  }
}

export const imageCompressionDefaults = {
  quality: WEBP_QUALITY,
  effort: WEBP_EFFORT,
  minSavingRatio: MIN_SAVING_RATIO,
  compressibleTypes: [...COMPRESSIBLE_TYPES]
};

