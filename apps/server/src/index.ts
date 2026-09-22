import { app } from './app';
import { config } from './config';
import { runMigrations } from './db/migrate';

const port = Number(process.env.PORT ?? 3000);

// Render's free plan silently ignores `preDeployCommand`, so pending migrations must be
// applied at boot in production. Idempotent, and a single free instance means no
// cross-instance race. Local dev keeps the explicit generate → migrate → seed workflow.
if (config.isProd) {
  await runMigrations();
  console.log('Migrations applied on startup.');
}

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
