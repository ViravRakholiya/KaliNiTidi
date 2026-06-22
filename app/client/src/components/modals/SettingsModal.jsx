import { useState } from "react";
import { useStore, store, toast } from "../../store.js";
import { actions } from "../../socket.js";

function settingsError(c) {
  const total = 250 * c.numberOfDecks;
  if (c.minimumBid > total)
    return `Minimum bid (${c.minimumBid}) can't exceed deck points (${total}).`;
  if (c.pointsPerExtraPartner > total)
    return `Extra-partner threshold (${c.pointsPerExtraPartner}) can't exceed deck points (${total}).`;
  return null;
}

export default function SettingsModal() {
  const s = useStore();
  const cfg = s.config || {};
  const [decks, setDecks] = useState(String(cfg.numberOfDecks || 2));
  const [cards, setCards] = useState(cfg.cardsPerPlayer || 13);
  const [minBid, setMinBid] = useState(cfg.minimumBid ?? 250);
  const [base, setBase] = useState(cfg.basePartners ?? 1);
  const [extra, setExtra] = useState(cfg.pointsPerExtraPartner ?? 250);

  const close = () => store.set({ overlay: null });

  const read = () => ({
    numberOfDecks: parseInt(decks) || 2,
    cardsPerPlayer: parseInt(cards) || 13,
    minimumBid: parseInt(minBid) || 0,
    basePartners: parseInt(base) || 0,
    pointsPerExtraPartner: parseInt(extra) || 0,
  });

  const c = read();
  const err = settingsError(c);
  const total = 250 * c.numberOfDecks;

  const save = () => {
    if (err) return toast(err, "err");
    actions.updateConfig(c, (r) => {
      if (r && r.success) {
        close();
        toast("Settings updated", "ok");
      } else toast(r?.message || "Could not update", "err");
    });
  };

  return (
    <div className="overlay show" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="panel modal">
        <h2>⚙️ Settings</h2>
        <div className="row2">
          <div className="field">
            <label>Decks</label>
            <select value={decks} onChange={(e) => setDecks(e.target.value)}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <option value={n} key={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Cards per player</label>
            <input
              type="number"
              min="1"
              max="52"
              value={cards}
              onChange={(e) => setCards(e.target.value)}
            />
          </div>
        </div>
        <div className="row2">
          <div className="field">
            <label>આટલા પોઈન્ટ મિનિમમ</label>
            <input
              type="number"
              min="0"
              step="5"
              value={minBid}
              onChange={(e) => setMinBid(e.target.value)}
            />
          </div>
          <div className="field">
            <label>આટલા ભેરુ મંગાવાના</label>
            <input
              type="number"
              min="0"
              max="10"
              value={base}
              onChange={(e) => setBase(e.target.value)}
            />
          </div>
        </div>
        <div className="field">
          <label>આટલા પોઈન્ટે 1 એક્સ્ટ્રા ભેરુ મળશે</label>
          <input
            type="number"
            min="0"
            step="5"
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
          />
        </div>
        <div
          className="set-hint"
          style={{ color: err ? "var(--danger)" : "var(--gold)" }}
        >
          {err ? "⚠ " + err : `Total ${total} points in play`}
        </div>
        <button className="btn block lg" onClick={save}>
          Save
        </button>
        <button className="btn block ghost" style={{ marginTop: 8 }} onClick={close}>
          Cancel
        </button>
      </div>
    </div>
  );
}
