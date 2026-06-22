import { useState } from "react";
import { useStore, store, getName } from "../store.js";
import { socket, actions } from "../socket.js";
import { roundUp5, partnersForBid, maxBidFor } from "../util.js";

const INFO_STYLE = {
  textAlign: "center",
  fontSize: 13,
  color: "rgba(246,236,210,.8)",
  padding: 10,
  fontWeight: 600,
};
function Info({ children }) {
  return (
    <div className="grow" style={INFO_STYLE}>
      {children}
    </div>
  );
}

function BidBox() {
  const s = useStore();
  const lo = roundUp5(s.currentBid + 5);
  const hi = maxBidFor(s.totalPoints, s.config, s.numberOfSets);
  const [amt, setAmt] = useState(Math.min(lo, hi));
  // keep amt within the live bounds
  const value = Math.min(Math.max(amt, lo), hi);
  const partners = partnersForBid(value, s.config, s.minBid, s.players.length);
  const canBid = lo <= hi;

  return (
    <>
      <div className="bidbox">
        <button onClick={() => setAmt(Math.max(lo, value - 5))}>–</button>
        <span className="val">{value}</span>
        <button onClick={() => setAmt(Math.min(hi, value + 5))}>+</button>
        <span className="bid-partners">🤝 {partners}</span>
      </div>
      <button
        className="btn grow"
        disabled={!canBid}
        onClick={() => actions.placeBid(Math.min(value, hi))}
      >
        Bid
      </button>
      <button className="btn ghost" onClick={actions.passBid}>
        Pass
      </button>
    </>
  );
}

export default function Actions() {
  const s = useStore();
  const openSettings = () => store.set({ overlay: "settings" });
  const openPartner = () => store.set({ overlay: "partner" });

  if (s.phase === "waiting") {
    if (s.spectating)
      return (
        <div className="actionbar">
          <Info>A round is in progress — you'll be dealt in next round.</Info>
        </div>
      );
    if (s.isHost) {
      const full = s.players.length >= 16;
      const hasBots = s.players.some((p) => p.isBot);
      const enough = s.players.length >= 4;
      return (
        <div className="actionbar">
          <div className="actionbar grow" style={{ padding: 0 }}>
            {!full ? (
              <button className="btn ghost" onClick={actions.addBot}>
                🤖 Add Bot
              </button>
            ) : null}
            {hasBots ? (
              <button className="btn ghost" onClick={actions.removeBot}>
                Remove Bot
              </button>
            ) : null}
            <button className="btn ghost" onClick={openSettings}>
              ⚙️ Settings
            </button>
          </div>
          <button className="btn" disabled={!enough} onClick={actions.startGame}>
            {enough ? "▶ Start Game" : `Need ${4 - s.players.length} more`}
          </button>
        </div>
      );
    }
    return (
      <div className="actionbar">
        <Info>Waiting for host to start…</Info>
      </div>
    );
  }

  if (s.phase === "bidding") {
    return (
      <div className="actionbar">
        {s.currentTurn === socket.id ? (
          <BidBox />
        ) : (
          <Info>{getName(s.currentTurn)} is bidding…</Info>
        )}
      </div>
    );
  }

  if (s.phase === "selection") {
    return (
      <div className="actionbar">
        {s.leader === socket.id ? (
          <button className="btn block" onClick={openPartner}>
            Open Trump / Partner
          </button>
        ) : (
          <Info>{getName(s.leader)} is choosing…</Info>
        )}
      </div>
    );
  }

  if (s.phase === "playing") {
    return (
      <div className="actionbar">
        <Info>
          {s.currentTurn === socket.id
            ? "▸ Your turn — tap a card to play"
            : `${getName(s.currentTurn)}'s turn`}
        </Info>
      </div>
    );
  }

  if (s.phase === "completed") {
    return (
      <div className="actionbar">
        {s.isHost ? (
          <>
            <button className="btn grow" onClick={actions.startGame}>
              ▶ Next Round
            </button>
            <button className="btn ghost" onClick={openSettings}>
              ⚙️
            </button>
          </>
        ) : (
          <Info>Waiting for next round…</Info>
        )}
      </div>
    );
  }

  return <div className="actionbar" />;
}
