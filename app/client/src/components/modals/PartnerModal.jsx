import { useState, useEffect } from "react";
import { useStore, store, toast } from "../../store.js";
import { socket, actions } from "../../socket.js";
import {
  SUIT,
  GU_SUIT,
  GU_ORD,
  DECK_RANKS,
  sortHand,
} from "../../util.js";
import Card from "../Card.jsx";

const selCss = {
  padding: "11px 8px",
  borderRadius: 10,
  background: "rgba(0,0,0,.35)",
  color: "var(--cream)",
  border: "1px solid rgba(232,196,104,.25)",
  fontSize: 15,
};

const makeRows = (n) =>
  Array.from({ length: n }, (_, i) => ({
    suit: "spades",
    rank: DECK_RANKS[i % DECK_RANKS.length],
    occurrence: 1,
  }));

// For each row, occurrences already used by another row with the same suit+rank
// are disabled; if a row lands on a taken occurrence, bump it to the first free.
function normalize(rows, decks) {
  return rows.map((row, idx) => {
    const taken = new Set();
    rows.forEach((o, j) => {
      if (j !== idx && o.suit === row.suit && o.rank === row.rank)
        taken.add(o.occurrence);
    });
    if (taken.has(row.occurrence)) {
      let free = null;
      for (let n = 1; n <= decks; n++)
        if (!taken.has(n)) {
          free = n;
          break;
        }
      if (free != null) return { ...row, occurrence: free };
    }
    return row;
  });
}

function disabledOccs(rows, idx) {
  const row = rows[idx];
  const taken = new Set();
  rows.forEach((o, j) => {
    if (j !== idx && o.suit === row.suit && o.rank === row.rank)
      taken.add(o.occurrence);
  });
  return taken;
}

export default function PartnerModal() {
  const s = useStore();
  const decks = s.numberOfSets || 2;
  const allowed = s.allowedPartners || 1;
  const [trump, setTrumpSel] = useState(s.trump || "");
  const [confirmed, setConfirmed] = useState(!!s.trump);
  const [rows, setRows] = useState(() => makeRows(allowed));

  useEffect(() => {
    setTrumpSel(s.trump || "");
    setConfirmed(!!s.trump);
    setRows(makeRows(allowed));
  }, []);

  const close = () => store.set({ overlay: null });

  const confirmTrump = () => {
    if (!trump) return toast("પહેલા હુકમ પસંદ કર", "err");
    actions.selectTrump(trump, (r) => {
      if (r && r.success) {
        store.set({ trump });
        setConfirmed(true);
        setRows(makeRows(allowed));
      } else toast(r?.message || "Trump failed", "err");
    });
  };

  const setRow = (idx, patch) => {
    setRows((rs) =>
      normalize(
        rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
        decks,
      ),
    );
  };

  const declare = () => {
    const seen = new Set();
    const partners = [];
    for (const row of rows) {
      if (!row.suit || !row.rank) return toast("બધા ભેરુ પસંદ કર", "err");
      const key = `${row.rank}_${row.suit}_${row.occurrence}`;
      if (seen.has(key)) return toast("એક જ કાર્ડ બે વાર ન ચાલે", "err");
      seen.add(key);
      partners.push({
        rank: row.rank,
        suit: row.suit,
        occurrence: row.occurrence,
      });
    }
    if (!partners.length) return toast("ઓછામાં ઓછો એક ભેરુ બોલ", "err");
    actions.declareAndStart(partners);
  };

  return (
    <div className="overlay show" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="panel modal">
        <h2>👑 હાલ ભાઈ, ફટાફટ હુકમ પાડ</h2>
        <p className="modal-sub">હુકમ પાડ અને ભેરુ બોલ</p>
        <div className="modal-hand-label">તારા કાર્ડ</div>
        <div className="modal-hand">
          {sortHand(s.hand, s.trump).map((c) => (
            <Card key={c.id} card={c} trump={s.trump} sm showPts={false} />
          ))}
        </div>
        <div className="field">
          <label>હુકમનું કાર્ડ</label>
          <select value={trump} onChange={(e) => setTrumpSel(e.target.value)}>
            <option value="">હુકમ પસંદ કર ભાઈ હવે…</option>
            <option value="spades">♠ કાળી</option>
            <option value="hearts">♥ લાલી</option>
            <option value="diamonds">♦ સરકટ</option>
            <option value="clubs">♣ ફૂલી</option>
          </select>
        </div>
        {!confirmed ? (
          <button className="btn block" onClick={confirmTrump}>
            નક્કી કર
          </button>
        ) : null}

        {confirmed ? (
          <div style={{ marginTop: 16 }}>
            <div className="partner-head">
              <label>ભેરુ બોલ</label>
              <span className="partner-allowed">{allowed} ભેરુ બોલ</span>
            </div>
            <p className="partner-hint">
              દરેક હરોળ = એક કાર્ડ + એ કાર્ડ કેટલામી વાર રમાય (1લી/2જી…) ત્યારે ભેરુ બને.
            </p>
            <div>
              {rows.map((row, idx) => {
                const taken = disabledOccs(rows, idx);
                return (
                  <div className="row2 partner-row" key={idx}>
                    <select
                      style={selCss}
                      value={row.suit}
                      onChange={(e) => setRow(idx, { suit: e.target.value })}
                    >
                      {["spades", "hearts", "diamonds", "clubs"].map((su) => (
                        <option value={su} key={su}>
                          {SUIT[su]} {GU_SUIT[su]}
                        </option>
                      ))}
                    </select>
                    <select
                      style={selCss}
                      value={row.occurrence}
                      onChange={(e) =>
                        setRow(idx, { occurrence: parseInt(e.target.value) || 1 })
                      }
                    >
                      {Array.from({ length: decks }, (_, i) => i + 1).map((n) => (
                        <option value={n} key={n} disabled={taken.has(n)}>
                          {GU_ORD[n] || n}
                        </option>
                      ))}
                    </select>
                    <select
                      style={selCss}
                      value={row.rank}
                      onChange={(e) => setRow(idx, { rank: e.target.value })}
                    >
                      {DECK_RANKS.map((r) => (
                        <option value={r} key={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
            <button className="btn block lg" style={{ marginTop: 12 }} onClick={declare}>
              હાલો ભાઈ, ચાલુ કર
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
