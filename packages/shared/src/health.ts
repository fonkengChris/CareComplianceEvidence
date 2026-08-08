import { z } from 'zod';

/**
 * Health-check response shape. Used by the server (response validation) and the
 * client (typed fetch) to confirm cross-package imports work end to end.
 */
export const healthStatusSchema = z.object({
  status: z.literal('ok'),
  db: z.enum(['up', 'down']),
});

export type HealthStatus = z.infer<typeof healthStatusSchema>;
