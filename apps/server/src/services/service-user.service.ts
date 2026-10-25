import {
  type ServiceUser,
  type ServiceUserCreate,
  type ServiceUserUpdate,
  serviceUserSchema,
} from '@care/shared';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { serviceUsers, weekPlans } from '../db/schema';
import { buildFieldChanges, recordAudit } from './audit.service';

/**
 * Service-user service — the only layer that touches the DB for service users
 * (CLAUDE.md layering). Controllers call these; routes never query Drizzle directly.
 * Managers normally deactivate (soft delete). A hard delete exists for records created
 * in error, but only while the service user has no week plans — once support has been
 * planned/recorded the history must survive, so those can only be deactivated.
 */

type ServiceUserRow = typeof serviceUsers.$inferSelect;

/**
 * Map a DB row to the public shared shape. `contractedHours` is a numeric column,
 * which Drizzle returns as a JS string — coerce it to a number so the API contract
 * stays `z.number()`. Dates become ISO strings.
 */
export function toPublicServiceUser(row: ServiceUserRow): ServiceUser {
  return serviceUserSchema.parse({
    id: row.id,
    name: row.name,
    contractedHours: Number(row.contractedHours),
    homeId: row.homeId,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

/** List service users, optionally filtered by active state, ordered by name. */
export async function listServiceUsers({ active }: { active?: boolean } = {}): Promise<
  ServiceUser[]
> {
  const rows =
    active === undefined
      ? await db.select().from(serviceUsers).orderBy(serviceUsers.name)
      : await db
          .select()
          .from(serviceUsers)
          .where(eq(serviceUsers.active, active))
          .orderBy(serviceUsers.name);
  return rows.map(toPublicServiceUser);
}

/** Fetch a single service user by id, or null if none exists. */
export async function getServiceUser(id: string): Promise<ServiceUser | null> {
  const [row] = await db.select().from(serviceUsers).where(eq(serviceUsers.id, id)).limit(1);
  return row ? toPublicServiceUser(row) : null;
}

/** Create a service user. `contractedHours` is written back as a string (numeric column). */
export async function createServiceUser(input: ServiceUserCreate): Promise<ServiceUser> {
  const [row] = await db
    .insert(serviceUsers)
    .values({
      name: input.name,
      contractedHours: input.contractedHours.toString(),
      ...(input.homeId === undefined ? {} : { homeId: input.homeId }),
      // `active` defaults to true at the DB when omitted.
      ...(input.active === undefined ? {} : { active: input.active }),
    })
    .returning();
  return toPublicServiceUser(row);
}

/**
 * Update the given fields of a service user. Only fields present in `input` are set;
 * returns null when no row matches the id. The one tracked field here — `contractedHours`
 * — is audited in the same transaction as the write (Phase 9); other edits (name, home,
 * active) produce no audit rows.
 */
export async function updateServiceUser(
  id: string,
  input: ServiceUserUpdate,
  actorUserId: string,
): Promise<ServiceUser | null> {
  const patch: Partial<typeof serviceUsers.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.contractedHours !== undefined) patch.contractedHours = input.contractedHours.toString();
  if (input.homeId !== undefined) patch.homeId = input.homeId;
  if (input.active !== undefined) patch.active = input.active;

  const row = await db.transaction(async (tx) => {
    const [before] = await tx.select().from(serviceUsers).where(eq(serviceUsers.id, id)).limit(1);
    if (!before) return null;

    const [after] = await tx
      .update(serviceUsers)
      .set(patch)
      .where(eq(serviceUsers.id, id))
      .returning();

    const changes = buildFieldChanges(before, after, ['contractedHours']);
    await recordAudit(
      tx,
      changes.map((c) => ({
        ...c,
        userId: actorUserId,
        action: 'UPDATE',
        entityType: 'SERVICE_USER' as const,
        entityId: id,
      })),
    );
    return after;
  });
  return row ? toPublicServiceUser(row) : null;
}

/** Toggle a service user's active flag (soft delete / restore). Null if id is unknown. */
export async function setServiceUserActive(
  id: string,
  active: boolean,
  actorUserId: string,
): Promise<ServiceUser | null> {
  return updateServiceUser(id, { active }, actorUserId);
}

export type DeleteServiceUserResult = 'deleted' | 'not-found' | 'has-week-plans';

/**
 * Permanently delete a service user that has no week plans. Their template, staff
 * assignments and auditor access requests go with them (FK cascades); week plans are
 * `restrict`, so the DB also refuses if one appears mid-flight. The deletion itself is
 * appended to the audit trail (the row keeps the name, since the entity label is gone).
 */
export async function deleteServiceUser(
  id: string,
  actorUserId: string,
): Promise<DeleteServiceUserResult> {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(serviceUsers).where(eq(serviceUsers.id, id)).limit(1);
    if (!before) return 'not-found';

    const [plan] = await tx
      .select({ id: weekPlans.id })
      .from(weekPlans)
      .where(eq(weekPlans.serviceUserId, id))
      .limit(1);
    if (plan) return 'has-week-plans';

    await tx.delete(serviceUsers).where(eq(serviceUsers.id, id));
    await recordAudit(tx, [
      {
        userId: actorUserId,
        action: 'DELETE',
        entityType: 'SERVICE_USER',
        entityId: id,
        field: 'name',
        fromValue: before.name,
        toValue: null,
      },
    ]);
    return 'deleted';
  });
}
