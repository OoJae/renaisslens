-- Milestone 2: columns the reserved ev_runs table needs to hold a full
-- EvResult. The table has never held rows, so ADD COLUMN with defaults is
-- safe everywhere. `scenario` is a real column (not JSON) because the
-- dashboard reads "newest run per (pack, scenario)".
ALTER TABLE ev_runs ADD COLUMN scenario TEXT NOT NULL DEFAULT 'neutral';
ALTER TABLE ev_runs ADD COLUMN prob_break_even REAL;
ALTER TABLE ev_runs ADD COLUMN prob_top_prize REAL;
ALTER TABLE ev_runs ADD COLUMN prob_ev_above_price REAL; -- drives the verdict badge
ALTER TABLE ev_runs ADD COLUMN ev_mean_cents INTEGER;    -- diagnostic; UI shows ranges, never this alone
ALTER TABLE ev_runs ADD COLUMN iterations INTEGER;
ALTER TABLE ev_runs ADD COLUMN seed INTEGER;

CREATE INDEX idx_ev_runs_pack_scenario_time ON ev_runs(pack_slug, scenario, ran_at DESC);
