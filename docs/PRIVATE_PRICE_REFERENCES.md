# Private historical market references

The owner's supplied historical snapshot is the primary price in the existing lower home quotations table, catalogue cards and detail dialogs. There is no extra upper price block. All use `fetchPrimaryPrices`, `selectPrimaryPrices` and `VerifiedPrice`. Buyer offers are excluded from this UI; their historical database rows and collectors remain unchanged.

Prices and owner identities are **not** seeded in migrations, committed fixtures, static assets or this report. Load owner-provided notes separately into `private_market_references`, with their actual verification status and unknown observation dates left null. This is not an authorized SMM live feed. A numerical match or publication date does not establish the date of the owner's snapshot or reproduction rights. `verified` requires an observation date, evidence URL and confirmed permission.

Ranges display endpoints without a fabricated midpoint. FeMo uses kg of contained Mo; FeW uses kg of alloy. Unit conversion multiplies both endpoints by 1000. Price sorting uses the displayed point or lower range endpoint; it is not a comparable market average. No private values are sent to charts, exports, AI or public APIs. Existing public World Bank monthly history remains available in a collapsed panel inside quotations.

Regional selection requires an explicitly verified market basis. Supplier addresses never determine it. Selection filters by region before applying precedence: owner snapshot, validated public regional quotation, World Bank monthly reference. Missing regional prices remain missing. The all-metals view preserves the owner's historical snapshot.

## Release and rollback

1. Run lint, typecheck/build, unit, PGlite/RLS, Deno and browser tests; require green PR CI and a fresh mergeable base.
2. Record previous production SHA in a remote rollback tag and save database preflight metadata privately. This additive migration does not modify existing price rows or Auth records.
3. Before merging frontend changes, apply only the new additive migration to the ALFA project, load the owner's notes privately and deploy the protected `verify-owner-login` smoke function. The previous frontend remains compatible throughout.
4. Run the protected smoke: real owner-key login, genuine Auth session, owner RLS reads, expected row count, local test-session revocation. No key, token, identity or price leaves that function. Confirm anonymous direct access is denied and existing data counts unchanged.
5. Align the local filename to the actual migration version in this PR, without rewriting applied migration history. After backend verification and green CI, merge the exact checked head and await the existing automatic Pages deployment. Check domain asset version and desktop/mobile gate.
6. If backend verification fails, keep the frontend PR unmerged and restore the previous smoke-function source. The additive table can remain closed behind RLS. If frontend verification fails, redeploy the rollback tag through the same workflow. Do not delete historical data or rewrite migrations.

## Validation

Unit tests use synthetic values, cover single/range validation, buyer exclusion, precedence and strict regional filtering. PGlite tests enforce owner-only SELECT, no client writes, anonymous/other-user isolation, duplicates, finite positive values and alloy/verification constraints. Browser tests compare all 13 synthetic references between home and catalogue, detail dialogs, kg/ton conversions, region gaps, mobile width, private export exclusion and JS errors. Existing public histories, FX conversion, news, AI quota and Auth tests remain active.

Existing security advisories remain: the narrowly scoped owner-access boolean function is intentionally SECURITY DEFINER with fixed search path; leaked-password protection was already disabled. This change does not alter Auth settings. See https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable and https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection .
