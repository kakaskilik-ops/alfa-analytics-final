# Фактически созданные объекты Supabase

Проект `vlfzjvwgrvyllvshwmzr`, организация alfa-analytics. Проверено 13 ноября 2026. Все перечисленные таблицы имеют RLS. Схема analytics_internal не открывается браузерному API. В public доступ ограничен grants и политиками. Security advisor после исправлений пуст.

| Схема                   | Таблицы                                                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| public: каталог         | active_metals, metal_categories, metals, metal_source_coverage, metal_specifications, regional_markets, data_sources          |
| public: рынок/история   | price_quotations, price_history, exchange_rates, fx_observations, analytical_calculations, index_observations, market_indices |
| public: новости         | news_sources, news_articles, news_metal_links, news_ingestion_runs                                                            |
| public: пользователи/ИИ | favorites, analytical_summaries, ai_daily_budget, ai_request_limits                                                           |
| public: эксплуатация    | ingestion_payloads, automation_runs, update_logs, data_quality_records                                                        |
| analytics_internal      | automation_state, quote_adapters, reference_benchmarks                                                                        |

Всего **29 таблиц**. Дополнительно public.app_exchange_rates — security-invoker view, объединяющее новый FX и старые разрешённые курсы с приоритетом источника.

Миграции: 20261113131040, 20261113131047, 20261113131054, 20261113131112, 20261113131121, 20261113131145, 20261113131201, 20261113131345, 20261113131352, 20261113131916. Версии соответствуют удалённому migration history; файлы SQL не воспроизводились повторно.

Edge Functions: collect-market-data v1, ai-analyze v1, ingest-quotes v1, collect-news v3, ingest-regional-history v1, collect-fx v1, collect-quotes v1, compute-orientations v1. AI имеет gateway JWT и собственную проверку пользователя; серверные импорты проверяют collector token через Vault. Получить токен через public RPC нельзя.

Проверены реальная запись/чтение FX и отдельная служебная запись integration-validation с чтением и удалением только созданного тестового ID. Тестовые котировки в базу не добавлялись. Анонимный REST: каталог и FX 200; raw/budget/запись FX 401. Нет привилегированных ключей в исходниках. Публичный publishable key настроен только в игнорируемом локальном .env; для Pages требуется такой же публичный runtime/build параметр.

Performance advisor сообщает только [неиспользованные индексы](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index) — INFO ожидаем для новой базы. Индексы не удалены: статистика ещё не отражает рабочую нагрузку.
