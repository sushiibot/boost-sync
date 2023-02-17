import { GuildFollows } from "@prisma/client";
import {
  DiscordAPIError,
  DiscordjsErrorCodes,
  Guild,
  RESTJSONErrorCodes,
} from "discord.js";
import Context from "../context";
import logger from "../logger";

/**
 * Synchronizes a guild with its followed guilds. This only modifies roles in
 * the called guild.
 *
 * @param ctx
 * @param guild
 */
export default async function syncBoosts(ctx: Context, guild: Guild) {
  const followedGuilds = await ctx.db.guildFollows.findMany({
    where: {
      guildId: BigInt(guild.id),
    },
  });

  const boostRoleToFollowedGuilds = new Map<string, GuildFollows>();

  for (const followedGuild of followedGuilds) {
    if (followedGuild.boostRoleId === null) {
      continue;
    }

    boostRoleToFollowedGuilds.set(
      followedGuild.boostRoleId.toString(),
      followedGuild
    );
  }

  const membersToRolesToRemove = new Map<string, Set<string>>();
  const membersToRolesToAdd = new Map<string, Set<string>>();

  for (const [, member] of guild.members.cache) {
    // Check **followed** servers if this member is boosting
    // Ensure the member has the boost role if they are boosting
    for (const [, role] of member.roles.cache) {
      const matchingFollowedGuild = boostRoleToFollowedGuilds.get(role.id);
      if (!matchingFollowedGuild) {
        // Not a boosting role, ignore
        continue;
      }

      const followedGuildID = matchingFollowedGuild.followingGuildId.toString();

      // Check if the member is boosting in the followed server
      let followedGuild = guild.client.guilds.cache.get(followedGuildID);
      if (!followedGuild) {
        logger.warn(
          { guildId: followedGuildID },
          "Guild not cached, fetching it..."
        );
        // Guild not cached, fetch it
        followedGuild = await guild.client.guilds.fetch(followedGuildID);
      }

      try {
        // Should be cached hopefully
        const memberInFollowedGuild = await followedGuild.members.fetch(
          member.id
        );

        // No longer boosting in followed server, remove boost role ONLY if there
        // are no other followed servers that give the same boost role
        if (!memberInFollowedGuild.premiumSince) {
          let rolesToRemove = membersToRolesToRemove.get(member.id);
          if (!rolesToRemove) {
            rolesToRemove = new Set();
          }

          rolesToRemove.add(role.id);
          membersToRolesToRemove.set(member.id, rolesToRemove);
        } else {
          // User is boosting in followed server, add boost role!

          let rolesToAdd = membersToRolesToAdd.get(member.id);
          if (!rolesToAdd) {
            rolesToAdd = new Set();
          }

          rolesToAdd.add(role.id);
          membersToRolesToAdd.set(member.id, rolesToAdd);
        }
      } catch (err) {
        if (err instanceof DiscordAPIError) {
          if (err.code === RESTJSONErrorCodes.UnknownMember) {
            logger.warn(
              {
                msg: err.message,
                code: err.code,
              },
              "Failed to fetch member in followed guild, removing boost role"
            );

            // User is no longer in followed server, so they should have their
            // boost role removed.
            await member.roles.remove(role.id);

            continue;
          }
        }

        logger.error({ err }, "Unknown error");
      }
    }
  }

  // Clean up roles to remove -- do not remove roles that are added in other guilds
  for (const [memberID, rolesToAdd] of membersToRolesToAdd) {
    const rolesToRemoveSet = membersToRolesToRemove.get(memberID);
    if (!rolesToRemoveSet) {
      continue;
    }

    // Prevent deletion of roles that should be added
    for (const roleID of rolesToAdd) {
      rolesToRemoveSet.delete(roleID);
    }
  }

  // Remove roles
  for (const [memberID, rolesToRemove] of membersToRolesToRemove) {
    const member = await guild.members.fetch(memberID);

    for (const roleID of rolesToRemove) {
      await member.roles.remove(roleID);
    }
  }

  // Add roles
  for (const [memberID, rolesToAdd] of membersToRolesToAdd) {
    const member = await guild.members.fetch(memberID);

    for (const roleID of rolesToAdd) {
      await member.roles.add(roleID);
    }
  }
}
