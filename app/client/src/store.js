// A tiny external store (no dependency). A fresh state object is produced on
// every update, so React's useSyncExternalStore re-renders subscribers.
import { useSyncExternalStore } from "react";

export const initialState = {
  // connection / identity
  socketId: null,
  connected: false,
  name: null,
  // screen + room
  screen: "lobby", // lobby | table
  roomId: null,
  isHost: false,
  players: [],
  maxPlayers: 4,
  config: null,
  phase: "lobby", // waiting | bidding | selection | playing | completed
  spectating: false,
  // per-player view flags (keyed by socketId)
  passed: {}, // socketId -> true
  team: {}, // socketId -> "bidder" | "opp"
  score: {}, // socketId -> live round trick points
  // round / game
  hand: [],
  trump: null,
  leader: null,
  bidWinner: null,
  partnerIds: [],
  partnerCards: [],
  partnerCard: null,
  allowedPartners: 1,
  revealedKeys: [],
  lostKeys: [],
  winningBid: 0,
  minBid: 0,
  currentBid: 0,
  currentTurn: null,
  token: null,
  numberOfSets: 2,
  cardsPerPlayer: 13,
  roundNumber: 1,
  totalPoints: 0,
  cumulative: {},
  cardPool: [],
  trickCards: [], // [{ playerId, card }]
  ledSuit: null,
  trickDone: false,
  turnDeadline: 0,
  turnPlayer: null,
  muted: false,
  // chat + reactions
  chat: [], // [{ id, playerId, name, text, ts, mine }]
  unreadChat: 0,
  reactions: [], // transient [{ id, playerId, emoji }]
  bubbles: [], // transient chat bubbles over seats [{ id, playerId, text }]
  // ui
  toasts: [],
  reveal: null, // { id, title, subtitle }
  overlay: null, // "scores" | "over" | "partner" | "settings" | "chat"
  gameOver: null, // GAME_OVER payload
  install: { available: false, dismissed: false },
};

let state = { ...initialState };
const listeners = new Set();

export const store = {
  get: () => state,
  set: (partial) => {
    const next = typeof partial === "function" ? partial(state) : partial;
    state = { ...state, ...next };
    listeners.forEach((l) => l());
  },
  subscribe: (l) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useStore(selector = (s) => s) {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.get()),
    () => selector(store.get()),
  );
}

// ---- shared UI helpers ----
let toastId = 0;
export function toast(msg, kind) {
  const id = ++toastId;
  store.set((s) => ({ toasts: [...s.toasts, { id, msg, kind: kind || "" }] }));
  setTimeout(() => {
    store.set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  }, 3100);
}

let revealTimer = null;
export function showReveal(title, subtitle) {
  store.set({ reveal: { id: ++toastId, title, subtitle } });
  clearTimeout(revealTimer);
  revealTimer = setTimeout(() => store.set({ reveal: null }), 3600);
}

// ---- selectors / lookups ----
export const getPlayer = (sid) =>
  store.get().players.find((p) => p.socketId === sid);
export const getName = (sid) => {
  const p = getPlayer(sid);
  return p ? p.name : "—";
};
