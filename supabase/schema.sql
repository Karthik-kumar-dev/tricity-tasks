-- ============================================================
-- Tricity Tasks — Database Schema
-- Run this in your Supabase SQL Editor to create tables + seed
-- ============================================================

-- Tasks table (no release_date; admin toggles is_active)
CREATE TABLE IF NOT EXISTS tasks (
  id                  SERIAL PRIMARY KEY,
  title               TEXT NOT NULL,
  description         TEXT NOT NULL,
  is_active           BOOLEAN NOT NULL DEFAULT false,
  rules               TEXT,
  linkedin_template   TEXT,
  instagram_template  TEXT
);

-- Migration for existing tasks table in Supabase SQL Editor:
-- ALTER TABLE tasks ADD COLUMN IF NOT EXISTS rules TEXT;
-- ALTER TABLE tasks ADD COLUMN IF NOT EXISTS linkedin_template TEXT;
-- ALTER TABLE tasks ADD COLUMN IF NOT EXISTS instagram_template TEXT;

-- Submissions table with composite unique constraint
CREATE TABLE IF NOT EXISTS submissions (
  id                      SERIAL PRIMARY KEY,
  team_id                 TEXT NOT NULL,
  member_name             TEXT NOT NULL,
  member_name_normalized  TEXT NOT NULL,
  college_name            TEXT,
  future_plan             TEXT,
  task_id                 INT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  answer                  TEXT NOT NULL,
  link                    TEXT,
  score                   INT CHECK (score >= 0 AND score <= 20),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, member_name_normalized, task_id)
);

-- Migration for existing scores (run in Supabase SQL Editor):
-- UPDATE submissions SET score = ROUND(score * 20.0 / 100.0) WHERE score IS NOT NULL;
-- ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_score_check;
-- ALTER TABLE submissions ADD CONSTRAINT submissions_score_check CHECK (score >= 0 AND score <= 20);

-- If you already have an existing submissions table, run this migration in Supabase SQL Editor:
-- ALTER TABLE submissions ADD COLUMN IF NOT EXISTS college_name TEXT;
-- ALTER TABLE submissions ADD COLUMN IF NOT EXISTS future_plan TEXT;

-- Index for fast team lookups
CREATE INDEX IF NOT EXISTS idx_submissions_team_id ON submissions(team_id);
CREATE INDEX IF NOT EXISTS idx_submissions_task_id ON submissions(task_id);

-- ============================================================
-- Seed 5 sample tasks (all start as inactive / locked)
-- ============================================================
-- If you already have an existing tasks table, update Task 1 in Supabase SQL Editor:
-- UPDATE tasks SET title = 'Task 1 — Share Your Registration Poster',
--   description = 'Create your personalized registration poster: upload your profile photo, crop it, add your name and college, then download and share it on LinkedIn. Paste your public LinkedIn post URL to complete this task. Note: Only links from the LinkedIn app/website are accepted.'
--   WHERE id = 1;

INSERT INTO tasks (title, description) VALUES
  (
    'Task 1 — Share Your Registration Poster',
    'Create your personalized registration poster: upload your profile photo, crop it, add your name and college, then download the poster and share it on LinkedIn. Paste your public LinkedIn post URL to complete this task. Note: Only links from the LinkedIn app/website are accepted.'
  ),
  (
    'Task 2 — Data Hunt',
    'Hidden within a public dataset lies a critical piece of information. Navigate through the noise, apply filters, and extract the signal. Provide the answer along with the query or method you used to find it.'
  ),
  (
    'Task 3 — Logic Puzzle',
    'Five suspects, three clues, one truth. Use deductive reasoning to solve this logic grid. No guessing allowed — every conclusion must follow from the given constraints. Show your elimination steps.'
  ),
  (
    'Task 4 — Code Challenge',
    'Write a function that takes a list of timestamps and returns the longest streak of consecutive days with activity. Optimize for clarity and efficiency. Submit your code and a brief explanation of your approach.'
  ),
  (
    'Task 5 — Final Showdown',
    'Combine insights from all previous tasks to crack the final challenge. This is a multi-step puzzle that tests everything you have learned. The answer is a single phrase — choose wisely.'
  );

-- ============================================================
-- Registrations Table & Atomic Replace Function
-- Run in Supabase SQL Editor:
-- ============================================================

CREATE TABLE IF NOT EXISTS registrations (
  id              SERIAL PRIMARY KEY,
  registration_id TEXT NOT NULL,
  team_name       TEXT NOT NULL,
  role            TEXT NOT NULL,
  member_name     TEXT NOT NULL,
  UNIQUE (registration_id, role)
);

CREATE INDEX IF NOT EXISTS idx_registrations_registration_id ON registrations(registration_id);
CREATE INDEX IF NOT EXISTS idx_registrations_team_name ON registrations(team_name);

-- Atomic replacement function (single transaction: deletes all rows and inserts new rows, rolling back on error)
CREATE OR REPLACE FUNCTION replace_registrations(rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  inserted_count int := 0;
BEGIN
  -- Delete all existing rows
  DELETE FROM registrations;

  -- Insert new rows from json array
  INSERT INTO registrations (registration_id, team_name, role, member_name)
  SELECT 
    TRIM(r->>'registration_id'),
    TRIM(r->>'team_name'),
    TRIM(r->>'role'),
    TRIM(r->>'member_name')
  FROM jsonb_array_elements(rows) AS r;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  RETURN json_build_object('success', true, 'count', inserted_count);
EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;

-- ============================================================
-- Task 2 Multi-Link Challenge — Links column on tasks table
-- Run this migration in Supabase SQL Editor:
-- ============================================================
-- ALTER TABLE tasks ADD COLUMN IF NOT EXISTS links JSONB DEFAULT '[]'::jsonb;

-- ============================================================
-- Task 2 Multi-Link Challenge — Link click tracking
-- Records which individual links each user has opened
-- ============================================================
CREATE TABLE IF NOT EXISTS task_link_clicks (
  id                      SERIAL PRIMARY KEY,
  team_id                 TEXT NOT NULL,
  member_name_normalized  TEXT NOT NULL,
  task_id                 INT NOT NULL,
  link_id                 TEXT NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, member_name_normalized, task_id, link_id)
);

CREATE INDEX IF NOT EXISTS idx_task_link_clicks_lookup
  ON task_link_clicks(team_id, member_name_normalized, task_id);

