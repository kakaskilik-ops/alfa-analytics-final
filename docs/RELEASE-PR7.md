# PR #7 production release — 17 November 2026

Released with owner authorisation. Main: `ebbce9456661246d3234fe09c5ed06a563d63a16`, merge of [PR #7](https://github.com/kakaskilik-ops/alfa-analytics-final/pull/7). PR #6's existing migration filename alignment is included; its SQL and applied database history were not rewritten.

* [Main CI](https://github.com/kakaskilik-ops/alfa-analytics-final/actions/runs/44088013572): success. PR CI also passed: 137 Vitest, 45 Deno, 19 migration applications, dedicated monitor/RLS tests, 4 browser scenarios.
* [Deploy](https://github.com/kakaskilik-ops/alfa-analytics-final/actions/runs/44088519545): success. Cloudflare Pages accepted the build at <https://d9b7179b.alfa-analytics-final.pages.dev>. Production <https://alfammetal.ru> verified after deployment.
* Deploy workflow was briefly disabled before merge to keep frontend behind the backend upgrade, then restored and explicitly dispatched on main. Its original contents and Cloudflare settings were preserved.

## Database, function and automation

Only Supabase project `vlfzjvwgrvyllvshwmzr` was changed. Preflight confirmed 18 existing versions matched repository filenames, the new monitor tables did not exist, 13 active materials and 3 regions were present, and seven existing cron jobs were active.

The `market_monitor` migration was applied through Supabase MCP and assigned actual version **20261117125754**. The original source filename was `20261117115646_market_monitor.sql`. This release-record branch renames the file to the actual applied version, with **identical SQL**, instead of rewriting `supabase_migrations.schema_migrations`. No migration repair, old migration rerun or database version update was performed. Total applied versions: 19.

`collect-market-monitor` is ACTIVE, version 1, bundle SHA-256 `40393b7c4191305f353a1f0ac4cc620d63ab37e4c98b8fc0870271b261e2c32e`. Gateway JWT verification is off as designed, while the handler checks the existing private collector token. No token was exported to client code or logs.

The exact target-guarded activation script enabled TED, USAspending and Contracts Finder and created only `alfa-market-monitor-15m` (job 9), schedule `3,18,33,48 * * * *`. Source HTTP cadence remains 30/60/30 minutes with additional backoff. The existing seven jobs remain unchanged. At **16:03 Moscow**, the first automatic Cron invocation succeeded; Edge returned HTTP 200 and skipped sources because their cadence/backoff had not expired. This verifies scheduling and protection, not an additional data fetch.

## Actual production observations

The first protected real collection, request 881, returned HTTP 207:

| Source | Stored events | Public | Pending | State |
| --- | ---: | ---: | ---: | --- |
| TED | 6 | 0 | 6 | Partial historical traversal, no error |
| USAspending | 19 | 12 | 7 | Partial historical traversal, no error |
| Contracts Finder | 0 | 0 | 0 | Upstream HTTP error from Edge; delayed/backoff |
| Total | **25** | **12** | **13** | |

Contracts Finder's public API had returned HTTP 200 in local development, including the historical Birmingham award. The hosted Edge fetch failed with `monitor_source_http_error`; the current sanitized error log does not retain the exact upstream HTTP status. No claim of successful hosted CF collection is made. No retry limit was bypassed, no local fixture was imported, and previous data was not deleted. Its network availability from Supabase remains an open operational issue.

All 25 stored normalized events were reprocessed through the storage RPC with their real source document and original draft/public story: all returned `duplicate`. Event revisions remained 25, publications 12, pending moderation 13. No pending record was approved merely to populate the site. **Zero verified allocated contract unit prices**; obligations are labelled as cumulative obligations, not exchange quotes or completed sales.

The earlier isolated test corpus remains distinct: 35 raw source rows → 34 material candidates → 16 permitted publications and 18 pending. These test counts must not be represented as production counts.

## Live site and access verification

Without mocked API data, Chromium checked 1440px and 390px screens:

* Production HTTP 200, monitor shows 12 real public records.
* Niobium filter shows the actual `NIOBIUM METAL INGOTS` registry record.
* Event CSV downloads contain the actual source URLs and obligation basis.
* Contract-price tab honestly shows no confirmed allocated unit prices.
* Coverage contains 13 rows × 3 regions, with all 13 Asian positions unconnected.
* News → «Тендеры и сделки» displays the same 12 public records when the full available period is selected.
* Homepage and real currency converter load; no horizontal page overflow in the mobile monitor; JavaScript errors 0; unexpected Supabase API errors 0.

Actual anonymous REST checks: approved event columns HTTP 200; private `document_id` HTTP 401; `monitor_begin` HTTP 401; anonymous source update HTTP 401; collector POST without private token HTTP 401. RLS enabled on all 10 monitor tables. Security advisor found no new monitor issue; it still reports the pre-existing [disabled leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), which was not changed in this release.

## Backup and rollback

Previous production commit **9dbebf7eb5f436b609eff6b07fb2a4b8783d10b9**, fixed by remote tag `alfa-monitor-pre-release-20261117`. Previous deployment <https://060229cb.alfa-analytics-final.pages.dev>. Local ignored `work/release-pr7/` contains the old source archive/index/production manifest, pre-change migration/source-reference/Cron snapshot, deployment plan and logs, real REST/browser results, CSV and desktop/mobile screenshots. No Vault values, service keys or Groq key were backed up into git. This is a scoped release backup, not a claimed full database point-in-time backup: the migration creates new module objects and does not modify existing application rows.

If necessary, stop only `alfa-market-monitor-15m`, disable its three sources, preserve collected records/history, and restore the reviewed previous frontend. No schema/data deletion is required for rollback. No critical platform failure required rollback during this release; one external source is delayed and visibly reported.

No DNS, SSL, domain, tariff, Groq settings or unrelated project was changed. No Asian or exchange adapter was activated. Remaining work: resolve Contracts Finder hosted availability within allowed access methods, let bounded backfill proceed, moderate ambiguous records, and acquire separately verified rights/connectors for Asian/exchange data.
