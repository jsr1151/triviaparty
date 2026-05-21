-- AlterTable
ALTER TABLE "UserClueProgress"
ADD COLUMN "practiceMissCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "UserStudyItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "category" TEXT,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "lapseCount" INTEGER NOT NULL DEFAULT 0,
    "consecutiveCorrect" INTEGER NOT NULL DEFAULT 0,
    "easeFactor" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "intervalDays" INTEGER NOT NULL DEFAULT 0,
    "nextDueAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReviewedAt" TIMESTAMP(3),
    "lastOutcome" TEXT NOT NULL DEFAULT 'new',
    "masteredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserStudyItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserStudyItem_userId_sourceType_sourceId_key" ON "UserStudyItem"("userId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "UserStudyItem_userId_nextDueAt_idx" ON "UserStudyItem"("userId", "nextDueAt");

-- CreateIndex
CREATE INDEX "UserStudyItem_userId_sourceType_nextDueAt_idx" ON "UserStudyItem"("userId", "sourceType", "nextDueAt");

-- AddForeignKey
ALTER TABLE "UserStudyItem" ADD CONSTRAINT "UserStudyItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
