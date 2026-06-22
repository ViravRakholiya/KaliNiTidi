import { useEffect, useState } from "react";
import { useStore } from "../store.js";

const fmt = (s) =>
  s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : `${s}s`;

// Live countdown shown on the active player's seat.
export default function TurnClock({ socketId }) {
  const turnPlayer = useStore((s) => s.turnPlayer);
  const turnDeadline = useStore((s) => s.turnDeadline);
  const [, tick] = useState(0);
  const active = socketId === turnPlayer && turnDeadline > 0;

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [active]);

  if (!active) return <div className="turn-clock" />;
  const rem = Math.max(0, Math.ceil((turnDeadline - Date.now()) / 1000));
  if (rem <= 0) return <div className="turn-clock" />;
  return (
    <div className="turn-clock" style={{ color: rem <= 15 ? "#ff6b6b" : "var(--gold)" }}>
      {fmt(rem)}
    </div>
  );
}
