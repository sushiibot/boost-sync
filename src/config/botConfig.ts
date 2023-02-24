import { z } from "zod";
import * as dotenv from "dotenv";
dotenv.config();

const schema = z.object({
  DISCORD_TOKEN: z.string(),
  APPLICATION_ID: z.string(),
  LOG_LEVEL: z.string().optional().default("info"),
  DRY_RUN: z
    .string()
    .default("false")
    .transform((value) => value === "true"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "❌ Invalid environment variables:",
    JSON.stringify(parsed.error.format(), null, 4)
  );

  process.exit(1);
}

export type ConfigType = z.infer<typeof schema>;

export default parsed.data;
