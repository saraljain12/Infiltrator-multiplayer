import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { WORD_PAIRS } from "../src/lib/wordList";

const prisma = new PrismaClient();

async function main() {
  await prisma.wordPair.deleteMany();
  await prisma.wordPair.createMany({ data: WORD_PAIRS });
  console.log(`Seeded ${WORD_PAIRS.length} word pairs across categories:`);
  const counts = WORD_PAIRS.reduce<Record<string, number>>((acc, p) => {
    acc[p.category] = (acc[p.category] ?? 0) + 1;
    return acc;
  }, {});
  for (const [cat, n] of Object.entries(counts)) {
    console.log(`  ${cat}: ${n} pairs`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
