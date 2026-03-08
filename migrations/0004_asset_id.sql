-- Asset ID for API / shareable links (e.g. u8y65jh4tn3rhg089)
ALTER TABLE files ADD COLUMN asset_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_files_asset_id ON files(asset_id);

-- Backfill existing rows
UPDATE files SET asset_id = lower(hex(randomblob(8))) WHERE asset_id IS NULL;
