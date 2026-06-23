import { useStore } from "../store.js";

// Always-visible label in the middle of the felt showing how many decks are in
// play (and the resulting total points), so everyone knows the table size.
export default function DeckIndicator() {
  const decks = useStore((s) => s.config?.numberOfDecks || s.numberOfSets || 2);
  const total = useStore((s) => s.totalPoints || decks * 250);
  return (
    <div className="deck-indicator">
      🃏 {decks} {decks === 1 ? "Deck" : "Decks"} · {total} pts
    </div>
  );
}
