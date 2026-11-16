-- Official feed linked from the publisher's industry news page. Only metadata
-- matching explicit supported metals and industrial context is imported.
INSERT INTO public.news_sources(id,name,feed_url,home_url,license_url,license_note,allowed_hosts,enabled,approved_at,min_interval_seconds)
VALUES('ec-industry','Европейская комиссия — промышленность','https://single-market-economy.ec.europa.eu/node/2/rss_en','https://single-market-economy.ec.europa.eu/news_en','https://commission.europa.eu/legal-notice_en','© European Union. CC BY 4.0, если публикация не содержит иных условий; только заголовки, короткие метаданные и ссылки. Сторонние изображения и полные статьи не импортируются.',ARRAY['single-market-economy.ec.europa.eu'],true,now(),1700)
ON CONFLICT(id) DO NOTHING;
-- Metadata coverage refers to monthly reference data only, not regional spot.
INSERT INTO public.metal_source_coverage(metal_id,source_id,source_symbol,grade,product_form)
VALUES('aluminum','world-bank-pink-sheet','Aluminum','MONTHLY_REFERENCE','LME primary ingots'),('copper','world-bank-pink-sheet','Copper','MONTHLY_REFERENCE','LME grade A cathodes/wire bars'),('tin','world-bank-pink-sheet','Tin','MONTHLY_REFERENCE','LME refined high grade'),('zinc','world-bank-pink-sheet','Zinc','MONTHLY_REFERENCE','LME refined special high grade') ON CONFLICT(metal_id,source_id) DO NOTHING;
