import { deckService } from '../engine/deckService.js';
import { logger } from '../utils/logger.js';
import { roomService } from './roomService.js';
import { biddingService } from './biddingService.js';

class GameService {
  constructor() {
    this.activeGames = new Map(); // roomId -> game state
  }

  /**
   * Validate game start parameters
   */
  validateGameStart(room, socketId, cardsPerPlayer) {
    const errors = [];

    if (room.hostId !== socketId) {
      errors.push('Only the host can start the game');
    }

    if (room.status !== 'waiting') {
      errors.push('Game has already been started');
    }

    // Validate distribution
    const distributionValidation = deckService.validateDistribution(
      room.players.length,
      cardsPerPlayer
    );

    if (!distributionValidation.isValid) {
      errors.push(...distributionValidation.errors);
    }

    return {
      isValid: errors.length === 0,
      errors,
      totalCards: distributionValidation.totalCards
    };
  }

  /**
   * Start a new game
   */
  startGame(roomId, socketId, options = {}) {
    const room = roomService.getRoom(roomId);

    if (!room) {
      return {
        success: false,
        error: 'ROOM_NOT_FOUND',
        message: 'Room does not exist'
      };
    }

    const cardsPerPlayer = options.cardsPerPlayer || 11;
    const numberOfPlayers = options.numberOfPlayers || room.players.length;
    const numberOfSets = options.numberOfSets || 2;

    // Validate game start
    const validation = this.validateGameStart(room, socketId, cardsPerPlayer);

    if (!validation.isValid) {
      return {
        success: false,
        error: 'VALIDATION_FAILED',
        message: validation.errors.join(', ')
      };
    }

    try {
      // Generate deck with specified number of sets
      const deck = deckService.generateDeckWithSets(validation.totalCards, numberOfSets);

      // Shuffle deck
      const shuffledDeck = deckService.shuffle(deck);

      // Distribute cards with important cards prioritized
      const hands = deckService.distributeCards(
        shuffledDeck,
        numberOfPlayers,
        cardsPerPlayer
      );

      // Create game state with bidding
      const gameState = {
        roomId,
        started: true,
        phase: 'bidding', // bidding | selection | playing
        cardsPerPlayer,
        totalCards: validation.totalCards,
        currentTurn: 0,
        direction: 1,
        hands: {},
        players: room.players.map(p => ({
          socketId: p.socketId,
          name: p.name,
          isHost: p.isHost,
          score: 0,
          cardsInHand: cardsPerPlayer
        })),
        startedAt: new Date().toISOString(),
        bidding: null,
        trump: null,
        partnerCard: null,
        partnerCards: [],
        leader: null,
        numberOfPlayers: numberOfPlayers,
        numberOfSets: numberOfSets
      };

      // Map hands to socket IDs
      room.players.forEach((player, index) => {
        gameState.hands[player.socketId] = hands[index];
      });

      // Initialize bidding with number of sets
      const biddingState = biddingService.initializeBidding(roomId, gameState, numberOfSets);
      gameState.bidding = biddingState;

      // Store game state
      this.activeGames.set(roomId, gameState);

      // Update room status
      roomService.updateRoomStatus(roomId, 'playing');

      logger.info(`Game started in room ${roomId} with ${numberOfPlayers} players, ${numberOfSets} sets, phase: bidding`);

      return {
        success: true,
        gameState,
        players: gameState.players,
        cardsPerPlayer,
        totalCards: validation.totalCards,
        numberOfPlayers,
        numberOfSets,
        bidding: biddingState
      };

    } catch (error) {
      logger.error('Error starting game:', error);
      return {
        success: false,
        error: 'GAME_START_ERROR',
        message: error.message
      };
    }
  }

