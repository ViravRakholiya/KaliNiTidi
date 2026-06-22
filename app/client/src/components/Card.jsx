import { SUIT, isRed } from "../util.js";

// A single playing card.
export default function Card({ card, trump, sm, showPts = true, playable, dim, onClick }) {
  const cls = [
    "card",
    isRed(card.suit) ? "red" : "",
    trump && card.suit === trump ? "trump" : "",
    sm ? "sm" : "",
    playable ? "playable" : "",
    dim ? "dim" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cls} data-id={card.id || ""} onClick={onClick}>
      <span className="c-rank">{card.rank}</span>
      <span className="c-suit-sm">{SUIT[card.suit]}</span>
      <span className={"c-pip " + (card.suit || "")}>{SUIT[card.suit]}</span>
      {showPts && card.points ? <span className="c-pt">{card.points}</span> : null}
    </div>
  );
}
