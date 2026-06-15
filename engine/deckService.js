import { logger } from '../utils/logger.js';

class DeckService {
  constructor() {
    // Reduced deck: 8 and above in every suit, plus the 5 (a 5-point card).
    // The 3 of spades (30-point card) is added separately in every set.
    this.ranks = ['A', 'K', 'Q', 'J', '10', '9', '8', '5'];
    this.suits = ['spades', 'hearts', 'diamonds', 'clubs'];
  }

  /**
   * Calculate points for a card based on the point system
   * 10, J, Q, K, A → 10 points
   * 5 → 5 points
   * 3 of spades → 30 points
   * Others → 0 points
   */
  calculatePoints(rank, suit) {
    if (rank === '3' && suit === 'spades') {
      return 30;
    }
    if (['A', 'K', 'Q', 'J', '10'].includes(rank)) {
      return 10;
    }
    if (rank === '5') {
      return 5;
    }
    return 0;
  }

  /**
   * Create a single card object
   */
  createCard(rank, suit, index) {
    return {
      id: `${suit}_${rank}_${index}`,
      rank,
      suit,
      points: this.calculatePoints(rank, suit)
    };
  }

  /**
   * Generate a standard deck of 52 cards
   */
  createStandardDeck() {
    const deck = [];
    let cardIndex = 0;

    for (const suit of this.suits) {
      for (const rank of this.ranks) {
        deck.push(this.createCard(rank, suit, cardIndex++));
      }
    }

    // The 3 of spades is the only "3" in the deck (30-point card).
    deck.push(this.createCard('3', 'spades', cardIndex++));

    return deck;
  }

  /**
   * Generate a dynamic deck until totalCards is reached
   * Creates multiple standard decks if needed
   */
  generateDeck(totalCards) {
    const deck = [];
    let deckNumber = 0;

    while (deck.length < totalCards) {
      const standardDeck = this.createStandardDeck();

      for (const card of standardDeck) {
        if (deck.length >= totalCards) break;

        // Create unique card ID for duplicate cards
        const uniqueCard = {
          ...card,
          id: `${card.suit}_${card.rank}_d${deckNumber}_${card.id}`
        };

        deck.push(uniqueCard);
      }

      deckNumber++;
    }

    logger.info(`Generated deck with ${deck.length} cards (${deckNumber} standard deck(s))`);
    return deck;
  }

  /**
   * Generate deck with specified number of sets
   * Each set = 1 full deck (52 cards with ~250 points)
   */
  generateDeckWithSets(totalCards, numberOfSets = 2) {
    const deck = [];

    // First, add the specified number of complete sets
    for (let setNum = 0; setNum < numberOfSets; setNum++) {
      const standardDeck = this.createStandardDeck();

      for (const card of standardDeck) {
        const uniqueCard = {
          ...card,
          id: `${card.suit}_${card.rank}_set${setNum}_${card.id}`
        };
        deck.push(uniqueCard);
      }
    }

    // If more cards are needed, add partial sets
    while (deck.length < totalCards) {
      const standardDeck = this.createStandardDeck();

      for (const card of standardDeck) {
        if (deck.length >= totalCards) break;

        const uniqueCard = {
          ...card,
          id: `${card.suit}_${card.rank}_extra_${deck.length}_${card.id}`
        };
        deck.push(uniqueCard);
      }
    }

    // Calculate total points in the deck
    const totalPoints = deck.reduce((sum, card) => sum + card.points, 0);

    logger.info(`Generated deck with ${deck.length} cards using ${numberOfSets} sets (${totalPoints} total points)`);

    return deck;
  }

  /**
   * Point cards for N decks (these must ALWAYS be dealt).
   * Per deck: A K Q J 10 5 in every suit (24) + the 3 of spades (1) = 25 cards, 250 points.
   */
  buildPointCards(numberOfDecks) {
    const pointRanks = ['A', 'K', 'Q', 'J', '10', '5'];
    const cards = [];
    for (let d = 0; d < numberOfDecks; d++) {
      for (const suit of this.suits) {
        for (const rank of pointRanks) {
          cards.push({ ...this.createCard(rank, suit, 0), id: `${suit}_${rank}_d${d}` });
        }
      }
      cards.push({ ...this.createCard('3', 'spades', 0), id: `spades_3_d${d}` });
    }
    return cards;
  }

