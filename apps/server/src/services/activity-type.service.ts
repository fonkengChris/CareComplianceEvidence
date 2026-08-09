import { type ActivityType, activityTypeSchema } from '@care/shared';
import { asc, eq } from 'drizzle-orm';
import { db } from '../db';
import { activityTypes } from '../db/schema';

/**
 * Activity-type service. The list is admin-maintained (not free-typed); in the MVP
 * it is read-only from the app and populated by the seed. Day-entry activities always
 * reference one of these by id, so the planner needs a way to fetch the options.
 */

type ActivityTypeRow = typeof activityTypes.$inferSelect;

export function toPublicActivityType(row: ActivityTypeRow): ActivityType {
  return activityTypeSchema.parse({
    id: row.id,
    name: row.name,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

/** List activity types, ordered by name. Defaults to active-only for the picker. */
export async function listActivityTypes({
  active = true,
}: { active?: boolean } = {}): Promise<ActivityType[]> {
  const rows = active
    ? await db
        .select()
        .from(activityTypes)
        .where(eq(activityTypes.active, true))
        .orderBy(asc(activityTypes.name))
    : await db.select().from(activityTypes).orderBy(asc(activityTypes.name));
  return rows.map(toPublicActivityType);
}
