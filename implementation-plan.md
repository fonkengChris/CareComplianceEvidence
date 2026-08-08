# Implementation Plan — Care 1-to-1 Hours Tracker

Scope: MVP (Version 1) as defined in the project summary. Stack: React + TS frontend, TS backend, Bun runtime, PostgreSQL + Drizzle ORM. See `tech-stack.md` for full rationale.

Each phase lists its goal, deliverables, and the milestone that marks it "done." Phases are sequential but 6–7 can overlap once the data layer is stable.

**Testing approach (applies to every phase):** write **component/unit tests** (`bun test` + React Testing Library) as the default and cover most functionality there — especially the calculation/compliance service. Add **end-to-end tests (Playwright) only where absolutely required**: full-stack journeys where integration is the actual thing under test. Don't duplicate component coverage in e2e.

---

## Phase 0 — Project Setup & Foundations

**Goal:** A working, empty skeleton everyone can build on.

- Initialise Bun monorepo (`apps/web`, `apps/api`, `packages/shared`)
- Set up Vite + React + TS in `apps/web`
- Set up Hono/Express + TS in `apps/api`, running on Bun
- Configure PostgreSQL locally (Docker Compose recommended) + Drizzle Kit
- Configure ESLint, Prettier, `bun test` across the monorepo
- Basic CI: install, lint, typecheck, test on push

**Milestone:** `bun run dev` starts frontend + backend, backend has a health-check route, frontend fetches and displays it, Postgres container connects successfully.

---

## Phase 1 — Data Model & Core Schema

**Goal:** The database structure that everything else depends on.

- Define Drizzle schemas: `ServiceUser`, `WeekPlan`, `DayEntry`, `ActivityType`, `User` (login), `RefreshToken` (server-side, revocable), `ComplianceSettings` (configurable thresholds), `AuditLog`
- `DayEntry` structure: Mon–Sun with ~4 lines/day as a seeded **default**, but the schema imposes no fixed line count — lines can be added/removed per real week
- Write and run initial migrations
- Seed script with sample service users + standard activity list (Shopping, Cleaning, Wellbeing, Budgeting, Admin, Social Inclusion, Personal Care, Exercise, Other)
- Define shared Zod schemas in `packages/shared` mirroring the DB models

**Milestone:** Schema is migrated on a clean Postgres instance, seed script populates realistic sample data, shared types compile and import cleanly into both apps.

---

## Phase 2 — Authentication & Roles

**Goal:** Secure login with STAFF / MANAGER / AUDITOR roles enforced end to end.

- User model + password hashing
- Login endpoint issuing a **short-lived JWT access token** plus a **refresh token**
- `RefreshToken` table (hashed tokens, expiry, `revokedAt`); `/auth/refresh` endpoint that validates + **rotates** the refresh token and issues a new access token
- Revocation paths: logout and user deactivation both revoke outstanding refresh tokens, so access ends promptly rather than lingering until the access JWT expires
- Auth middleware on backend routes
- Role-guard middleware (block STAFF from manager-only routes, block AUDITOR from any write route)
- Frontend: login screen, access-token storage, silent refresh on expiry, protected routes, role-based navigation shell

**Milestone:** A user can log in as each of the three roles and is correctly redirected/blocked according to permissions; hitting a manager-only API route as STAFF returns 403; an expired access token is silently refreshed; and revoking/deactivating a user immediately blocks their next refresh (no new access tokens issued).

---

## Phase 3 — Service User Management (Manager)

**Goal:** Managers can maintain the central list of service users.

- API: CRUD for `ServiceUser` (create, edit, view, active/inactive toggle)
- Frontend: service user list (with active/inactive filter), create/edit form, detail view
- Validation: contracted hours must be a positive number, name/address required

**Milestone:** A manager can create, edit, and deactivate a service user, and the list correctly reflects active/inactive status.

---

## Phase 4 — Weekly Planning (Manager)

**Goal:** Managers can build a week's plan of activities for a service user.

- API: CRUD for `WeekPlan` and its `DayEntry` lines (approx. 4 lines/day, Mon–Sun)
- Activity selection via dropdown (from `ActivityType`, admin-maintained list)
- Allocated time input per entry
- **Duplicate Previous Week** feature: copies activities/allocated time/structure, clears actual time and notes
- Frontend: weekly planner grid/table view, per-day entry rows, duplicate-week action

**Milestone:** A manager can create a full week's plan for a service user, including using "Duplicate Previous Week" to seed the next week, and the plan persists correctly with all day entries.

---

## Phase 5 — Staff Recording Interface

**Goal:** The simple, mobile-first screen staff actually use during shifts.

- API: endpoint(s) for staff to view today's/this week's planned entries and update `timeSpent` + comment + outcome
- Restrict staff writes to time spent, comments, and outcome only — no editing of contracted hours, allocated time, or calculated totals
- Frontend: "Today's Support" mobile view — activity cards with time input, comment box, and a prominent **+ Record Activity** action
- Explicit **"Outcome"** field (Completed / Partially completed / Refused / Missed / Cancelled / Other) — this is the single authoritative record of what happened
- Keyword scan of comment text (missed, refused, declined, did not) as a **review prompt only**: it surfaces a low-weight "check this entry" hint for managers, and never sets, overrides, or is displayed as the outcome/status

