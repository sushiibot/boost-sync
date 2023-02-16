import DiscordClient from "./client";
import {
  RESTPostAPIChatInputApplicationCommandsJSONBody,
  Routes,
} from "discord.js";
import pino from "pino";
import syncCommand from "./commands/sync";

const logger = pino();

export async function registerCommands(client: DiscordClient) {
  const commands = [syncCommand];

  for (const command of commands) {
    client.commands.set(command.data.name, command);
  }

  const commandsJson: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [];
  for (const command of client.commands.values()) {
    commandsJson.push(command.data);
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
