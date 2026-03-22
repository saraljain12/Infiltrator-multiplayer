import { FastifyInstance } from "fastify";
import prisma from "../../lib/prisma";

export async function playerRoutes(app: FastifyInstance) {
  app.get("/players/me", async (req, reply) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return reply.status(401).send({ error: "Unauthorized" });

    const player = await prisma.player.findUnique({ where: { sessionToken: token } });
    if (!player) return reply.status(401).send({ error: "Unauthorized" });

    const party = await prisma.party.findUnique({ where: { id: player.partyId } });

    let word: string | null = null;
    if (player.role === "civilian") word = party?.wordA ?? null;
    else if (player.role === "infiltrator") word = party?.wordB ?? null;
    // spy gets null

    // If infiltratorKnowsRole is false, infiltrators are shown as civilians
    const displayRole =
      player.role === "infiltrator" && party && !party.infiltratorKnowsRole
        ? "civilian"
        : player.role;

    return {
      playerId: player.id,
      displayName: player.displayName,
      role: displayRole,
      word,
      isAlive: player.isAlive,
    };
  });
}
