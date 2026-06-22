import { useStore } from "../store.js";
import { socket, actions } from "../socket.js";
import { sortHand } from "../util.js";
import Card from "./Card.jsx";

export default function Hand() {
  const s = useStore();
  const myTurn = s.phase === "playing" && s.currentTurn === socket.id;
  const led = s.ledSuit;
  const mustFollow = myTurn && led && s.hand.some((c) => c.suit === led);
  return (
    <div id="hand" className={"hand" + (myTurn ? " myturn" : "")}>
      {sortHand(s.hand, s.trump).map((c) => {
        const playable = myTurn && (!mustFollow || c.suit === led);
        return (
          <Card
            key={c.id}
            card={c}
            trump={s.trump}
            playable={myTurn && playable}
            dim={myTurn && !playable}
            onClick={myTurn && playable ? () => actions.playCard(c.id) : undefined}
          />
        );
      })}
    </div>
  );
}
