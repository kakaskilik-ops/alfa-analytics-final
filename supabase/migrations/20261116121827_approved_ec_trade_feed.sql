-- Official EC RSS, verified HTTP 200; import only matching metal/sector metadata, not full articles.
INSERT INTO public.news_sources(id,name,feed_url,home_url,license_url,license_note,allowed_hosts,enabled,approved_at,min_interval_seconds)
VALUES('ec-trade','Европейская комиссия — торговая политика','https://policy.trade.ec.europa.eu/node/2/rss_en','https://policy.trade.ec.europa.eu/news_en','https://commission.europa.eu/legal-notice_en','© European Union. CC BY 4.0 unless otherwise stated. Only titles, short RSS metadata and original links; no images or full-text redistribution.',ARRAY['policy.trade.ec.europa.eu'],true,now(),3500)
ON CONFLICT(id) DO NOTHING;
