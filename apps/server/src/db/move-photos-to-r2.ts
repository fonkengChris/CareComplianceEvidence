import { eq, isNotNull } from 'drizzle-orm';
import { photoStorageKey } from '../services/day-entry-photo.service';
import { objectStore } from '../storage/object-store';
import { client, db } from './index';
import { dayEntries, dayEntryPhotos } from './schema';

/**
 * One-off backfill: copy evidence photos still held inline in Postgres (`data`) into
 * Cloudflare R2, then point each row at its object and clear the bytes. One photo at a
 * time, each upload committed before its row changes, so it's safe to stop and re-run —
 * already-moved rows are skipped. Run with `bun run db:move-photos-to-r2` once R2 is set up.
 */
if (!objectStore) {
  console.error(
    'R2 is not configured (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET).',
  );
  process.exit(1);
}

const pending = await db
  .select({ id: dayEntryPhotos.id, weekPlanId: dayEntries.weekPlanId })
  .from(dayEntryPhotos)
  .innerJoin(dayEntries, eq(dayEntries.id, dayEntryPhotos.dayEntryId))
  .where(isNotNull(dayEntryPhotos.data));

let moved = 0;
for (const { id, weekPlanId } of pending) {
  const [row] = await db
    .select({ contentType: dayEntryPhotos.contentType, data: dayEntryPhotos.data })
    .from(dayEntryPhotos)
    .where(eq(dayEntryPhotos.id, id))
    .limit(1);
  if (!row?.data) continue; // deleted or moved since the listing
  const key = photoStorageKey(weekPlanId, id);
  await objectStore.put(key, row.data, row.contentType);
  await db
    .update(dayEntryPhotos)
    .set({ storageKey: key, data: null })
    .where(eq(dayEntryPhotos.id, id));
  moved += 1;
}

await client.end();
console.log(`Moved ${moved} of ${pending.length} photo(s) to R2.`);
