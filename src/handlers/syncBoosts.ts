import { GuildFollows } from "@prisma/client";
import {
  DiscordAPIError,
  DiscordjsErrorCodes,
  Guild,
  RESTJSONErrorCodes,
} from "discord.js";
import Context from "../context";
import logger from "../logger";
import config from "../config/botConfig";

interface SyncResult {
  membersRoleRemoved: number;
  membersRoleAdded: number;
}

/**
 * Synchronizes a guild with its followed guilds. This only modifies roles in
 * the called guild.
 *
 * @param ctx
 * @param guild
 */
export default async function syncBoosts(
  ctx: Context,
  guild: Guild,
  syncOnlyFollowedGuildIds?: string[]
): Promise<SyncResult> {
  const followedGuilds = await ctx.db.guildFollows.findMany({
    where: {
      guildId: BigInt(guild.id),
    },
  });

  logger.debug(
    {
      guildId: guild.id,
      guildName: guild.name,
      followedGuilds: followedGuilds.length,
    },
    "Syncing boosts for guild..."
  );

  const boostRoleToFollowedGuilds = new Map<string, GuildFollows>();

  for (const followedGuild of followedGuilds) {
    // Ignore followed guilds that don't have a boost role
    if (followedGuild.boostRoleId === null) {
      continue;
    }

    if (
      syncOnlyFollowedGuildIds &&
      syncOnlyFollowedGuildIds.includes(
        followedGuild.followingGuildId.toString()
      )
    ) {
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
      const follow = boostRoleToFollowedGuilds.get(role.id);
      if (!follow || !follow.boostRoleId) {
        // Not a boosting role, ignore
        // Follow doesn't have a boost role, ignore (this shouldn't happen but just a type check)
        continue;
      }

      const followedGuildID = follow.followingGuildId.toString();

      // Check if the member is boosting in the followed server
      let followedGuild = await guild.client.guilds.fetch(followedGuildID);

      try {
        // Should be cached hopefully
        const memberInFollowedGuild = await followedGuild.members.fetch(
          member.id
        );

        // No longer boosting in followed server, remove boost role ONLY if there
        // are no other followed servers that give the same boost role
        if (!memberInFollowedGuild.premiumSince) {
          logger.debug(
            {
              guildId: guild.id,
              guildName: guild.name,
              followedGuildId: followedGuild.id,
              followedGuildName: followedGuild.name,
              memberId: member.id,
              memberName: member.user.tag,
              boostRoleId: follow.boostRoleId,
              premiumSince: member.premiumSince,
            },
            "Found member no longer boosting in followed guild"
          );

          mapSetValue(
            membersToRolesToRemove,
            member.id,
            follow.boostRoleId.toString()
          );
        } else {
          // User is still boosting in followed server, add boost role just
          // so that it isn't removed by another followed server

          mapSetValue(
            membersToRolesToAdd,
            member.id,
            follow.boostRoleId.toString()
          );
        }
      } catch (err) {
        if (err instanceof DiscordAPIError) {
          if (err.code === RESTJSONErrorCodes.UnknownMember) {
            logger.warn(
              {
                msg: err.message,
                code: err.code,
              },
              "Member not in followed guild"
            );

            // User is no longer in followed server, so they should have their
            // boost role removed.
            mapSetValue(
              membersToRolesToRemove,
              member.id,
              follow.boostRoleId.toString()
            );

            continue;
          }
        }

        logger.error({ err }, "Unknown error");
      }
    }
  }

  // Check for boosts in followed guilds -- members that don't already have the role
  for (const follow of followedGuilds) {
    // Ignore followed guilds that don't have a linked boost role
    if (!follow.boostRoleId) {
      continue;
    }

    // Ignore if subset of followed guilds is specified
    if (
      syncOnlyFollowedGuildIds &&
      syncOnlyFollowedGuildIds.includes(follow.followingGuildId.toString())
    ) {
      continue;
    }

    let followedGuild: Guild;
    try {
      followedGuild = await guild.client.guilds.fetch(
        follow.followingGuildId.toString()
      );
    } catch (err) {
      if (err instanceof DiscordAPIError) {
        if (err.code === RESTJSONErrorCodes.UnknownGuild) {
          logger.warn(
            {
              msg: err.message,
              code: err.code,
              guildId: follow.guildId,
              guildName: guild.name,
              followingGuildId: follow.followingGuildId,
            },
            "Failed to fetch followed guild (not added to server or removed)"
          );

          // TODO: The boost role should be removed from everyone?

          continue;
        }

        logger.warn(
          {
            msg: err.message,
            code: err.code,
          },
          "Error fetching followed guild"
        );
      }

      logger.error({ err }, "Unknown error");
      continue;
    }

    // Look for new boosters in followed guild
    for (const [, member] of followedGuild.members.cache) {
      // Skip non-boosters
      if (!member.premiumSince) {
        continue;
      }

      logger.debug(
        {
          guildId: guild.id,
          guildName: guild.name,
          followedGuildId: followedGuild.id,
          followedGuildName: followedGuild.name,
          memberId: member.id,
          memberName: member.user.tag,
          boostRoleId: follow.boostRoleId,
          premiumSince: member.premiumSince,
        },
        "Found booster in followed guild, adding boost role..."
      );

      mapSetValue(
        membersToRolesToAdd,
        member.id,
        follow.boostRoleId.toString()
      );
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

    logger.debug(
      {
        guildId: guild.id,
        guildName: guild.name,
        memberId: member.id,
        memberName: member.user.tag,
        rolesRemoved: [...rolesToRemove],
      },
      "Removed boost roles to member"
    );

    if (!config.DRY_RUN) {
      await member.roles.remove([...rolesToRemove]);
    }
  }

  // Add roles
  for (const [memberID, rolesToAdd] of membersToRolesToAdd) {
    const member = await guild.members.fetch(memberID);

    logger.debug(
      {
        guildId: guild.id,
        guildName: guild.name,
        memberId: member.id,
        memberName: member.user.tag,
        rolesAdded: [...rolesToAdd],
      },
      "Added boost roles to member"
    );

    if (!config.DRY_RUN) {
      await member.roles.add([...rolesToAdd]);
    }
  }

  return {
    membersRoleAdded: membersToRolesToAdd.size,
    membersRoleRemoved: membersToRolesToRemove.size,
  };
}

function mapSetValue<T1, T2>(map: Map<T1, Set<T2>>, key: T1, value: T2) {
  let set = map.get(key);
  if (!set) {
    set = new Set();
  }

  set.add(value);
  map.set(key, set);
}
