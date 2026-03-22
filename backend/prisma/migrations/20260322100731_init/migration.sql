-- CreateTable
CREATE TABLE "Party" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'lobby',
    "wordA" TEXT NOT NULL DEFAULT '',
    "wordB" TEXT NOT NULL DEFAULT '',
    "desiredInfiltratorCount" INTEGER NOT NULL,
    "hasSpy" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "hostPlayerId" TEXT,

    CONSTRAINT "Party_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" TEXT,
    "isAlive" BOOLEAN NOT NULL DEFAULT true,
    "sessionToken" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "partyId" TEXT NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Round" (
    "id" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'voting',
    "spyGuess" TEXT,
    "spyGuessCorrect" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "partyId" TEXT NOT NULL,
    "eliminatedPlayerId" TEXT,

    CONSTRAINT "Round_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vote" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "roundId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Party_code_key" ON "Party"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Player_sessionToken_key" ON "Player"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "Player_partyId_displayName_key" ON "Player"("partyId", "displayName");

-- CreateIndex
CREATE UNIQUE INDEX "Round_partyId_roundNumber_key" ON "Round"("partyId", "roundNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_roundId_voterId_key" ON "Vote"("roundId", "voterId");

-- AddForeignKey
ALTER TABLE "Party" ADD CONSTRAINT "Party_hostPlayerId_fkey" FOREIGN KEY ("hostPlayerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Round" ADD CONSTRAINT "Round_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Round" ADD CONSTRAINT "Round_eliminatedPlayerId_fkey" FOREIGN KEY ("eliminatedPlayerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
