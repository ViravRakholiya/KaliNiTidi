import { useStore } from "../store.js";
import { socket } from "../socket.js";
import { initials } from "../util.js";
import TurnClock from "./TurnClock.jsx";

function Seat({ p, isMe, x, y, s }) {
  const me = socket.id;
  const onTeamBidder =
    s.team[p.socketId] === "bidder" ||
    p.socketId === s.bidWinner ||
    s.partnerIds.includes(p.socketId);
  const cls = [
    "seat",
    isMe ? "me-seat" : "",
    p.socketId === s.currentTurn ? "active" : "",
    p.connected === false ? "off" : "",
    onTeamBidder ? "team-bidder" : s.team[p.socketId] === "opp" ? "team-opp" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const roles = [];
  if (p.socketId === s.leader || p.socketId === s.bidWinner) roles.push("👑");
  if (s.partnerIds.includes(p.socketId)) roles.push("🤝");
  if (p.isBot) roles.push("🤖");
  if (p.isHost) roles.push("★");

  let status = null;
  if (p.connected === false) status = <div className="status off">offline</div>;
  else if (p.waiting) status = <div className="status bid">next round</div>;
  else if (s.phase === "bidding" && p.socketId === s.currentTurn)
    status = <div className="status turn">bidding…</div>;
  else if (s.phase === "bidding" && s.passed[p.socketId])
    status = <div className="status passed">passed</div>;
  else if (s.phase === "playing" && p.socketId === s.currentTurn)
    status = <div className="status turn">turn</div>;

  const score = s.score[p.socketId];
  return (
    <div className={cls} style={{ left: x + "%", top: y + "%" }}>
      <div className="roles">
        {roles.map((r, i) => (
          <span className="badge" key={i}>
            {r}
          </span>
        ))}
      </div>
      {p.socketId === s.token ? (
        <div className="dealer-chip" title="Token (deals/bids first this round)">
          D
        </div>
      ) : null}
      <div className="avatar">{initials(p.name)}</div>
      <div className="nm">{isMe ? "You" : p.name}</div>
      {s.phase === "playing" && typeof score === "number" ? (
        <div className="sc">{score} pts</div>
      ) : null}
      {status}
      <TurnClock socketId={p.socketId} />
    </div>
  );
}

export default function Seats() {
  const s = useStore();
  const me = socket.id;
  const meIdx = s.players.findIndex((p) => p.socketId === me);
  const ordered =
    meIdx < 0
      ? s.players.slice()
      : [...s.players.slice(meIdx), ...s.players.slice(0, meIdx)];
  const n = ordered.length || 1;
  return (
    <div id="seats" className="seats">
      {ordered.map((p, k) => {
        const a = ((90 + (k * 360) / n) * Math.PI) / 180;
        const x = 50 + 44 * Math.cos(a);
        const y = 50 + 41 * Math.sin(a);
        return (
          <Seat
            key={p.socketId}
            p={p}
            isMe={p.socketId === me}
            x={x}
            y={y}
            s={s}
          />
        );
      })}
    </div>
  );
}
