export type Role = "civilian" | "infiltrator" | "spy";

export interface PlayerAssignment {
  playerId: string;
  role: Role;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function assignRoles(
  playerIds: string[],
  infiltratorCount: number,
  hasSpy: boolean
): PlayerAssignment[] {
  const n = playerIds.length;

  if (n < 3) throw new Error("Need at least 3 players");
  if (infiltratorCount < 1) throw new Error("Need at least 1 infiltrator");

  const badCount = infiltratorCount + (hasSpy ? 1 : 0);
  const civilianCount = n - badCount;
  if (civilianCount < badCount) {
    throw new Error(`Civilians (${civilianCount}) must be at least equal to bad players (${badCount}).`);
  }

  const shuffled = shuffle(playerIds);
  const assignments: PlayerAssignment[] = [];

  let i = 0;
  for (; i < infiltratorCount; i++) {
    assignments.push({ playerId: shuffled[i], role: "infiltrator" });
  }
  if (hasSpy) {
    assignments.push({ playerId: shuffled[i], role: "spy" });
    i++;
  }
  for (; i < n; i++) {
    assignments.push({ playerId: shuffled[i], role: "civilian" });
  }

  return assignments;
}

export function generateSpeakingOrder(
  players: { id: string; role: string | null }[],
  spyNotFirst: boolean
): string[] {
  const ids = shuffle(players.map((p) => p.id));
  if (spyNotFirst) {
    const firstRole = players.find((p) => p.id === ids[0])?.role;
    if (firstRole === "spy") {
      const swapIdx = 1 + Math.floor(Math.random() * (ids.length - 1));
      [ids[0], ids[swapIdx]] = [ids[swapIdx], ids[0]];
    }
  }
  return ids;
}

export function checkWinCondition(players: { role: string | null; isAlive: boolean }[]): "civilians" | "bad" | null {
  const alive = players.filter((p) => p.isAlive);
  const aliveBad = alive.filter((p) => p.role === "infiltrator" || p.role === "spy").length;
  const aliveCivilians = alive.filter((p) => p.role === "civilian").length;

  if (aliveBad === 0) return "civilians";
  if (aliveCivilians <= 1) return "bad";
  return null;
}
