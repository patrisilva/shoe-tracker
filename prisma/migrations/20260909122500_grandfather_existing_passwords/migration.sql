-- Grandfather password accounts that existed before email confirmation did.
--
-- authorize() now refuses a password account whose emailVerified is null, so
-- without this every account created before this release would be locked out
-- of an app it could previously use. Runs once, at the deploy that introduces
-- the check; accounts created afterwards start null and must confirm.
--
-- OAuth accounts are untouched: they have no passwordHash, so the check never
-- applies to them and their provider has already verified the address.
UPDATE "User"
SET "emailVerified" = NOW()
WHERE "passwordHash" IS NOT NULL
  AND "emailVerified" IS NULL;