  /**
   * Generate `count` zero-point filler cards (9s and 8s only). These are what
   * we add/remove to make the deck divide evenly among the players.
   */
  buildFillerCards(count) {
    const zeroRanks = ['9', '8'];
    const cards = [];
    let d = 0;
    while (cards.length < count) {
      for (const suit of this.suits) {
        for (const rank of zeroRanks) {
          if (cards.length >= count) break;
          cards.push({ id: `${suit}_${rank}_f${d}_${cards.length}`, rank, suit, points: 0 });
        }
        if (cards.length >= count) break;
      }
      d++;
    }
    return cards;
  }

  /**
   * Validate a room's card setup for the given player count.
   */
  validateSetup(numberOfPlayers, numberOfDecks, cardsPerPlayer) {
    const errors = [];
    if (numberOfPlayers < 4) errors.push('Minimum 4 players required to start');
    if (!numberOfDecks || numberOfDecks < 1) errors.push('Number of decks must be at least 1');
    if (!cardsPerPlayer || cardsPerPlayer < 1) errors.push('Cards per player must be at least 1');

    const target = numberOfPlayers * cardsPerPlayer;
    const pointCount = 25 * (numberOfDecks || 0);
    if (numberOfDecks && cardsPerPlayer && target < pointCount) {
      errors.push(`${numberOfPlayers} players × ${cardsPerPlayer} cards = ${target}, which can't hold all ${pointCount} point cards (${numberOfDecks} decks). Increase cards per player or use fewer decks.`);
    }

    return { isValid: errors.length === 0, errors, target, pointCount, totalPoints: 250 * (numberOfDecks || 0) };
  }

  /**
   * Build and deal hands for a round. All point cards from `numberOfDecks`
   * decks are dealt; each hand is filled out with zero-point cards (8s/9s) so
   * that players × cardsPerPlayer comes out exactly even.
   */
  buildHands({ numberOfPlayers, numberOfDecks, cardsPerPlayer }) {
    const v = this.validateSetup(numberOfPlayers, numberOfDecks, cardsPerPlayer);
    if (!v.isValid) throw new Error(v.errors.join('; '));

    const pointCards = this.buildPointCards(numberOfDecks);
    const filler = this.buildFillerCards(v.target - pointCards.length);
    const pool = this.shuffle([...pointCards, ...filler]);

    const hands = {};
    for (let i = 0; i < numberOfPlayers; i++) hands[i] = [];
    pool.forEach((card, idx) => { hands[idx % numberOfPlayers].push(card); });

    logger.info(`Built hands: ${numberOfPlayers}×${cardsPerPlayer}=${v.target} cards (${pointCards.length} point + ${filler.length} filler), ${v.totalPoints} pts, ${numberOfDecks} decks`);
    return { hands, totalCards: v.target, totalPoints: v.totalPoints, pointCardCount: pointCards.length, fillerCount: filler.length };
  }

  /**
   * Fisher-Yates shuffle algorithm
   */
  shuffle(deck) {
    const shuffled = [...deck];
    let currentIndex = shuffled.length;

    while (currentIndex !== 0) {
      const randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex--;

      [shuffled[currentIndex], shuffled[randomIndex]] = [
        shuffled[randomIndex],
        shuffled[currentIndex]
      ];
    }

    logger.info(`Shuffled deck of ${shuffled.length} cards`);
    return shuffled;
  }

  /**
   * Validate card distribution parameters
   */
  validateDistribution(playerCount, cardsPerPlayer) {
    const errors = [];

    if (playerCount < 4) {
      errors.push('Minimum 4 players required to start the game');
    }

    if (!cardsPerPlayer || typeof cardsPerPlayer !== 'number') {
      errors.push('cardsPerPlayer must be a valid number');
    } else if (cardsPerPlayer < 13) {
      errors.push('Each player must receive at least 13 cards');
    } else if (cardsPerPlayer > 52) {
      errors.push('Maximum 52 cards per player');
    }

    const totalCards = playerCount * cardsPerPlayer;
    if (totalCards > 208) { // 4 standard decks
      errors.push('Total cards cannot exceed 208 (4 standard decks)');
    }

    return {
      isValid: errors.length === 0,
      errors,
      totalCards
    };
  }

