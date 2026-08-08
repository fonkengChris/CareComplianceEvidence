# CLAUDE.md — Care 1-to-1 Hours Tracker

Project memory for Claude Code / AI-assisted development. Read this first in every session. Full details live in `tech-stack.md` and `implementation-plan.md` — this file is the quick-reference source of truth for conventions and rules, not a replacement for them.

---

## What this project is

A mobile-first web app for care settings that replaces a spreadsheet-based process for planning, recording, and reporting **1-to-1 support hours** delivered to service users. Core cycle: manager plans a week → staff record what actually happened → system calculates totals → manager reviews → PDF report goes to commissioners/auditors.

One-sentence spec: *A mobile-friendly React/TypeScript and Bun/PostgreSQL application that replaces spreadsheet-based 1-to-1 support recording with a central system for planning, recording, calculating, monitoring and reporting care hours.*

---

## Stack (see `tech-stack.md` for full rationale)

- **Runtime:** Bun (everywhere — install, run, test, bundle)
- **Frontend:** React + TypeScript, Vite, Tailwind CSS, React Router, TanStack Query, React Hook Form + Zod
- **Backend:** TypeScript on Bun, Hono (preferred) or Express
- **Database:** PostgreSQL — chosen over MongoDB because the data is a fixed relational hierarchy (`ServiceUser → WeekPlan → DayEntry`) with heavy aggregation/reporting needs and audit/compliance requirements. Do not suggest switching to MongoDB.
- **ORM:** Drizzle ORM + Drizzle Kit for migrations
- **PDF export:** @react-pdf/renderer (fallback: Puppeteer)
- **Testing:** `bun test` for unit + component tests (React Testing Library under a DOM env, e.g. happy-dom) — do not add Jest/Vitest. **Component tests are the default** and should cover most functionality; reserve end-to-end tests (Playwright) for the few flows that genuinely need a full stack (e.g. login→record→report, PDF download).
- **Monorepo layout:** Bun workspaces — `apps/client`, `apps/server`, `packages/shared` (shared Zod schemas + types)

---

## Data model

```
ServiceUser (id, name, address, contractedHours, active)
  └── WeekPlan (id, serviceUserId, weekCommencing, notes)
        └── DayEntry (id, weekPlanId, day, lineNumber, activity, description, timeAllocated, timeSpent, outcome)

ActivityType (id, name, active)  — standardised list, admin-maintained
User (id, name, role, passwordHash)  — role: STAFF | MANAGER | AUDITOR
RefreshToken (id, userId, tokenHash, expiresAt, revokedAt)  — server-side, revocable
ComplianceSettings (id, greenMin, amberMin, redOverPct, ...)  — configurable 🟢/🟡/🔴 boundaries
AuditLog (who, what, from, to, timestamp)
```

Rules to preserve when touching this model:
- `DayEntry` lines are Mon–Sun per `WeekPlan`, with ~4 lines/day as a sensible **default** (from original acceptance criteria) — not a hard limit. Staff/managers can add or remove lines as a real week requires; never enforce a fixed row count in the schema or UI.
- Activities are always selected from `ActivityType`, never free-typed — this is deliberate, for reporting consistency.
- `Outcome` (Completed / Partially completed / Refused / Missed / Cancelled / Other) is the **single authoritative** signal for whether support happened. Keyword detection on comments (missed/refused/declined/did not) is only a **prompt to review** — it nudges a manager to check the entry, never sets or overrides status. Surface it as a review hint (distinct, lower visual weight than `Outcome`), never as a status badge.

---

## Roles & permissions (enforce on backend, not just UI)

| Role | Can | Cannot |
|---|---|---|
| **STAFF** | View assigned plans, record time spent/comments/outcome | Change contracted hours, edit allocated time, manage service users, edit calculated totals |
| **MANAGER** | Full CRUD on service users, week plans, activities; view summaries/reports | — |
| **AUDITOR** | View records, summaries, reports, audit history | Any write, anywhere |

Every new API route must have explicit role middleware. Never rely on frontend hiding alone.

---

## Non-negotiable conventions

- **Layered backend:** Routes → Controllers → Services → Drizzle queries. Don't put business logic in route handlers.
- **Shared types:** Zod schemas live in `packages/shared` and are imported by both frontend and backend — never redefine the same shape twice.
- **Calculations are backend-owned:** delivered hours, remaining hours, and compliance status (🟢/🟡/🔴) are computed server-side and recalculated on every `DayEntry` write. The frontend displays, never derives, these values.
- **Compliance thresholds are configurable**, not hardcoded — original requirements didn't specify exact thresholds; treat them as a settings concern. There is a `ComplianceSettings` record (seeded with sensible defaults) that the compliance calculation reads at runtime; managers can adjust the 🟢/🟡/🔴 boundaries. Never inline threshold numbers in calculation code.
- **Auth uses short-lived access + refresh tokens.** Access JWTs are short-lived; a longer-lived refresh token (stored server-side so it can be revoked) issues new access tokens. Deactivating a user or logging out must invalidate their refresh token — a departed staff member's access ends promptly. See Phase 2 in `implementation-plan.md`.
- **Audit every tracked field change** (time spent, activity, outcome, contracted hours) — who/what/from/to/when. Audit log is append-only: no edit/delete route should ever exist for it.
- **Mobile-first for staff, table/grid for managers** — these are intentionally different UI patterns. Don't force one layout to serve both roles.
- **PDF report is purpose-built for print**, not a screenshot of the app screen.

---

## Current phase / where we are

See `implementation-plan.md` for the full 11-phase breakdown and milestones. Update this section as phases complete:

- [x] Phase 0 — Setup & foundations
- [x] Phase 1 — Data model & core schema
- [ ] Phase 2 — Auth & roles
- [ ] Phase 3 — Service user management
- [ ] Phase 4 — Weekly planning
- [ ] Phase 5 — Staff recording interface
- [ ] Phase 6 — Calculations & compliance indicators
- [ ] Phase 7 — Manager summary
- [ ] Phase 8 — Commissioner PDF report
- [ ] Phase 9 — Audit trail
- [ ] Phase 10 — Auditor access & QA
- [ ] Phase 11 — Deployment

---

## MVP scope boundary

In scope for v1: auth, service user CRUD, weekly plans, activity dropdown + time tracking, auto calculations, staff recording UI, manager summary, one-page PDF report, basic audit fields.

**Explicitly out of scope for v1** — do not build unless asked: notifications/alerts, advanced analytics/trend dashboards, multi-home/organisation hierarchy, Teams/SharePoint integration. These are documented in the project summary as post-MVP; flag it if a request drifts into this territory rather than quietly implementing it.

---

## Commands (fill in once scaffolded)

```bash
bun install          # install all workspace deps
bun run dev           # run web + api concurrently
bun test              # run all tests
bun run typecheck     # typecheck every workspace
bun run db:generate   # generate a versioned SQL migration from schema.ts
bun run db:migrate    # apply committed migrations (auditable; preferred over db:push)
bun run db:seed       # seed activities, compliance settings + sample data (idempotent)
```

Migration workflow is **generate → migrate → seed** (versioned SQL, not `db:push`) for an
auditable, reproducible schema history. `db:push` remains available for throwaway local
prototyping only.

---

## Related docs

- `tech-stack.md` — full stack decisions and rationale (esp. Postgres vs MongoDB)
- `implementation-plan.md` — phase-by-phase build plan with milestones
