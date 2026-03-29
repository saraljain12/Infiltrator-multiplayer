import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getParty, startGame } from "../lib/api";
import storage from "../lib/storage";
import { connectWS, onEvent, disconnectWS } from "../lib/ws";

interface Player { id: string; displayName: string; isAlive: boolean }

const AVATAR_GRADIENTS = [
  ["#7c3aed", "#a855f7"],
  ["#be123c", "#ef4444"],
  ["#0369a1", "#3b82f6"],
  ["#047857", "#10b981"],
  ["#b45309", "#f59e0b"],
];

function avatarGradient(name: string) {
  const hash = [...name].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const [a, b] = AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
  return `linear-gradient(135deg, ${a}, ${b})`;
}

function initials(name: string) {
  return name.trim().split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

export default function Lobby() {
  const { code } = useParams<{ code: string }>();
  const nav = useNavigate();
  const [players, setPlayers] = useState<Player[]>([]);
  const [hostId, setHostId] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const myId = storage.getItem("playerId") ?? "";
  const token = storage.getItem("sessionToken") ?? "";

  useEffect(() => {
    if (!code) return;
    function syncParty() {
      getParty(code!).then(({ party, players }) => {
        if (party.status === "in_progress") { nav(`/game/${code}`); return; }
        setPlayers(players);
        setHostId(party.hostPlayerId);
      });
    }
    syncParty();

    connectWS(code, token, syncParty);
    const unsub1 = onEvent("player_joined", (p: any) => {
      setPlayers((prev) => [...prev, { id: p.playerId, displayName: p.displayName, isAlive: true }]);
    });
    const unsub2 = onEvent("game_started", () => { nav(`/game/${code}`); });

    return () => { unsub1(); unsub2(); disconnectWS(); };
  }, [code]);

  async function handleStart() {
    setError("");
    try { await startGame(code!); }
    catch (e: any) { setError(e?.error || "Failed to start"); }
  }

  const gameUrl = window.location.origin;
  const inviteMessage = `I'm starting a spy game 😈\nJoin me: ${gameUrl}\nCode: ${code}`;

  async function handleCopyInvite() {
    await navigator.clipboard.writeText(inviteMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleShareWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(inviteMessage)}`, "_blank");
  }

  const isHost = myId === hostId;
  const canStart = players.length >= 3;

  return (
    <div className="page">
      <div style={{ textAlign: "center", marginBottom: "1.25rem" }}>
        <p className="code-label">Party Code</p>
        <div className="code-badge">{code}</div>
      </div>

      <div className="invite-box" style={{ marginBottom: "1.75rem" }}>
        <p className="section-label" style={{ marginBottom: ".6rem" }}>Invite friends</p>
        <div className="invite-message">{inviteMessage}</div>
        <div className="share-btns">
          <button className="btn-whatsapp" onClick={handleShareWhatsApp} style={{ flex: 1 }}>WhatsApp</button>
          <button className="btn-ghost" onClick={handleCopyInvite} style={{ flex: 1 }}>
            {copied ? "Copied!" : "Copy invite"}
          </button>
        </div>
      </div>

      <p className="section-label">{players.length} player{players.length !== 1 ? "s" : ""} in lobby</p>

      <div style={{ display: "flex", flexDirection: "column", gap: ".4rem", marginBottom: "1.5rem" }}>
        {players.map((p, i) => (
          <div key={p.id} className="player-chip" style={{ animationDelay: `${i * 0.05}s` }}>
            <div className="avatar" style={{ background: avatarGradient(p.displayName) }}>
              {initials(p.displayName)}
            </div>
            <span style={{ flex: 1, textAlign: "center" }}>{p.displayName}</span>
            {p.id === hostId && <span className="badge badge-host">host</span>}
            {p.id === myId && <span className="badge badge-you">you</span>}
          </div>
        ))}
      </div>

      {error && <p className="error">{error}</p>}

      {isHost ? (
        <button onClick={handleStart} disabled={!canStart} style={{ width: "100%" }}>
          {canStart ? "Start Game" : `Need at least 3 players (${players.length}/3)`}
        </button>
      ) : (
        <p className="waiting" style={{ textAlign: "center" }}>
          Waiting for host to start the game...
        </p>
      )}
    </div>
  );
}
