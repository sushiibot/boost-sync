import { Events } from "discord.js";
import DiscordClient from "../client";
import pino from "pino";
import { handleGuildMemberUpdate } from "./handleBoost";
import { Prisma } from "@prisma/client";

const logger = pino({
  level: "debug",
});

export function registerHandlers(client: DiscordClient) {
  // When the client is ready, run this code (only once)
  // We use 'c' for the event parameter to keep it separate from the already defined 'client'
  client.once(Events.ClientReady, (c) => {
    logger.info(`Ready! Logged in as ${c.user.tag}`);
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
    // Fetch boosters
    // await guild.members.fetch();
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

    logger.debug({ db: client.db.guildFollows }, "db client guildFollows");

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
