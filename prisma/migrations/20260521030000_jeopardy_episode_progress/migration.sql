-- CreateTable
CREATE TABLE "UserJeopardyEpisodeProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "episodeKey" TEXT NOT NULL,
    "showNumber" INTEGER,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unfinished',
    "totalClues" INTEGER NOT NULL DEFAULT 0,
    "revealedClueIds" JSONB NOT NULL DEFAULT '[]',
    "revealedCount" INTEGER NOT NULL DEFAULT 0,
    "uniqueCluesAnswered" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastPlayedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserJeopardyEpisodeProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserJeopardyEpisodeProgress_userId_episodeKey_mode_key" ON "UserJeopardyEpisodeProgress"("userId", "episodeKey", "mode");

-- CreateIndex
CREATE INDEX "UserJeopardyEpisodeProgress_userId_status_lastPlayedAt_idx" ON "UserJeopardyEpisodeProgress"("userId", "status", "lastPlayedAt");

-- AddForeignKey
ALTER TABLE "UserJeopardyEpisodeProgress" ADD CONSTRAINT "UserJeopardyEpisodeProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
