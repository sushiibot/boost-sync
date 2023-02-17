import { DiscordAPIError, GuildMember, PartialGuildMember } from "discord.js";
import logger from "../logger";
import Context from "../context";

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
    logger.info(
      {
        guildId: newMember.guild.id,
        guildName: newMember.guild.name,
        userId: newMember.user.id,
        username: newMember.user.tag,
      },
      "Boost added"
    );

    await handleBoostAdded(ctx, newMember);
  }

  if (boostRemoved) {
    logger.info(
      {
        guildId: newMember.guild.id,
        guildName: newMember.guild.name,
        userId: newMember.user.id,
        username: newMember.user.tag,
      },
      "Boost removed"
    );

    handleBoostRemoved(ctx, newMember);
  }
}

async function handleBoostAdded(ctx: Context, member: GuildMember) {
  // Find follower servers
  const followerServers = await ctx.db.guildFollows.findMany({
    where: { followingGuildId: BigInt(member.guild.id) },
  });

  logger.debug(
    {
      guildId: member.guild.id,
      guildName: member.guild.name,
      boostFollowers: followerServers.length,
    },
    "Boosted server"
  );

  // Add boost announcement + role to follower servers
  for (const follower of followerServers) {
    // Ignore if not accepted in parent server
    if (!follower.accepted) {
      logger.debug(
        {
          guildId: member.guild.id,
          guildName: member.guild.name,
          followerGuildId: follower.guildId,
        },
        "Ignoring pending follower server"
      );

      continue;
    }

    const followerGuild = await member.client.guilds.fetch(
      follower.guildId.toString()
    );

    logger.debug(
      {
        guildId: member.guild.id,
        guildName: member.guild.name,
        followerGuildId: follower.guildId,
        followerGuildName: followerGuild.name,
        followerAnnounceChannelId: follower.announceChannelId,
        followerRoleId: follower.boostRoleId,
      },
      "Found accepted follower server"
    );

    if (follower.boostRoleId) {
      try {
        const followerMember = await followerGuild.members.fetch(
          member.user.id
        );

        // Add boost role
        await followerMember.roles.add(follower.boostRoleId.toString());

        logger.debug(
          {
            guildId: member.guild.id,
            guildName: member.guild.name,
            followerGuildId: follower.guildId,
            followerGuildName: followerGuild.name,
            followerMemberId: followerMember.id,
            followerMemberName: followerMember.user.tag,
            roleGiven: follower.boostRoleId,
          },
          "Added boost role to follower member"
        );
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
      logger.debug(
        {
          guildId: member.guild.id,
          guildName: member.guild.name,
          followerGuildId: follower.guildId,
          followerGuildName: followerGuild.name,
        },
        "No announcement channel set for follower server, skipping"
      );
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

      logger.debug(
        {
          guildId: member.guild.id,
          guildName: member.guild.name,
          followerGuildId: follower.guildId,
          followerGuildName: followerGuild.name,
        },
        "Announcement created in follower server"
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

async function handleBoostRemoved(ctx: Context, member: GuildMember) {
  const followerServers = await ctx.db.guildFollows.findMany({
    where: { followingGuildId: BigInt(member.guild.id) },
  });

  logger.debug(
    {
      guildId: member.guild.id,
      guildName: member.guild.name,
      boostFollowers: followerServers.length,
    },
    "Removed boost from server"
  );

  // Remove boost role from follower servers
  for (const follower of followerServers) {
    if (!follower.accepted) {
      logger.debug(
        {
          guildId: member.guild.id,
          guildName: member.guild.name,
          followerGuildId: follower.guildId,
        },
        "Ignoring pending follower server"
      );

      continue;
    }

    const followerGuild = await member.client.guilds.fetch(
      follower.guildId.toString()
    );

    logger.debug(
      {
        guildId: member.guild.id,
        guildName: member.guild.name,
        followerGuildId: follower.guildId,
        followerGuildName: followerGuild.name,
        followerRoleId: follower.boostRoleId,
      },
      "Found accepted follower server"
    );

    if (follower.boostRoleId) {
      try {
        const followerMember = await followerGuild.members.fetch(
          member.user.id
        );

        // Remove boost role
        await followerMember.roles.remove(follower.boostRoleId.toString());

        logger.debug(
          {
            guildId: member.guild.id,
            guildName: member.guild.name,
            followerGuildId: follower.guildId,
            followerGuildName: followerGuild.name,
            followerMemberId: followerMember.id,
            followerMemberName: followerMember.user.tag,
            roleRemoved: follower.boostRoleId,
          },
          "Removed boost role from follower member"
        );
      } catch (err) {
        if (err instanceof DiscordAPIError) {
          logger.warn(
            {
              msg: err.message,
              code: err.code,
            },
            "Failed to fetch member or remove boost role from member"
          );
        }

        logger.error({ err }, "Unknown error");
        continue;
      }
    }
  }
}
