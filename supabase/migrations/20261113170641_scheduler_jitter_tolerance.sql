-- Keep scheduled cadence unchanged. Small cooldown margin avoids alternate runs
-- being skipped when pg_cron starts a few milliseconds before the previous time.
-- Respect any independently customised interval: update only shipped defaults.
UPDATE analytics_internal.automation_state SET min_interval_seconds=3500 WHERE job='collect-fx' AND min_interval_seconds=3600;
UPDATE analytics_internal.automation_state SET min_interval_seconds=1700 WHERE job IN('collect-quotes','compute-orientations') AND min_interval_seconds=1800;
UPDATE analytics_internal.automation_state SET min_interval_seconds=82800 WHERE job='collect-reference-prices' AND min_interval_seconds=86400;
