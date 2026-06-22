// Socket.io connection + all server event handlers + the action functions.
// This is a faithful port of the original client's socket logic; the server
// and the wire protocol are unchanged.
import { io } from "socket.io-client";
import { store, toast, showReveal, getPlayer } from "./store.js";
import { SFX } from "./sfx.js";
import {
  getPlayerId,
  setPlayerId,
  saveSession,
  getSession,
  clearSession,
} from "./session.js";

export const socket = io({ transports: ["websocket", "polling"], reconnection: true });
const me = () => socket.id;

function applyConfig(cfg) {
  if (!cfg) return;
  const patch = { config: cfg };
  if (cfg.numberOfDecks) patch.numberOfSets = cfg.numberOfDecks;
  if (cfg.cardsPerPlayer) patch.cardsPerPlayer = cfg.cardsPerPlayer;
  store.set(patch);
}

function mergeConn(players) {
  return players.map((p) => {
    const old = getPlayer(p.socketId);
    return Object.assign({ connected: true }, old || {}, p);
  });
}

function refreshRoom() {
  socket.emit("GET_ROOM_STATE", { roomId: store.get().roomId }, (r) => {
    if (r && r.success) store.set({ players: r.roomState.players });
  });
}

function onSeated(d, host) {
  setPlayerId(d.playerId);
  saveSession(d.roomId, store.get().name);
  applyConfig(d.config);
  store.set({
    roomId: d.roomId,
    isHost: host,
    players: d.players || [],
    maxPlayers: d.maxPlayers || store.get().maxPlayers,
    spectating: !!d.waitingForNextRound,
    phase: "waiting",
    screen: "table",
  });
  if (d.waitingForNextRound)
    toast("Round in progress — you’ll join next round", "gold");
  else toast(host ? `Room ${d.roomId} created` : `Joined ${d.roomId}`, "ok");
}

function attemptReconnect() {
  const s = getSession();
  if (!s || !s.roomId) return;
  socket.emit(
    "REJOIN_ROOM",
    { roomId: s.roomId, playerId: getPlayerId(), name: s.name },
    (r) => {
      if (r && !r.success) toast(r.message || "Reconnect failed", "err");
    },
  );
}

// ---------- connection ----------
socket.on("connect", () => {
  store.set({ socketId: socket.id, connected: true });
  if (getSession()) attemptReconnect();
});
socket.on("disconnect", () => {
  store.set({ connected: false });
  if (getSession()) toast("Disconnected — 2 min to return", "err");
});
socket.on("CONNECTED", () => {});
socket.on("ROOM_ERROR", (e) => toast(e && e.message ? e.message : "Error", "err"));

// ---------- lobby ----------
socket.on("ROOM_CREATED", (d) => onSeated(d, true));
socket.on("ROOM_JOINED", (d) => onSeated(d, false));
socket.on("PLAYER_JOINED", () => refreshRoom());
socket.on("PLAYER_LEFT", (d) => {
  if (d && d.newHostId === me()) {
    store.set({ isHost: true });
    toast("You are now the host", "gold");
  }
  refreshRoom();
});
socket.on("PLAYER_DISCONNECTED", (d) => {
  toast(`${d.player?.name || "A player"} disconnected`, "err");
  refreshRoom();
});
socket.on("PLAYER_RECONNECTED", (d) => {
  toast(`${d.player?.name || "A player"} reconnected`, "ok");
  refreshRoom();
});
socket.on("HOST_ASSIGNED", () => refreshRoom());
socket.on("CONFIG_UPDATED", (d) => {
  if (d.config) applyConfig(d.config);
  if (store.get().roomId && d.roomId === store.get().roomId && !store.get().isHost)
    toast("Host changed the settings", "gold");
});

// ---------- game start ----------
socket.on("PLAYER_HAND", (d) => {
  store.set({ hand: d.cards || [], cardsPerPlayer: d.cardsPerPlayer || (d.cards || []).length });
  SFX.deal();
});

