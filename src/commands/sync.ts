import { PrismaClient } from "@prisma/client";
import {
  ChannelType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Guild,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import pino from "pino";
import { Command } from "../client";
import Context from "../context";
import syncBoosts from "../handlers/syncBoosts";

const logger = pino({
  level: "debug",
});

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("boostsync")
    .setDescription("Setup boost syncing")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((c) =>
      c
        .setName("follow")
        .setDescription("Follow a server's boosts.")
        .addStringOption((o) =>
          o
            .setName("server_id")
            .setDescription("The server ID to sync boosts with.")
            .setRequired(true)
        )
        .addRoleOption((o) =>
          o
            .setName("boost_role")
            .setDescription("Role to give to boosters in this server.")
            .setRequired(false)
        )
        .addChannelOption((o) =>
          o
            .setName("announcement_channel")
            .setDescription(
              "Channel to send boost announcements in. Leave blank to disable."
            )
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
    )
    .addSubcommand((c) =>
      c
        .setName("unfollow")
        .setDescription("Stop following a server's boosts.")
        .addStringOption((o) =>
          o
            .setName("server_id")
            .setDescription("Server ID to unfollow.")
            .setRequired(true)
        )
    )
    .addSubcommand((c) =>
      c
        .setName("accept")
        .setDescription("Permit a server to follow your boosts.")
        .addStringOption((o) =>
          o
            .setName("server_id")
            .setDescription("Server ID to accept to follow your boosts.")
            .setRequired(true)
        )
    )
    .addSubcommand((c) =>
      c
        .setName("deny")
        .setDescription(
          "Stop a previously allowed server from following your boosts."
        )
        .addStringOption((o) =>
          o
            .setName("server_id")
            .setDescription("Server ID to deny following your boosts.")
            .setRequired(true)
        )
    )
    .addSubcommand((c) =>
      c.setName("list").setDescription("List boost synced servers")
    )
    .toJSON(),

  async execute(ctx: Context, interaction: ChatInputCommandInteraction) {
    if (!interaction.guild || !interaction.guildId) {
      return;
    }

    switch (interaction.options.getSubcommand()) {
      case "follow": {
        const serverIdToFollow = interaction.options.getString(
          "server_id",
          true
        );
        const boostRoleId = interaction.options.getRole("boost_role")?.id;
        const announcementChannelId = interaction.options.getChannel(
          "announcement_channel"
        )?.id;

        if (serverIdToFollow === interaction.guild.id) {
          await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setTitle("Could not follow server")
                .setDescription(
                  "You cannot follow the current server, please specify a different server ID to follow."
                ),
            ],
          });

          return;
        }

        const exists = await ctx.db.guildFollows.findFirst({
          where: {
            guildId: BigInt(interaction.guild.id),
            followingGuildId: BigInt(serverIdToFollow),
          },
        });

        // Check if the server is valid
        let serverToFollow: Guild;
        try {
          serverToFollow = await interaction.client.guilds.fetch(
            serverIdToFollow
          );
        } catch (err) {
          await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setTitle("Could not follow server")
                .setDescription("Invalid server ID. Am I in that server?"),
            ],
          });

          return;
        }

        logger.debug(
          {
            followServerID: serverIdToFollow,
            boostRoleID: boostRoleId,
            announcementChannelID: announcementChannelId,
            isUpdateExisting: exists !== null,
          },
          "creating or updating new follow in database"
        );

        await ctx.db.guildFollows.upsert({
          where: {
            guildId_followingGuildId: {
              guildId: BigInt(interaction.guild.id),
              followingGuildId: BigInt(serverIdToFollow),
            },
          },
          update: {
            boostRoleId: boostRoleId ? BigInt(boostRoleId) : null,
            announceChannelId: announcementChannelId
              ? BigInt(announcementChannelId)
              : null,
          },
          create: {
            guildId: BigInt(interaction.guild.id),
            followingGuildId: BigInt(serverIdToFollow),
            boostRoleId: boostRoleId ? BigInt(boostRoleId) : null,
            announceChannelId: announcementChannelId
              ? BigInt(announcementChannelId)
              : null,
            // Default to false
            accepted: false,
          },
        });

        logger.debug(
          {
            followServerID: serverIdToFollow,
            boostRoleID: boostRoleId,
            announcementChannelID: announcementChannelId,
          },
          "created or updated new follow in database"
        );

        if (exists) {
          await interaction.reply({
            embeds: [
              new EmbedBuilder().setTitle("Updated Follow").setFields(
                {
                  name: "Following server",
                  value: serverToFollow.name,
                },
                {
                  name: "Boost role",
                  value: boostRoleId ? `<@&${boostRoleId}>` : "None",
                },
                {
                  name: "Announcement channel",
                  value: announcementChannelId
                    ? `<#${announcementChannelId}>`
                    : "None",
                }
              ),
            ],
          });
        } else {
          await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setTitle("Created Follow")
                .setDescription(
                  `You need to accept this follow in the **${serverToFollow.name}** server with \`/boostsync accept\`.`
                )
                .setFields(
                  {
                    name: "Following server",
                    value: serverToFollow.name,
                  },
                  {
                    name: "Boost role",
                    value: boostRoleId ? `<@&${boostRoleId}>` : "None",
                  },
                  {
                    name: "Announcement channel",
                    value: announcementChannelId
                      ? `<#${announcementChannelId}>`
                      : "None",
                  }
                ),
            ],
          });
        }

        return;
      }
      case "list": {
        const follows = await ctx.db.guildFollows.findMany({
          where: {
            guildId: BigInt(interaction.guild.id),
          },
        });

        if (follows.length === 0) {
          await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setTitle("No follows")
                .setDescription("You are not following any servers."),
            ],
          });

          return;
        }

        await interaction.reply({
          embeds: [
            new EmbedBuilder().setTitle("Following servers").setDescription(
              follows
                .map((f) => {
                  const guild = interaction.client.guilds.cache.get(
                    f.followingGuildId.toString()
                  );

                  if (!guild) {
                    return null;
                  }

                  return `${guild.name} - ${
                    f.accepted ? "Accepted" : "Pending"
                  }`;
                })
                .filter((g) => !!g)
                .join("\n")
            ),
          ],
        });

        return;
      }
      case "unfollow": {
        const serverIdToUnfollow = interaction.options.getString(
          "server_id",
          true
        );

        let serverToUnfollow: Guild;
        try {
          serverToUnfollow = await interaction.client.guilds.fetch(
            serverIdToUnfollow
          );
        } catch (err) {
          await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setTitle("Could not unfollow server")
                .setDescription("Invalid server ID. Am I in that server?"),
            ],
          });
          return;
        }

        await ctx.db.guildFollows.delete({
          where: {
            guildId_followingGuildId: {
              guildId: BigInt(interaction.guild.id),
              followingGuildId: BigInt(serverIdToUnfollow),
            },
          },
        });

        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle("Unfollowed server boosts")
              .setDescription(
                `You are no longer following boosts from server **${serverToUnfollow.name}**.`
              ),
          ],
        });

        return;
      }
      case "accept": {
        const serverIdFollower = interaction.options.getString(
          "server_id",
          true
        );

        let serverToAccept: Guild;
        try {
          serverToAccept = await interaction.client.guilds.fetch(
            serverIdFollower
          );
        } catch (err) {
          await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setTitle("Could not accept follow from server")
                .setDescription("Invalid server ID. Am I in that server?"),
            ],
          });
          return;
        }

        const { announceChannelId, boostRoleId } =
          await ctx.db.guildFollows.update({
            where: {
              guildId_followingGuildId: {
                // We are modifying the **follower's** entry
                guildId: BigInt(serverIdFollower),
                followingGuildId: BigInt(interaction.guild.id),
              },
            },
            data: {
              accepted: true,
            },
            select: {
              boostRoleId: true,
              announceChannelId: true,
            },
          });

        let description = `Boosts in this server are now followed by **${serverToAccept.name}**.`;

        if (announceChannelId) {
          description += `\nI will announce boosts in <#${announceChannelId}>.`;
        }

        if (boostRoleId) {
          description += `\nA role sync has been started for existing boosts, I'll let you know when it's done.`;
        }

        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle("Accepted follow from server")
              .setDescription(description),
          ],
        });

        // No boost role, no sync needed
        if (!boostRoleId) {
          return;
        }

        const { membersRoleAdded, membersRoleRemoved } = await syncBoosts(
          ctx,
          serverToAccept,
          // Only sync for this guild
          [interaction.guildId]
        );

        interaction.followUp({
          embeds: [
            new EmbedBuilder()
              .setTitle(`Boosts have been synced to ${serverToAccept.name}`)
              .addFields(
                {
                  name: "Boosters given boost role",
                  value: membersRoleAdded.toLocaleString(),
                },
                {
                  name: "Non-boosters removed boost role",
                  value: membersRoleRemoved.toLocaleString(),
                }
              ),
          ],
        });

        return;
      }
      case "deny": {
        const serverIdFollower = interaction.options.getString(
          "server_id",
          true
        );

        let serverToDeny: Guild;
        try {
          serverToDeny = await interaction.client.guilds.fetch(
            serverIdFollower
          );
        } catch (err) {
          await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setTitle("Could not deny follow from server")
                .setDescription("Invalid server ID. Am I in that server?"),
            ],
          });
          return;
        }

        // Only disable, not delete
        await ctx.db.guildFollows.update({
          where: {
            guildId_followingGuildId: {
              // We are modifying the **follower's** entry
              guildId: BigInt(serverIdFollower),
              followingGuildId: BigInt(interaction.guild.id),
            },
          },
          data: {
            accepted: false,
          },
        });

        await interaction.reply({
          embeds: [
            new EmbedBuilder()

              .setTitle("Denied follow from server")
              .setDescription(
                `The server **${serverToDeny.name}** is no longer following this server.`
              ),
          ],
        });

        return;
      }
    }
  },
};

export default command;
