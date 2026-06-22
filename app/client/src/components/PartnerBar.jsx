import { useStore } from "../store.js";
import { SUIT, isRed, pKey } from "../util.js";

// One chip per declared partner card; the revealed one is highlighted.
export default function PartnerBar() {
  const s = useStore();
  if (s.phase !== "playing" || !s.partnerCards || !s.partnerCards.length)
    return <div className="partner-bar" />;
  return (
    <div className="partner-bar">
      {s.partnerCards.map((p, i) => {
        const k = pKey(p);
        const cls =
          "pchip" +
          (s.revealedKeys.includes(k)
            ? " revealed"
            : s.lostKeys.includes(k)
              ? " lost"
              : "");
        return (
          <span className={cls} key={i}>
            {p.occurrence ? <span className="occ">{p.occurrence}×</span> : null}
            {p.rank}
            <span className={"suit " + (isRed(p.suit) ? "red" : "blk")}>
              {SUIT[p.suit]}
            </span>
          </span>
        );
      })}
    </div>
  );
}
