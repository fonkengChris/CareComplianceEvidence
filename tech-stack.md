# Tech Stack — Care 1-to-1 Hours Tracker

## 1. Summary

| Layer | Choice |
|---|---|
| Runtime | Bun |
| Frontend | React + TypeScript |
| Styling | Tailwind CSS |
| UI components | shadcn/ui |
| Backend | TypeScript (Node-compatible, run on Bun) |
| API layer | Express (or Hono — see note below) |
| Database | **PostgreSQL** |
| ORM | Drizzle ORM |
| Auth | JWT access + revocable refresh tokens, role middleware (STAFF / MANAGER / AUDITOR) |
| PDF generation | Puppeteer or @react-pdf/renderer |
| Package manager | Bun (single toolchain for install, run, test, bundle) |

---

## 2. Database: PostgreSQL (not MongoDB)

The original Excel-derived notes suggested MongoDB, but given the actual shape of this data, **PostgreSQL is the more logical choice**. Reasoning:

- **The data is inherently relational, not document-shaped.** `ServiceUser → WeekPlan → DayEntry` is a strict, fixed, three-level hierarchy with clear foreign keys. There's no need for flexible/nested schemas — every record has the same shape every time.
- **Aggregation-heavy reporting.** Contracted vs delivered vs remaining hours, activity breakdowns, weekly/monthly trends, and the Commissioner Report all require `SUM`/`GROUP BY`-style aggregation across related tables. SQL is a more natural and performant fit than MongoDB's aggregation pipeline for this kind of tabular reporting.
- **Compliance and audit integrity.** A care-sector tool handling contracted hours and audit trails benefits from strong ACID guarantees, foreign key constraints, and transactional writes (e.g. updating a `DayEntry` and its parent `WeekPlan` total together) — Postgres enforces this at the database level; MongoDB requires more manual discipline.
- **Auditors need read-only, consistent views.** Relational views/permissions map cleanly onto the STAFF/MANAGER/AUDITOR role model.
- **Growth path.** The "Future enhancements" section (multi-home, organisation hierarchy, notifications, analytics) is also naturally relational — Postgres scales well into that structure without a redesign.

MongoDB would only make more sense if activity/day-entry shapes were highly variable per service user — they aren't; they're a fixed, standardised list (Section 6).

### ORM: Drizzle
Drizzle is recommended over Mongoose/Prisma here because it's lightweight, fully TypeScript-native, has excellent Bun support, and generates real SQL migrations — a good fit for a schema this stable and audit-sensitive.

---

## 3. Frontend

- **React + TypeScript**, built and served via **Bun** (`bun run` / `bunx`)
- **Vite** as the build tool (Bun-compatible, fast dev server, works cleanly with React + TS)
- **Styling**: **Tailwind CSS** for the whole UI — utility-first, fast to build, easy responsive breakpoints for the mobile-first staff recording screens and a slightly denser table/grid layer for the manager planning view
- **Component library**: **shadcn/ui** — accessible, unstyled-by-default components (built on Radix UI primitives) that are copied into the codebase rather than installed as a black-box dependency. This keeps components fully editable and Tailwind-native, fits the STAFF/MANAGER/AUDITOR views cleanly, and provides ready-made primitives (dialogs, dropdowns, tables, forms, toasts) that pair naturally with React Hook Form + Zod. Because the code lives in `apps/web`, it stays in-repo and versioned with everything else.
- **React Router** for role-based navigation (STAFF / MANAGER / AUDITOR views)
- **React Query (TanStack Query)** for API state, caching weekly plan data, and handling the auto-calculated totals reactively
- **React Hook Form + Zod** for form validation (weekly plan creation, activity entry) — Zod schemas can be shared between frontend and backend for consistent validation rules

---

## 4. Backend

- **TypeScript**, run natively on **Bun** (no separate Node runtime needed — Bun executes TS directly)
- **API framework**: Express is fine and familiar, but since the whole stack is already committed to Bun, **Hono** is worth strong consideration — it's built with Bun in mind, has first-class TypeScript types, and is noticeably faster on Bun's runtime than Express. Either works; Hono is the more "native" choice for this stack.
- **Layered structure** (as in the original notes):
  ```
  Routes → Controllers → Services → Drizzle models/queries
  ```
- **Validation**: Zod, shared with frontend where possible
- **Auth**: short-lived **JWT access tokens** paired with longer-lived **refresh tokens** for silent re-authentication. Refresh tokens are persisted server-side (hashed, in a `RefreshToken` table) so they can be **revoked** — logout, and deactivating a user, invalidate the token immediately, so a departed staff member loses access without waiting for a JWT to expire. Access tokens stay short-lived precisely because they can't be revoked mid-life; the refresh token is the revocation point. Rotate refresh tokens on use. Role middleware guards routes by STAFF/MANAGER/AUDITOR on top of this.
- **Audit logging**: a dedicated `AuditLog` table (who/what/when/from/to), written via a service-layer hook whenever a tracked field changes (e.g. `timeSpent`)

---

## 5. PDF / Commissioner Report

- **@react-pdf/renderer** is a good fit since the team is already in React/TS — reports can be composed as React components and rendered server-side to PDF, avoiding a "screenshot the screen" approach
- Alternative: **Puppeteer** rendering a dedicated print-styled HTML template if more layout flexibility is needed later

---

## 6. Testing & Tooling

**Testing strategy — component tests first, e2e sparingly.** The bulk of coverage comes from fast, isolated **component/unit tests**; end-to-end tests are reserved only for flows that genuinely need the full stack running.

- **Bun's built-in test runner** (`bun test`) for both frontend and backend unit/integration tests — avoids adding Jest/Vitest as a separate dependency
- **Component tests (the default):** React Testing Library running under `bun test` with a DOM environment (happy-dom). Cover components, hooks, form validation, and — critically — the backend **calculation/compliance service** (pure functions over known inputs: delivered/remaining hours, 🟢/🟡/🔴 status against configurable thresholds). This is the highest-risk-for-correctness area and the cheapest to test exhaustively here.
- **End-to-end tests (only where absolutely required):** Playwright, limited to the handful of full-stack journeys where integration is the thing under test — e.g. login→refresh-token flow, staff record→manager summary→PDF download, and role-based 403 enforcement. Keep this suite small and stable; do not mirror component coverage in e2e.
- **ESLint + Prettier** (TypeScript configs) for consistency across frontend/backend
- **Drizzle Kit** for migrations, run via `bunx drizzle-kit`

---

## 7. Suggested Repo Structure

```
care-tracker/
├── apps/
│   ├── web/            # React + TS frontend (Vite)
│   └── api/            # TS backend on Bun (Hono/Express)
├── packages/
│   └── shared/         # Shared Zod schemas + TS types (ServiceUser, WeekPlan, DayEntry, ActivityType)
├── drizzle/             # Postgres schema + migrations
├── bun.lockb
└── tech-stack.md
```

A monorepo (Bun workspaces) keeps the shared Zod/TypeScript types in one place so the frontend form validation and backend request validation never drift apart.

---

## 8. Why this stack fits the MVP

- Bun everywhere means one install step, one lockfile, one test runner — less tooling overhead for a small first version.
- Postgres + Drizzle gives correct, auditable, reportable data from day one, matching the compliance-heavy nature of a care setting.
- React + TS + Zod on both ends keeps the staff/manager UI simple to build fast while staying type-safe end to end.
