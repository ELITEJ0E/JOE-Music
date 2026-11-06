-- Run once in Cloudflare dashboard > Workers & Pages > D1 > joe-chords > Console.
CREATE TABLE IF NOT EXISTS verified_chords (
  video_id TEXT PRIMARY KEY NOT NULL,
  song_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
