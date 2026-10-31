import {
  type DayEntryPhoto,
  type PhotoContentType,
  type Role,
  dayEntryPhotoSchema,
  isAssignmentScoped,
} from '@care/shared';
import { and, asc, count, eq } from 'drizzle-orm';
import { config } from '../config';
import { db } from '../db';
import { dayEntries, dayEntryPhotos } from '../db/schema';
import { recordAudit } from './audit.service';

/**
 * Evidence photos on recorded activities — the only layer that touches `day_entry_photos`
 * (CLAUDE.md layering). Every call is scoped by the week plan in the URL: the route's
 * assignment guard authorises the PLAN, so each query here also proves the entry/photo
 * belongs to that plan, or a staff member could reach another plan's photos by id.
 * Adding and removing a photo are audited in the same transaction as the write.
 */

/**
 * Identify an image from its leading bytes. The client-sent Content-Type is never trusted:
 * the stored type (and the header the image is later served with) comes from here, so a
 * non-image upload can't be replayed to a browser as something else. Pure for unit tests.
 */
export function detectImageType(bytes: Buffer): PhotoContentType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 12 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

// Every column except the image bytes — list reads never pull the images themselves.
const metadataColumns = {
  id: dayEntryPhotos.id,
  dayEntryId: dayEntryPhotos.dayEntryId,
  uploadedById: dayEntryPhotos.uploadedById,
  contentType: dayEntryPhotos.contentType,
  sizeBytes: dayEntryPhotos.sizeBytes,
  createdAt: dayEntryPhotos.createdAt,
};

type PhotoMetadataRow = {
  id: string;
  dayEntryId: string;
  uploadedById: string | null;
  contentType: string;
  sizeBytes: number;
  createdAt: Date;
};

export function toPublicPhoto(row: PhotoMetadataRow): DayEntryPhoto {
  return dayEntryPhotoSchema.parse({ ...row, createdAt: row.createdAt.toISOString() });
}

/** Photo metadata for every line of a plan, oldest first. */
export async function listPhotosForPlan(weekPlanId: string): Promise<DayEntryPhoto[]> {
  const rows = await db
    .select(metadataColumns)
    .from(dayEntryPhotos)
    .innerJoin(dayEntries, eq(dayEntries.id, dayEntryPhotos.dayEntryId))
    .where(eq(dayEntries.weekPlanId, weekPlanId))
    .orderBy(asc(dayEntryPhotos.createdAt));
  return rows.map(toPublicPhoto);
}

export type AddPhotoResult =
  | { ok: true; value: DayEntryPhoto }
  | { ok: false; reason: 'not_found' | 'unsupported_type' | 'too_many' };

/**
 * Attach a photo to a line of the plan. `not_found` when the entry isn't on this plan,
 * `unsupported_type` when the bytes aren't a JPEG/PNG/WebP, `too_many` at the per-entry cap.
 */
export async function addPhoto(
  weekPlanId: string,
  dayEntryId: string,
  data: Buffer,
  actorUserId: string,
): Promise<AddPhotoResult> {
  const contentType = detectImageType(data);
  if (contentType === null) return { ok: false, reason: 'unsupported_type' };

  return db.transaction(async (tx): Promise<AddPhotoResult> => {
    const [entry] = await tx
      .select({ id: dayEntries.id })
      .from(dayEntries)
      .where(and(eq(dayEntries.id, dayEntryId), eq(dayEntries.weekPlanId, weekPlanId)))
      .limit(1);
    if (!entry) return { ok: false, reason: 'not_found' };

    const [{ n }] = await tx
      .select({ n: count() })
      .from(dayEntryPhotos)
      .where(eq(dayEntryPhotos.dayEntryId, dayEntryId));
    if (n >= config.photoMaxPerEntry) return { ok: false, reason: 'too_many' };

    const [created] = await tx
      .insert(dayEntryPhotos)
      .values({ dayEntryId, uploadedById: actorUserId, contentType, sizeBytes: data.length, data })
      .returning(metadataColumns);

    await recordAudit(tx, [
      {
        userId: actorUserId,
        action: 'PHOTO_ADD',
        entityType: 'DAY_ENTRY',
        entityId: dayEntryId,
        field: 'photo',
        toValue: created.id,
      },
    ]);
    return { ok: true, value: toPublicPhoto(created) };
  });
}

/** The image bytes + type of a photo on this plan, or null if it isn't on this plan. */
export async function getPhotoData(
  weekPlanId: string,
  photoId: string,
): Promise<{ contentType: string; data: Buffer } | null> {
  const [row] = await db
    .select({ contentType: dayEntryPhotos.contentType, data: dayEntryPhotos.data })
    .from(dayEntryPhotos)
    .innerJoin(dayEntries, eq(dayEntries.id, dayEntryPhotos.dayEntryId))
    .where(and(eq(dayEntryPhotos.id, photoId), eq(dayEntries.weekPlanId, weekPlanId)))
    .limit(1);
  return row ?? null;
}

export type DeletePhotoResult = { ok: true } | { ok: false; reason: 'not_found' | 'forbidden' };

/**
 * Remove a photo from a plan's line. Staff/key workers may remove only photos they
 * uploaded (e.g. the wrong person was in frame); managers may remove any. Audited.
 */
export async function deletePhoto(
  weekPlanId: string,
  photoId: string,
  actor: { sub: string; role: Role },
): Promise<DeletePhotoResult> {
  return db.transaction(async (tx): Promise<DeletePhotoResult> => {
    const [photo] = await tx
      .select({ dayEntryId: dayEntryPhotos.dayEntryId, uploadedById: dayEntryPhotos.uploadedById })
      .from(dayEntryPhotos)
      .innerJoin(dayEntries, eq(dayEntries.id, dayEntryPhotos.dayEntryId))
      .where(and(eq(dayEntryPhotos.id, photoId), eq(dayEntries.weekPlanId, weekPlanId)))
      .limit(1);
    if (!photo) return { ok: false, reason: 'not_found' };
    if (isAssignmentScoped(actor.role) && photo.uploadedById !== actor.sub) {
      return { ok: false, reason: 'forbidden' };
    }

    await tx.delete(dayEntryPhotos).where(eq(dayEntryPhotos.id, photoId));
    await recordAudit(tx, [
      {
        userId: actor.sub,
        action: 'PHOTO_DELETE',
        entityType: 'DAY_ENTRY',
        entityId: photo.dayEntryId,
        field: 'photo',
        fromValue: photoId,
      },
    ]);
    return { ok: true };
  });
}