**Milestone:** A staff user can open the app on a phone-sized viewport, record an activity (time + comment + outcome) in a few taps, and see it reflected instantly; keyword detection correctly flags a declined/missed entry.

---

## Phase 6 — Automatic Calculations & Compliance Indicators

**Goal:** The app does the maths so managers don't have to.

- Backend calculation: total delivered hours, remaining hours, per `WeekPlan`
- Compliance status logic (🟢 On Track / 🟡 Under Target / 🔴 Over Hours / Attention Required) — the calculation service reads boundaries from a `ComplianceSettings` record; **no threshold numbers hard-coded** in calculation code
- **Settings surface (owned by this phase):** seed `ComplianceSettings` with sensible defaults and expose a manager-only endpoint + minimal UI to view/edit the 🟢/🟡/🔴 boundaries. "Configurable" is delivered here, not deferred into an unowned config file
- Recalculate automatically whenever a `DayEntry` is updated
- Frontend: totals and status badge visible on both the planner and staff views

**Milestone:** Editing a `DayEntry`'s time spent immediately and correctly updates delivered/remaining hours and the compliance indicator, with no manual recalculation step anywhere in the UI; changing a threshold in settings re-colours statuses accordingly without a code change.

---

## Phase 7 — Manager Summary & Reporting

**Goal:** Managers get an at-a-glance view without opening every record.

- API: weekly summary endpoint (service user, week, contracted/delivered/remaining, missed/refused count, status, activity breakdown)
- Frontend: manager dashboard/summary table across service users and weeks
- Activity breakdown view (counts per activity type)

**Milestone:** A manager can see, in one screen, the status of every active service user for the current week without opening individual plans.

---

## Phase 8 — Commissioner PDF Report

**Goal:** A professional, print-ready one-page export.

- Design print-specific layout (not a screenshot of the app): service user info, week, hours, activity breakdown, weekly notes, missed/refused count
- Implement generation via @react-pdf/renderer (or Puppeteer if layout needs exceed component-based rendering)
- API endpoint to generate/download PDF for a given `WeekPlan`
- Frontend: "Export Report" action on the weekly summary/planner view

**Milestone:** A manager can generate a one-page PDF for any completed week that is accurate, correctly formatted for printing, and matches the data shown in the app.

---

## Phase 9 — Audit Trail

**Goal:** Every meaningful change is traceable.

- `AuditLog` writes triggered on key field changes (time spent, activity, outcome, contracted hours) — capturing who, what, from/to values, and timestamp
- API: read-only audit history per `WeekPlan` or `DayEntry`
- Frontend: simple audit history view, accessible to managers and auditors

**Milestone:** Changing a tracked field produces a correct, timestamped audit entry visible to managers/auditors, and cannot be edited or deleted by any role.

---

## Phase 10 — Auditor Access & QA Pass

**Goal:** Read-only role fully wired up, and the whole MVP hardened.

- Confirm AUDITOR role can view records, summaries, reports, and audit history but cannot write anywhere (backend-enforced, not just hidden in the UI)
- End-to-end pass through all MVP acceptance criteria (Section 23 of the project summary)
- Confirm the small Playwright e2e suite covers the required full-stack journeys (login/refresh, record→summary→PDF, role 403s); component tests carry the rest
- Manual QA on mobile viewport for the staff flow
- Fix bugs, tighten validation, review error states/loading states

**Milestone:** All nine MVP feature areas (auth, service users, weekly plans, activities, calculations, staff recording, manager summary, PDF report, audit info) pass a full run-through for all three roles.

---

## Phase 11 — Deployment

**Goal:** MVP live in a real environment.

- Production Postgres instance (managed service recommended)
- Environment config/secrets for JWT, DB connection
- Build and deploy `apps/api` and `apps/web` (containerised or platform-specific, e.g. Fly.io/Render for API, static hosting for the frontend)
- Basic uptime/error monitoring

**Milestone:** MVP is accessible at a production URL, a manager and a staff user can complete a full weekly cycle (plan → record → report) against the production database.

---

## Suggested Ordering Summary

```
Phase 0  Setup
Phase 1  Data model
Phase 2  Auth & roles
Phase 3  Service users
Phase 4  Weekly planning
Phase 5  Staff recording
Phase 6  Calculations & indicators
Phase 7  Manager summary
Phase 8  Commissioner PDF
Phase 9  Audit trail
Phase 10 Auditor access & QA
Phase 11 Deployment
```

Phases 6 and 7 can start as soon as Phase 4/5 produce real data to calculate against; Phase 9 (audit trail) can be built incrementally alongside Phases 3–5 rather than strictly after, since it hooks into the same write paths.

---

## Post-MVP (not in this plan, see Section 22 of project summary)

Notifications/alerts, advanced analytics and trends, multi-home/organisation hierarchy, Teams/SharePoint integration. These should only be scoped once the MVP milestone in Phase 11 is live and validated with real users.
