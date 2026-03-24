import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createParty, joinParty } from "../lib/api";
import storage from "../lib/storage";

export default function Home() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"pick" | "create" | "join" | "rules">("pick");
  const [error, setError] = useState("");

  const [hostName, setHostName] = useState("");
  const [infiltratorCount, setInfiltratorCount] = useState(1);
  const [hasSpy, setHasSpy] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [spyNotFirst, setSpyNotFirst] = useState(false);
  const [infiltratorKnowsRole, setInfiltratorKnowsRole] = useState(true);

  const [joinCode, setJoinCode] = useState("");
  const [joinName, setJoinName] = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const res = await createParty({ hostName, infiltratorCount, hasSpy, spyNotFirst, infiltratorKnowsRole });
      storage.setItem("sessionToken", res.sessionToken);
      storage.setItem("playerId", res.playerId);
      storage.setItem("partyCode", res.partyCode);
      nav(`/lobby/${res.partyCode}`);
    } catch (e: any) {
      setError(e?.error || "Failed to create party");
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const res = await joinParty(joinCode.toUpperCase(), joinName);
      storage.setItem("sessionToken", res.sessionToken);
      storage.setItem("playerId", res.playerId);
      storage.setItem("partyCode", joinCode.toUpperCase());
      nav(`/lobby/${joinCode.toUpperCase()}`);
    } catch (e: any) {
      setError(e?.error || "Failed to join party");
    }
  }

  if (mode === "pick") {
    return (
      <div className="page center" style={{ paddingTop: "8vh", gap: "1.75rem" }}>
        <img src="/banner.png" alt="Infiltrator Party Game" style={{ width: "100%", maxWidth: "300px", borderRadius: "12px" }} fetchPriority="high" />

        <div className="how-it-works">
          {([
            ["👀", "Everyone gets a secret word"],
            ["😈", "Infiltrators get a different word"],
            ["🕵️", "The spy gets no word — just vibes"],
            ["🗳️", "Discuss, then vote out the bad team"],
          ] as [string, string][]).map(([icon, text], i) => (
            <div key={i} className="how-step">
              <span className="how-step-icon">{icon}</span>
              <span className="how-step-text">{text}</span>
            </div>
          ))}
        </div>

        <div className="home-actions">
          <button onClick={() => setMode("create")}>Create Room</button>
          <button className="btn-ghost" onClick={() => setMode("join")}>Join Room</button>
          <button className="btn-offline" onClick={() => nav("/offline")}>📱 Play Offline</button>
          <button className="btn-ghost" onClick={() => setMode("rules")} style={{ fontSize: ".8rem", opacity: .6 }}>Full rules</button>
        </div>
      </div>
    );
  }

  if (mode === "create") {
    return (
      <div className="page">
        <h2>Create Room</h2>
        <form onSubmit={handleCreate}>
          <label>
            Your name
            <input value={hostName} onChange={(e) => setHostName(e.target.value)} placeholder="Enter your name" required />
          </label>

          <label>
            Infiltrators
            <div style={{ display: "flex", alignItems: "center", gap: ".6rem", marginTop: ".1rem" }}>
              <button
                type="button"
                onClick={() => setInfiltratorCount((v) => Math.max(1, v - 1))}
                style={{ width: "2.2rem", height: "2.2rem", padding: 0, flexShrink: 0, fontSize: "1.1rem" }}
              >−</button>
              <span style={{ minWidth: "1.5rem", textAlign: "center", fontSize: "1.1rem", fontWeight: 600 }}>{infiltratorCount}</span>
              <button
                type="button"
                onClick={() => setInfiltratorCount((v) => v + 1)}
                style={{ width: "2.2rem", height: "2.2rem", padding: 0, flexShrink: 0, fontSize: "1.1rem" }}
              >+</button>
            </div>
          </label>

          <label>
            <input type="checkbox" checked={hasSpy} onChange={(e) => setHasSpy(e.target.checked)} />
            Include a spy
          </label>

          <button
            type="button"
            className="btn-ghost"
            onClick={() => setShowAdvanced((v) => !v)}
            style={{ alignSelf: "flex-start", fontSize: ".85rem", padding: ".3rem .7rem" }}
          >
            {showAdvanced ? "▾" : "▸"} Advanced options
          </button>

          {showAdvanced && (
            <div style={{ display: "flex", flexDirection: "column", gap: ".6rem", paddingLeft: ".9rem", borderLeft: "2px solid rgba(168,85,247,.3)" }}>
              <label>
                <input type="checkbox" checked={spyNotFirst} onChange={(e) => setSpyNotFirst(e.target.checked)} />
                Don't place spy first in speaking order
              </label>
              <label>
                <input type="checkbox" checked={infiltratorKnowsRole} onChange={(e) => setInfiltratorKnowsRole(e.target.checked)} />
                Infiltrators know they are infiltrators
              </label>
            </div>
          )}

          {error && <p className="error">{error}</p>}
          <div className="btn-group">
            <button type="button" className="btn-ghost" onClick={() => setMode("pick")}>Back</button>
            <button type="submit">Create</button>
          </div>
        </form>
      </div>
    );
  }

  if (mode === "rules") {
    return (
      <div className="page">
        <h2>How to Play</h2>

        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

          <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "1.1rem 1.25rem" }}>
            <p className="section-label" style={{ marginBottom: ".6rem" }}>Roles</p>
            <div style={{ display: "flex", flexDirection: "column", gap: ".6rem" }}>
              <div style={{ display: "flex", gap: ".75rem", alignItems: "flex-start" }}>
                <span className="role-badge civilian" style={{ flexShrink: 0, marginTop: ".1rem" }}>👤 Civilian</span>
                <span style={{ color: "var(--muted)", fontSize: ".9rem" }}>Gets a secret word. Discuss it without saying it. Find and vote out the bad team.</span>
              </div>
              <div style={{ display: "flex", gap: ".75rem", alignItems: "flex-start" }}>
                <span className="role-badge infiltrator" style={{ flexShrink: 0, marginTop: ".1rem" }}>🗡️ Infiltrator</span>
                <span style={{ color: "var(--muted)", fontSize: ".9rem" }}>Gets a different word. Blend in with civilians. Survive until you outnumber them.</span>
              </div>
              <div style={{ display: "flex", gap: ".75rem", alignItems: "flex-start" }}>
                <span className="role-badge spy" style={{ flexShrink: 0, marginTop: ".1rem" }}>🕵️ Spy</span>
                <span style={{ color: "var(--muted)", fontSize: ".9rem" }}>Gets no word. Listen carefully and pretend you know. If caught, guess the civilian word to win.</span>
              </div>
            </div>
          </section>

          <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "1.1rem 1.25rem" }}>
            <p className="section-label" style={{ marginBottom: ".6rem" }}>Each Round</p>
            <ol style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: ".5rem", padding: 0 }}>
              {[
                ["💬", "Players take turns describing their word — don't say it directly."],
                ["🗳️", "Host starts voting. Everyone votes to eliminate one suspect."],
                ["⚖️", "Most votes gets eliminated. Ties = nobody goes."],
                ["🕵️", "If the spy is eliminated, they get one guess at the civilian word."],
              ].map(([icon, text], i) => (
                <li key={i} style={{ display: "flex", gap: ".75rem", alignItems: "flex-start", fontSize: ".9rem" }}>
                  <span style={{ fontSize: "1rem", flexShrink: 0 }}>{icon}</span>
                  <span style={{ color: "var(--muted)" }}>{text}</span>
                </li>
              ))}
            </ol>
          </section>

          <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "1.1rem 1.25rem" }}>
            <p className="section-label" style={{ marginBottom: ".6rem" }}>Winning</p>
            <div style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
              <div style={{ display: "flex", gap: ".75rem", fontSize: ".9rem" }}>
                <span style={{ flexShrink: 0 }}>✅</span>
                <span style={{ color: "var(--muted)" }}><strong style={{ color: "#93c5fd" }}>Civilians win</strong> when all infiltrators and the spy are eliminated.</span>
              </div>
              <div style={{ display: "flex", gap: ".75rem", fontSize: ".9rem" }}>
                <span style={{ flexShrink: 0 }}>💀</span>
                <span style={{ color: "var(--muted)" }}><strong style={{ color: "#fca5a5" }}>Bad team wins</strong> when only 1 civilian remains alive.</span>
              </div>
              <div style={{ display: "flex", gap: ".75rem", fontSize: ".9rem" }}>
                <span style={{ flexShrink: 0 }}>🎯</span>
                <span style={{ color: "var(--muted)" }}><strong style={{ color: "#d8b4fe" }}>Spy wins</strong> for the bad team by correctly guessing the civilian word after being caught.</span>
              </div>
            </div>
          </section>

          <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "1.1rem 1.25rem" }}>
            <p className="section-label" style={{ marginBottom: ".6rem" }}>Tips</p>
            <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: ".4rem", padding: 0 }}>
              {[
                "Be vague enough to confuse — but not so vague you look sus.",
                "Infiltrators have a different word, so their clues will feel slightly off.",
                "The spy has no word — watch for someone giving generic or recycled hints.",
                "You don't have to vote — abstaining counts as a tie contribution.",
              ].map((tip, i) => (
                <li key={i} style={{ display: "flex", gap: ".6rem", fontSize: ".875rem", color: "var(--muted)" }}>
                  <span style={{ color: "var(--purple)", flexShrink: 0 }}>›</span>
                  {tip}
                </li>
              ))}
            </ul>
          </section>

        </div>

        <div className="btn-group" style={{ marginTop: "1rem" }}>
          <button className="btn-ghost" onClick={() => setMode("pick")}>Back</button>
          <button onClick={() => setMode("create")}>Create Party</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <h2>Join Party</h2>
      <form onSubmit={handleJoin}>
        <label>
          Party code
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            maxLength={6}
            placeholder="XXXXXX"
            style={{ fontFamily: "'Cinzel', serif", letterSpacing: ".2em", fontSize: "1.2rem" }}
            required
          />
        </label>
        <label>
          Your name
          <input value={joinName} onChange={(e) => setJoinName(e.target.value)} placeholder="Enter your name" required />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="btn-group">
          <button type="button" className="btn-ghost" onClick={() => setMode("pick")}>Back</button>
          <button type="submit">Join</button>
        </div>
      </form>
    </div>
  );
}
