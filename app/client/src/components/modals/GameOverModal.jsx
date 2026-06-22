import { useStore, store, getName } from "../../store.js";
import { actions } from "../../socket.js";

export default function GameOverModal() {
  const s = useStore();
  const d = s.gameOver;
  if (!d) return null;
  const close = () => store.set({ overlay: null });

  const rows = (d.scores || []).slice().sort((a, b) => b.score - a.score);
  const headline = d.winner
    ? `🏆 ${getName(d.winner)} made the bid!`
    : `💔 Bidder failed the bid`;

  return (
    <div className="overlay show" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="panel modal">
        <h2>Round Over</h2>
        <div>
          <div className="winner-line">
            <b>{headline}</b>
          </div>
          <table className="scoretable">
            <tbody>
              <tr>
                <th>Player</th>
                <th>Team</th>
                <th className="num">Score</th>
              </tr>
              {rows.map((sc, i) => (
                <tr key={i}>
                  <td>
                    {sc.name} {sc.isBidder ? "👑" : sc.isPartner ? "🤝" : ""}
                  </td>
                  <td>{sc.team || ""}</td>
                  <td className={"num " + (sc.score >= 0 ? "pos" : "neg")}>
                    {sc.score >= 0 ? "+" : ""}
                    {sc.score}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 14 }}>
          {s.isHost ? (
            <button
              className="btn block lg"
              onClick={() => {
                close();
                actions.startGame();
              }}
            >
              ▶ Next Round
            </button>
          ) : null}
          <button className="btn block ghost" onClick={close}>
            View Table
          </button>
        </div>
      </div>
    </div>
  );
}
