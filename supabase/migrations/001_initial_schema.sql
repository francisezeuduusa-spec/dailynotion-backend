-- ============================================================
-- DailyNotion Database Schema
-- Run this entire file in your Supabase SQL editor
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- USERS TABLE
-- Tracks every user and exactly where they are in the flow
-- status enum is the guard logic source of truth
-- ============================================================
CREATE TYPE user_status AS ENUM (
  'signed_up',      -- created account, hasn't selected a plan yet
  'plan_selected',  -- selected a plan, free users skip to active
  'pending_payment',-- selected paid plan, hasn't completed Stripe yet
  'active',         -- fully onboarded, can access dashboard
  'suspended'       -- payment failed or manually suspended
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  status user_status NOT NULL DEFAULT 'signed_up',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);

-- ============================================================
-- SUBSCRIPTIONS TABLE
-- One row per user. Free users get a row too (plan = 'free')
-- ============================================================
CREATE TYPE plan_type AS ENUM ('free', 'pro', 'team');
CREATE TYPE billing_interval AS ENUM ('monthly', 'yearly');
CREATE TYPE subscription_status AS ENUM (
  'active', 'past_due', 'canceled', 'trialing', 'incomplete'
);

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan plan_type NOT NULL DEFAULT 'free',
  billing_interval billing_interval,
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  stripe_price_id TEXT,
  status subscription_status NOT NULL DEFAULT 'active',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  seats INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id);

-- ============================================================
-- ONBOARDING STATE TABLE
-- Tracks each step of the onboarding flow individually
-- Guard middleware checks this to resume where they left off
-- ============================================================
CREATE TABLE onboarding_state (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  notion_connected BOOLEAN NOT NULL DEFAULT FALSE,
  journal_db_selected BOOLEAN NOT NULL DEFAULT FALSE,
  tasks_db_selected BOOLEAN NOT NULL DEFAULT FALSE,
  template_chosen BOOLEAN NOT NULL DEFAULT FALSE,
  schedule_set BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_onboarding_user_id ON onboarding_state(user_id);

-- ============================================================
-- NOTION CONFIGS TABLE
-- Stores the OAuth tokens and selected database IDs per user
-- ============================================================
CREATE TABLE notion_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  workspace_name TEXT,
  workspace_icon TEXT,
  bot_id TEXT,
  journal_db_id TEXT,
  journal_db_name TEXT,
  tasks_db_id TEXT,
  tasks_db_name TEXT,
  notes_db_id TEXT,
  notes_db_name TEXT,
  habits_db_id TEXT,
  habits_db_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notion_configs_user_id ON notion_configs(user_id);

-- ============================================================
-- TEMPLATES TABLE
-- User-created journal templates with placeholder support
-- ============================================================
CREATE TABLE templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_templates_user_id ON templates(user_id);

-- ============================================================
-- SCHEDULES TABLE
-- One schedule per user. Stores time + timezone for cron job
-- ============================================================
CREATE TABLE schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  generate_time TIME NOT NULL DEFAULT '08:00:00',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_schedules_user_id ON schedules(user_id);
CREATE INDEX idx_schedules_active ON schedules(is_active);

-- ============================================================
-- JOURNAL RUNS TABLE
-- Every generation attempt logged here (success or fail)
-- Used for history page in dashboard
-- ============================================================
CREATE TYPE run_status AS ENUM ('success', 'failed', 'pending');
CREATE TYPE run_trigger AS ENUM ('scheduled', 'manual');

CREATE TABLE journal_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trigger run_trigger NOT NULL DEFAULT 'scheduled',
  status run_status NOT NULL DEFAULT 'pending',
  notion_page_id TEXT,
  notion_page_url TEXT,
  tasks_count INTEGER DEFAULT 0,
  notes_count INTEGER DEFAULT 0,
  error_message TEXT,
  run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_journal_runs_user_id ON journal_runs(user_id);
CREATE INDEX idx_journal_runs_run_at ON journal_runs(run_at DESC);

-- ============================================================
-- TEAM MEMBERS TABLE (for Team plan)
-- Links additional seats to the owner's subscription
-- ============================================================
CREATE TYPE member_role AS ENUM ('owner', 'member');

CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role member_role NOT NULL DEFAULT 'member',
  invited_email TEXT,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(subscription_id, user_id)
);

CREATE INDEX idx_team_members_subscription ON team_members(subscription_id);
CREATE INDEX idx_team_members_user ON team_members(user_id);

-- ============================================================
-- REFRESH TOKENS TABLE
-- Tracks issued refresh tokens for JWT rotation
-- ============================================================
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);

-- ============================================================
-- UPDATED_AT TRIGGER (auto-update timestamps)
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER subscriptions_updated_at BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER onboarding_state_updated_at BEFORE UPDATE ON onboarding_state FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER notion_configs_updated_at BEFORE UPDATE ON notion_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER templates_updated_at BEFORE UPDATE ON templates FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER schedules_updated_at BEFORE UPDATE ON schedules FOR EACH ROW EXECUTE FUNCTION update_updated_at();
