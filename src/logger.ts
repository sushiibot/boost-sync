import pino from "pino";
import config from "./config/botConfig";

const logger = pino({
  level: config.LOG_LEVEL,
});

export default logger;
