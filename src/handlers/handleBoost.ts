import { DiscordAPIError, GuildMember, PartialGuildMember } from "discord.js";
import pino from "pino";
import Context from "../context";

const logger = pino();

export async function handleGuildMemberUpdate(
  ctx: Context,
  oldMember: GuildMember | PartialGuildMember,
  newMember: GuildMember
) {
  if (
    // non-booster
    (oldMember.premiumSince === null && newMember.premiumSince === null) ||
    // booster
    (oldMember.premiumSince !== null && newMember.premiumSince !== null)
  ) {
    return;
  }

  const boostAdded =
    oldMember.premiumSince === null && newMember.premiumSince !== null;
  const boostRemoved =
    oldMember.premiumSince !== null && newMember.premiumSince === null;

  if (boostAdded) {
    await handleBoostAdded(ctx, newMember);
  }
}

async function handleBoostAdded(ctx: Context, member: GuildMember) {
  if (!member.guild.systemChannel) {
    return;
  }

  // Find follower servers
  const followerServers = await ctx.db.guildFollows.findMany({
    where: { followingGuildId: BigInt(member.guild.id) },
  });

  // Add boost announcement + role to follower servers
  for (const follower of followerServers) {
    const followerGuild = await member.client.guilds.fetch(
      follower.guildId.toString()
    );

    if (follower.boostRoleId) {
      try {
        const followerMember = await followerGuild.members.fetch(
          member.user.id
        );
        // Add boost role
        await followerMember.roles.add(follower.boostRoleId.toString());
      } catch (err) {
        if (err instanceof DiscordAPIError) {
          logger.warn(
            {
              msg: err.message,
              code: err.code,
            },
            "Failed to fetch member or add boost role to member"
          );
        }

        logger.error({ err }, "Unknown error");
        continue;
      }
    }

    // No announcement to set
    if (!follower.announceChannelId) {
      continue;
    }

    try {
      // Announcement in follower server
      const followerAnnounceChannel = await followerGuild.channels.fetch(
        follower.announceChannelId.toString()
      );

      if (!followerAnnounceChannel || !followerAnnounceChannel.isTextBased()) {
        logger.warn(
          "Follower announce channel not found or is not a text channel"
        );
        continue;
      }

      await followerAnnounceChannel.send(
        `${member.user.tag} just boosted ${member.guild.name}!`
      );
    } catch (err) {
      if (err instanceof DiscordAPIError) {
        logger.warn(
          {
            msg: err.message,
            code: err.code,
          },
          "Failed to send boost announcement"
        );
      }

      logger.error({ err }, "Unknown error");

      continue;
    }
  }
}
