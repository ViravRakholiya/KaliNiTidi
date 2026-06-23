import { useState, useEffect } from "react";
import { store, toast } from "../store.js";
import { actions } from "../socket.js";
import { getSession } from "../session.js";
import InstallBanner from "./InstallBanner.jsx";

export default function Lobby() {
  const [mode, setMode] = useState("join");
  const [name, setName] = useState("");
  const [room, setRoom] = useState("");
  const [players, setPlayers] = useState("4");
  const [decks, setDecks] = useState("2");
  const [cards, setCards] = useState("13");
  const [minBid, setMinBid] = useState("250");
  const [basePartners, setBasePartners] = useState("1");
  const [extraStep, setExtraStep] = useState("250");

  // prefill name + room from session / share link
  useEffect(() => {
    const sess = getSession();
    if (sess && sess.name) setName(sess.name);
    const roomParam = (new URLSearchParams(location.search).get("room") || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    if (roomParam) {
      setMode("join");
      setRoom(roomParam);
    }
  }, []);

  const deckPts = 250 * (parseInt(decks) || 2);
  const total = (parseInt(players) || 4) * (parseInt(cards) || 13);
  const pointCards = 25 * (parseInt(decks) || 2);

  let hint, hintErr;
  if (total < pointCards) {
    hintErr = true;
    hint = `⚠ ${players}×${cards}=${total} cards can't hold ${pointCards} point cards. Raise cards or lower decks.`;
  } else if ((parseInt(minBid) || 0) > deckPts) {
    hintErr = true;
    hint = `⚠ Minimum bid ${minBid} > deck points ${deckPts}. Lower it or add decks.`;
  } else if ((parseInt(extraStep) || 0) > deckPts) {
    hintErr = true;
    hint = `⚠ Extra-partner threshold ${extraStep} > deck points ${deckPts}. Lower it or add decks.`;
  } else {
    hint = `Total ${deckPts} pts · ${total} cards (${pointCards} point + ${total - pointCards} filler)`;
  }

  const go = () => {
    const nm = name.trim();
    if (!nm) return toast("Enter your name", "err");
    store.set({ name: nm });
    if (mode === "join") {
      const rid = room.trim().toUpperCase();
      if (!rid) return toast("Enter a room code", "err");
      actions.joinRoom(rid, nm);
    } else {
      const config = {
        numberOfDecks: parseInt(decks) || 2,
        cardsPerPlayer: parseInt(cards) || 13,
        minimumBid: parseInt(minBid) || 0,
        basePartners: parseInt(basePartners) || 0,
        pointsPerExtraPartner: parseInt(extraStep) || 0,
      };
      if (config.minimumBid > deckPts)
        return toast(`Minimum bid can't exceed ${deckPts} (deck points)`, "err");
      if (config.pointsPerExtraPartner > deckPts)
        return toast(`Extra-partner threshold can't exceed ${deckPts} (deck points)`, "err");
      actions.createRoom(nm, parseInt(players) || 4, config);
    }
  };

  return (
    <section className="screen active screen-lobby">
      <div className="brand">
        <div className="suits">
          <span className="b">♠</span> <span className="r">♥</span>{" "}
          <span className="r">♦</span> <span className="b">♣</span>
        </div>
        <h1>Kali ni Tidi</h1>
        <p>Regensburg Gujarati Valav — by Virav</p>
      </div>
      <div className="panel">
        <div className="tabs">
          <button className={mode === "join" ? "on" : ""} onClick={() => setMode("join")}>
            Join Room
          </button>
          <button className={mode === "create" ? "on" : ""} onClick={() => setMode("create")}>
            Create Room
          </button>
        </div>

        <div className="field">
          <label>Your Name</label>
          <input
            type="text"
            placeholder="Enter your name"
            maxLength={16}
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {mode === "join" ? (
          <div className="field">
            <label>Room Code</label>
            <input
              type="text"
              placeholder="e.g. 08SNH8"
              maxLength={6}
              autoComplete="off"
              style={{ textTransform: "uppercase" }}
              value={room}
              onChange={(e) => setRoom(e.target.value)}
            />
          </div>
        ) : (
          <div>
            <div className="row2">
              <div className="field">
                <label>Max Players</label>
                <select value={players} onChange={(e) => setPlayers(e.target.value)}>
                  {[4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                    <option value={n} key={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
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
                  value={basePartners}
                  onChange={(e) => setBasePartners(e.target.value)}
                />
              </div>
            </div>
            <div className="field">
              <label>આટલા પોઈન્ટે 1 એક્સ્ટ્રા ભેરુ મળશે</label>
              <input
                type="number"
                min="0"
                step="5"
                value={extraStep}
                onChange={(e) => setExtraStep(e.target.value)}
              />
            </div>
            <div
              className="cfg-hint"
              style={{ color: hintErr ? "var(--danger)" : "var(--gold)" }}
            >
              {hint}
            </div>
          </div>
        )}

        <button className="btn block lg" onClick={go}>
          {mode === "join" ? "Join Table" : "Create Table"}
        </button>
        <p className="lobby-note">
          Min 4 players to start. Short? Add bots from the table.
        </p>
      </div>

      <InstallBanner />
    </section>
  );
}
