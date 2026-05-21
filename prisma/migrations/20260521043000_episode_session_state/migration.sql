-- AlterTable
ALTER TABLE "UserJeopardyEpisodeProgress"
ADD COLUMN "sessionState" JSONB NOT NULL DEFAULT '{}';
