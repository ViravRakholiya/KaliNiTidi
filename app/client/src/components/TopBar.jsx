import { useState, useEffect, useRef } from "react";
import { useStore, store, toast } from "../store.js";
import { actions } from "../socket.js";

export default function TopBar() {
  const s = useStore();
  const [menu, setMenu] = useState(false);
  const wrap = useRef(null);

  useEffect(() => {
    if (!menu) return;
    const onDoc = (e) => {
      if (wrap.current && !wrap.current.contains(e.target)) setMenu(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [menu]);

  const share = () => {
    if (!s.roomId) return;
    const link = `${location.origin}/?room=${s.roomId}`;
    const text = `Join my Kali ni Tidi game! Room ${s.roomId}`;
    if (navigator.share)
      navigator.share({ title: "Kali ni Tidi", text, url: link }).catch(() => {});
    else if (navigator.clipboard)
      navigator.clipboard
        .writeText(link)
        .then(() => toast("Invite link copied!", "ok"))
        .catch(() => toast(link));
    else toast(link);
  };

  const showRound = s.phase !== "lobby" && s.phase !== "waiting";
  const showBid = (s.phase === "selection" || s.phase === "playing") && s.winningBid;

  return (
    <div className="topbar">
      <span className="chip room-chip" onClick={share} title="Tap to share">
        <span className={"conn-dot" + (s.connected ? "" : " off")} />
        <b>{s.roomId || "—"}</b>
        <span style={{ opacity: 0.8 }}>🔗</span>
      </span>
      {showBid ? (
        <span className="chip">
          Bid <b>{s.winningBid}</b>
        </span>
      ) : null}
      {showRound ? (
        <span className="chip">
          Round <b>{s.roundNumber}</b>
        </span>
      ) : null}
      <span className="spacer" />
      <div className="settings-wrap" ref={wrap}>
        <button className="icon-btn" onClick={() => setMenu((m) => !m)} title="Menu">
          ⚙️
        </button>
        <div className={"menu" + (menu ? "" : " hidden")}>
          <button
            onClick={() => {
              store.set((x) => ({ muted: !x.muted }));
            }}
          >
            <span>{s.muted ? "🔇" : "🔊"}</span> Sound
          </button>
          <button
            onClick={() => {
              store.set({ overlay: "scores" });
              setMenu(false);
            }}
          >
            🏆 Scoreboard
          </button>
          <button
            onClick={() => {
              if (confirm("Leave the table?")) actions.leave();
            }}
          >
            ⎋ Logout
          </button>
        </div>
      </div>
    </div>
  );
}
