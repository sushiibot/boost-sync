import { PrismaClient } from "@prisma/client";
import {
  ChatInputCommandInteraction,
  Client,
  ClientOptions,
  Collection,
  SlashCommandBuilder,
} from "discord.js";
import Context from "./context";

type Command = {
  data: SlashCommandBuilder;
  execute: (
    ctx: Context,
    interaction: ChatInputCommandInteraction
  ) => Promise<void>;
};

export default class DiscordClient extends Client {
  applicationId: string;

  commands = new Collection<string, Command>();
  db: PrismaClient;

  constructor(options: ClientOptions, applicationId: string, db: PrismaClient) {
    super(options);

    this.applicationId = applicationId;
    this.db = db;
  }
}
