# ALFA MARKET MONITOR — implementation and verified limits

Status: development branch, **not deployed**. No production Supabase data, schedules, Groq budget, Cloudflare, DNS or SSL changed by this work. The existing application and separate Groq analytics are preserved.

## Working cycle

`collect-market-monitor` → official JSON APIs → deterministic source adapters → field validation → private raw JSON + hash → stable source/entity ID + revision → public verified event and Russian publication **or private moderation queue** → `#monitor` and News / «Тендеры и сделки». No AI call, AI key or AI translation is part of this pipeline.

The test cycle normalizes 34 material events from 35 real official search records: TED 13 (3 published / 10 review), USAspending 20 raw hits → 19 material candidates (12 / 7), Contracts Finder 2 (1 / 1). All **34 repeated ingestions are duplicates**, with unchanged publication/revision counts. Thus **16 public records and 18 moderation records**, not 16 completed sales. These include historical records; discovery time is not the event date. Confirmed allocated contract prices in this corpus: **zero**. There is no invented price chart.

An additional live check on 17 November 2026, 15:32 Moscow time, received HTTP 200 from all three production API endpoints. TED: latest 20 search hits, 6 material candidates, all require review. USAspending: 20 hits, 19 candidates, 12 eligible. Contracts Finder: 99 releases in a bounded window, 1 ambiguous candidate. The latter window may be capped; the collector splits it and does not declare a complete scan. Live logs and full documents are local ignored artifacts, not public git files.

## Sources and use rights

