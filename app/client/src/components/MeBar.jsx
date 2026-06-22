import { useStore, getPlayer } from "../store.js";
import { socket } from "../socket.js";
import { SUIT, GU_SUIT, cap, isRed } from "../util.js";

export default function MeBar() {
  const s = useStore();
  const me = getPlayer(socket.id);
  const name = (me ? me.name : s.name) || "You";
  const pts =
    me && typeof me.score === "number"
      ? me.score
      : s.hand.reduce((a, c) => a + (c.points || 0), 0);

  let tag = "";
  if (s.bidWinner === socket.id) tag = "👑 Bidder";
  else if (s.partnerIds.includes(socket.id)) tag = "🤝 Partner";

  return (
    <div className="me-row">
      <span className="me-name">{name}</span>
      {tag ? <span className="me-tag">{tag}</span> : null}
      {s.trump ? (
        <span className={"chip " + (isRed(s.trump) ? "suit-red" : "suit-black")}>
          હુકમ{" "}
          <b>
            {GU_SUIT[s.trump] || cap(s.trump)} {SUIT[s.trump]}
          </b>
        </span>
      ) : null}
      <span className="me-pts">
        Hand: <b>{s.hand.length}</b> · <b>{pts}</b> pts
      </span>
    </div>
  );
}
