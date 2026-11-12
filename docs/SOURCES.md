# Проверка источников — 12 ноября 2026

Доступность HTTP, условия использования, реализация адаптера и развёртывание — разные состояния. Новые платные источники в ходе работы не подключались.

| Источник | Подтверждённая информация | Состояние проекта |
|---|---|---|
| USGS Mineral Resources | Официальная страница программы ссылается на RSS `/news/minerals/feed`. Прямой запрос: HTTP 200, валидный RSS, 0 элементов. Большинство текстов USGS — общественное достояние США; сторонние материалы могут иметь отдельные ограничения. | Адаптер и запись источника готовы. Сборщик и расписание не развёрнуты; получение реальных публикаций не подтверждено. |
| LME | Лицензии разделяют display, distribution и non-display использование. Есть XML feed и лицензированные дистрибьюторы. Доступность сайта не означает бесплатное API котировок. | Нужны договор и mapping предоставленного продукта. Общий контракт готов; официальная интеграция не объявляется работающей. |
| CME Group / COMEX | Есть REST/WebSocket API; onboarding включает API ID и проверку лицензии. Website disclaimer ограничивает автоматический сбор и распространение без разрешения. | Нужны API ID, лицензия и спецификация продукта. Скрейпинг сайта не реализован. |
| SHFE | Официальная страница содержит SMDP 2.0 V1.22 от июля 2026; есть реестр лицензированных поставщиков. Наличие документации не доказывает бесплатный доступ или право на распространение. | Нужны доступ и лицензия. Фьючерс Китая не размножается в Европу/США. |
| Frankfurter / ЕЦБ | Существующий FX-адаптер сохранён для USD/EUR, GBP, CNY, SEK. | В этой среде удалённый сбор не запускался. Для RUB нужен отдельный подтверждённый поставщик. |
| Производители, статистические агентства, отраслевые СМИ | Форматы и права различаются. | Поддерживаются RSS/Atom/JSON Feed и allowlist доменов. Новые источники включаются только после отдельной проверки; адреса и разрешения не выдуманы. |

Первичные документы:

- [USGS Mineral Resources — News](https://www.usgs.gov/programs/mineral-resources-program/news)
- [Официальная RSS USGS](https://www.usgs.gov/news/minerals/feed)
- [USGS Copyrights and Credits](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits)
- [LME Market Data Licensing](https://www.lme.com/market-data/market-data-licensing)
- [LME Market Data FAQs](https://www.lme.com/about/faqs/market-data-faqs)
- [CME Market Data APIs](https://www.cmegroup.com/market-data/market-data-api.html)
- [CME API Onboarding](https://www.cmegroup.com/tools-information/webhelp/data-services-portal/Content/Onboarding-CME-Group-Cloud-Based%20Market%20Data%20APIs.html)
- [CME Market Data Disclaimer](https://www.cmegroup.com/trading/market-data-explanation-disclaimer.html)
- [SHFE API Technical Specifications](https://www.shfe.cn/eng/services/Technology/TechnicalSpecificationResource/)
- [SHFE Licensed Data Vendors](https://www.shfe.cn/eng/services/vendorMarketData/Vendorlist/)

Paywall и ограничения не обходятся. Полные статьи и изображения не загружаются. Для новых источников оператор фиксирует license_url, license_note, approved_at и допустимые домены; публичность URL не является лицензией.
