import { PrismaClient } from "@prisma/client";
import {
  ChatInputCommandInteraction,
  Client,
  ClientOptions,
  Collection,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord.js";
import Context from "./context";

export interface Command {
  data: RESTPostAPIChatInputApplicationCommandsJSONBody;
  execute: (
    ctx: Context,
    interaction: ChatInputCommandInteraction
  ) => Promise<void>;
}

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
