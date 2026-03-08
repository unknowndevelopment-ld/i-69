export interface Env {
  BUCKET: R2Bucket;
  DB: D1Database;
  SESSION_SECRET?: string;
}

export interface User {
  id: number;
  email: string;
  quota_gb: number;
  used_bytes: number;
  is_root: number;
}

export const DEFAULT_QUOTA_GB = 10;
export const MAX_QUOTA_GB = 50;
