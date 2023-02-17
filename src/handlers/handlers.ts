import { Events } from "discord.js";
import DiscordClient from "../client";
import { handleGuildMemberUpdate } from "./handleBoost";
import logger from "../logger";
import { fetchGuildMembers } from "./handleGuildCreate";

export function registerHandlers(client: DiscordClient) {
  // When the client is ready, run this code (only once)
  // We use 'c' for the event parameter to keep it separate from the already defined 'client'
  client.once(Events.ClientReady, async (c) => {
    logger.info(`Ready! Logged in as ${c.user.tag}`);
    logger.info(
      {
        guilds: c.guilds.cache.size,
      },
      "Fetching members for all guilds."
    );

    const ps = c.guilds.cache.map((guild) => {
      return fetchGuildMembers(guild);
    });

    const res = await Promise.allSettled(ps);

    for (const r of res) {
      if (r.status === "rejected") {
        logger.error(
          {
            err: r.reason,
          },
          "Failed to fetch members for guild."
        );
      }
    }

    logger.info(
      {
        guilds: c.guilds.cache.size,
      },
      "Fetched all guild members."
    );
  });

  client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
    handleGuildMemberUpdate(
      {
        db: client.db,
      },
      oldMember,
      newMember
    );
  });

  client.on(Events.GuildCreate, async (guild) => {
    // Joining new server
    fetchGuildMembers(guild);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) {
      logger.error(
        {
          commandName: interaction.commandName,
        },
        `No command matching was found.`
      );
      return;
    }

    try {
      await command.execute(
        {
          db: client.db,
        },
        interaction
      );
    } catch (err) {
      logger.error(
        {
          commandName: interaction.commandName,
          err,
        },
        "Error while executing command"
      );

      // Reply needs to be in a try/catch block because it can also fail
      try {
        await interaction.reply({
          content: "There was an error while executing this command!",
          ephemeral: true,
        });
      } catch (err) {
        logger.error(
          {
            commandName: interaction.commandName,
            err,
          },
          "Error while replying to command"
        );
      }
    }
  });
}
