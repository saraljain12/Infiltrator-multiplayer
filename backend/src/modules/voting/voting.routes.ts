import { FastifyInstance } from "fastify";
import { z } from "zod";
import prisma from "../../lib/prisma";
import { checkWinCondition, generateSpeakingOrder } from "../party/roleAssignment";
import { broadcast } from "../websocket/websocket.service";

const VOTING_DURATION_MS = 3 * 60 * 1000;

const voteSchema = z.object({ targetPlayerId: z.string().uuid() });
const spyGuessSchema = z.object({ guess: z.string().min(1) });

export async function votingRoutes(app: FastifyInstance) {
  // Get current round state
  app.get("/parties/:code/rounds/current", async (req, reply) => {
    const { code } = req.params as { code: string };
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return reply.status(401).send({ error: "Unauthorized" });

    const [player, party] = await Promise.all([
      prisma.player.findUnique({ where: { sessionToken: token } }),
      prisma.party.findUnique({ where: { code } }),
    ]);
    if (!player) return reply.status(401).send({ error: "Unauthorized" });
    if (!party) return reply.status(404).send({ error: "Party not found" });

    const [round, aliveCount] = await Promise.all([
      prisma.round.findFirst({
        where: { partyId: party.id, status: { not: "completed" } },
        orderBy: { roundNumber: "desc" },
      }),
      prisma.player.count({ where: { partyId: party.id, isAlive: true } }),
    ]);
    if (!round) return reply.status(404).send({ error: "No active round" });

    const votesSubmitted = await prisma.vote.count({ where: { roundId: round.id } });

    const votingDeadline = round.votingStartedAt
      ? new Date(round.votingStartedAt.getTime() + VOTING_DURATION_MS).toISOString()
      : null;

    return {
      roundId: round.id,
      roundNumber: round.roundNumber,
      status: round.status,
      votesSubmitted,
      totalVoters: aliveCount,
      votingDeadline,
      speakingOrder: round.speakingOrder,
    };
  });

  // Start voting (host only)
  app.post("/rounds/:roundId/start-voting", async (req, reply) => {
    const { roundId } = req.params as { roundId: string };
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return reply.status(401).send({ error: "Unauthorized" });

    const player = await prisma.player.findUnique({ where: { sessionToken: token } });
    if (!player) return reply.status(401).send({ error: "Unauthorized" });

    const round = await prisma.round.findUnique({ where: { id: roundId }, include: { party: true } });
    if (!round || round.status !== "discussion") {
      return reply.status(400).send({ error: "Round not in discussion phase" });
    }
    if (round.party.hostPlayerId !== player.id) {
      return reply.status(403).send({ error: "Only the host can start voting" });
    }

    const votingStartedAt = new Date();
    const votingDeadline = new Date(votingStartedAt.getTime() + VOTING_DURATION_MS);

    await prisma.round.update({ where: { id: roundId }, data: { status: "voting", votingStartedAt } });

    broadcast(round.party.code, "voting_started", { roundId, votingDeadline: votingDeadline.toISOString() });

    setTimeout(async () => {
      const current = await prisma.round.findUnique({ where: { id: roundId } });
      if (current?.status === "voting") await resolveRound(roundId, round.party.code, true);
    }, VOTING_DURATION_MS);

    return { votingDeadline: votingDeadline.toISOString() };
  });

  // Submit vote
  app.post("/rounds/:roundId/votes", async (req, reply) => {
    const { roundId } = req.params as { roundId: string };
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return reply.status(401).send({ error: "Unauthorized" });

    const body = voteSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const voter = await prisma.player.findUnique({ where: { sessionToken: token } });
    if (!voter || !voter.isAlive) return reply.status(403).send({ error: "Cannot vote" });

    const round = await prisma.round.findUnique({ where: { id: roundId }, include: { party: true } });
    if (!round || round.status !== "voting") return reply.status(400).send({ error: "Round not in voting phase" });

    const target = await prisma.player.findUnique({ where: { id: body.data.targetPlayerId } });
    if (!target || !target.isAlive || target.partyId !== voter.partyId) {
      return reply.status(400).send({ error: "Invalid target" });
    }
    if (target.id === voter.id) return reply.status(400).send({ error: "Cannot vote for yourself" });

    try {
      await prisma.vote.create({ data: { roundId, voterId: voter.id, targetId: target.id } });
    } catch (e: any) {
      if (e.code === "P2002") return reply.status(400).send({ error: "Already voted" });
      throw e;
    }

    const aliveCount = await prisma.player.count({ where: { partyId: voter.partyId, isAlive: true } });
    const votesSubmitted = await prisma.vote.count({ where: { roundId } });

    broadcast(round.party.code, "vote_cast", { votesSubmitted, totalVoters: aliveCount });

    if (votesSubmitted >= aliveCount) await resolveRound(round.id, round.party.code);

    return { votesSubmitted, totalVoters: aliveCount };
  });

  // Host starts next round (after seeing elimination result)
  app.post("/parties/:code/next-round", async (req, reply) => {
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
    if (party.status !== "in_progress") return reply.status(400).send({ error: "Game not in progress" });
    if (party.hostPlayerId !== player.id) return reply.status(403).send({ error: "Only host can continue" });

    const activeRound = await prisma.round.findFirst({
      where: { partyId: party.id, status: { not: "completed" } },
    });
    if (activeRound) return reply.status(400).send({ error: "Round still in progress" });

    const lastRound = await prisma.round.findFirst({
      where: { partyId: party.id },
      orderBy: { roundNumber: "desc" },
    });

    const alivePlayers = party.players.filter((p) => p.isAlive);
    const speakingOrder = generateSpeakingOrder(alivePlayers, party.spyNotFirst);
    const nextRound = await prisma.round.create({
      data: { partyId: party.id, roundNumber: (lastRound?.roundNumber ?? 0) + 1, speakingOrder },
    });

    broadcast(code, "round_started", {
      roundId: nextRound.id,
      roundNumber: nextRound.roundNumber,
      alivePlayerIds: alivePlayers.map((p) => p.id),
      speakingOrder,
    });

    return { roundId: nextRound.id };
  });

  // Spy guess
  app.post("/rounds/:roundId/spy-guess", async (req, reply) => {
    const { roundId } = req.params as { roundId: string };
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return reply.status(401).send({ error: "Unauthorized" });

    const body = spyGuessSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const player = await prisma.player.findUnique({ where: { sessionToken: token } });
    if (!player || player.role !== "spy") return reply.status(403).send({ error: "Only the spy can guess" });

    const round = await prisma.round.findUnique({ where: { id: roundId }, include: { party: true } });
    if (!round || round.status !== "spy_guessing") {
      return reply.status(400).send({ error: "Not in spy guessing phase" });
    }
    if (round.eliminatedPlayerId !== player.id) {
      return reply.status(403).send({ error: "You are not the eliminated spy" });
    }

    const correct = body.data.guess.trim().toLowerCase() === round.party.wordA.trim().toLowerCase();

    await prisma.$transaction(async (tx) => {
      await tx.round.update({
        where: { id: roundId },
        data: { spyGuess: body.data.guess, spyGuessCorrect: correct, status: "completed", completedAt: new Date() },
      });
      await tx.player.update({ where: { id: player.id }, data: { isAlive: false } });
    });

    broadcast(round.party.code, "spy_guess_result", { correct, guessedWord: body.data.guess });

    if (correct) {
      await prisma.party.update({ where: { id: round.partyId }, data: { status: "finished" } });
      const allPlayers = await prisma.player.findMany({ where: { partyId: round.partyId } });
      broadcast(round.party.code, "game_over", {
        winner: "infiltrators_and_spy",
        reason: "spy_guessed_word",
        finalRoles: allPlayers.map((p) => ({ id: p.id, displayName: p.displayName, role: p.role })),
      });
    } else {
      const allPlayers = await prisma.player.findMany({ where: { partyId: round.partyId } });
      const win = checkWinCondition(allPlayers);

      broadcast(round.party.code, "round_completed", {
        roundId,
        eliminatedPlayer: { id: player.id, displayName: player.displayName, role: player.role },
        reason: "spy_caught",
      });

      if (win) {
        await prisma.party.update({ where: { id: round.partyId }, data: { status: "finished" } });
        broadcast(round.party.code, "game_over", {
          winner: win === "civilians" ? "civilians" : "infiltrators_and_spy",
          reason: win === "civilians" ? "all_bad_eliminated" : "civilians_outnumbered",
          finalRoles: allPlayers.map((p) => ({ id: p.id, displayName: p.displayName, role: p.role })),
        });
      }
      // No win: host will start next round via /next-round endpoint
    }

    return { correct };
  });
}

