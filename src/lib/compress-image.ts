/**
 * Client-side image compression for uploads.
 *
 * Goal: keep documents (driver paperwork, receipts, POD photos) readable while
 * shrinking phone-camera images from many MB down to ~800 KB so they upload
 * quickly and don't blow out storage quotas.
 *
 * Behavior:
 *  - Skips non-image files (PDF, docx, etc.) — returned untouched.
 *  - Skips SVG (vector, would rasterize and lose scalability).
 *  - Skips already-small JPEG/WebP files under the target.
 *  - Otherwise decodes, scales the longest edge to <= maxDimension (default
 *    2400px so document text stays sharp), re-encodes to WebP (falls back to
 *    JPEG), and iteratively lowers quality / dimensions until the result fits
 *    under targetBytes. On any failure, returns the original file untouched —
 *    compression must never block an upload.
 */

export interface CompressImageOptions {
  /** Target maximum bytes for the encoded output. Default 800 KB. */
  targetBytes?: number;
  /** Hard cap for longest edge in pixels. Default 2400 (keeps text legible). */
  maxDimension?: number;
  /** Initial encoder quality (0-1). Default 0.85. */
  initialQuality?: number;
  /** Minimum quality before we start scaling down. Default 0.5. */
  minQuality?: number;
}

const DEFAULT_TARGET = 800 * 1024;
const DEFAULT_MAX_DIM = 2400;

export async function compressImage(
  file: File,
  opts: CompressImageOptions = {}
): Promise<File> {
  const targetBytes = opts.targetBytes ?? DEFAULT_TARGET;
  const maxDim = opts.maxDimension ?? DEFAULT_MAX_DIM;
  const initialQuality = opts.initialQuality ?? 0.85;
  const minQuality = opts.minQuality ?? 0.5;

  try {
    // Only touch real image files. Leave PDFs, docx, etc. alone.
    if (!file.type || !file.type.startsWith('image/')) return file;
    // SVG is vector — rasterizing would degrade it. GIFs would lose animation.
    if (file.type === 'image/svg+xml' || file.type === 'image/gif') return file;

    const alreadyCompact =
      file.size <= targetBytes &&
      (file.type === 'image/jpeg' || file.type === 'image/webp');
    if (alreadyCompact) return file;

    const bitmap = await decode(file);
    if (!bitmap) return file;

    // Pick output mime: prefer webp for smaller documents; fallback jpeg.
    const outMime = supportsWebpEncode() ? 'image/webp' : 'image/jpeg';

    let scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    let quality = initialQuality;
    let blob: Blob | null = null;

    // Up to ~10 attempts: drop quality first, then rescale.
    for (let attempt = 0; attempt < 10; attempt++) {
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      blob = await render(bitmap, w, h, outMime, quality);
      if (!blob) break;
      if (blob.size <= targetBytes) break;

      if (quality > minQuality + 0.001) {
        quality = Math.max(minQuality, quality - 0.1);
      } else {
        scale *= 0.85; // shrink further
        quality = initialQuality; // reset quality after a rescale
      }
    }

    if (!blob) return file;
    // If compression somehow produced a larger file than the original, keep original.
    if (blob.size >= file.size) return file;

    const newName = swapExtension(file.name, outMime);
    return new File([blob], newName, {
      type: blob.type || outMime,
      lastModified: file.lastModified,
    });
  } catch (err) {
    // Never block an upload because compression failed.
    // eslint-disable-next-line no-console
    console.warn('[compressImage] falling back to original file', err);
    return file;
  }
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // fall through to <img> fallback
    }
  }
  return await new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      // Don't revoke immediately — canvas draw still needs the decoded pixels,
      // but the browser keeps them after onload, so it's safe.
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

async function render(
  source: ImageBitmap | HTMLImageElement,
  w: number,
  h: number,
  mime: string,
  quality: number
): Promise<Blob | null> {
  // Prefer OffscreenCanvas when available (does not block main thread paint).
  if (typeof OffscreenCanvas !== 'undefined') {
    try {
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d context');
      // White background so transparent PNG documents read like paper.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(source as CanvasImageSource, 0, 0, w, h);
      return await canvas.convertToBlob({ type: mime, quality });
    } catch {
      // fall through to HTMLCanvasElement
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source as CanvasImageSource, 0, 0, w, h);
  return await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, mime, quality)
  );
}

let _webpSupport: boolean | null = null;
function supportsWebpEncode(): boolean {
  if (_webpSupport !== null) return _webpSupport;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    const url = c.toDataURL('image/webp');
    _webpSupport = url.startsWith('data:image/webp');
  } catch {
    _webpSupport = false;
  }
  return _webpSupport;
}

function swapExtension(name: string, mime: string): string {
  const ext = mime === 'image/webp' ? 'webp' : 'jpg';
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  return `${base}.${ext}`;
}
