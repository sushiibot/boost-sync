import { PrismaClient } from "@prisma/client";
import { GatewayIntentBits } from "discord.js";
import DiscordClient from "./client";
import { registerCommands } from "./commands";
import config from "./config/botConfig";
import { registerHandlers } from "./handlers/handlers";

const db = new PrismaClient();

async function main() {
  const client = new DiscordClient(
    {
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    },
    config.APPLICATION_ID,
    db
  );

  // Set the rest token first before registering commands
  client.rest.setToken(config.DISCORD_TOKEN);

  await registerCommands(client);
  registerHandlers(client);

  // Log in to Discord with your client's token
  await client.login(config.DISCORD_TOKEN);
}

main()
  .then(async () => {
    await db.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();

    process.exit(1);
  });
