CREATE TABLE "WordPair" (
  "id"       TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "wordA"    TEXT NOT NULL,
  "wordB"    TEXT NOT NULL,
  CONSTRAINT "WordPair_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Party" ADD COLUMN "category" TEXT NOT NULL DEFAULT '';
