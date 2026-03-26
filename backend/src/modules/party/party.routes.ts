import { FastifyInstance } from "fastify";
import { z } from "zod";
import prisma from "../../lib/prisma";
import { generateToken, generatePartyCode } from "../../lib/token";
import { assignRoles, generateSpeakingOrder, checkWinCondition } from "./roleAssignment";
import { broadcast } from "../websocket/websocket.service";

const createPartySchema = z.object({
  hostName: z.string().min(1).max(30),
  infiltratorCount: z.number().int().min(1),
  hasSpy: z.boolean().default(true),
  spyNotFirst: z.boolean().default(false),
  infiltratorKnowsRole: z.boolean().default(true),
});

const joinPartySchema = z.object({
  displayName: z.string().min(1).max(30),
});

export async function partyRoutes(app: FastifyInstance) {
  // Create party
  app.post("/parties", async (req, reply) => {
    const body = createPartySchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const { hostName, infiltratorCount, hasSpy, spyNotFirst, infiltratorKnowsRole } = body.data;

    // Pick a random word pair from the DB
    const pairCount = await prisma.wordPair.count();
    const pair = await prisma.wordPair.findFirst({ skip: Math.floor(Math.random() * pairCount) });
    if (!pair) return reply.status(500).send({ error: "No word pairs available" });

    // Generate unique code
    let code = generatePartyCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      const exists = await prisma.party.findUnique({ where: { code } });
      if (!exists) break;
      code = generatePartyCode();
    }

    const sessionToken = generateToken();

    const result = await prisma.$transaction(async (tx) => {
      const party = await tx.party.create({
        data: { code, desiredInfiltratorCount: infiltratorCount, hasSpy, spyNotFirst, infiltratorKnowsRole, wordA: pair.wordA, wordB: pair.wordB, category: pair.category },
      });
      const player = await tx.player.create({
        data: { displayName: hostName, partyId: party.id, sessionToken },
      });
      const updatedParty = await tx.party.update({
        where: { id: party.id },
        data: { hostPlayerId: player.id },
      });
      return { party: updatedParty, player };
    });

    return reply.status(201).send({
      partyId: result.party.id,
      partyCode: result.party.code,
      playerId: result.player.id,
      sessionToken,
    });
  });

  // Join party
  app.post("/parties/:code/join", async (req, reply) => {
    const { code } = req.params as { code: string };
    const body = joinPartySchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const party = await prisma.party.findUnique({ where: { code } });
    if (!party) return reply.status(404).send({ error: "Party not found" });
    if (party.status !== "lobby") return reply.status(400).send({ error: "Game already started" });

    const sessionToken = generateToken();
    try {
      const player = await prisma.player.create({
        data: { displayName: body.data.displayName, partyId: party.id, sessionToken },
      });

      broadcast(code, "player_joined", { playerId: player.id, displayName: player.displayName });

      return reply.status(201).send({ partyId: party.id, playerId: player.id, sessionToken });
    } catch (e: any) {
      if (e.code === "P2002") return reply.status(400).send({ error: "Name already taken" });
      throw e;
    }
  });

  // Get party / lobby state
  app.get("/parties/:code", async (req, reply) => {
    const { code } = req.params as { code: string };

    const party = await prisma.party.findUnique({
      where: { code },
      include: { players: { select: { id: true, displayName: true, isAlive: true, joinedAt: true } } },
    });
    if (!party) return reply.status(404).send({ error: "Party not found" });

    return {
      party: { id: party.id, code: party.code, status: party.status, hostPlayerId: party.hostPlayerId, hasSpy: party.hasSpy, category: party.category, infiltratorKnowsRole: party.infiltratorKnowsRole },
      players: party.players,
    };
  });

  // Start game (host only)
  app.post("/parties/:code/start", async (req, reply) => {
    const { code } = req.params as { code: string };
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return reply.status(401).send({ error: "Unauthorized" });

    const player = await prisma.player.findUnique({ where: { sessionToken: token } });
    if (!player) return reply.status(401).send({ error: "Unauthorized" });

    const party = await prisma.party.findUnique({
      where: { code },
      include: { players: true },
    });
    if (!party) return reply.status(404).send({ error: "Party not found" });
    if (party.hostPlayerId !== player.id) return reply.status(403).send({ error: "Only host can start" });
    if (party.status !== "lobby") return reply.status(400).send({ error: "Game already started" });
    if (party.players.length < 3) return reply.status(400).send({ error: "Need at least 3 players" });

    let assignments;
    try {
      assignments = assignRoles(
        party.players.map((p) => p.id),
        party.desiredInfiltratorCount,
        party.hasSpy
      );
    } catch (e: any) {
      return reply.status(400).send({ error: e.message });
    }

    const roleMap = new Map(assignments.map(({ playerId, role }) => [playerId, role]));
    const playersWithRoles = party.players.map((p) => ({ id: p.id, role: roleMap.get(p.id) ?? null }));
    const speakingOrder = generateSpeakingOrder(playersWithRoles, party.spyNotFirst);

    const round = await prisma.$transaction(async (tx) => {
      await Promise.all(assignments.map(({ playerId, role }) =>
        tx.player.update({ where: { id: playerId }, data: { role } })
      ));
      await tx.party.update({ where: { id: party.id }, data: { status: "in_progress" } });
      return tx.round.create({ data: { partyId: party.id, roundNumber: 1, speakingOrder } });
    });

    const alivePlayerIds = party.players.map((p) => p.id);
    broadcast(code, "game_started", { roundId: round.id, roundNumber: 1, alivePlayerIds, speakingOrder });

    return { roundId: round.id };
  });

  // Play again — reset finished party to lobby (host only)
  app.post("/parties/:code/reset", async (req, reply) => {
    const { code } = req.params as { code: string };
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return reply.status(401).send({ error: "Unauthorized" });

    const [player, party] = await Promise.all([
      prisma.player.findUnique({ where: { sessionToken: token } }),
      prisma.party.findUnique({ where: { code }, include: { players: true } }),
    ]);
    if (!player) return reply.status(401).send({ error: "Unauthorized" });
    if (!party) return reply.status(404).send({ error: "Party not found" });
    if (party.hostPlayerId !== player.id) return reply.status(403).send({ error: "Only host can reset" });
    if (party.status === "lobby") return reply.send({ success: true, alreadyReset: true });
    if (party.status !== "finished") return reply.status(400).send({ error: "Game not finished" });

    const pairCount = await prisma.wordPair.count();
    const pair = await prisma.wordPair.findFirst({ skip: Math.floor(Math.random() * pairCount) });
    if (!pair) return reply.status(500).send({ error: "No word pairs available" });

    await prisma.$transaction(async (tx) => {
      await tx.party.update({
        where: { id: party.id },
        data: { status: "lobby", wordA: pair.wordA, wordB: pair.wordB, category: pair.category },
      });
      await Promise.all(
        party.players.map((p) => tx.player.update({ where: { id: p.id }, data: { role: null, isAlive: true } }))
      );
    });

    broadcast(code, "party_reset", {});

    return { success: true };
  });
}
