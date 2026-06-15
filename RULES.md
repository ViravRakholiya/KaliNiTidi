# Kali ni Tidi — Game Rules (working spec)

> This is our agreed source of truth for how the game should work.
> Lines marked **❓** still need Virav's confirmation. Everything else is confirmed.

## 1. Players
- Minimum **4**. Odd numbers are allowed (5, 7, 9, …).
- A player may **join mid-game**; they sit out the current round and are dealt in next round.
- Bots can be added by the host to fill seats (for testing / short tables).

## 2. Room setup — decided by the host when creating the room
These stay fixed for the whole session. The host can change them only when the room
is recreated, or when players join/leave:

| Setting | Example (7 players) | Notes |
|---|---|---|
| Number of decks | 4 | Sets the total points = 250 × decks |
| Cards per player | 18 | Hand size everyone gets |
| Minimum bid | 600 | Lowest opening bid |
| Base partners | 3 | Max partners the bidder may name at the minimum bid |
| Points per extra partner | 250 | Each full step of this many points bid **above the minimum** lets the bidder name 1 more partner (e.g. min 600 → 3, bid 850 → 4, bid 1100 → 5) |
| Max partners | half the table ❓ | Optional cap |

All of the above are **set by the host at room creation** (not formulas).

## 3. The deck
- **1 deck = 33 cards:** `A K Q J 10 9 8 5` in all four suits (32) **+ the 3♠** (1).
- **Point cards:** A K Q J 10 = 10 pts each, 5 = 5 pts, **3♠ = 30 pts** → **250 pts per deck**.
- **Zero-point cards:** the **9s and 8s** (these are the only filler cards).
- **Total points in play = 250 × number of decks** (4 decks = 1000).

## 4. Dealing
- **All point cards** from the chosen number of decks are **always dealt** — never discarded.
- Total cards dealt = `players × cards-per-player`.
- To make it come out exactly even, we **add or remove zero-point cards only (8s / 9s)** —
  point cards are never added or removed.
  - Example: 7 players × 18 = **126** cards needed. 4 decks = 132 → **remove 6** zero-point cards.
  - If we needed 133 (19 each), we'd **add 1** zero-point 8 from another deck.
- Constraint: `players × cards-per-player` must be at least the number of point cards
  (25 × decks), so every point card fits.

## 5. Bidding & the token
- There is a **token** (like the dealer token in Teen Patti) that **rotates one seat every round**.
- The token-holder **bids first** each round.
- Opening bid = the room's **minimum bid**; bids go up in **multiples of 5**.
- Turn rotates; each player bids higher or passes. Highest bidder wins the contract.
- **If everyone passes**, the **token-holder is forced to take the contract at the minimum bid**
  (they get at least the minimum). The token then moves on next round.

## 6. Trump & partner declaration (winner, before play)
- Winner names the **trump suit**.
- Winner names their **partner cards** — count = base partners (+ extras earned by a high bid).
- Each partner card is a **card + occurrence number**, e.g. *"1st A♠, 2nd K♥, 1st A♦, 3rd A♠."*
- **Occurrence number** = the Nth time that exact card is played in the whole round
  (decks can contain duplicates, so the 1st A♠ played, the 2nd, the 3rd… are different).

## 7. Finding partners during play
Each time a **declared** card-occurrence is played:
- A **new player** (not the bidder, not already a partner) plays it → **joins** the bidder's team.
- The **bidder** plays it themselves → that partner is **lost** (you can't partner yourself);
  the team ends up one short.
- A player who is **already a partner** plays it → **no** new partner; the team ends up one short.

So the bidder's team = **the bidder + each distinct other player who played a declared occurrence.**
The team can end up smaller than the bidder hoped.

## 8. Scoring — ❓ to confirm next
- The bidder's team must collect at least the **winning bid** in points across their tricks.
- Exact win/lose values still to confirm.
  (Current code: bid made → bidder +bid×2, partner +bid, opponents 0;
   bid failed → bidder −bid×2, opponents +bid.)

---

### Status
1. ✅ Extra-partner rule — host sets at room creation (base partners + points-per-extra-partner).
2. ✅ Bid increment — multiples of 5.
3. ✅ Everyone passes — token-holder takes it at the minimum bid.
4. ⏳ Scoring — keep current for now; Virav will design the final scoring later.
5. ❓ Max-partners cap — confirm (default: no more than half the table).

### Build order
1. ✅ **Cards & setup** (DONE): host-configured room setup (decks, cards/player, min bid,
   base partners, points-per-extra-partner) + new deck/dealing engine (point cards always
   dealt, balanced with 8s/9s). Earned-partner count scales with the winning bid.
2. ✅ **Partner engine** (DONE): bidder declares up to `allowedPartners` cards, each as
   `card + occurrence`. During play, the Nth play of that card resolves: a new player joins
   the team, while the bidder or an already-partnered player playing it loses a slot.
   Scoring uses the full team (bidder + all partners).
3. ⏳ **Scoring** (last): once Virav finalises the rules.
