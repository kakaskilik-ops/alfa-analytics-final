ALTER TABLE metals ALTER COLUMN base_price DROP DEFAULT;
ALTER TABLE metals ALTER COLUMN volatility DROP DEFAULT;
ALTER TABLE metals ALTER COLUMN trend DROP DEFAULT;

UPDATE metals SET base_price = NULL, volatility = NULL, trend = NULL
WHERE base_price IS NOT NULL OR volatility IS NOT NULL OR trend IS NOT NULL;
