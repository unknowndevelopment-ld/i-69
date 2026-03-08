-- Add media_type for dashboard stats and trends (image, audio, video, other)
ALTER TABLE files ADD COLUMN media_type TEXT NOT NULL DEFAULT 'other';

CREATE INDEX IF NOT EXISTS idx_files_media_type ON files(media_type);
CREATE INDEX IF NOT EXISTS idx_files_uploaded_at ON files(uploaded_at);
