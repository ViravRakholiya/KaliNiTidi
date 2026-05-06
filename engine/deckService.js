import { logger } from '../utils/logger.js';

class DeckService {
  constructor() {
    this.ranks = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
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

    if (playerCount % 2 !== 0) {
      errors.push('Number of players must be even (4, 6, 8, 10, ...)');
    }

    if (!cardsPerPlayer || typeof cardsPerPlayer !== 'number') {
      errors.push('cardsPerPlayer must be a valid number');
    } else if (cardsPerPlayer < 11) {
      errors.push('Each player must receive at least 11 cards');
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
   * Distribute cards to players using the Blacks 3 distribution pattern
   * ALL important cards are dealt first, then fill remaining with regular cards
   */
  distributeCards(deck, playerCount, cardsPerPlayer) {
    const hands = {};
    for (let i = 0; i < playerCount; i++) {
      hands[i] = [];
    }

    // Separate important cards (high point cards) from regular cards
    const importantCards = [];
    const regularCards = [];

    deck.forEach(card => {
      if (card.points > 0) {
        importantCards.push(card);
      } else {
        regularCards.push(card);
      }
    });

    // Shuffle both piles
    const shuffledImportant = this.shuffle(importantCards);
    const shuffledRegular = this.shuffle(regularCards);

    logger.info(`Important cards: ${shuffledImportant.length} (${this.calculateTotalPointsFromArray(shuffledImportant)} points)`);
    logger.info(`Regular cards: ${shuffledRegular.length} (${this.calculateTotalPointsFromArray(shuffledRegular)} points)`);

    // Deal ALL important cards first (round-robin to all players)
    let importantCardIndex = 0;
    let regularCardIndex = 0;

    // Deal every important card to players (round-robin)
    while (importantCardIndex < shuffledImportant.length) {
      for (let i = 0; i < playerCount && importantCardIndex < shuffledImportant.length; i++) {
        if (hands[i].length < cardsPerPlayer) {
          hands[i].push(shuffledImportant[importantCardIndex++]);
        }
      }
    }

    logger.info(`All important cards dealt. Now filling with regular cards...`);

    // Fill remaining slots with regular cards
    for (let i = 0; i < playerCount && regularCardIndex < shuffledRegular.length; i++) {
      while (hands[i].length < cardsPerPlayer && regularCardIndex < shuffledRegular.length) {
        hands[i].push(shuffledRegular[regularCardIndex++]);
      }
    }

    // Log final distribution
    for (let i = 0; i < playerCount; i++) {
      const handPoints = this.calculateTotalPointsFromArray(hands[i]);
      logger.info(`Player ${i}: ${hands[i].length} cards (${handPoints} points)`);
    }

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
