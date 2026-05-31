-- Migration 003: Enable RLS on all tables
-- Backend uses service_role key which bypasses RLS entirely
-- These policies block direct anon/authenticated access to the database

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE notion_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_all_users" ON users AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "deny_all_subscriptions" ON subscriptions AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "deny_all_onboarding" ON onboarding_state AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "deny_all_notion_configs" ON notion_configs AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "deny_all_templates" ON templates AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "deny_all_schedules" ON schedules AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "deny_all_journal_runs" ON journal_runs AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "deny_all_team_members" ON team_members AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "deny_all_refresh_tokens" ON refresh_tokens AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false);
