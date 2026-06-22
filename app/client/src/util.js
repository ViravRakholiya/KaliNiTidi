// Shared constants + pure helpers (ported 1:1 from the original client).
export const SUIT = { spades: "♠", hearts: "♥", diamonds: "♦", clubs: "♣" };
export const RED = { hearts: 1, diamonds: 1 };
export const RANK_ORDER = ["A", "K", "Q", "J", "10", "9", "8", "5", "3"];
export const DECK_RANKS = ["A", "K", "Q", "J", "10", "9", "8", "5", "3"];
export const GU_SUIT = {
  spades: "કાળી",
  hearts: "લાલી",
  diamonds: "સરકટ",
  clubs: "ફૂલી",
};
export const GU_ORD = [
  "",
  "પેલો",
  "બીજો",
  "ત્રીજો",
  "ચોથો",
  "પાંચમો",
  "છઠ્ઠો",
  "સાતમો",
  "આઠમો",
];

// Quick one-tap reactions (must match the server whitelist in gameSocket.js).
export const REACTIONS = ["👍", "😂", "🔥", "😮", "😢", "👏", "❤️", "🤔", "🎉", "😎"];

export const isRed = (suit) => !!RED[suit];
export const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
export const initials = (name) => (name || "?").trim().slice(0, 2).toUpperCase();
export const cardKey = (c) => `${c.rank}_${c.suit}`;
export const pKey = (p) => `${p.rank}_${p.suit}_${p.occurrence || 1}`;
export const roundUp5 = (n) => Math.ceil(n / 5) * 5;

export function sortHand(cards, trump) {
  return [...cards].sort((a, b) => {
    const sa = a.suit === trump ? -1 : 0,
      sb = b.suit === trump ? -1 : 0;
    if (sa !== sb) return sa - sb;
    if (a.suit !== b.suit) return a.suit < b.suit ? -1 : 1;
    return RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank);
  });
}

// How many ભેરુ a bid earns: base, plus a fixed +1 once it reaches the threshold.
export function partnersForBid(bid, config, minBid, playerCount) {
  const cfg = config || {};
  const base = typeof cfg.basePartners === "number" ? cfg.basePartners : 1;
  const threshold = cfg.pointsPerExtraPartner || 0;
  const min = typeof cfg.minimumBid === "number" ? cfg.minimumBid : minBid || 0;
  const maxP =
    cfg.maxPartners != null
      ? cfg.maxPartners
      : Math.max(1, (playerCount || 4) - 2);
  let n = base;
  if (threshold > 0 && threshold > min && bid >= threshold) n = base + 1;
  return Math.min(n, maxP);
}

export const maxBidFor = (totalPoints, config, numberOfSets) =>
  totalPoints || 250 * (config?.numberOfDecks || numberOfSets || 2);