socket.on("BIDDING_STARTED", (d) => {
  store.set({
    phase: "bidding",
    spectating: false,
    trump: null,
    partnerCard: null,
    partnerCards: [],
    partnerIds: [],
    allowedPartners: 1,
    revealedKeys: [],
    lostKeys: [],
    bidWinner: null,
    leader: null,
    passed: {},
    team: {},
    score: {},
    trickCards: [],
    ledSuit: null,
    trickDone: false,
    minBid: d.minBid,
    currentBid: d.minBid,
    winningBid: d.minBid,
    currentTurn: d.currentTurn,
    token: d.token || null,
    roundNumber: d.roundNumber || store.get().roundNumber,
    numberOfSets: d.numberOfSets || store.get().numberOfSets,
    totalPoints: d.totalPoints,
  });
  if (d.currentTurn === me()) SFX.turn();
});

socket.on("NEXT_ROUND_STARTED", (d) => {
  store.set({ roundNumber: d.roundNumber || store.get().roundNumber + 1 });
  if (d.cumulativeScores) store.set({ cumulative: d.cumulativeScores });
  toast(`Round ${d.roundNumber || store.get().roundNumber}`, "gold");
});

socket.on("BID_UPDATED", (d) => {
  store.set({
    currentBid: d.bidValue,
    winningBid: d.bidValue,
    bidWinner: d.bidder,
    currentTurn: d.nextTurn,
  });
  SFX.bid();
  if (d.nextTurn === me()) SFX.turn();
});

socket.on("PLAYER_PASSED", (d) => {
  store.set((s) => ({
    passed: { ...s.passed, [d.player]: true },
    currentTurn: d.nextTurn,
  }));
  if (d.nextTurn === me()) SFX.turn();
});

socket.on("BIDDING_ENDED", (d) => {
  store.set({
    phase: "selection",
    leader: d.leader,
    bidWinner: d.leader,
    winningBid: d.winningBid,
    cardPool: d.cardPool || [],
    allowedPartners: d.allowedPartners || 1,
    currentTurn: null,
    passed: {},
  });
  if (d.leader === me()) {
    store.set({ overlay: "partner" });
    toast(`You won! Choose up to ${d.allowedPartners || 1} partner(s)`, "gold");
  } else toast(`${nameOf(d.leader)} won the bid (${d.winningBid})`, "gold");
});

socket.on("TRUMP_SELECTED", (d) => {
  store.set({ trump: d.suit });
  if (d.selectedBy !== me()) toast(`Trump chosen`, "gold");
});

socket.on("PARTNERS_DECLARED", (d) => {
  store.set({ partnerCards: d.partners || [] });
  if (d.selectedBy !== me()) toast(`Partner cards declared`, "gold");
});

socket.on("GAMEPLAY_STARTED", (d) => {
  store.set((s) => ({
    phase: "playing",
    trump: d.trump,
    leader: d.leader,
    bidWinner: d.leader,
    partnerCard: d.partnerCard || s.partnerCard,
    partnerCards: d.partnerCards || s.partnerCards,
    winningBid: d.winningBid || s.winningBid,
    currentTurn: d.leader,
    players: d.players ? mergeConn(d.players) : s.players,
    team: { ...s.team, [d.leader]: "bidder" },
    overlay: null,
  }));
  toast("Game on!", "ok");
  if (d.leader === me()) SFX.turn();
});

socket.on("CARD_PLAYED", (d) => {
  store.set((s) => {
    let trickCards = s.trickCards;
    let ledSuit = s.ledSuit;
    let trickDone = s.trickDone;
    if (trickDone) {
      trickCards = [];
      ledSuit = null;
      trickDone = false;
    }
    if (trickCards.length === 0) ledSuit = d.card.suit;
    trickCards = [...trickCards, { playerId: d.playerId, card: d.card }];

    const patch = { trickCards, ledSuit, trickDone };
    if (d.playerId === me())
      patch.hand = s.hand.filter((c) => c.id !== d.card.id);
    if (Array.isArray(d.partnerIds)) patch.partnerIds = d.partnerIds;

    // mark which declared partner card this resolved
    if (d.partnerCardPlayed && d.declaredOccurrence) {
      const key = `${d.card.rank}_${d.card.suit}_${d.declaredOccurrence}`;
      if (d.partnerAssigned) patch.revealedKeys = [...s.revealedKeys, key];
      else if (d.partnerLost) patch.lostKeys = [...s.lostKeys, key];
    }
    if (d.partnerAssigned && d.partnerId) {
      patch.partnerIds = patch.partnerIds || s.partnerIds;
      if (!patch.partnerIds.includes(d.partnerId))
        patch.partnerIds = [...patch.partnerIds, d.partnerId];
      patch.team = { ...s.team, [d.partnerId]: "bidder", [s.bidWinner]: "bidder" };
    }
    if (!d.trickComplete) patch.currentTurn = d.nextPlayerId;
    return patch;
  });

  if (d.partnerAssigned && d.partnerId) {
    const who = d.partnerId === me() ? "તું" : d.partnerName;
    showReveal("🤝 ભેરુ ખૂલ્યો!", `${who} હવે ભેરુ છે`);
  } else if (d.partnerLost) {
    toast(`💔 એક ભેરુ ગયો`);
  }
  SFX.play();
  if (!d.trickComplete && d.nextPlayerId === me()) SFX.turn();
});

