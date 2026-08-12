ALTER TABLE "Round" ADD COLUMN "votingStartedAt" TIMESTAMP(3);
ALTER TABLE "Round" ALTER COLUMN "status" SET DEFAULT 'discussion';
