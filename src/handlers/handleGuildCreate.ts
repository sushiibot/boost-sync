import { Guild } from "discord.js";
import logger from "../logger";

export async function fetchGuildMembers(guild: Guild) {
  logger.info(
    {
      id: guild.id,
      guildName: guild.name,
    },
    "Fetching members for guild..."
  );

  const members = await guild.members.fetch();

  logger.info(
    {
      id: guild.id,
      guildName: guild.name,
      members: members.size,
    },
    "Fetched guild members."
  );
}