  /**
   * Start bidding phase
   */
  startBidding(roomId) {
    const gameState = this.activeGames.get(roomId);

    if (!gameState) {
      return {
        success: false,
        error: 'GAME_NOT_FOUND',
        message: 'Game does not exist'
      };
    }

    const bidding = biddingService.getBiddingState(roomId);

    if (!bidding) {
      return {
        success: false,
        error: 'BIDDING_NOT_INITIALIZED',
        message: 'Bidding not initialized'
      };
    }

    gameState.phase = 'bidding';

    return {
      success: true,
      minBid: bidding.minimumBid,
      currentTurn: bidding.playersOrder[bidding.currentTurnIndex],
      totalPoints: bidding.totalPoints
    };
  }

  /**
   * Get a player's hand (private)
   */
  getPlayerHand(roomId, socketId) {
    const gameState = this.activeGames.get(roomId);

    if (!gameState) {
      return {
        success: false,
        error: 'GAME_NOT_FOUND',
        message: 'Game does not exist'
      };
    }

    const hand = gameState.hands[socketId];

    if (!hand) {
      return {
        success: false,
        error: 'PLAYER_NOT_IN_GAME',
        message: 'Player not in this game'
      };
    }

    return {
      success: true,
      cards: hand
    };
  }

  /**
   * Get game state (public - without hands)
   */
  getGameState(roomId) {
    const gameState = this.activeGames.get(roomId);

    if (!gameState) {
      return {
        success: false,
        error: 'GAME_NOT_FOUND',
        message: 'Game does not exist'
      };
    }

    // Get bidding info if available
    let biddingInfo = null;
    if (gameState.phase === 'bidding' || gameState.phase === 'selection') {
      const bidInfo = biddingService.getBiddingInfo(roomId);
      if (bidInfo.success) {
        biddingInfo = bidInfo.bidding;
      }
    }

    // Return public game state without card data
    const publicState = {
      roomId: gameState.roomId,
      started: gameState.started,
      phase: gameState.phase,
      cardsPerPlayer: gameState.cardsPerPlayer,
      totalCards: gameState.totalCards,
      currentTurn: gameState.currentTurn,
      direction: gameState.direction,
      players: gameState.players,
      startedAt: gameState.startedAt,
      bidding: biddingInfo,
      trump: gameState.trump,
      partnerCard: gameState.partnerCard,
      leader: gameState.leader
    };

    return {
      success: true,
      gameState: publicState
    };
  }

  /**
   * Place a bid
   */
  placeBid(roomId, socketId, bidValue) {
    const gameState = this.activeGames.get(roomId);

    if (!gameState) {
      return {
        success: false,
        error: 'GAME_NOT_FOUND',
        message: 'Game does not exist'
      };
    }

    if (gameState.phase !== 'bidding') {
      return {
        success: false,
        error: 'NOT_BIDDING_PHASE',
        message: 'Cannot bid - not in bidding phase'
      };
    }

    return biddingService.placeBid(roomId, socketId, bidValue);
  }

  /**
   * Pass bidding
   */
  passBid(roomId, socketId) {
    const gameState = this.activeGames.get(roomId);

    if (!gameState) {
      return {
        success: false,
        error: 'GAME_NOT_FOUND',
        message: 'Game does not exist'
      };
    }

    if (gameState.phase !== 'bidding') {
      return {
        success: false,
        error: 'NOT_BIDDING_PHASE',
        message: 'Cannot pass - not in bidding phase'
      };
    }

    const result = biddingService.passBid(roomId, socketId);

    if (result.success) {
      // Check if bidding should end
      if (biddingService.shouldEndBidding(roomId)) {
        gameState.phase = 'selection';
        return {
          ...result,
          biddingEnded: true,
          endResult: biddingService.endBidding(roomId)
        };
      }
    }

    return result;
  }

  /**
   * Select trump suit
   */
  selectTrump(roomId, socketId, suit) {
    const gameState = this.activeGames.get(roomId);

    if (!gameState) {
      return {
        success: false,
        error: 'GAME_NOT_FOUND',
        message: 'Game does not exist'
      };
    }

    if (gameState.phase !== 'selection') {
      return {
        success: false,
        error: 'NOT_SELECTION_PHASE',
        message: 'Cannot select trump - not in selection phase'
      };
    }

    const result = biddingService.selectTrump(roomId, socketId, suit);

    if (result.success) {
      gameState.trump = suit;
    }

    return result;
  }

