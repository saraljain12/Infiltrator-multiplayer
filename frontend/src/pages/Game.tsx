import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getMe, getParty, getCurrentRound, startVoting, submitVote, submitSpyGuess, nextRound } from "../lib/api";
import storage from "../lib/storage";
import { connectWS, onEvent } from "../lib/ws";

interface PlayerInfo { id: string; displayName: string; isAlive: boolean }
interface Me { playerId: string; displayName: string; role: string | null; word: string | null; isAlive: boolean }
interface Round { roundId: string; roundNumber: number; status: string; votesSubmitted: number; totalVoters: number; votingDeadline: string | null; speakingOrder: string[] }
interface GameOverPayload { winner: string; reason?: string; finalRoles: { id: string; displayName: string; role: string | null }[] }
interface SpyGuessingPayload { roundId: string; spyPlayerId: string; spyDisplayName: string }
interface VoteEntry { targetId: string; count: number }
interface EliminationNotice {
  eliminatedPlayer: { id: string; displayName: string; role: string | null } | null;
  reason?: string;
  votes?: VoteEntry[];
}

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

const ROLE_ICON: Record<string, string> = { civilian: "👤", infiltrator: "🗡️", spy: "🕵️" };

export default function Game() {
  const { code } = useParams<{ code: string }>();
  const nav = useNavigate();
  const token = storage.getItem("sessionToken") ?? "";
  const myId = storage.getItem("playerId") ?? "";

  const [me, setMe] = useState<Me | null>(null);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [round, setRound] = useState<Round | null>(null);
  const [hostId, setHostId] = useState("");
  const [category, setCategory] = useState("");
  const [infiltratorKnowsRole, setInfiltratorKnowsRole] = useState(true);
  const [cardVisible, setCardVisible] = useState(true);
  const [votedRoundId, setVotedRoundId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const [spyGuessing, setSpyGuessing] = useState<SpyGuessingPayload | null>(null);
  const [spyGuessInput, setSpyGuessInput] = useState("");
  const [gameOver, setGameOver] = useState<GameOverPayload | null>(null);
  const [eliminationNotice, setEliminationNotice] = useState<EliminationNotice | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function startCountdown(deadline: string) {
    if (timerRef.current) clearInterval(timerRef.current);
    const update = () => {
      const secs = Math.max(0, Math.floor((new Date(deadline).getTime() - Date.now()) / 1000));
      setSecondsLeft(secs);
      if (secs === 0 && timerRef.current) clearInterval(timerRef.current);
    };
    update();
    timerRef.current = setInterval(update, 1000);
  }

  useEffect(() => {
    if (!code) return;
    Promise.all([getMe(), getParty(code), getCurrentRound(code)]).then(([meData, partyData, roundData]) => {
      setMe(meData);
      setPlayers(partyData.players);
      setHostId(partyData.party.hostPlayerId);
      setCategory(partyData.party.category);
      setInfiltratorKnowsRole(partyData.party.infiltratorKnowsRole);
      setRound({ ...roundData, speakingOrder: roundData.speakingOrder ?? [] });
      if (roundData.status === "voting" && roundData.votingDeadline) startCountdown(roundData.votingDeadline);
    });

    const ws = connectWS(code, token);

    const unsubVotingStarted = onEvent("voting_started", (p: any) => {
      setRound((r) => r ? { ...r, status: "voting", votingDeadline: p.votingDeadline } : r);
      startCountdown(p.votingDeadline);
    });
    const unsubVote = onEvent("vote_cast", (p: any) => {
      setRound((r) => r ? { ...r, votesSubmitted: p.votesSubmitted, totalVoters: p.totalVoters } : r);
    });
    const unsubSpyGuessing = onEvent("spy_guessing", (p: any) => { setSpyGuessing(p); });
    const unsubSpyResult = onEvent("spy_guess_result", () => { setSpyGuessing(null); });

    const unsubRoundCompleted = onEvent("round_completed", (p: any) => {
      if (timerRef.current) clearInterval(timerRef.current);
      setSecondsLeft(null);
      setEliminationNotice({ eliminatedPlayer: p.eliminatedPlayer, reason: p.reason, votes: p.votes });
      setPlayers((prev) => p.eliminatedPlayer
        ? prev.map((pl) => pl.id === p.eliminatedPlayer.id ? { ...pl, isAlive: false } : pl)
        : prev
      );
      if (p.eliminatedPlayer?.id === myId) setMe((m) => m ? { ...m, isAlive: false } : m);
    });

    const unsubRoundStarted = onEvent("round_started", (p: any) => {
      setRound({ roundId: p.roundId, roundNumber: p.roundNumber, status: "discussion", votesSubmitted: 0, totalVoters: p.alivePlayerIds.length, votingDeadline: null, speakingOrder: p.speakingOrder ?? [] });
      setEliminationNotice(null);
      setSpyGuessing(null);
      setSecondsLeft(null);
    });

    const unsubGameOver = onEvent("game_over", (p: any) => { setGameOver(p); });

    return () => {
      unsubVotingStarted(); unsubVote(); unsubSpyGuessing(); unsubSpyResult();
      unsubRoundCompleted(); unsubRoundStarted(); unsubGameOver();
      ws.close();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [code]);

  async function handleStartVoting() {
    if (!round) return;
    setError("");
    try { await startVoting(round.roundId); }
    catch (e: any) { setError(e?.error || "Failed to start voting"); }
  }

  async function handleVote(targetId: string) {
    if (!round || votedRoundId === round.roundId) return;
    setError("");
    try {
      await submitVote(round.roundId, targetId);
      setVotedRoundId(round.roundId);
    } catch (e: any) { setError(e?.error || "Vote failed"); }
  }

  async function handleNextRound() {
    if (!code) return;
    setError("");
    try { await nextRound(code); }
    catch (e: any) { setError(e?.error || "Failed to start next round"); }
  }

  async function handleSpyGuess(e: React.FormEvent) {
    e.preventDefault();
    if (!spyGuessing) return;
    setError("");
    try { await submitSpyGuess(spyGuessing.roundId, spyGuessInput); }
    catch (e: any) { setError(e?.error || "Guess failed"); }
  }

  // ── Game Over ──
  if (gameOver) {
    const myActualRole = gameOver.finalRoles.find((p) => p.id === myId)?.role;
    const won =
      (gameOver.winner === "civilians" && myActualRole === "civilian") ||
      (gameOver.winner === "infiltrators_and_spy" && (myActualRole === "infiltrator" || myActualRole === "spy"));
    const winnerLabel = gameOver.winner === "civilians" ? "Civilians" : "Infiltrators & Spy";
    const WIN_REASONS: Record<string, string> = {
      all_bad_eliminated: "All infiltrators and the spy were eliminated.",
      civilians_outnumbered: "The bad team outnumbered the remaining civilians.",
      spy_guessed_word: "The spy correctly guessed the civilian word.",
    };
    const reasonText = gameOver.reason ? WIN_REASONS[gameOver.reason] : null;

    return (
      <div className="page center">
        <div style={{ fontSize: "3.5rem", lineHeight: 1 }}>{won ? "🏆" : "💀"}</div>
        <h2 style={{ marginBottom: 0 }}>{won ? "Victory" : "Defeat"}</h2>
        <span className={`game-over-result ${won ? "win" : "lose"}`}>{winnerLabel} won</span>
        {reasonText && <p style={{ color: "var(--muted)", fontSize: ".9rem", marginTop: "-.25rem" }}>{reasonText}</p>}

        <div style={{ width: "100%", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r)", overflow: "hidden" }}>
          <table>
            <thead>
              <tr><th>Player</th><th style={{ textAlign: "right" }}>Role</th></tr>
            </thead>
            <tbody>
              {gameOver.finalRoles.map((p) => {
                const role = p.role ?? "spy";
                return (
                  <tr key={p.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
                        <div className="avatar" style={{ background: avatarGradient(p.displayName), width: "1.6rem", height: "1.6rem", fontSize: ".65rem" }}>
                          {initials(p.displayName)}
                        </div>
                        {p.displayName}{p.id === myId ? " (you)" : ""}
                      </div>
                    </td>
                    <td>
                      <span className={`role-badge ${role}`}>{ROLE_ICON[role]} {role}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button onClick={() => nav("/")}>Back to Home</button>
      </div>
    );
  }

  // ── Spy Guessing ──
  if (spyGuessing) {
    const isSpy = myId === spyGuessing.spyPlayerId;
    return (
      <div className="page center">
        <div style={{ fontSize: "3rem" }}>🕵️</div>
        <h2>The Spy Was Caught!</h2>
        <p style={{ color: "var(--muted)" }}>
          <strong style={{ color: "var(--text)" }}>{spyGuessing.spyDisplayName}</strong> is the spy and gets one last chance to guess the civilian word.
        </p>
        {isSpy ? (
          <form onSubmit={handleSpyGuess} style={{ width: "100%" }}>
            <label>
              Your guess
              <input value={spyGuessInput} onChange={(e) => setSpyGuessInput(e.target.value)} placeholder="What's the word?" required />
            </label>
            {error && <p className="error">{error}</p>}
            <button type="submit" className="btn-danger">Submit Guess</button>
          </form>
        ) : (
          <p className="waiting">Waiting for spy to guess...</p>
        )}
      </div>
    );
  }

  const alivePlayers = players.filter((p) => p.isAlive && p.id !== myId);
  const isHost = myId === hostId;
  const isDiscussion = round?.status === "discussion";
  const isVoting = round?.status === "voting";
  const timerDisplay = secondsLeft !== null
    ? `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`
    : null;

  return (
    <div className="page">

      {/* ── Elimination Modal ── */}
      {eliminationNotice && (
        <div className="modal-overlay">
          <div className="modal">
            {eliminationNotice.eliminatedPlayer ? (
              <>
                <div className="modal-icon">⚰️</div>
                {eliminationNotice.reason === "timeout" && (
                  <p style={{ color: "var(--muted)", fontSize: ".8rem", marginTop: "-.5rem" }}>Time ran out — result by votes cast</p>
                )}
                <div>
                  <div className="eliminated-name">{eliminationNotice.eliminatedPlayer.displayName}</div>
                  <div style={{ marginTop: ".4rem" }}>
                    <span className={`role-badge ${eliminationNotice.eliminatedPlayer.role ?? "spy"}`}>
                      {ROLE_ICON[eliminationNotice.eliminatedPlayer.role ?? "spy"]} {eliminationNotice.eliminatedPlayer.role ?? "spy"}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="modal-icon">{eliminationNotice.reason === "tie" ? "⚖️" : "⏰"}</div>
                <div className="eliminated-name" style={{ fontSize: "1.1rem" }}>
                  {eliminationNotice.reason === "tie" ? "It's a Tie!" : "Time's Up!"}
                </div>
                <p style={{ color: "var(--muted)", fontSize: ".9rem" }}>
                  {eliminationNotice.reason === "tie" ? "No one was eliminated." : "No votes were cast."}
                </p>
              </>
            )}

            {/* Vote bars */}
            {eliminationNotice.votes && eliminationNotice.votes.length > 0 && (
              <div>
                <p className="section-label" style={{ marginBottom: ".5rem" }}>Vote Tally</p>
                <div className="vote-bars">
                  {[...eliminationNotice.votes]
                    .sort((a, b) => b.count - a.count)
                    .map(({ targetId, count }) => {
                      const maxVotes = Math.max(...eliminationNotice.votes!.map((v) => v.count));
                      const player = players.find((p) => p.id === targetId);
                      const isEliminated = eliminationNotice.eliminatedPlayer?.id === targetId;
                      return (
                        <div key={targetId} className={`vote-bar-row ${isEliminated ? "top" : ""}`}>
                          <div className="vote-bar-meta">
                            <span className="name">
                              {player?.displayName ?? targetId}
                              {isEliminated ? " 💀" : ""}
                            </span>
                            <span className="count">{count} vote{count !== 1 ? "s" : ""}</span>
                          </div>
                          <div className="vote-bar-track">
                            <div className="vote-bar-fill" style={{ width: `${(count / maxVotes) * 100}%` }} />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {isHost
              ? <button onClick={handleNextRound} style={{ width: "100%" }}>Continue →</button>
              : <p className="waiting" style={{ fontSize: ".85rem" }}>Waiting for host to continue...</p>
            }
          </div>
        </div>
      )}

      {/* ── Word Card ── */}
      {me && (
        <div className="word-card">
          <div className="word-card-header">
            {infiltratorKnowsRole
              ? <span className={`role-badge ${me.role ?? "spy"}`}>{ROLE_ICON[me.role ?? "spy"]} {me.role ?? "spy"}</span>
              : <span style={{ fontSize: ".8rem", color: "var(--muted)" }}>Your word</span>
            }
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setCardVisible((v) => !v)}
              style={{ fontSize: ".78rem", padding: ".2rem .6rem" }}
            >
              {cardVisible ? "Hide" : "Show"}
            </button>
          </div>
          {cardVisible ? (
            me.word
              ? <div className="big-word">{me.word}</div>
              : <div>
                  <div className="big-word" style={{ fontSize: "2.5rem" }}>🕵️</div>
                  <div className="spy-word">You are the spy — no word assigned</div>
                </div>
          ) : (
            <div style={{ color: "var(--muted)", fontSize: ".9rem", marginTop: ".25rem" }}>Word hidden</div>
          )}
          {!me.isAlive && <p className="eliminated" style={{ marginTop: ".5rem" }}>You have been eliminated</p>}
        </div>
      )}

      {/* ── Round header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: ".6rem", marginBottom: "1.25rem" }}>
        {category && <span className="category-chip">📂 {category}</span>}
        <span className="category-chip" style={{ marginLeft: "auto" }}>Round {round?.roundNumber}</span>
      </div>

      {/* ── Discussion Phase ── */}
      {isDiscussion && (
        <div>
          <p style={{ color: "var(--muted)", fontSize: ".9rem", marginBottom: "1.1rem" }}>
            Describe your word without saying it directly.
          </p>

          {round && round.speakingOrder.length > 0 && (
            <div style={{ marginBottom: "1.25rem" }}>
              <p className="section-label">Speaking Order</p>
              <ul className="speaking-list">
                {round.speakingOrder.map((id, i) => {
                  const p = players.find((pl) => pl.id === id);
                  const isMe = id === myId;
                  const isDead = p && !p.isAlive;
                  return (
                    <li key={id} className={`speaking-item${isMe ? " me" : ""}${isDead ? " dead" : ""}`}>
                      <span className="speaking-num">{i + 1}</span>
                      <div className="avatar" style={{ background: avatarGradient(p?.displayName ?? id), width: "1.6rem", height: "1.6rem", fontSize: ".65rem" }}>
                        {initials(p?.displayName ?? id)}
                      </div>
                      <span style={{ flex: 1 }}>{p?.displayName ?? id}</span>
                      {isMe && <span style={{ fontSize: ".75rem", color: "#d8b4fe" }}>you</span>}
                      {isDead && <span style={{ fontSize: ".8rem" }}>✕</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {isHost
            ? <button onClick={handleStartVoting} style={{ width: "100%" }}>Start Voting</button>
            : <p className="waiting" style={{ textAlign: "center" }}>Waiting for host to start voting...</p>
          }
        </div>
      )}

      {/* ── Voting Phase ── */}
      {isVoting && (
        <div>
          <div className="stats-row" style={{ marginBottom: "1rem" }}>
            <span style={{ color: "var(--muted)", fontSize: ".85rem" }}>
              🗳️ <strong style={{ color: "var(--text)" }}>{round?.votesSubmitted ?? 0}</strong> / {round?.totalVoters ?? 0} votes
            </span>
            {timerDisplay && (
              <span className={`timer${secondsLeft! < 30 ? " urgent" : ""}`}>⏱ {timerDisplay}</span>
            )}
          </div>

          {me?.isAlive && votedRoundId !== round?.roundId && (
            <div>
              <p className="section-label" style={{ marginBottom: ".6rem" }}>Vote to eliminate</p>
              <ul className="vote-list">
                {alivePlayers.map((p) => (
                  <li key={p.id}>
                    <button onClick={() => handleVote(p.id)}>
                      <div className="avatar" style={{ background: avatarGradient(p.displayName), width: "1.5rem", height: "1.5rem", fontSize: ".6rem" }}>
                        {initials(p.displayName)}
                      </div>
                      {p.displayName}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {me?.isAlive && votedRoundId === round?.roundId && (
            <p className="waiting" style={{ textAlign: "center" }}>Vote submitted. Waiting for others...</p>
          )}
          {!me?.isAlive && (
            <p className="waiting" style={{ textAlign: "center" }}>You are eliminated — spectating 👁️</p>
          )}
        </div>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );
}
