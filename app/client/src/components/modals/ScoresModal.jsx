import { useStore, store, getName } from "../../store.js";

function rows(map) {
  return Object.keys(map)
    .map((sid) => ({ sid, score: map[sid], name: getName(sid) }))
    .sort((a, b) => b.score - a.score);
}

export default function ScoresModal() {
  const s = useStore();
  const close = () => store.set({ overlay: null });

  const hasCumulative = Object.keys(s.cumulative || {}).length > 0;
  let data, label;
  if (hasCumulative) {
    data = rows(s.cumulative);
    label = "Total";
  } else {
    const live = {};
    s.players.forEach(
      (p) => (live[p.socketId] = typeof p.score === "number" ? p.score : 0),
    );
    data = rows(live);
    label = "This round";
  }

  return (
    <div className="overlay show" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="panel modal">
        <h2>🏆 Scores</h2>
        <table className="scoretable">
          <tbody>
            <tr>
              <th>Player</th>
              <th className="num">{label}</th>
            </tr>
            {data.map((r) => (
              <tr key={r.sid}>
                <td>{r.name}</td>
                <td className={"num " + (r.score >= 0 ? "pos" : "neg")}>
                  {r.score >= 0 ? "+" : ""}
                  {r.score}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn block ghost" style={{ marginTop: 14 }} onClick={close}>
          Close
        </button>
      </div>
    </div>
  );
}