| Source | API / official documentation | Data, rights and limitations | Polling |
| --- | --- | --- | --- |
| TED, EU Publications Office | [POST notices/search](https://api.ted.europa.eu/v3/notices/search), [Search API](https://docs.ted.europa.eu/api/latest/search.html), [reuse guide](https://docs.ted.europa.eu/ODS/latest/reuse/search-api.html) | No key; official searchable metadata, attribution and [legal notice](https://ted.europa.eu/en/legal-notice). Only returned metadata is stored; no attachment scraping or blanket claim of rights to third-party documents. API metadata does **not** prove signing, delivery, amount or metal mass. | 30 min, max two 20-record pages per run |
| USAspending.gov, US Treasury | [POST spending_by_award](https://api.usaspending.gov/api/v2/search/spending_by_award/), [official API guide](https://api.usaspending.gov/docs/intro-tutorial), [about](https://www.usaspending.gov/about) | No key, public federal spending data. Cumulative obligations labelled separately. Last Modified Date is not signature date; buyer registry jurisdiction is not delivery country. Restrictive raw-material phrases reduce false positives. | 60 min, max two 20-record pages per run |
| Contracts Finder, UK Cabinet Office | [OCDS search](https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search), [official API guidance](https://www.gov.uk/government/publications/open-contracting) | No key; JSON package identifies [OGL v3](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/). Store official source JSON privately; public fields exclude contact details. Amounts GBP or source currency, quantity only if explicitly present in awarded items. | 30 min; windows up to one day, split at 90+ releases |

These are application limits, **not claimed provider SLA or guaranteed published rate allowances**. Retry-After and exponential backoff take precedence. Source revisions/publication delay remain outside our control.

## Explored, not connected

* [SAM.gov official opportunities API](https://open.gsa.gov/api/get-opportunities-public-api/): requires an owner account/API key and account-dependent request limits. No key collected in chat, no connector falsely marked active. Existing USAspending covers contract records, not the entire US opportunities market.
* [LME licensing](https://www.lme.com/Market-data/Accessing-market-data/Licensing) and [CME market-data disclaimer](https://www.cmegroup.com/trading/market-data-explanation-disclaimer.html): public display/redistribution and automated access cannot be assumed free. CME explicitly limits automated scraping and redistribution without authorisation. No exchange feed enabled, no single contract reclassified as an exchange quote.
* [SHFE](https://www.shfe.com.cn/eng/) public pages do not establish rights to redistribute or a tested supported anonymous API. No unofficial endpoint or anti-bot bypass is used.
* China [CCGP data standards](https://www.ccgp.gov.cn/sjbzjgf/202603/t20260316_26275504.htm) describe information publication/exchange; they do not establish an unrestricted working public search API. No adapter activated. [Taiwan procurement dataset](https://data.gov.tw/en/datasets/7264) is a further official open-data candidate, not a tested source in this release.
* UK Find a Tender was investigated, but API access timed out / documentation returned 403 in this environment. Contracts Finder's documented JSON API works; browser notice pages may independently return 403. No CAPTCHA or access restriction was bypassed.
* Enterprise press releases, private tenders and supplier indications have not been verified for automated reuse in this increment. They are not silently copied or advertised as connected.

All 39 cells (13 metals × 3 regions) exist in the UI. Two European registries and one US registry have configured searches; **Asia has no active adapter**. A configured search is not proof of a quote, of an observation for every metal, or of exhaustive coverage. English source searches miss foreign-language-only titles and USAspending phrases miss other descriptions. This is the first 3-source increment requested, not worldwide completeness.

## Semantics and arithmetic

Missing values are null. Publication dates remain dates; a date-only/no-zone value is not converted into a fabricated precise timestamp. Explicit quantity literals can be extracted from a USAspending description, with a field-path note; they are never divided into cumulative obligations. Award dates and signature dates are separate. An old contract end date never proves delivery. TED results remain «опубликованы результаты», not signed contracts.

kg, t, g, lb and UN/CEFACT equivalents use exact BigInt fixed-point arithmetic in TypeScript and independently checked Postgres numeric division, rounded to 12 decimals. A price requires a single material line, allocated amount, mass, currency and an explicit exclusion of ancillary services. Source adapters **do not infer allocation/services/taxes from a goods label**. Differing specifications, country, currency, delivery basis, tax/logistics/charges, price kind or contract stage are separate comparison series. Incomplete conditions cannot enter a comparable index. No averages of unrelated contracts or summed volumes of unrelated products are produced.

Raw titles, original links, buyer/supplier, published amount basis and unknown fields are shown. A deterministic Russian story labels obligations and contract lifecycle. Award / tender / signing / implementation / termination are separate states. Current adapters have no proof of executed delivery or current exchange quotes; those states are never generated heuristically.

## Storage, moderation and security

Migration `20261117115646_market_monitor.sql` creates a source registry; normalized public events/publications/update notices; a security-invoker contract-price view; private source cursors, leases, raw JSON documents (SHA-256), append-only event revisions, error runs, moderation queue and storage accounting.

RLS remains enabled. Anonymous/authenticated roles can read approved event columns, source health, published stories and safe withdrawal notices. They cannot read raw documents, internal revisions/queue/state, document IDs or hashes, change sources, collect, or moderate. Service-only invoker RPCs validate the official source host, fields and price. The Edge endpoint verifies the existing server collector token, never browser credentials. No additional API key is required by these three feeds. No monitor code reads GROQ_API_KEY.

Ambiguous material scope (medical isotopes, wire, software, alloys such as A356, remediation or services) is pending. An operator can review original documents, then call service-only `monitor_review(event_id, expected_revision, 'approve'|'reject', documented_note)`. Stale revision approvals are refused. Invalid provenance must be corrected rather than approved. Manual approval always excludes unit-price comparison. Rejected/changed/cancelled events disappear from public reads; a public withdrawal notice remains. Normal source corrections replace the story and append revision history, not duplicate news.

OCDS incremental releases are merged by object and array IDs without losing absent fields; tender mass is never borrowed for an awarded contract. Whole-procedure cancellation withdraws other published records in that process. **TED metadata has no cross-notice procedure linkage in this adapter**: distinct official notice IDs stay distinct documents. Automatic linking of their cancellations and removal from a registry is not claimed; full OCDS/eForms lifecycle expansion remains future work. USAspending changes are based on stable generated award IDs and modified dates, not inferred tender stages.

Limits: 15s network timeout, HTTPS/host allowlist, no redirects, 2MB response, 128KiB raw document, 5,000 event IDs, 40MiB raw-document budget. Storage errors pause/back off without deleting previous data. At capacity an operator must export/archive and explicitly plan retention; there is no silent purge. TED page-number search is bounded at page 250; it reports a specific error if partitioning is needed, not a completed global backfill. The latest page is refreshed alongside one historical page, so backfill does not block fresh updates. CF overlaps windows and splits potentially capped windows; minimum window overflow is an explicit error. Failures do not advance the checkpoint.

The frontend reads at most the latest 200 public documents and states this if truncated; local filters apply to that sample. It refreshes every 60 seconds, not on every keystroke. Source checks last 30–60 minutes or longer after backoff. No promise of immediate global publication.

## Activation and rollback — not performed

Only project `vlfzjvwgrvyllvshwmzr`. No other Supabase project, CRM, DNS, Cloudflare or Groq secret is involved.

1. Review the separate PR and CI. The branch includes the PR #6 documentation/filename alignment commit; the two renamed older migrations retain unchanged SQL and actual remote history versions. Do not repair remote migration history.
2. On explicit release approval, back up affected schemas and record the deployed main commit; apply the new migration after existing history. Sources default **disabled**.
3. Deploy `collect-market-monitor` with the existing server-only collector configuration (config.toml disables gateway JWT, handler requires the collector token). `deploy:plan` includes it; `deploy:supabase` includes it after migration confirmation.
4. Set the confirmed project URL in the SQL session and run `ops/activate-market-monitor.sql` only on that project. It checks the exact URL and existing Vault URL/token, enables these three sources and creates just `alfa-market-monitor-15m`. Existing seven jobs are not modified. The 15-minute scheduler checks leases; source-specific HTTP cadence stays 30/60/30 minutes. No NEWS_AI_TRANSLATION or model budget change.
5. Run one protected collection, inspect runs/queue/publications, confirm RLS and browser reads, then publish the reviewed frontend through the existing main GitHub Actions workflow. No production release is claimed before this.
6. To stop, unschedule **only** `alfa-market-monitor-15m` and disable monitor sources, preserving data and history. Restore the previous frontend if needed. Existing application tables/jobs require no rollback change.

## Reproducible verification

`npm ci`, `npm run lint`, `npm run build`, `npm test`, `npm run test:db`, `npm run test:monitor`, `npm run test:server`, `npm run test:browser`, `npm run deploy:plan`.

`test:monitor` applies all migrations to isolated PGlite (Supabase extensions/Auth/Vault/Cron stubbed), imports real fixtures, tests duplicate ingestion, independent TS/SQL arithmetic, forged price rejection, revision/cancellation, moderation, role permissions, source lease and Retry-After backoff. It produces `work/monitor/test-public.json` from **anon SELECT**, consumed by a local Chromium test via intercepted local REST requests. This checks real-record rendering on desktop/mobile and News filters; it is not a hosted Supabase/PostgREST or production Cron execution. Synthetic transition tests are explicitly separate from real counts.

Optional network check: `NODE_USE_ENV_PROXY=1 node --experimental-strip-types scripts/check-monitor-sources.mjs --live`. It contacts official APIs once per source, stores raw responses and request/hash logs under ignored work/, and never writes a database. Do not run it repeatedly to evade provider limits. Historical fixture acquisition and current moving-page checks are separate datasets; see [fixture provenance](../tests/fixtures/monitor/README.md).

Production migration/Edge/Cron/browser integration is deferred until release approval. No AI calls are needed or consumed to test this module.
