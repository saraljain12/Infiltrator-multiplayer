import { PrismaClient } from "@prisma/client";

function buildDatabaseUrl() {
  const url = process.env.DATABASE_URL ?? "";
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}connection_limit=20&pool_timeout=30`;
}

const prisma = new PrismaClient({
  datasources: { db: { url: buildDatabaseUrl() } },
});
export default prisma;
