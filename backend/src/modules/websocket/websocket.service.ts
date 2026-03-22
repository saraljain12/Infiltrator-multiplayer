import { WebSocket } from "@fastify/websocket";

type PartyCode = string;

const partyConnections = new Map<PartyCode, Set<WebSocket>>();

export function addConnection(partyCode: PartyCode, ws: WebSocket): void {
  if (!partyConnections.has(partyCode)) {
    partyConnections.set(partyCode, new Set());
  }
  partyConnections.get(partyCode)!.add(ws);
}

export function removeConnection(partyCode: PartyCode, ws: WebSocket): void {
  partyConnections.get(partyCode)?.delete(ws);
}

export function broadcast(partyCode: PartyCode, event: string, payload: unknown): void {
  const connections = partyConnections.get(partyCode);
  if (!connections) return;
  const message = JSON.stringify({ event, payload });
  for (const ws of connections) {
    if (ws.readyState === ws.OPEN) {
      ws.send(message);
    }
  }
}
