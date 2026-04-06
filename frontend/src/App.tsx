import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useState, useEffect } from "react";
import Home from "./pages/Home";
import Lobby from "./pages/Lobby";
import Game from "./pages/Game";
import OfflineGame from "./pages/OfflineGame";
import "./App.css";

function BirthdayPopup() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const now = new Date();
    // Convert to IST (UTC+5:30)
    const istDate = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
    const date = istDate.getUTCDate();
    const month = istDate.getUTCMonth(); // 3 = April
    // Show once to anyone who opens the app on April 7th IST
    if (month === 3 && date === 7 && !localStorage.getItem("birthday_anuja_dismissed")) {
      setShow(true);
    }
  }, []);

  if (!show) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: "linear-gradient(135deg, #1a0a2e 0%, #2d0a4e 100%)",
        border: "2px solid #c084fc",
        borderRadius: "1.5rem",
        padding: "3rem 4rem",
        textAlign: "center",
        position: "relative",
        boxShadow: "0 0 60px #c084fc88",
        maxWidth: "90vw",
      }}>
        <button
          onClick={() => { setShow(false); localStorage.setItem("birthday_anuja_dismissed", "1"); }}
          style={{
            position: "absolute", top: "1rem", right: "1rem",
            background: "none", border: "none", color: "#c084fc",
            fontSize: "1.5rem", cursor: "pointer", lineHeight: 1,
          }}
        >✕</button>
        <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>🎂🎉✨</div>
        <h1 style={{
          fontSize: "2.5rem", fontWeight: 800,
          background: "linear-gradient(90deg, #f0abfc, #c084fc, #a855f7)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          margin: "0 0 0.5rem",
        }}>Happy Birthday Anuja!</h1>
        <p style={{ color: "#e9d5ff", fontSize: "1.1rem", margin: 0 }}>Wishing you an amazing day! 🥳</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <BirthdayPopup />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/lobby/:code" element={<Lobby />} />
        <Route path="/game/:code" element={<Game />} />
        <Route path="/offline" element={<OfflineGame />} />
      </Routes>
      <footer style={{ textAlign: "center", padding: "1.5rem 0 1rem", fontSize: ".75rem", color: "var(--muted)" }}>
        made with ♥ for nidhi
      </footer>
    </BrowserRouter>
  );
}
