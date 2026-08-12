import "dotenv/config";
import path from "path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import staticPlugin from "@fastify/static";
import websocketPlugin from "@fastify/websocket";
import { partyRoutes } from "./modules/party/party.routes";
import { playerRoutes } from "./modules/player/player.routes";
import { votingRoutes } from "./modules/voting/voting.routes";
import { websocketRoutes } from "./modules/websocket/websocket.routes";

const app = Fastify({ logger: true });

async function main() {
  await app.register(cors, { origin: true });
  await app.register(websocketPlugin);
  await app.register(staticPlugin, {
    root: path.join(__dirname, "../../frontend/dist"),
    prefix: "/",
  });

  await app.register(partyRoutes);
  await app.register(playerRoutes);
  await app.register(votingRoutes);
  await app.register(websocketRoutes);

  app.setNotFoundHandler((_req, reply) => {
    reply.sendFile("index.html");
  });

  await app.listen({ port: Number(process.env.PORT) || 3001, host: "0.0.0.0" });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
