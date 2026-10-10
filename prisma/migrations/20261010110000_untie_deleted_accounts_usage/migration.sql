-- G-133 M4 (D406): usage left by accounts deleted before their events were untied keeps counting in the site's totals,
-- but no longer carries the id of an account that is gone.
UPDATE "UsageEvent" SET "userId" = NULL
WHERE "userId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u."id" = "UsageEvent"."userId");