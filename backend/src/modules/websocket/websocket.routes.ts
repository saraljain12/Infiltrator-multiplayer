import { FastifyInstance } from "fastify";
import prisma from "../../lib/prisma";
import { addConnection, removeConnection } from "./websocket.service";

export async function websocketRoutes(app: FastifyInstance) {
  app.get("/parties/:code/ws", { websocket: true }, async (socket, req) => {
    const { code } = req.params as { code: string };
    const token = (req.query as Record<string, string>).token;

    if (!token) {
      socket.close(1008, "Missing token");
      return;
    }

    const player = await prisma.player.findUnique({ where: { sessionToken: token } });
    const party = await prisma.party.findUnique({ where: { code } });

    if (!player || !party || player.partyId !== party.id) {
      socket.close(1008, "Unauthorized");
      return;
    }

    addConnection(code, socket);

    socket.on("close", () => {
      removeConnection(code, socket);
    });
  });
}