  /**
   * Distribute cards to players using random distribution
   * ENSURES all important cards (500 points) are always in play
   * Mixes all important cards with needed regular cards, then distributes randomly
   */
  distributeCards(deck, playerCount, cardsPerPlayer) {
    const hands = {};
    for (let i = 0; i < playerCount; i++) {
      hands[i] = [];
    }

    // Calculate total cards needed
    const totalCardsNeeded = playerCount * cardsPerPlayer;

    // Separate important cards (MUST ALL BE DEALT) from regular cards
    const importantCards = [];
    const regularCards = [];

    deck.forEach(card => {
      if (card.points > 0) {
        importantCards.push(card);
      } else {
        regularCards.push(card);
      }
    });

    logger.info(`Deck has ${importantCards.length} important cards (${this.calculateTotalPointsFromArray(importantCards)} points) and ${regularCards.length} regular cards`);

    // Calculate how many regular cards we need
    const regularCardsNeeded = totalCardsNeeded - importantCards.length;

    // Check if we have enough capacity for all important cards
    if (totalCardsNeeded < importantCards.length) {
      logger.error(`ERROR: Cannot fit all ${importantCards.length} important cards into ${totalCardsNeeded} total slots!`);
      throw new Error(`Not enough card slots for all important cards. Need at least ${Math.ceil(importantCards.length / playerCount)} cards per player.`);
    }

    // Take all important cards + needed regular cards
    const selectedRegularCards = regularCards.slice(0, regularCardsNeeded);
    const cardsToDeal = [...importantCards, ...selectedRegularCards];

    // Shuffle the combined pile for randomness
    const shuffledCards = this.shuffle(cardsToDeal);

    logger.info(`Dealing ${shuffledCards.length} cards: ALL ${importantCards.length} important cards (${this.calculateTotalPointsFromArray(importantCards)} points) + ${selectedRegularCards.length} regular cards`);

    // Distribute randomly using round-robin from the shuffled pile
    let cardIndex = 0;
    let playerIndex = 0;

    while (cardIndex < shuffledCards.length) {
      hands[playerIndex].push(shuffledCards[cardIndex]);
      cardIndex++;
      playerIndex = (playerIndex + 1) % playerCount; // Move to next player
    }

    // Log final distribution
    logger.info(`Random distribution complete:`);
    let totalPointsDealt = 0;
    for (let i = 0; i < playerCount; i++) {
      const handPoints = this.calculateTotalPointsFromArray(hands[i]);
      totalPointsDealt += handPoints;
      const importantCount = hands[i].filter(c => c.points > 0).length;
      const regularCount = hands[i].filter(c => c.points === 0).length;
      logger.info(`Player ${i}: ${hands[i].length} cards (${importantCount} important, ${regularCount} regular, ${handPoints} points)`);
    }
    logger.info(`TOTAL POINTS IN PLAY: ${totalPointsDealt}`);

    return hands;
  }

  /**
   * Calculate total points from an array of cards
   */
  calculateTotalPointsFromArray(cards) {
    return cards.reduce((sum, card) => sum + card.points, 0);
  }

  /**
   * Sort cards by suit and rank for display
   */
  sortCards(cards) {
    const suitOrder = { 'spades': 0, 'hearts': 1, 'diamonds': 2, 'clubs': 3 };
    const rankOrder = {
      'A': 12, 'K': 11, 'Q': 10, 'J': 9,
      '10': 8, '9': 7, '8': 6, '7': 5,
      '6': 4, '5': 3, '4': 2, '3': 1, '2': 0
    };

    return [...cards].sort((a, b) => {
      if (suitOrder[a.suit] !== suitOrder[b.suit]) {
        return suitOrder[a.suit] - suitOrder[b.suit];
      }
      return rankOrder[b.rank] - rankOrder[a.rank];
    });
  }

  /**
   * Get card summary for logging/debugging
   */
  getCardSummary(card) {
    return `${card.rank} of ${card.suit} (${card.points} pts)`;
  }
}

export const deckService = new DeckService();
