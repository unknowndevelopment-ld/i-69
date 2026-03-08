-- Public user ID for URLs (e.g. /dashboard/CCGjn6945jJUgreKf)
-- SQLite cannot add a UNIQUE column via ALTER TABLE; add column then create index.
ALTER TABLE users ADD COLUMN public_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_public_id ON users(public_id);
