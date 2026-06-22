import { useStore, getName } from "../store.js";
import { socket } from "../socket.js";
import Card from "./Card.jsx";

function Prompt() {
  const s = useStore();
  if (s.phase === "waiting") {
    if (s.spectating)
      return (
        <div className="prompt">
          <span className="big">Round in Progress</span>You're seated — you'll be
          dealt in when the next round starts.
        </div>
      );
    const n = s.players.length;
    return (
      <div className="prompt">
        <span className="big">Waiting Room</span>
        {n} player{n !== 1 ? "s" : ""} seated
        <br />
        {s.isHost ? "Add bots or start when ready." : "Waiting for the host to start…"}
      </div>
    );
  }
  if (s.phase === "bidding") {
    const who =
      s.currentTurn === socket.id
        ? "Your turn to bid"
        : `${getName(s.currentTurn)} is bidding`;
    return (
      <div className="prompt">
        <span className="big">Bidding</span>
        {who}
        <br />
        Highest: <b>{s.currentBid}</b> (min {s.minBid})
      </div>
    );
  }
  if (s.phase === "selection") {
    return (
      <div className="prompt">
        {s.leader === socket.id ? (
          <>
            <span className="big">Your Call</span>Pick trump &amp; partner card
          </>
        ) : (
          <>
            <span className="big">{getName(s.leader)} won</span>Choosing trump &amp;
            partner…
          </>
        )}
      </div>
    );
  }
  if (s.phase === "completed") {
    return (
      <div className="prompt">
        <span className="big">Round Over</span>
        {s.isHost ? "Start the next round when ready." : "Waiting for the next round…"}
      </div>
    );
  }
  return null;
}

export default function Center() {
  const phase = useStore((s) => s.phase);
  const trickCards = useStore((s) => s.trickCards);
  const trump = useStore((s) => s.trump);
  const playing = phase === "playing";
  return (
    <div className="center">
      <div className="center-felt" />
      {playing ? (
        <div className="trick" key="trick">
          {trickCards.map((tc, i) => (
            <div className="tcard" key={i}>
              <Card card={tc.card} trump={trump} sm showPts={false} />
              <div className="who">{getName(tc.playerId)}</div>
            </div>
          ))}
        </div>
      ) : (
        <Prompt />
      )}
    </div>
  );
}
