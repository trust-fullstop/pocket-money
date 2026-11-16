// Photos are compressed on the phone (max 1280 px JPEG, EXIF stripped by re-encoding) before upload.
import { useEffect, useState } from 'react';
import { backend } from './backend';

const compressed = new WeakSet<Blob>();

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not a photo we can read.')); };
    img.src = url;
  });
}

/** Resize to fit maxDim × maxDim and re-encode as JPEG (removes EXIF incl. location). */
export async function compressImage(file: Blob, maxDim = 1280, quality = 0.72): Promise<Blob> {
  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    source = await loadImage(file);
  }
  const w = source.width;
  const h = source.height;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_unavailable');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  if ('close' in source) source.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('compress_failed'))), 'image/jpeg', quality));
  compressed.add(blob);
  return blob;
}

function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Compress (if not already) and upload a photo. Returns the storage path to save in the database:
 * `${familyId}/${folder}/${uuid}.jpg`. Folder: 'avatars', a member id (evidence), or 'spotted'.
 */
export async function uploadPhoto(familyId: string, folder: string, file: Blob): Promise<string> {
  const blob = compressed.has(file) ? file : await compressImage(file);
  const path = `${familyId}/${folder}/${uuid()}.jpg`;
  await backend().uploadPhoto(path, blob);
  return path;
}

/** Resolve a stored photo path to a displayable URL (signed URL in the cloud, object URL in the demo). */
export function usePhotoUrl(path: string | null | undefined): string | null {
  const [state, setState] = useState<{ path: string; url: string } | null>(null);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    backend().photoUrl(path).then((url) => { if (alive) setState({ path, url }); }, () => { if (alive) setState(null); });
    return () => { alive = false; };
  }, [path]);
  return path && state?.path === path ? state.url : null;
}
