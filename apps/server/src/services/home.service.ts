import {
  type Home,
  type HomeCreate,
  type HomeUpdate,
  type ServiceUser,
  homeSchema,
} from '@care/shared';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '../db';
import { homes, serviceUsers } from '../db/schema';
import { toPublicServiceUser } from './service-user.service';

/**
 * Home service — the only layer that touches the DB for homes (CLAUDE.md layering).
 * A home groups service users; staff assigned to a home reach every service user in
 * it. Managers normally soft-delete (deactivate). A hard delete is also available: the home's
 * service users stay but are left without a home (`home_id` → null), and its staff
 * assignments are removed (FK cascades).
 */

type HomeRow = typeof homes.$inferSelect;

/** Map a DB row to the public shared shape (ISO-dates). */
export function toPublicHome(row: HomeRow): Home {
  return homeSchema.parse({
    id: row.id,
    name: row.name,
    address: row.address,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

/** List homes, optionally filtered by active state, ordered by name. */
export async function listHomes({ active }: { active?: boolean } = {}): Promise<Home[]> {
  const rows =
    active === undefined
      ? await db.select().from(homes).orderBy(asc(homes.name))
      : await db.select().from(homes).where(eq(homes.active, active)).orderBy(asc(homes.name));
  return rows.map(toPublicHome);
}

/** Fetch a single home by id, or null if none exists. */
export async function getHome(id: string): Promise<Home | null> {
  const [row] = await db.select().from(homes).where(eq(homes.id, id)).limit(1);
  return row ? toPublicHome(row) : null;
}

/** Create a home. */
export async function createHome(input: HomeCreate): Promise<Home> {
  const [row] = await db
    .insert(homes)
    .values({
      name: input.name,
      address: input.address ?? null,
      ...(input.active === undefined ? {} : { active: input.active }),
    })
    .returning();
  return toPublicHome(row);
}

/** Update the given fields of a home; returns null when no row matches the id. */
export async function updateHome(id: string, input: HomeUpdate): Promise<Home | null> {
  const patch: Partial<typeof homes.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.address !== undefined) patch.address = input.address;
  if (input.active !== undefined) patch.active = input.active;

  const [row] = await db.update(homes).set(patch).where(eq(homes.id, id)).returning();
  return row ? toPublicHome(row) : null;
}

/** Toggle a home's active flag (soft delete / restore). Null if id is unknown. */
export async function setHomeActive(id: string, active: boolean): Promise<Home | null> {
  return updateHome(id, { active });
}

/** The active service users belonging to a home, ordered by name. */
export async function listServiceUsersForHome(homeId: string): Promise<ServiceUser[]> {
  const rows = await db
    .select()
    .from(serviceUsers)
    .where(and(eq(serviceUsers.homeId, homeId), eq(serviceUsers.active, true)))
    .orderBy(asc(serviceUsers.name));
  return rows.map(toPublicServiceUser);
}

/** Permanently delete a home. Returns false when no row matches the id. */
export async function deleteHome(id: string): Promise<boolean> {
  const rows = await db.delete(homes).where(eq(homes.id, id)).returning({ id: homes.id });
  return rows.length > 0;
}
