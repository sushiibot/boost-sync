-- CreateTable
CREATE TABLE "GuildFollows" (
    "guildId" BIGINT NOT NULL,
    "followingGuildId" BIGINT NOT NULL,
    "announceChannelId" BIGINT,
    "boostRoleId" BIGINT,
    "accepted" BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY ("guildId", "followingGuildId")
);
