import { PrismaClient } from "@prisma/client";

export default interface Context {
  db: PrismaClient;
}