  /**
   * Select partner card
   */
  selectPartnerCard(roomId, socketId, rank, suit) {
    const gameState = this.activeGames.get(roomId);

    if (!gameState) {
      return {
        success: false,
        error: 'GAME_NOT_FOUND',
        message: 'Game does not exist'
      };
    }

    if (gameState.phase !== 'selection') {
      return {
        success: false,
        error: 'NOT_SELECTION_PHASE',
        message: 'Cannot select partner - not in selection phase'
      };
    }

    const result = biddingService.selectPartnerCard(roomId, socketId, rank, suit);

    if (result.success) {
      // Store partner cards in game state
      if (!gameState.partnerCards) {
        gameState.partnerCards = [];
      }
      gameState.partnerCards.push({ rank, suit });
      gameState.leader = socketId;

      // Check if all partner cards are selected and we can complete selection
      const bidding = biddingService.activeBiddings.get(roomId);
      if (bidding && gameState.trump && result.allPartnersSelected) {
        const completeResult = biddingService.completeSelection(roomId);
        if (completeResult.success) {
          gameState.phase = 'playing';

          // Find and identify all partners
          const partnerSocketIds = biddingService.findPartners(roomId, gameState.hands);
          gameState.partnerIds = partnerSocketIds;

          return {
            success: true,
            ...completeResult,
            phase: 'playing',
            partnerIds: partnerSocketIds
          };
        }
      }

      return {
        success: true,
        ...result,
        canComplete: result.allPartnersSelected
      };
    }

    return result;
  }

  /**
   * Play a card (for future card play logic)
   */
  playCard(roomId, socketId, cardId) {
    const gameState = this.activeGames.get(roomId);

    if (!gameState) {
      return {
        success: false,
        error: 'GAME_NOT_FOUND',
        message: 'Game does not exist'
      };
    }

    if (gameState.phase !== 'playing') {
      return {
        success: false,
        error: 'NOT_PLAYING_PHASE',
        message: 'Cannot play card - game not in playing phase'
      };
    }

    const hand = gameState.hands[socketId];

    if (!hand) {
      return {
        success: false,
        error: 'PLAYER_NOT_IN_GAME',
        message: 'Player not in this game'
      };
    }

    // Find card in hand
    const cardIndex = hand.findIndex(c => c.id === cardId);

    if (cardIndex === -1) {
      return {
        success: false,
        error: 'CARD_NOT_IN_HAND',
        message: 'Card not found in player\'s hand'
      };
    }

    const playedCard = hand.splice(cardIndex, 1)[0];

    // Update player's card count
    const player = gameState.players.find(p => p.socketId === socketId);
    if (player) {
      player.cardsInHand = hand.length;
    }

    logger.info(`Player ${socketId} played card: ${deckService.getCardSummary(playedCard)}`);

    return {
      success: true,
      card: playedCard,
      cardsRemaining: hand.length
    };
  }

  /**
   * End game and clean up
   */
  endGame(roomId) {
    const gameState = this.activeGames.get(roomId);

    if (!gameState) {
      return {
        success: false,
        error: 'GAME_NOT_FOUND',
        message: 'Game does not exist'
      };
    }

    // Clean up bidding state
    biddingService.cleanup(roomId);

    this.activeGames.delete(roomId);
    roomService.updateRoomStatus(roomId, 'completed');

    logger.info(`Game ended in room ${roomId}`);

    return {
      success: true,
      message: 'Game ended successfully'
    };
  }

  /**
   * Check if game exists
   */
  hasGame(roomId) {
    return this.activeGames.has(roomId);
  }

  /**
   * Get active game count
   */
  getActiveGameCount() {
    return this.activeGames.size;
  }
}

export const gameService = new GameService();
