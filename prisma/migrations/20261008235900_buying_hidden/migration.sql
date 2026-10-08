-- G-106 M3: buying a plan starts hidden (D372). The site's row is the admin's to change at launch (G-128); an existing
-- row is left as it is.
INSERT INTO "FeatureState" ("featureId", "state", "updatedAt", "updatedBy")
VALUES ('billing.buy', 'HIDDEN', now(), 'migration')
ON CONFLICT ("featureId") DO NOTHING;