import { useEffect, useState } from 'react';
import type { HealthStatus } from '@care/shared';

export default function App() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data: HealthStatus) => setHealth(data))
      .catch(() => setError('Could not reach the API'));
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">Care 1-to-1 Hours Tracker</h1>
      {error && <p className="text-red-600">{error}</p>}
      {health ? (
        <p role="status" className="text-green-700">
          API status: {health.status} · DB: {health.db}
        </p>
      ) : (
        !error && <p className="text-gray-500">Checking API…</p>
      )}
    </main>
  );
}
