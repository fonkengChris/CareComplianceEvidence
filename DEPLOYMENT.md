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

## 3. Create the admin account

After the first successful deploy, open the Render **Shell** for the service and run once:

```bash
bun run db:create-admin
```

This is idempotent and creates the admin account (`olivier.mandengue@rightcareservices.co.uk`,
MANAGER role), the activity list and compliance defaults — no sample data. The admin
password is randomly generated and **printed once** on first run; copy it somewhere safe
immediately. Re-running leaves an existing admin's password unchanged.

## 3b. File storage — Cloudflare R2 (recommended)

Evidence photos go to a Cloudflare R2 bucket when it's configured; otherwise they're stored
in Postgres, which will fill Neon's free 0.5 GB quickly.

1. Cloudflare dashboard → **R2** → **Create bucket** (e.g. `care-tracker-files`). Leave
   **public access off** — files are personal data and are only ever served through the API,
   behind login and assignment checks. Pick the EU jurisdiction if data must stay in the EU
   (then set `R2_ENDPOINT=https://<account-id>.eu.r2.cloudflarestorage.com`).
2. **R2 → Manage API tokens → Create API token** with **Object Read & Write**, scoped to that
   bucket only. Note the Access Key ID and Secret Access Key (shown once).
3. In Render, set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `R2_BUCKET`,
   then redeploy. New uploads now go to R2.
4. If photos were uploaded before R2, copy them across once from the Render **Shell**:

   ```bash
   bun run db:move-photos-to-r2
   ```

   Safe to re-run; already-moved photos are skipped. Old photos keep working until moved.

## 3c. Check-in screens (required before staff can start shifts)

Staff start a shift by entering the rotating 6-digit code shown on a **check-in screen** at
their home. This proves they are on site, so a password alone never opens a home's records
(GDPR). Set one up for each home before rollout. Until a home has one, a manager can start
shifts for its staff from the home page.

1. On a tablet/PC that stays at the home, sign in as a manager and open **Homes → the home →
   Check-in screens**. Name the screen (e.g. "Office tablet") and click **Pair screen**.
2. Click **Open on this device**, or open the one-time pairing link on the screen. Then sign out.
   The screen keeps showing codes with nobody signed in. Its token is stored on that device
   and can only fetch the code.
3. Lost or replaced device: **Unpair** it on the home page. It stops working at once.

Optional env tuning (defaults shown):

| Env | Default | Meaning |
|---|---|---|
| `CHECK_IN_CODE_WINDOW_SECONDS` | `60` | How often the code changes (the previous code is also accepted) |
| `CHECK_IN_MAX_FAILURES` / `CHECK_IN_FAILURE_WINDOW_MINUTES` | `5` / `15` | Wrong codes allowed before shift start is refused for the window |
| `STAFF_HISTORY_WEEKS` | `2` | How many past weeks STAFF/KEY_WORKER can open and record against |
| `ASSIGNMENT_DEFAULT_DAYS` | `90` | Default length of a direct staff↔service-user assignment |

Migration `0011` gives every existing direct assignment an end date 90 days from the migration.
Managers renew the ones still needed from each service user's page.

## 4. Verify

Visit the Render URL:

- `/` loads the app; log in as `olivier.mandengue@rightcareservices.co.uk`.
- Deep-link/refresh (e.g. `/service-users`) returns the app, not JSON.
- `GET /health` returns `{"status":"ok","db":"up"}`.
- Walk plan → record → report → PDF.
- Pair a check-in screen for a home and start a shift as a staff member with its code.

## Notes

- **Free-tier cold start:** the Render free instance sleeps after ~15 min idle; the first
  request after sleeping takes a few seconds to wake.
- **Migrations:** applied automatically at container **startup** in production
  (`apps/server/src/index.ts` calls `runMigrations()`), because Render's free plan silently
  ignores `preDeployCommand`. Idempotent — already-applied migrations are skipped. Generate
  new ones locally with `bun run db:generate` and commit the SQL under `apps/server/drizzle/`;
  the next deploy applies them on boot. (On a paid plan you can switch back to the
  `preDeployCommand: bun run db:migrate` step in `render.yaml`.)
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
