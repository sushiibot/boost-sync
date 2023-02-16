import path from "path";
import fs from "fs";
import DiscordClient from "./client";
import {
  RESTPostAPIChatInputApplicationCommandsJSONBody,
  Routes,
} from "discord.js";
import pino from "pino";

const logger = pino();

export async function registerCommands(client: DiscordClient) {
  const commandsPath = path.join(__dirname, "commands");
  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith(".ts"));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    // Set a new item in the Collection with the key as the command name and the value as the exported module
    if ("data" in command && "execute" in command) {
      client.commands.set(command.data.name, command);
    } else {
      console.log(
        `[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`
      );
    }
  }

  const commandsJson: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [];
  for (const command of client.commands.values()) {
    commandsJson.push(command.data.toJSON());
  }

  await client.rest.put(Routes.applicationCommands(client.applicationId), {
    body: commandsJson,
  });

  logger.info(
    {
      commands: client.commands.map((command) => command.data.name),
      count: client.commands.size,
    },
    "Registered application commands."
  );
}
