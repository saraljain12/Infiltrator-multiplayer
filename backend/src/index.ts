import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import websocketPlugin from "@fastify/websocket";
import { partyRoutes } from "./modules/party/party.routes";
import { playerRoutes } from "./modules/player/player.routes";
import { votingRoutes } from "./modules/voting/voting.routes";
import { websocketRoutes } from "./modules/websocket/websocket.routes";

const app = Fastify({ logger: true });

async function main() {
  await app.register(cors, { origin: true });
  await app.register(websocketPlugin);

  await app.register(partyRoutes);
  await app.register(playerRoutes);
  await app.register(votingRoutes);
  await app.register(websocketRoutes);

  await app.listen({ port: Number(process.env.PORT) || 3001, host: "0.0.0.0" });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
