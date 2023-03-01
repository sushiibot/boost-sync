-- AlterTable
ALTER TABLE "GuildFollows" ADD COLUMN "announceMessageTemplate" TEXT;

-- CreateTable
CREATE TABLE "GuildConfig" (
    "guildId" BIGINT NOT NULL PRIMARY KEY,
    "logChannel" BIGINT NOT NULL,
    "announceChannelId" BIGINT,
    "announceMessageTemplate" TEXT
);
