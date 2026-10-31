import { z } from 'zod';

/**
 * A photo staff attach to a recorded activity (a `DayEntry`) as supporting evidence — taken
 * with the device camera or picked from the gallery on the recording screen. This is the
 * METADATA shape only; the image bytes are served from their own endpoint so listing a
 * week's photos never ships the images themselves.
 *
 * Only these raster types are accepted. The server identifies the type from the file's
 * own bytes (never the client-sent header), and the client re-encodes to JPEG before
 * upload where the browser can, which also strips EXIF metadata such as GPS location.
 */
export const PHOTO_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const photoContentTypeSchema = z.enum(PHOTO_CONTENT_TYPES);

export const dayEntryPhotoSchema = z.object({
  id: z.string().uuid(),
  dayEntryId: z.string().uuid(),
  // Who attached it; null once that user is deleted. Staff may remove only their own.
  uploadedById: z.string().uuid().nullable(),
  contentType: photoContentTypeSchema,
  sizeBytes: z.number().int().min(0),
  createdAt: z.string(),
});

export type PhotoContentType = z.infer<typeof photoContentTypeSchema>;
export type DayEntryPhoto = z.infer<typeof dayEntryPhotoSchema>;
