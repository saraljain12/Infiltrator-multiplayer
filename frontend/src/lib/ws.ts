type Handler = (payload: unknown) => void;

let socket: WebSocket | null = null;
const handlers = new Map<string, Set<Handler>>();

export function connectWS(partyCode: string, token: string): WebSocket {
  if (socket) socket.close();
  const wsBase = (import.meta.env.VITE_API_URL ?? "http://localhost:3001").replace(/^http/, "ws");
  socket = new WebSocket(`${wsBase}/parties/${partyCode}/ws?token=${token}`);

  socket.addEventListener("message", (e) => {
    try {
      const { event, payload } = JSON.parse(e.data);
      handlers.get(event)?.forEach((fn) => fn(payload));
    } catch {}
  });

  return socket;
}

export function onEvent(event: string, handler: Handler): () => void {
  if (!handlers.has(event)) handlers.set(event, new Set());
  handlers.get(event)!.add(handler);
  return () => handlers.get(event)?.delete(handler);
}

export function disconnectWS() {
  socket?.close();
  socket = null;
  handlers.clear();
}