socket.on("TRICK_COMPLETE", (d) => {
  store.set((s) => {
    const score = { ...s.score };
    if (d.currentScores) d.currentScores.forEach((x) => (score[x.socketId] = x.score));
    return { score, currentTurn: d.nextPlayerId, trickDone: true };
  });
  toast(`${nameOf(d.winner)} takes the trick (+${d.points})`, "gold");
  SFX.win();
  setTimeout(() => {
    if (store.get().trickDone)
      store.set({ trickCards: [], ledSuit: null, trickDone: false });
  }, 2200);
});

socket.on("GAME_OVER", (d) => {
  store.set((s) => {
    const score = { ...s.score };
    if (d.scores) d.scores.forEach((x) => (score[x.socketId] = x.score));
    return {
      phase: "completed",
      turnDeadline: 0,
      turnPlayer: null,
      cumulative: d.cumulativeScores || s.cumulative,
      score,
      gameOver: d,
      overlay: "over",
    };
  });
  SFX.win();
});

socket.on("TURN_TIMER", (d) => {
  store.set({
    turnPlayer: d.playerId,
    currentTurn: d.playerId,
    turnDeadline: Date.now() + (d.durationMs || 0),
  });
});

socket.on("REJOIN_FAILED", (d) => {
  clearSession();
  toast(d.message || "Reconnect failed — join again", "err");
  store.set({ screen: "lobby" });
});

socket.on("REJOINED", (d) => {
  applyConfig(d.config);
  saveSession(d.roomId, getSession()?.name || store.get().name);
  const g = d.game;
  if (!g) {
    store.set({
      roomId: d.roomId,
      isHost: !!d.isHost,
      players: d.players || [],
      cumulative: d.cumulativeScores || store.get().cumulative,
      phase: "waiting",
      screen: "table",
    });
    toast("Reconnected", "ok");
    return;
  }
  const passed = {};
  (g.bidding?.passedPlayers || []).forEach((pid) => (passed[pid] = true));
  const team = {};
  if (g.bidWinner) team[g.bidWinner] = "bidder";
  (g.partnerIds || []).forEach((pid) => (team[pid] = "bidder"));
  const revealedKeys = [];
  (g.declaredPartners || []).forEach((p) => {
    if (p.resolved) revealedKeys.push(`${p.rank}_${p.suit}_${p.occurrence || 1}`);
  });
  store.set({
    roomId: d.roomId,
    isHost: !!d.isHost,
    players: g.players && g.players.length ? mergeConn(g.players) : d.players || [],
    cumulative: d.cumulativeScores || store.get().cumulative,
    phase: g.phase === "completed" ? "waiting" : g.phase,
    hand: Array.isArray(g.hand) ? g.hand : store.get().hand,
    trump: g.trump,
    leader: g.leader,
    bidWinner: g.bidWinner,
    partnerIds: g.partnerIds || [],
    partnerCards: g.partnerCards || [],
    partnerCard: g.partnerCard,
    token: g.token || null,
    revealedKeys,
    lostKeys: [],
    allowedPartners: g.allowedPartners || store.get().allowedPartners,
    winningBid: g.winningBid || 0,
    currentBid: g.bidding?.currentBid || g.winningBid || 0,
    minBid: g.bidding?.minimumBid || g.bidding?.currentBid || 0,
    currentTurn: g.currentTurn,
    roundNumber: g.roundNumber || 1,
    numberOfSets: g.bidding?.numberOfSets || store.get().numberOfSets,
    totalPoints: g.totalPoints || store.get().totalPoints,
    passed,
    team,
    trickCards: Array.isArray(g.currentTrick)
      ? g.currentTrick.map((tc) => ({ playerId: tc.playerId, card: tc.card }))
      : [],
    ledSuit: null,
    trickDone: false,
    overlay: null,
    screen: "table",
  });
  toast("Reconnected to your game", "ok");
});

