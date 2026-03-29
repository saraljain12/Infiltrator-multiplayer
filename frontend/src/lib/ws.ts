type Handler = (payload: unknown) => void;

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let activePartyCode = "";
let activeToken = "";
let onReconnectCallback: (() => void) | null = null;
let stopped = false;

const handlers = new Map<string, Set<Handler>>();

function createSocket() {
  const wsBase = (import.meta.env.VITE_API_URL ?? "http://localhost:3001").replace(/^http/, "ws");
  const ws = new WebSocket(`${wsBase}/parties/${activePartyCode}/ws?token=${activeToken}`);

  ws.addEventListener("message", (e) => {
    try {
      const { event, payload } = JSON.parse(e.data);
      handlers.get(event)?.forEach((fn) => fn(payload));
    } catch {}
  });

  ws.addEventListener("close", () => {
    if (stopped) return;
    reconnectTimer = setTimeout(() => {
      socket = createSocket();
      onReconnectCallback?.();
    }, 2000);
  });

  return ws;
}

export function connectWS(partyCode: string, token: string, onReconnect?: () => void): WebSocket {
  stopped = false;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (socket) socket.close();

  activePartyCode = partyCode;
  activeToken = token;
  onReconnectCallback = onReconnect ?? null;

  socket = createSocket();
  return socket;
}

export function onEvent(event: string, handler: Handler): () => void {
  if (!handlers.has(event)) handlers.set(event, new Set());
  handlers.get(event)!.add(handler);
  return () => handlers.get(event)?.delete(handler);
}

export function disconnectWS() {
  stopped = true;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  socket?.close();
  socket = null;
  handlers.clear();
}
