-- Public user ID for URLs (e.g. /dashboard/CCGjn6945jJUgreKf)
ALTER TABLE users ADD COLUMN public_id TEXT UNIQUE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_public_id ON users(public_id);
