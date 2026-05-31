-- ============================================================
-- Migration 002: Add Google OAuth support
-- Run this in your Supabase SQL editor AFTER 001_initial_schema.sql
-- ============================================================

-- Add auth_provider enum
CREATE TYPE auth_provider AS ENUM ('email', 'google', 'both');

-- Add Google columns to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS auth_provider auth_provider NOT NULL DEFAULT 'email';

-- Make password_hash nullable (Google users won't have one)
ALTER TABLE users
  ALTER COLUMN password_hash DROP NOT NULL;

-- Index for fast Google ID lookups
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
