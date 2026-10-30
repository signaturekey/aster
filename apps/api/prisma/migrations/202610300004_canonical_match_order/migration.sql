-- Canonical pair order must agree with ASCII user-ID ordering in the service,
-- independent of the PostgreSQL cluster's language-sensitive collation.
ALTER TABLE "Match" DROP CONSTRAINT "match_canonical_pair";
ALTER TABLE "Match" ADD CONSTRAINT "match_canonical_pair" CHECK ("lowId" COLLATE "C" < "highId" COLLATE "C");
