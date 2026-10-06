-- Singleton rows: the SIIAU gateway and the poller's last run.
INSERT INTO `siiau_gateway` (`id`) VALUES (1) ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO `poller_state` (`id`) VALUES (1) ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- 2027A registration: Monday January 11 to Friday January 15, 2027, Guadalajara time (UTC-6),
-- in milliseconds: 2027-01-11T00:00:00-06:00 and 2027-01-16T00:00:00-06:00.
-- Add a row per cycle as the university publishes its calendar (see docs/deploy.md).
INSERT INTO `registration_windows` (`cycle`, `label`, `starts_at`, `ends_at`)
VALUES ('202710', 'Registro de materias 2027A', 1799647200000, 1800079200000)
ON CONFLICT DO NOTHING;
