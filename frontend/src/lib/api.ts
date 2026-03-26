import storage from "./storage";

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

function getToken() {
  return storage.getItem("sessionToken") ?? "";
}

function authHeaders() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` };
}

export async function createParty(data: {
  hostName: string;
  infiltratorCount: number;
  hasSpy: boolean;
  spyNotFirst: boolean;
  infiltratorKnowsRole: boolean;
}) {
  const res = await fetch(`${BASE}/parties`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw await res.json();
  return res.json() as Promise<{ partyId: string; partyCode: string; playerId: string; sessionToken: string }>;
}

export async function joinParty(code: string, displayName: string) {
  const res = await fetch(`${BASE}/parties/${code}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ displayName }),
  });
  if (!res.ok) throw await res.json();
  return res.json() as Promise<{ partyId: string; playerId: string; sessionToken: string }>;
}

export async function getParty(code: string) {
  const res = await fetch(`${BASE}/parties/${code}`, { headers: authHeaders() });
  if (!res.ok) throw await res.json();
  return res.json() as Promise<{
    party: { id: string; code: string; status: string; hostPlayerId: string; hasSpy: boolean; category: string; infiltratorKnowsRole: boolean };
    players: { id: string; displayName: string; isAlive: boolean }[];
  }>;
}

export async function startGame(code: string) {
  const res = await fetch(`${BASE}/parties/${code}/start`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({}),
  });
  if (!res.ok) throw await res.json();
  return res.json() as Promise<{ roundId: string }>;
}

export async function getMe() {
  const res = await fetch(`${BASE}/players/me`, { headers: authHeaders() });
  if (!res.ok) throw await res.json();
  return res.json() as Promise<{
    playerId: string;
    displayName: string;
    role: string | null;
    word: string | null;
    isAlive: boolean;
  }>;
}

export async function getCurrentRound(code: string) {
  const res = await fetch(`${BASE}/parties/${code}/rounds/current`, { headers: authHeaders() });
  if (!res.ok) throw await res.json();
  return res.json() as Promise<{
    roundId: string;
    roundNumber: number;
    status: string;
    votesSubmitted: number;
    totalVoters: number;
    votingDeadline: string | null;
    speakingOrder: string[];
  }>;
}

export async function startVoting(roundId: string) {
  const res = await fetch(`${BASE}/rounds/${roundId}/start-voting`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({}),
  });
  if (!res.ok) throw await res.json();
  return res.json() as Promise<{ votingDeadline: string }>;
}

export async function submitVote(roundId: string, targetPlayerId: string) {
  const res = await fetch(`${BASE}/rounds/${roundId}/votes`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ targetPlayerId }),
  });
  if (!res.ok) throw await res.json();
  return res.json();
}

export async function nextRound(code: string) {
  const res = await fetch(`${BASE}/parties/${code}/next-round`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({}),
  });
  if (!res.ok) throw await res.json();
  return res.json() as Promise<{ roundId: string }>;
}

export async function resetParty(code: string) {
  const res = await fetch(`${BASE}/parties/${code}/reset`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({}),
  });
  if (!res.ok) throw await res.json();
  return res.json() as Promise<{ success: boolean }>;
}

export async function submitSpyGuess(roundId: string, guess: string) {
  const res = await fetch(`${BASE}/rounds/${roundId}/spy-guess`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ guess }),
  });
  if (!res.ok) throw await res.json();
  return res.json() as Promise<{ correct: boolean }>;
}
