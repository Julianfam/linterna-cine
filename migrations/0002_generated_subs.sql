CREATE TABLE IF NOT EXISTS generated_subs (
  film_id TEXT PRIMARY KEY,
  archive_id TEXT NOT NULL,
  vtt TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'audio',
  cues INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
