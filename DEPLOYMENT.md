# Deployment

Live-testing setup: **one Render Web Service** (Docker) runs the Bun/Express API and
serves the built React SPA from the same origin, backed by **Neon** free Postgres.

Because the browser talks to a single origin, the `sameSite=lax` refresh-token cookie
works with no CORS configuration. The API is served under `/api/*`; every other path is
handled by the SPA.

## 1. Database — Neon

1. Create a project at  (free tier).
2. Copy the **pooled** connection string (the host contains `-pooler`). Ensure it ends
   with `?sslmode=require`, e.g.
   `postgresql://user:pass@ep-xxxx-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require`.

## 2. Web service — Render

Either use the committed `render.yaml` Blueprint (New → Blueprint → pick the repo) or
create it manually: **New → Web Service → Docker**, pointing at this repo. Then set:

| Setting | Value |
|---|---|
| Runtime | Docker (`./Dockerfile`) |
| Health check path | `/health` |
| Pre-Deploy command | `bun run db:migrate` |
| Env `NODE_ENV` | `production` |
| Env `JWT_SECRET` | generate: `openssl rand -hex 32` |
| Env `DATABASE_URL` | the Neon pooled string from step 1 |

`PORT` is injected by Render automatically — `apps/server/src/index.ts` already reads it.

## 3. First-run seed

After the first successful deploy, open the Render **Shell** for the service and run once:

```bash
bun run db:seed
```

This is idempotent and creates the login accounts, activity list, compliance defaults,
and sample data. Seeded accounts share the password `Password123!`
(`manager@example.com`, `staff@example.com`, `auditor@example.com`) — **test-only
credentials; change or remove them before any real use.**

## 4. Verify

Visit the Render URL:

- `/` loads the app; log in as `manager@example.com`.
- Deep-link/refresh (e.g. `/service-users`) returns the app, not JSON.
- `GET /health` returns `{"status":"ok","db":"up"}`.
- Walk plan → record → report → PDF.

## Notes

- **Free-tier cold start:** the Render free instance sleeps after ~15 min idle; the first
  request after sleeping takes a few seconds to wake.
- **Migrations:** `bun run db:migrate` runs on every deploy (idempotent — already-applied
  migrations are skipped). Generate new ones locally with `bun run db:generate` and commit
  the SQL under `apps/server/drizzle/`.
- **Neon SSL:** handled via `?sslmode=require` in the URL. If TLS ever fails to negotiate,
  force it in `apps/server/src/db/index.ts` by passing `{ ssl: 'require' }` to `postgres(url)`
  for non-localhost hosts.

## Local production smoke test

```bash
bun run --filter @care/client build
NODE_ENV=production \
  DATABASE_URL='postgresql://...neon...?sslmode=require' \
  JWT_SECRET="$(openssl rand -hex 32)" \
  bun apps/server/src/index.ts
# open http://localhost:3000
```
