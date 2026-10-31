import type { DayEntryPhoto } from '@care/shared';
import { api } from './api';

/**
 * Typed helpers over the shared axios instance for evidence photos on recorded activities.
 * Images are fetched as blobs (not `<img src>`), because the access token lives in memory
 * and must ride on the request as a bearer header.
 */

// Longest edge after downscaling. Plenty for evidence, and keeps uploads to a few hundred KB.
const MAX_EDGE_PX = 1600;
const JPEG_QUALITY = 0.8;

export async function fetchPlanPhotos(planId: string): Promise<DayEntryPhoto[]> {
  const { data } = await api.get<DayEntryPhoto[]>(`/api/week-plans/${planId}/photos`);
  return data;
}

export async function fetchPhotoBlob(planId: string, photoId: string): Promise<Blob> {
  const { data } = await api.get<Blob>(`/api/week-plans/${planId}/photos/${photoId}`, {
    responseType: 'blob',
  });
  return data;
}

export async function uploadPhoto(
  planId: string,
  entryId: string,
  image: Blob,
): Promise<DayEntryPhoto> {
  const { data } = await api.post<DayEntryPhoto>(
    `/api/week-plans/${planId}/day-entries/${entryId}/photos`,
    image,
    { headers: { 'Content-Type': image.type || 'application/octet-stream' } },
  );
  return data;
}

export async function deletePhoto(planId: string, photoId: string): Promise<void> {
  await api.delete(`/api/week-plans/${planId}/photos/${photoId}`);
}

/**
 * Downscale and re-encode a picked/captured photo to JPEG before upload. Re-encoding through
 * a canvas also drops EXIF metadata (GPS location, device details) — personal data that has
 * no place in a care record. Falls back to the original file wherever the browser can't
 * decode it (e.g. HEIC on desktop Chrome, or the test DOM); the server then validates it.
 */
export async function prepareImage(file: File): Promise<Blob> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    );
    return blob ?? file;
  } catch {
    return file;
  }
}