async function resolveRound(roundId: string, partyCode: string, forced = false) {
  // Atomically claim resolution rights — only one caller proceeds if concurrent
  const claimed = await prisma.round.updateMany({
    where: { id: roundId, status: "voting" },
    data: { status: "resolving" },
  });
  if (claimed.count === 0) return; // another caller already claimed it

  const round = await prisma.round.findUnique({ where: { id: roundId }, include: { votes: true, party: true } });
  if (!round) return;
  const spyNotFirst = round.party.spyNotFirst;

  // No votes cast — skip elimination
  if (round.votes.length === 0) {
    await prisma.round.update({ where: { id: roundId }, data: { status: "completed", completedAt: new Date() } });
    broadcast(partyCode, "round_completed", { roundId, eliminatedPlayer: null });

    const allPlayers = await prisma.player.findMany({ where: { partyId: round.partyId } });
    const win = checkWinCondition(allPlayers);
    if (win) {
      await prisma.party.update({ where: { id: round.partyId }, data: { status: "finished" } });
      broadcast(partyCode, "game_over", {
        winner: win === "civilians" ? "civilians" : "infiltrators_and_spy",
        reason: win === "civilians" ? "all_bad_eliminated" : "civilians_outnumbered",
        finalRoles: allPlayers.map((p) => ({ id: p.id, displayName: p.displayName, role: p.role })),
      });
    }
    // No win: host starts next round
    return;
  }

  // Tally votes
  const tally = new Map<string, number>();
  for (const vote of round.votes) {
    tally.set(vote.targetId, (tally.get(vote.targetId) ?? 0) + 1);
  }

  const maxVotes = Math.max(...tally.values());
  const tied = [...tally.entries()].filter(([, v]) => v === maxVotes).map(([id]) => id);
  const voteSummary = [...tally.entries()].map(([targetId, count]) => ({ targetId, count }));

  // Tie — no elimination
  if (tied.length > 1) {
    await prisma.round.update({ where: { id: roundId }, data: { status: "completed", completedAt: new Date() } });
    broadcast(partyCode, "round_completed", { roundId, eliminatedPlayer: null, reason: "tie", votes: voteSummary });

    const allPlayers = await prisma.player.findMany({ where: { partyId: round.partyId } });
    const win = checkWinCondition(allPlayers);
    if (win) {
      await prisma.party.update({ where: { id: round.partyId }, data: { status: "finished" } });
      broadcast(partyCode, "game_over", {
        winner: win === "civilians" ? "civilians" : "infiltrators_and_spy",
        reason: win === "civilians" ? "all_bad_eliminated" : "civilians_outnumbered",
        finalRoles: allPlayers.map((p) => ({ id: p.id, displayName: p.displayName, role: p.role })),
      });
    }
    return;
  }

  const eliminatedId = tied[Math.floor(Math.random() * tied.length)];
  const eliminated = await prisma.player.findUnique({ where: { id: eliminatedId } });
  if (!eliminated) return;

  // Spy voted out — enter spy_guessing phase
  if (eliminated.role === "spy") {
    await prisma.round.update({
      where: { id: roundId },
      data: { eliminatedPlayerId: eliminatedId, status: "spy_guessing" },
    });
    broadcast(partyCode, "spy_guessing", {
      roundId,
      spyPlayerId: eliminatedId,
      spyDisplayName: eliminated.displayName,
    });
    return;
  }

  // Normal elimination
  await prisma.$transaction(async (tx) => {
    await tx.player.update({ where: { id: eliminatedId }, data: { isAlive: false } });
    await tx.round.update({
      where: { id: roundId },
      data: { eliminatedPlayerId: eliminatedId, status: "completed", completedAt: new Date() },
    });
  });

  broadcast(partyCode, "round_completed", {
    roundId,
    eliminatedPlayer: { id: eliminated.id, displayName: eliminated.displayName, role: eliminated.role },
    votes: voteSummary,
    ...(forced && { reason: "timeout" }),
  });

  const allPlayers = await prisma.player.findMany({ where: { partyId: round.partyId } });
  const win = checkWinCondition(allPlayers);

  if (win) {
    await prisma.party.update({ where: { id: round.partyId }, data: { status: "finished" } });
    broadcast(partyCode, "game_over", {
      winner: win === "civilians" ? "civilians" : "infiltrators_and_spy",
      reason: win === "civilians" ? "all_bad_eliminated" : "civilians_outnumbered",
      finalRoles: allPlayers.map((p) => ({ id: p.id, displayName: p.displayName, role: p.role })),
    });
  }
  // No win: host starts next round via /next-round endpoint
}
