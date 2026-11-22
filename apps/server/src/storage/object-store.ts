import { S3Client } from 'bun';
import { config } from '../config';

/**
 * Object storage for uploaded files (evidence photos, and later documents), backed by
 * Cloudflare R2 through Bun's built-in S3 client (R2 speaks the S3 API, so no SDK
 * dependency). The bucket stays PRIVATE: files are personal data about service users, so
 * they are never served from a public R2 URL — the API reads them here and streams them
 * back behind the same role + assignment guards as the rest of the plan.
 *
 * Optional: when R2 isn't configured `objectStore` is null and callers keep files in
 * Postgres (local dev, tests). Rows record which one holds them, so both can coexist.
 */
export interface ObjectStore {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  /** The object's bytes, or null if no such key exists. */
  get(key: string): Promise<Buffer | null>;
  /** Idempotent: deleting a missing key is not an error. */
  delete(key: string): Promise<void>;
}

function createR2Store(): ObjectStore | null {
  const { accountId, accessKeyId, secretAccessKey, bucket, endpoint } = config.r2;
  if (!accessKeyId || !secretAccessKey || !bucket || !(endpoint || accountId)) return null;

  const client = new S3Client({
    accessKeyId,
    secretAccessKey,
    bucket,
    endpoint: endpoint || `https://${accountId}.r2.cloudflarestorage.com`,
    region: 'auto',
  });

  return {
    async put(key, data, contentType) {
      await client.write(key, data, { type: contentType });
    },
    async get(key) {
      const file = client.file(key);
      if (!(await file.exists())) return null;
      return Buffer.from(await file.arrayBuffer());
    },
    async delete(key) {
      await client.delete(key);
    },
  };
}

export const objectStore: ObjectStore | null = createR2Store();

/**
 * Best-effort removal of objects whose rows are already gone (deleted photo, removed plan
 * line). Runs after the DB commit, so a storage hiccup never rolls back an audited delete;
 * a failure only leaves an orphaned object, which is logged.
 */
export async function deleteObjectsQuietly(keys: readonly string[]): Promise<void> {
  if (!objectStore || keys.length === 0) return;
  const results = await Promise.allSettled(keys.map((k) => objectStore!.delete(k)));
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(`object-store: failed to delete ${keys[i]} (orphaned)`, r.reason);
    }
  });
}
