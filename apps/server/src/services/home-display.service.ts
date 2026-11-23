import {
  type CheckInDisplayCode,
  type HomeDisplay,
  type HomeDisplayPaired,
  homeDisplaySchema,
} from '@care/shared';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { currentCheckInCode } from '../auth/check-in-code';
import { generateRefreshToken, hashToken } from '../auth/tokens';
import { db } from '../db';
import { homeDisplayDevices, homes } from '../db/schema';
import { recordAudit } from './audit.service';

/**
 * Home check-in displays — the only layer that touches `home_display_devices`. A manager pairs a
 * screen at a home (office tablet/PC); the screen keeps an opaque token (only its hash is stored)
 * that can fetch the home's current on-site check-in code and nothing else. Pairing and revoking
 * are audited against the home.
 */

type DisplayRow = typeof homeDisplayDevices.$inferSelect;

/** Map a DB row to the public shape (ISO dates; never the token hash). */
export function toPublicDisplay(row: DisplayRow): HomeDisplay {
  return homeDisplaySchema.parse({
    id: row.id,
    homeId: row.homeId,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    lastSeenAt: row.lastSeenAt ? row.lastSeenAt.toISOString() : null,
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
  });
}

/** Pair a new display at a home. Returns the raw token once, or null if the home is unknown. */
export async function pairDisplay(
  homeId: string,
  name: string,
  managerId: string,
): Promise<HomeDisplayPaired | null> {
  return db.transaction(async (tx) => {
    const [home] = await tx
      .select({ id: homes.id })
      .from(homes)
      .where(eq(homes.id, homeId))
      .limit(1);
    if (!home) return null;
    const { token, tokenHash } = generateRefreshToken();
    const [row] = await tx
      .insert(homeDisplayDevices)
      .values({ homeId, name, tokenHash, createdById: managerId })
      .returning();
    await recordAudit(tx, [
      {
        userId: managerId,
        action: 'DISPLAY_PAIR',
        entityType: 'HOME',
        entityId: homeId,
        field: 'checkInDisplay',
        toValue: name,
      },
    ]);
    return { display: toPublicDisplay(row!), token };
  });
}

/** A home's displays, newest first (revoked ones included as history). */
export async function listDisplays(homeId: string): Promise<HomeDisplay[]> {
  const rows = await db
    .select()
    .from(homeDisplayDevices)
    .where(eq(homeDisplayDevices.homeId, homeId))
    .orderBy(desc(homeDisplayDevices.createdAt));
  return rows.map(toPublicDisplay);
}

/** Unpair a display; its token stops working at once. Revoking twice is a no-op success. */
export async function revokeDisplay(
  homeId: string,
  displayId: string,
  managerId: string,
): Promise<'ok' | 'not-found'> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(homeDisplayDevices)
      .where(and(eq(homeDisplayDevices.id, displayId), eq(homeDisplayDevices.homeId, homeId)))
      .limit(1);
    if (!row) return 'not-found';
    if (row.revokedAt !== null) return 'ok';
    await tx
      .update(homeDisplayDevices)
      .set({ revokedAt: new Date() })
      .where(eq(homeDisplayDevices.id, displayId));
    await recordAudit(tx, [
      {
        userId: managerId,
        action: 'DISPLAY_REVOKE',
        entityType: 'HOME',
        entityId: homeId,
        field: 'checkInDisplay',
        fromValue: row.name,
      },
    ]);
    return 'ok';
  });
}

/**
 * The current check-in code for the home a display token is paired with, or null when the token
 * is unknown or revoked, or the home is inactive. Touches `lastSeenAt` so managers can spot a
 * display that has gone dark.
 */
export async function codeForDisplayToken(rawToken: string): Promise<CheckInDisplayCode | null> {
  const [row] = await db
    .select({
      id: homeDisplayDevices.id,
      homeId: homes.id,
      homeName: homes.name,
      secret: homes.checkInSecret,
    })
    .from(homeDisplayDevices)
    .innerJoin(homes, eq(homes.id, homeDisplayDevices.homeId))
    .where(
      and(
        eq(homeDisplayDevices.tokenHash, hashToken(rawToken)),
        isNull(homeDisplayDevices.revokedAt),
        eq(homes.active, true),
      ),
    )
    .limit(1);
  if (!row) return null;
  await db
    .update(homeDisplayDevices)
    .set({ lastSeenAt: new Date() })
    .where(eq(homeDisplayDevices.id, row.id));
  const { code, expiresAt } = currentCheckInCode(row.secret);
  return { homeId: row.homeId, homeName: row.homeName, code, expiresAt: expiresAt.toISOString() };
}
