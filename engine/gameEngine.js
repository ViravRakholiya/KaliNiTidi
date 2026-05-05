import { logger } from '../utils/logger.js';

class GameEngine {
  constructor() {
    this.gameStates = new Map();
  }

  initialize(game) {
    const initialState = {
      ...game,
      currentTurn: 0,
      direction: 1,
      drawPile: this.createDeck(),
      discardPile: [],
      currentColor: null,
      currentSuit: null
    };

    this.dealCards(initialState);

    const topCard = initialState.discardPile[initialState.discardPile.length - 1];
    initialState.currentColor = topCard.color;
    initialState.currentSuit = topCard.suit;

    this.gameStates.set(game.id, initialState);

    return initialState;
  }

  createDeck() {
    const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

    const deck = [];

    for (const suit of suits) {
      for (const rank of ranks) {
        deck.push({
          id: `${suit}_${rank}`,
          suit,
          rank,
          color: suit === 'hearts' || suit === 'diamonds' ? 'red' : 'black',
          value: this.getCardValue(rank)
        });
      }
    }

    return this.shuffle(deck);
  }

  getCardValue(rank) {
    const values = {
      'A': 14, 'K': 13, 'Q': 12, 'J': 11,
      '10': 10, '9': 9, '8': 8, '7': 7,
      '6': 6, '5': 5, '4': 4, '3': 3, '2': 2
    };
    return values[rank] || 0;
  }

  shuffle(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  dealCards(gameState) {
    const cardsPerPlayer = 7;

    gameState.players.forEach(player => {
      player.hand = gameState.drawPile.splice(0, cardsPerPlayer);
    });

    gameState.discardPile.push(gameState.drawPile.pop());
  }

  playCard(game, userId, cardId) {
    const gameState = this.gameStates.get(game.id);

    if (!gameState) {
      return { success: false, message: 'Game state not found' };
    }

    const currentPlayer = gameState.players[gameState.currentTurn];

    if (currentPlayer.userId !== userId) {
      return { success: false, message: 'Not your turn' };
    }

    const cardIndex = currentPlayer.hand.findIndex(c => c.id === cardId);

    if (cardIndex === -1) {
      return { success: false, message: 'Card not in hand' };
    }

    const card = currentPlayer.hand[cardIndex];

    if (!this.isValidPlay(card, gameState)) {
      return { success: false, message: 'Invalid play' };
    }

    currentPlayer.hand.splice(cardIndex, 1);
    gameState.discardPile.push(card);
    gameState.currentColor = card.color;
    gameState.currentSuit = card.suit;

    this.applyCardEffect(card, gameState);

    if (currentPlayer.hand.length === 0) {
      gameState.status = 'completed';
      gameState.winner = currentPlayer.userId;
      return { success: true, card, gameState };
    }

    this.nextTurn(gameState);
    this.gameStates.set(game.id, gameState);

    return { success: true, card, gameState };
  }

  isValidPlay(card, gameState) {
    if (card.color === 'black') return true;

    const topCard = gameState.discardPile[gameState.discardPile.length - 1];

    return card.color === gameState.currentColor ||
           card.suit === gameState.currentSuit ||
           card.rank === topCard.rank;
  }

  applyCardEffect(card, gameState) {
    switch (card.rank) {
      case 'J':
        gameState.currentTurn = (gameState.currentTurn + gameState.direction * 2) % gameState.players.length;
        break;
      case 'A':
        gameState.direction *= -1;
        break;
      case '2':
        this.drawCards(gameState, (gameState.currentTurn + gameState.direction) % gameState.players.length, 2);
        break;
    }
  }

  drawCards(gameState, playerIndex, count) {
    const player = gameState.players[playerIndex];

    for (let i = 0; i < count; i++) {
      if (gameState.drawPile.length === 0) {
        this.reshuffleDiscardPile(gameState);
      }

      if (gameState.drawPile.length > 0) {
        player.hand.push(gameState.drawPile.pop());
      }
    }
  }

  reshuffleDiscardPile(gameState) {
    if (gameState.discardPile.length <= 1) return;

    const topCard = gameState.discardPile.pop();
    gameState.drawPile = this.shuffle(gameState.discardPile);
    gameState.discardPile = [topCard];
  }

  nextTurn(gameState) {
    gameState.currentTurn = (gameState.currentTurn + gameState.direction) % gameState.players.length;
    if (gameState.currentTurn < 0) {
      gameState.currentTurn += gameState.players.length;
    }
  }

  getGameState(gameId) {
    return this.gameStates.get(gameId);
  }
}

export const gameEngine = new GameEngine();