// ---------- chat + reactions ----------
let chatId = 0;
socket.on("CHAT_MESSAGE", (d) => {
  const mine = d.playerId === me();
  const msg = {
    id: ++chatId,
    playerId: d.playerId,
    name: d.name,
    text: d.text,
    ts: d.ts,
    mine,
  };
  store.set((s) => ({
    chat: [...s.chat, msg].slice(-100),
    unreadChat: s.overlay === "chat" ? 0 : s.unreadChat + (mine ? 0 : 1),
  }));
});

socket.on("REACTION", (d) => {
  const id = ++chatId;
  store.set((s) => ({
    reactions: [...s.reactions, { id, playerId: d.playerId, emoji: d.emoji }],
  }));
  setTimeout(() => {
    store.set((s) => ({ reactions: s.reactions.filter((r) => r.id !== id) }));
  }, 3000);
});

function nameOf(sid) {
  const p = getPlayer(sid);
  return p ? p.name : "—";
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !socket.connected && getSession()) socket.connect();
});

// ---------- actions ----------
export const actions = {
  createRoom: (name, maxPlayers, config) =>
    socket.emit(
      "CREATE_ROOM",
      { name, maxPlayers, playerId: getPlayerId(), config },
      (r) => {
        if (r && !r.success) toast(r.message || "Create failed", "err");
      },
    ),
  joinRoom: (roomId, name) =>
    socket.emit("JOIN_ROOM", { roomId, name, playerId: getPlayerId() }, (r) => {
      if (r && !r.success) toast(r.message || "Join failed", "err");
    }),
  refreshRoom,
  leave: () => {
    socket.emit("LEAVE_ROOM", { roomId: store.get().roomId }, () => {});
    clearSession();
    location.reload();
  },
  addBot: () =>
    socket.emit("ADD_BOT", { roomId: store.get().roomId }, (r) => {
      if (r && r.success) refreshRoom();
      else toast(r?.message || "Could not add bot", "err");
    }),
  removeBot: () =>
    socket.emit("REMOVE_BOT", { roomId: store.get().roomId }, (r) => {
      if (r && r.success) refreshRoom();
      else toast(r?.message || "Could not remove bot", "err");
    }),
  startGame: () => {
    const s = store.get();
    socket.emit(
      "START_GAME",
      {
        roomId: s.roomId,
        cardsPerPlayer: s.cardsPerPlayer || 13,
        numberOfSets: s.numberOfSets || 2,
      },
      (r) => {
        if (r && !r.success) toast(r.message || "Could not start", "err");
      },
    );
  },
  placeBid: (v) =>
    socket.emit("PLACE_BID", { roomId: store.get().roomId, bidValue: v }, (r) => {
      if (r && !r.success) toast(r.message || "Bid failed", "err");
    }),
  passBid: () =>
    socket.emit("PASS_BID", { roomId: store.get().roomId }, (r) => {
      if (r && !r.success) toast(r.message || "Pass failed", "err");
    }),
  selectTrump: (suit, cb) =>
    socket.emit("SELECT_TRUMP", { roomId: store.get().roomId, suit }, cb),
  declareAndStart: (partners) => {
    socket.emit(
      "DECLARE_PARTNERS",
      { roomId: store.get().roomId, partners },
      (r) => {
        if (r && r.success) {
          store.set({ partnerCards: r.partnerCards, overlay: null });
          socket.emit("START_GAMEPLAY", { roomId: store.get().roomId }, (g) => {
            if (g && !g.success) toast(g.message || "Could not start play", "err");
          });
        } else toast(r?.message || "Could not declare partners", "err");
      },
    );
  },
  playCard: (cardId) =>
    socket.emit("PLAY_CARD", { roomId: store.get().roomId, cardId }, (r) => {
      if (r && !r.success) toast(r.message || "Invalid play", "err");
    }),
  updateConfig: (config, cb) =>
    socket.emit("UPDATE_CONFIG", { roomId: store.get().roomId, config }, cb),
  sendChat: (text) => {
    const t = (text || "").trim();
    if (!t) return;
    socket.emit("CHAT_MESSAGE", { roomId: store.get().roomId, text: t });
  },
  sendReaction: (emoji) =>
    socket.emit("REACTION", { roomId: store.get().roomId, emoji }),
};
