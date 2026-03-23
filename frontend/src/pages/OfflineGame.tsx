import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { WORD_PAIRS } from "../lib/wordList";

type Role = "civilian" | "infiltrator" | "spy";
type Phase = "setup" | "revealing" | "discussion" | "voting" | "elimination" | "spy_guess" | "game_over";

interface OfflinePlayer {
  id: string;
  name: string;
  role: Role;
  word: string | null;
  isAlive: boolean;
}

const ROLE_ICON: Record<Role, string> = { civilian: "👤", infiltrator: "🗡️", spy: "🕵️" };

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
  return name.trim().split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 2);
}
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function checkWin(players: OfflinePlayer[]): "civilians" | "bad" | null {
  const alive = players.filter(p => p.isAlive);
  const aliveBad = alive.filter(p => p.role === "infiltrator" || p.role === "spy").length;
  const aliveCivilians = alive.filter(p => p.role === "civilian").length;
  if (aliveBad === 0) return "civilians";
  if (aliveCivilians <= 1) return "bad";
  return null;
}

export default function OfflineGame() {
  const nav = useNavigate();

  // ── Setup state ──────────────────────────────────────────────────────────
  const [names, setNames] = useState<string[]>(["", "", ""]);
  const [infiltratorCount, setInfiltratorCount] = useState(1);
  const [hasSpy, setHasSpy] = useState(true);
  const [spyNotFirst, setSpyNotFirst] = useState(false);
  const [infiltratorKnowsRole, setInfiltratorKnowsRole] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [setupError, setSetupError] = useState("");

  // ── Game state ───────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>("setup");
  const [players, setPlayers] = useState<OfflinePlayer[]>([]);
  const [civilianWord, setCivilianWord] = useState("");
  const [infiltratorWord, setInfiltratorWord] = useState("");
  const [category, setCategory] = useState("");
  const [round, setRound] = useState(1);
  const [speakingOrder, setSpeakingOrder] = useState<string[]>([]);

  // ── Reveal state ─────────────────────────────────────────────────────────
  const [revealIndex, setRevealIndex] = useState(0);
  const [revealVisible, setRevealVisible] = useState(false);

  // ── Voting state ─────────────────────────────────────────────────────────
  const [pendingElimination, setPendingElimination] = useState<string | null>(null);
  const [eliminatedPlayer, setEliminatedPlayer] = useState<OfflinePlayer | null>(null);

  // ── Spy guess state ──────────────────────────────────────────────────────
  const [spyPlayer, setSpyPlayer] = useState<OfflinePlayer | null>(null);
  const [spyGuessInput, setSpyGuessInput] = useState("");
  const [spyGuessResult, setSpyGuessResult] = useState<"correct" | "wrong" | null>(null);

  // ── Game over state ──────────────────────────────────────────────────────
  const [gameOverData, setGameOverData] = useState<{ winner: "civilians" | "bad_team"; reason: string } | null>(null);

  // ── Helpers ──────────────────────────────────────────────────────────────

  function buildOrder(alivePlayers: OfflinePlayer[]): string[] {
    const order = shuffle(alivePlayers.map(p => p.id));
    if (spyNotFirst && order.length > 1) {
      const firstRole = alivePlayers.find(p => p.id === order[0])?.role;
      if (firstRole === "spy") {
        const j = 1 + Math.floor(Math.random() * (order.length - 1));
        [order[0], order[j]] = [order[j], order[0]];
      }
    }
    return order;
  }

  function goNextRound(currentPlayers: OfflinePlayer[]) {
    const alive = currentPlayers.filter(p => p.isAlive);
    setSpeakingOrder(buildOrder(alive));
    setRound(r => r + 1);
    setEliminatedPlayer(null);
    setSpyPlayer(null);
    setPhase("discussion");
  }

  function endGame(currentPlayers: OfflinePlayer[], winner: "civilians" | "bad_team", reason: string) {
    setPlayers(currentPlayers);
    setGameOverData({ winner, reason });
    setPhase("game_over");
  }

  // ── Start game ───────────────────────────────────────────────────────────

  function handleStart() {
    setSetupError("");
    const validNames = names.map(n => n.trim()).filter(Boolean);
    if (validNames.length < 3) return setSetupError("Need at least 3 players");
    if (new Set(validNames).size !== validNames.length) return setSetupError("Names must be unique");

    const badCount = infiltratorCount + (hasSpy ? 1 : 0);
    const civilianCount = validNames.length - badCount;
    if (civilianCount < badCount) {
      return setSetupError(`Too many bad players (${badCount}) for ${validNames.length} players — add more players or reduce infiltrators`);
    }

    const pair = WORD_PAIRS[Math.floor(Math.random() * WORD_PAIRS.length)];
    const shuffled = shuffle(validNames);
    const newPlayers: OfflinePlayer[] = shuffled.map((name, i) => {
      let role: Role = "civilian";
      let word: string | null = pair.wordA;
      if (i < infiltratorCount) { role = "infiltrator"; word = pair.wordB; }
      else if (hasSpy && i === infiltratorCount) { role = "spy"; word = null; }
      return { id: String(i), name, role, word, isAlive: true };
    });

    setPlayers(newPlayers);
    setCivilianWord(pair.wordA);
    setInfiltratorWord(pair.wordB);
    setCategory(pair.category);
    setSpeakingOrder(buildOrder(newPlayers));
    setRevealIndex(0);
    setRevealVisible(false);
    setRound(1);
    setEliminatedPlayer(null);
    setGameOverData(null);
    setSpyGuessResult(null);
    setPhase("revealing");
  }

  // ── Voting handlers ──────────────────────────────────────────────────────

  function handleConfirmEliminate(playerId: string) {
    const target = players.find(p => p.id === playerId)!;
    const newPlayers = players.map(p => p.id === playerId ? { ...p, isAlive: false } : p);
    setPlayers(newPlayers);
    setPendingElimination(null);
    setEliminatedPlayer(target);
    setPhase("elimination");
  }

  function handleSkipElimination() {
    setPendingElimination(null);
    goNextRound(players);
  }

  function handleContinueAfterElimination() {
    if (!eliminatedPlayer) return;
    if (eliminatedPlayer.role === "spy") {
      setSpyPlayer(eliminatedPlayer);
      setSpyGuessInput("");
      setSpyGuessResult(null);
      setPhase("spy_guess");
      return;
    }
    const win = checkWin(players);
    if (win === "civilians") return endGame(players, "civilians", "all_bad_eliminated");
    if (win === "bad") return endGame(players, "bad_team", "civilians_outnumbered");
    goNextRound(players);
  }

  // ── Spy guess handlers ───────────────────────────────────────────────────

  function handleSpyGuessSubmit(e: React.FormEvent) {
    e.preventDefault();
    const correct = spyGuessInput.trim().toLowerCase() === civilianWord.toLowerCase();
    setSpyGuessResult(correct ? "correct" : "wrong");
  }

  function handleAfterSpyGuessReveal() {
    if (spyGuessResult === "correct") {
      setGameOverData({ winner: "bad_team", reason: "spy_guessed_word" });
      setPhase("game_over");
      return;
    }
    const win = checkWin(players);
    if (win === "civilians") return endGame(players, "civilians", "all_bad_eliminated");
    if (win === "bad") return endGame(players, "bad_team", "civilians_outnumbered");
    goNextRound(players);
  }

  // ── Reveal handler ───────────────────────────────────────────────────────

  function handleRevealDone() {
    setRevealVisible(false);
    if (revealIndex + 1 < speakingOrder.length) {
      setRevealIndex(revealIndex + 1);
    } else {
      setPhase("discussion");
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // RENDER: SETUP
  // ────────────────────────────────────────────────────────────────────────

  if (phase === "setup") {
    return (
      <div className="page">
        <div style={{ display: "flex", alignItems: "center", gap: ".75rem", marginBottom: "1.5rem" }}>
          <button className="btn-ghost" onClick={() => nav("/")} style={{ padding: ".4rem .8rem", fontSize: ".85rem" }}>← Back</button>
          <h2 style={{ margin: 0 }}>Offline Game</h2>
        </div>

        <p className="section-label" style={{ marginBottom: ".5rem" }}>Players</p>
        <div style={{ display: "flex", flexDirection: "column", gap: ".45rem", marginBottom: ".6rem" }}>
          {names.map((n, i) => (
            <div key={i} style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
              <input
                value={n}
                onChange={e => setNames(prev => prev.map((v, idx) => idx === i ? e.target.value : v))}
                placeholder={`Player ${i + 1}`}
                style={{ flex: 1 }}
              />
              {names.length > 3 && (
                <button type="button" className="btn-ghost" onClick={() => setNames(prev => prev.filter((_, idx) => idx !== i))} style={{ padding: ".4rem .7rem", flexShrink: 0 }}>✕</button>
              )}
            </div>
          ))}
        </div>
        <button type="button" className="btn-ghost" onClick={() => setNames(prev => [...prev, ""])} style={{ alignSelf: "flex-start", fontSize: ".85rem", padding: ".35rem .8rem", marginBottom: "1.25rem" }}>
          + Add player
        </button>

        <label style={{ marginBottom: ".75rem" }}>
          Infiltrators
          <div style={{ display: "flex", alignItems: "center", gap: ".6rem", marginTop: ".25rem" }}>
            <button type="button" onClick={() => setInfiltratorCount(v => Math.max(1, v - 1))} style={{ width: "2.2rem", height: "2.2rem", padding: 0, flexShrink: 0, fontSize: "1.1rem" }}>−</button>
            <span style={{ minWidth: "1.5rem", textAlign: "center", fontSize: "1.1rem", fontWeight: 600 }}>{infiltratorCount}</span>
            <button type="button" onClick={() => setInfiltratorCount(v => v + 1)} style={{ width: "2.2rem", height: "2.2rem", padding: 0, flexShrink: 0, fontSize: "1.1rem" }}>+</button>
          </div>
        </label>

        <label style={{ marginBottom: ".75rem" }}>
          <input type="checkbox" checked={hasSpy} onChange={e => setHasSpy(e.target.checked)} />
          Include a spy
        </label>

        <button type="button" className="btn-ghost" onClick={() => setShowAdvanced(v => !v)} style={{ alignSelf: "flex-start", fontSize: ".85rem", padding: ".3rem .7rem", marginBottom: ".5rem" }}>
          {showAdvanced ? "▾" : "▸"} Advanced options
        </button>

        {showAdvanced && (
          <div style={{ display: "flex", flexDirection: "column", gap: ".6rem", paddingLeft: ".9rem", borderLeft: "2px solid rgba(168,85,247,.3)", marginBottom: ".75rem" }}>
            <label>
              <input type="checkbox" checked={spyNotFirst} onChange={e => setSpyNotFirst(e.target.checked)} />
              Don't place spy first in speaking order
            </label>
            <label>
              <input type="checkbox" checked={infiltratorKnowsRole} onChange={e => setInfiltratorKnowsRole(e.target.checked)} />
              Infiltrators know they are infiltrators
            </label>
          </div>
        )}

        {setupError && <p className="error">{setupError}</p>}
        <button onClick={handleStart} style={{ width: "100%", marginTop: ".5rem" }}>Start Game</button>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────
  // RENDER: REVEALING (pass-the-phone)
  // ────────────────────────────────────────────────────────────────────────

  if (phase === "revealing") {
    const currentPlayer = players.find(p => p.id === speakingOrder[revealIndex])!;
    const total = speakingOrder.length;
    const showRole = infiltratorKnowsRole || currentPlayer.role === "spy";

    if (!revealVisible) {
      return (
        <div className="page center">
          <div className="pass-counter">{revealIndex + 1} / {total}</div>
          <div style={{ fontSize: "2.5rem", lineHeight: 1 }}>📱</div>
          <h2>Pass to {currentPlayer.name}</h2>
          <p className="waiting">Everyone else look away</p>
          <button onClick={() => setRevealVisible(true)} style={{ width: "100%", maxWidth: "280px" }}>
            👁 Reveal my word
          </button>
        </div>
      );
    }

    return (
      <div className="page center">
        <div className="pass-counter">{revealIndex + 1} / {total}</div>
        <div className="word-card" style={{ width: "100%", maxWidth: "360px" }}>
          <div className="word-card-header">
            {showRole
              ? <span className={`role-badge ${currentPlayer.role}`}>{ROLE_ICON[currentPlayer.role]} {currentPlayer.role}</span>
              : <span style={{ color: "var(--muted)", fontSize: ".8rem" }}>Your word</span>
            }
            <button className="btn-ghost" onClick={() => setRevealVisible(false)} style={{ fontSize: ".78rem", padding: ".2rem .6rem" }}>Hide</button>
          </div>
          {currentPlayer.word
            ? <div className="big-word">{currentPlayer.word}</div>
            : <>
                <div className="big-word" style={{ fontSize: "2.5rem" }}>🕵️</div>
                <div className="spy-word">You are the spy — no word assigned</div>
              </>
          }
        </div>
        <button onClick={handleRevealDone} style={{ width: "100%", maxWidth: "280px" }}>
          {revealIndex + 1 < total ? "Done — pass to next →" : "All done — start game"}
        </button>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────
  // RENDER: DISCUSSION
  // ────────────────────────────────────────────────────────────────────────

  if (phase === "discussion") {
    return (
      <div className="page">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
          {category && <span className="category-chip">📂 {category}</span>}
          <span className="category-chip" style={{ marginLeft: "auto" }}>Round {round}</span>
        </div>

        <p style={{ color: "var(--muted)", fontSize: ".9rem", marginBottom: "1.1rem" }}>
          Describe your word without saying it directly.
        </p>

        <p className="section-label">Speaking Order</p>
        <ul className="speaking-list" style={{ marginBottom: "1.5rem" }}>
          {speakingOrder.map((id, i) => {
            const p = players.find(pl => pl.id === id);
            const isDead = p && !p.isAlive;
            return (
              <li key={id} className={`speaking-item${isDead ? " dead" : ""}`}>
                <span className="speaking-num">{i + 1}</span>
                <div className="avatar" style={{ background: avatarGradient(p?.name ?? id), width: "1.6rem", height: "1.6rem", fontSize: ".65rem" }}>
                  {initials(p?.name ?? id)}
                </div>
                <span style={{ flex: 1 }}>{p?.name ?? id}</span>
                {isDead && <span style={{ fontSize: ".8rem" }}>✕</span>}
              </li>
            );
          })}
        </ul>

        <button onClick={() => setPhase("voting")} style={{ width: "100%" }}>Start Voting</button>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────
  // RENDER: VOTING
  // ────────────────────────────────────────────────────────────────────────

  if (phase === "voting") {
    const alive = players.filter(p => p.isAlive);
    return (
      <div className="page">
        {pendingElimination && (
          <div className="modal-overlay">
            <div className="modal">
              <div className="modal-icon">⚰️</div>
              <div className="eliminated-name">
                Eliminate {players.find(p => p.id === pendingElimination)?.name}?
              </div>
              <p style={{ color: "var(--muted)", fontSize: ".9rem" }}>This cannot be undone.</p>
              <div style={{ display: "flex", gap: ".75rem" }}>
                <button className="btn-ghost" onClick={() => setPendingElimination(null)} style={{ flex: 1 }}>Cancel</button>
                <button className="btn-danger" onClick={() => handleConfirmEliminate(pendingElimination)} style={{ flex: 1 }}>Eliminate</button>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
          {category && <span className="category-chip">📂 {category}</span>}
          <span className="category-chip" style={{ marginLeft: "auto" }}>Round {round}</span>
        </div>

        <p className="section-label" style={{ marginBottom: ".6rem" }}>Vote to eliminate</p>
        <ul className="vote-list">
          {alive.map(p => (
            <li key={p.id}>
              <button onClick={() => setPendingElimination(p.id)}>
                <div className="avatar" style={{ background: avatarGradient(p.name), width: "1.5rem", height: "1.5rem", fontSize: ".6rem" }}>
                  {initials(p.name)}
                </div>
                {p.name}
              </button>
            </li>
          ))}
        </ul>

        <button className="btn-ghost" onClick={handleSkipElimination} style={{ width: "100%", marginTop: "1.25rem", fontSize: ".85rem" }}>
          No elimination — skip round
        </button>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────
  // RENDER: ELIMINATION RESULT
  // ────────────────────────────────────────────────────────────────────────

  if (phase === "elimination") {
    return (
      <div className="page center">
        <div style={{ fontSize: "3.5rem", lineHeight: 1 }}>⚰️</div>
        <div>
          <div className="eliminated-name">{eliminatedPlayer?.name}</div>
          <div style={{ marginTop: ".5rem", display: "flex", justifyContent: "center" }}>
            {eliminatedPlayer && (
              <span className={`role-badge ${eliminatedPlayer.role}`}>
                {ROLE_ICON[eliminatedPlayer.role]} {eliminatedPlayer.role}
              </span>
            )}
          </div>
        </div>
        <p style={{ color: "var(--muted)", fontSize: ".9rem" }}>has been eliminated</p>
        <button onClick={handleContinueAfterElimination} style={{ width: "100%", maxWidth: "280px" }}>
          Continue →
        </button>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────
  // RENDER: SPY GUESS
  // ────────────────────────────────────────────────────────────────────────

  if (phase === "spy_guess") {
    return (
      <div className="page center">
        {spyGuessResult && (
          <div className="modal-overlay">
            <div className="modal">
              <div className="modal-icon">{spyGuessResult === "correct" ? "🎯" : "✗"}</div>
              <div className="eliminated-name">
                {spyGuessResult === "correct" ? "Correct!" : "Wrong!"}
              </div>
              <p style={{ color: "var(--muted)" }}>
                The word was <strong style={{ color: "var(--text)" }}>{civilianWord}</strong>
              </p>
              <button onClick={handleAfterSpyGuessReveal} style={{ width: "100%" }}>Continue →</button>
            </div>
          </div>
        )}

        <div style={{ fontSize: "3.5rem", lineHeight: 1 }}>🕵️</div>
        <h2 style={{ marginBottom: 0 }}>The Spy Was Caught!</h2>
        <p style={{ color: "var(--muted)", fontSize: ".9rem", marginTop: "-.25rem" }}>But it's not over yet...</p>
        <p style={{ color: "var(--muted)", textAlign: "center" }}>
          <strong style={{ color: "var(--text)" }}>{spyPlayer?.name}</strong> gets one last chance.
          <br />Pass the phone to them.
        </p>
        <form onSubmit={handleSpyGuessSubmit} style={{ width: "100%", display: "flex", flexDirection: "column", gap: ".85rem" }}>
          <label>
            Your guess
            <input
              value={spyGuessInput}
              onChange={e => setSpyGuessInput(e.target.value)}
              placeholder="What's the word?"
              required
            />
          </label>
          <button type="submit" className="btn-danger">Submit Guess — Win or Lose</button>
        </form>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────
  // RENDER: GAME OVER
  // ────────────────────────────────────────────────────────────────────────

  if (phase === "game_over" && gameOverData) {
    const isWinCivilians = gameOverData.winner === "civilians";
    const WIN_REASONS: Record<string, string> = {
      all_bad_eliminated: "All infiltrators and the spy were eliminated.",
      civilians_outnumbered: "The bad team outnumbered the remaining civilians.",
      spy_guessed_word: "The spy correctly guessed the civilian word.",
    };

    return (
      <div className="page center">
        <div style={{ fontSize: "4rem", lineHeight: 1 }}>{isWinCivilians ? "🎉" : "😈"}</div>
        <div className="game-over-headline">{isWinCivilians ? "Civilians Win!" : "Infiltrators Win!"}</div>
        <span className={`game-over-result ${isWinCivilians ? "win" : "lose"}`}>
          {isWinCivilians ? "Civilians" : "Infiltrators & Spy"} won
        </span>
        <p style={{ color: "var(--muted)", fontSize: ".9rem" }}>{WIN_REASONS[gameOverData.reason]}</p>

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "1rem 1.25rem", width: "100%", textAlign: "left" }}>
          <p className="section-label" style={{ marginBottom: ".6rem" }}>The words were</p>
          <div style={{ display: "flex", flexDirection: "column", gap: ".4rem", fontSize: ".9rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--muted)" }}>👤 Civilian word</span>
              <strong>{civilianWord}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--muted)" }}>🗡️ Infiltrator word</span>
              <strong>{infiltratorWord}</strong>
            </div>
          </div>
        </div>

        <div style={{ width: "100%", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r)", overflow: "hidden" }}>
          <table>
            <thead>
              <tr><th>Player</th><th style={{ textAlign: "right" }}>Role</th></tr>
            </thead>
            <tbody>
              {players.map(p => (
                <tr key={p.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
                      <div className="avatar" style={{ background: avatarGradient(p.name), width: "1.6rem", height: "1.6rem", fontSize: ".65rem" }}>
                        {initials(p.name)}
                      </div>
                      {p.name}{!p.isAlive ? " 💀" : ""}
                    </div>
                  </td>
                  <td>
                    <span className={`role-badge ${p.role}`}>{ROLE_ICON[p.role]} {p.role}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", gap: ".75rem", width: "100%" }}>
          <button className="btn-ghost" onClick={() => nav("/")} style={{ flex: 1 }}>Home</button>
          <button onClick={() => { setNames(players.map(p => p.name)); setPhase("setup"); }} style={{ flex: 1 }}>Play Again</button>
        </div>
      </div>
    );
  }

  return null;
}
