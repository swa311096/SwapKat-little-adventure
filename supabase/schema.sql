-- SwapKat's Adventure Time - Supabase Schema
-- Run this in Supabase SQL Editor after creating your project

-- Single table: stores the full app state (shared between Swapnil & Kat)
CREATE TABLE IF NOT EXISTS app_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL DEFAULT 'swapkat_main',
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert initial row if not exists (empty state - app will seed on first load)
INSERT INTO app_data (key, data)
VALUES ('swapkat_main', '{"currentUser":null,"currentContext":"work","users":{}}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Enable Row Level Security (optional - for now allow all, add auth later if needed)
ALTER TABLE app_data ENABLE ROW LEVEL SECURITY;

-- Policy: allow all reads and writes (shared app for trusted users)
DROP POLICY IF EXISTS "Allow all for swapkat" ON app_data;
CREATE POLICY "Allow all for swapkat" ON app_data
  FOR ALL USING (true) WITH CHECK (true);
