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

    // Allow starting a new game if there's no active game state (or only a completed game)
    // This works for both first game and subsequent rounds
    const existingGame = this.activeGames.get(room.roomId);
    const hasActiveGame = existingGame && existingGame.phase !== 'completed';
    logger.info(`[DEBUG] validateGameStart: room=${room.roomId}, status=${room.status}, hasActiveGame=${hasActiveGame}, existingGamePhase=${existingGame?.phase}, activeGamesSize=${this.activeGames.size}`);
    if (hasActiveGame) {
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
      logger.info('[DEBUG] About to generate deck...');

      // Clean up any completed game before starting a new one
      const existingGame = this.activeGames.get(roomId);
      if (existingGame) {
        logger.info(`[DEBUG] Found existing game in room ${roomId}, phase: ${existingGame.phase}`);
        // Check if game is completed or has no cards (both indicate a finished game)
        const totalCardsInHands = Object.values(existingGame.hands || {}).reduce((sum, hand) => sum + hand.length, 0);
        const isCompleted = existingGame.phase === 'completed' || totalCardsInHands === 0;

        if (isCompleted) {
          logger.info(`[DEBUG] Cleaning up completed/empty game in room ${roomId} before starting new game (phase: ${existingGame.phase}, cards in hands: ${totalCardsInHands})`);
          biddingService.cleanup(roomId);
          this.activeGames.delete(roomId);
        } else {
          logger.warn(`[DEBUG] Existing game in room ${roomId} is not completed (phase: ${existingGame.phase}, cards: ${totalCardsInHands})`);
          return {
            success: false,
            error: 'VALIDATION_FAILED',
            message: 'A game is already in progress'
          };
        }
      }

      // Generate deck with specified number of sets
      const deck = deckService.generateDeckWithSets(validation.totalCards, numberOfSets);
      logger.info('[DEBUG] Deck generated successfully');

      logger.info('[DEBUG] About to shuffle deck...');
      // Shuffle deck
      const shuffledDeck = deckService.shuffle(deck);
      logger.info('[DEBUG] Deck shuffled successfully');

      logger.info('[DEBUG] About to distribute cards...');
      // Distribute cards with important cards prioritized
      const hands = deckService.distributeCards(
        shuffledDeck,
        numberOfPlayers,
        cardsPerPlayer
      );
      logger.info('[DEBUG] Cards distributed successfully, hands:', Object.keys(hands));

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
      logger.info('[DEBUG] About to map hands to socket IDs...');
      room.players.forEach((player, index) => {
        gameState.hands[player.socketId] = hands[index];
      });
      logger.info('[DEBUG] Hands mapped successfully');

      // Calculate round number BEFORE initializing bidding (important for rotation)
      const isSubsequentRound = room.status === 'playing';
      const roundNumber = isSubsequentRound ? (room.currentRound || 1) + 1 : 1;
      gameState.roundNumber = roundNumber;

      // Initialize bidding with number of sets and round number
      logger.info('[DEBUG] About to initialize bidding...');
      const biddingState = biddingService.initializeBidding(roomId, gameState, numberOfSets, roundNumber);
      logger.info('[DEBUG] Bidding initialized successfully');
      gameState.bidding = biddingState;

      // Store game state
      logger.info('[DEBUG] About to store game state...');
      this.activeGames.set(roomId, gameState);
      logger.info('[DEBUG] Game state stored successfully');

      // Update room status
      logger.info('[DEBUG] About to update room status...');
      roomService.updateRoomStatus(roomId, 'playing');
      logger.info('[DEBUG] Room status updated successfully');

      logger.info(`Game started in room ${roomId} with ${numberOfPlayers} players, ${numberOfSets} sets, phase: bidding`);

      return {
        success: true,
        gameState,
        players: gameState.players,
        cardsPerPlayer,
        totalCards: validation.totalCards,
        numberOfPlayers,
        numberOfSets,
        bidding: biddingState,
        roundNumber,
        isSubsequentRound
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
        const endResult = biddingService.endBidding(roomId);

        // Handle the case where everyone passed
        if (endResult.allPassed || !endResult.leader) {
          return {
            ...result,
            biddingEnded: true,
            endResult: endResult,
            allPassed: true
          };
        }

        gameState.phase = 'selection';
        return {
          ...result,
          biddingEnded: true,
          endResult: endResult
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
   * Start gameplay after trump and partner card selection
   */
  startGameplay(roomId, socketId) {
    logger.info(`[DEBUG] START_GAMEPLAY called for room ${roomId} by socket ${socketId.substring(0, 8)}...`);
    logger.info(`[DEBUG] Active games: ${Array.from(this.activeGames.keys()).join(', ')}`);

    const gameState = this.activeGames.get(roomId);

    if (!gameState) {
      logger.error(`[DEBUG] START_GAMEPLAY: No game state found for room ${roomId}`);
      return {
        success: false,
        error: 'GAME_NOT_FOUND',
        message: 'Game does not exist'
      };
    }

    logger.info(`[DEBUG] START_GAMEPLAY: Found game state for room ${roomId}, phase: ${gameState.phase}, players: ${gameState.players.length}`);

    // DEBUG: Check if hands have cards
    logger.info(`[DEBUG] START_GAMEPLAY: Checking hands before starting gameplay...`);
    Object.entries(gameState.hands).forEach(([playerSocketId, hand]) => {
      const player = gameState.players.find(p => p.socketId === playerSocketId);
      logger.info(`[DEBUG] START_GAMEPLAY: Player ${player?.name || playerSocketId.substring(0, 8)} has ${hand.length} cards`);
    });

    const totalCardsInHands = Object.values(gameState.hands).reduce((sum, hand) => sum + hand.length, 0);
    if (totalCardsInHands === 0) {
      logger.error(`[DEBUG] START_GAMEPLAY: ERROR - No cards in any hands! Cannot start gameplay.`);
      return {
        success: false,
        error: 'NO_CARDS_DEALT',
        message: 'No cards have been dealt. Cannot start gameplay.'
      };
    }

    // Check if player is the leader
    const bidding = biddingService.activeBiddings.get(roomId);
    if (!bidding || bidding.highestBidder !== socketId) {
      return {
        success: false,
        error: 'NOT_LEADER',
        message: 'Only the leader can start the game'
      };
    }

    if (!bidding.trump) {
      return {
        success: false,
        error: 'TRUMP_NOT_SELECTED',
        message: 'Trump must be selected first'
      };
    }

    if (!bidding.partnerCards || bidding.partnerCards.length === 0) {
      return {
        success: false,
        error: 'PARTNER_CARD_NOT_SELECTED',
        message: 'Partner card must be selected first'
      };
    }

    // Transition to playing phase
    gameState.phase = 'playing';
    gameState.leader = socketId;
    gameState.trump = bidding.trump;
    gameState.partnerCard = bidding.partnerCards[0]; // First (and only) partner card

    // Track bidding information for scoring
    gameState.bidWinner = bidding.highestBidder;
    gameState.winningBid = bidding.currentBid;
    gameState.minimumBid = bidding.minimumBid;
    gameState.totalPointsInDeck = bidding.totalPoints;

    // Initialize current trick with leader starting
    gameState.currentTrick = {
      cards: [],
      ledSuit: null,
      currentPlayerIndex: gameState.players.findIndex(p => p.socketId === socketId)
    };

    // Track partner card plays for dynamic team assignment
    gameState.partnerCardPlays = []; // Will track who plays the partner card
    gameState.teamsAssigned = false; // Will be set to true after both partner card holders have played

    // Debug: Log cards in each hand
    logger.info(`[DEBUG] Cards in hands at START_GAMEPLAY:`);
    Object.entries(gameState.hands).forEach(([socketId, hand]) => {
      const player = gameState.players.find(p => p.socketId === socketId);
      logger.info(`[DEBUG]   ${player?.name || socketId.substring(0, 8)}: ${hand.length} cards`);
    });

    logger.info(`Gameplay started in room ${roomId}. Leader: ${socketId.substring(0, 8)}..., Trump: ${gameState.trump}, Partner Card: ${gameState.partnerCard.rank} of ${gameState.partnerCard.suit}, Bid: ${gameState.winningBid}`);
    logger.info(`[DEBUG] Partner card for tracking: Rank=${gameState.partnerCard.rank}, Suit=${gameState.partnerCard.suit}`);

    return {
      success: true,
      gameState,
      trump: gameState.trump,
      partnerCard: gameState.partnerCard,
      leader: socketId,
      winningBid: gameState.winningBid,
      bidWinner: gameState.bidWinner
    };
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
      // Store partner card in game state (leader will manually start gameplay)
      if (!gameState.partnerCards) {
        gameState.partnerCards = [];
      }
      gameState.partnerCards.push({ rank, suit });
      gameState.leader = socketId;

      // Return success without automatically completing selection
      return {
        success: true,
        partnerCard: { rank, suit },
        selectedCount: gameState.partnerCards.length
      };
    }

    return result;
  }

  /**
   * Play a card with full gameplay logic
   */
  playCard(roomId, socketId, cardId) {
    try {
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

      // Initialize current trick if needed
      if (!gameState.currentTrick) {
        gameState.currentTrick = {
          cards: [],
          ledSuit: null,
          currentPlayerIndex: gameState.players.findIndex(p => p.socketId === gameState.leader)
        };
      }

      // Check if it's this player's turn
      const currentPlayerSocketId = gameState.players[gameState.currentTrick.currentPlayerIndex].socketId;
      if (currentPlayerSocketId !== socketId) {
        return {
          success: false,
          error: 'NOT_YOUR_TURN',
          message: 'It is not your turn to play'
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

      const playedCard = hand[cardIndex];
      const player = gameState.players.find(p => p.socketId === socketId);

      // Check if this card is the partner card (only if partner card is set)
      let isPartnerCard = false;
      if (gameState.partnerCard && playedCard) {
        isPartnerCard = playedCard.rank === gameState.partnerCard.rank &&
                        playedCard.suit === gameState.partnerCard.suit;

        logger.info(`[PARTNER CHECK] Player played: ${playedCard.rank} of ${playedCard.suit}, Partner card: ${gameState.partnerCard.rank} of ${gameState.partnerCard.suit}, Match: ${isPartnerCard}`);
      } else {
        logger.info(`[PARTNER CHECK] Partner card not set (${!gameState.partnerCard}) or card not found`);
      }

      // Track partner card plays for dynamic team assignment
      if (isPartnerCard && gameState.partnerCardPlays) {
        const alreadyPlayed = gameState.partnerCardPlays.find(p => p.playerId === socketId);

        if (!alreadyPlayed) {
          gameState.partnerCardPlays.push({
            playerId: socketId,
            playerName: player.name,
            card: playedCard,
            timestamp: new Date().toISOString()
          });

          logger.info(`Partner card played by ${player.name} (${socketId.substring(0, 8)}...) - Play #${gameState.partnerCardPlays.length}`);

          // Prevent bidder from becoming their own partner
          if (socketId === gameState.bidWinner) {
            logger.info(`Skipping partner assignment - bidder cannot be their own partner`);
          } else if (gameState.partnerId) {
            // Partner already assigned, log but don't re-assign
            logger.info(`Partner already assigned to ${gameState.partnerId.substring(0, 8)}... - skipping re-assignment for ${player.name} (${socketId.substring(0, 8)}...)`);
          } else {
            // Check partner assignment based on preferred position
            const bidding = biddingService.activeBiddings.get(roomId);
            const preferredPosition = bidding?.partnerCards[0]?.preferredPosition;

            // Count non-bidder partner card plays
            const nonBidderPlays = gameState.partnerCardPlays.filter(p => p.playerId !== gameState.bidWinner);
            const playCount = nonBidderPlays.length;

            logger.info(`[PARTNER ASSIGNMENT CHECK] Player: ${player.name}, PlayCount: ${playCount}, PreferredPosition: ${preferredPosition || 'none'}`);

            if (preferredPosition && playCount === preferredPosition) {
              // Leader's preferred position player becomes partner
              gameState.partnerId = socketId;
              gameState.partnerAssignedAt = Date.now();

              logger.info(`PARTNER ASSIGNED (Preferred Position ${preferredPosition}): ${player.name} (${socketId.substring(0, 8)}...) is now the partner!`);

              gameState.teamsAssigned = true;

              // Set partner assignment info for result (to be sent to clients)
              result.partnerAssigned = true;
              result.partnerId = socketId;
              result.partnerName = player.name;
            } else if (playCount === 1 && !preferredPosition) {
              // First non-bidder player to play partner card becomes partner (no preference)
              gameState.partnerId = socketId;
              gameState.partnerAssignedAt = Date.now();

              logger.info(`PARTNER ASSIGNED: ${player.name} (${socketId.substring(0, 8)}...) is now the partner!`);

              // Set partner assignment info for result (to be sent to clients)
              result.partnerAssigned = true;
              result.partnerId = socketId;
              result.partnerName = player.name;
            } else if (playCount === 2 && !preferredPosition) {
              // Second non-bidder player to play partner card becomes opponent
              logger.info(`SECOND PARTNER CARD PLAYED: ${player.name} (${socketId.substring(0, 8)}...) is now an opponent!`);
              gameState.teamsAssigned = true;

              // Set opponent assignment info for result
              result.secondPartnerCardPlayed = true;
              result.opponentId = socketId;
              result.opponentName = player.name;
            } else if (playCount === 2 && preferredPosition) {
              // Second non-bidder player played (not the preferred position) - becomes opponent
              logger.info(`SECOND PARTNER CARD PLAYED: ${player.name} (${socketId.substring(0, 8)}...) is now an opponent!`);
              gameState.teamsAssigned = true;

              // Set opponent assignment info for result
              result.secondPartnerCardPlayed = true;
              result.opponentId = socketId;
              result.opponentName = player.name;
            }
          }
        }
      }

      // Validate follow suit rule
      if (gameState.currentTrick.ledSuit) {
        const hasLedSuit = hand.some(c => c.suit === gameState.currentTrick.ledSuit);

        if (hasLedSuit && playedCard.suit !== gameState.currentTrick.ledSuit) {
          return {
            success: false,
            error: 'MUST_FOLLOW_SUIT',
            message: `You must follow suit (${gameState.currentTrick.ledSuit}) if you have it`
          };
        }
      }

      // Remove card from hand and add to trick
      hand.splice(cardIndex, 1);
      gameState.currentTrick.cards.push({
        playerId: socketId,
        card: playedCard
      });

      // Set led suit if this is the first card
      if (gameState.currentTrick.cards.length === 1) {
        gameState.currentTrick.ledSuit = playedCard.suit;
      }

      // Update player's card count
      if (player) {
        player.cardsInHand = hand.length;
      }

      logger.info(`Player ${socketId.substring(0, 8)}... played ${playedCard.rank} of ${playedCard.suit}`);

      const result = {
        success: true,
        card: playedCard,
        cardsRemaining: hand.length,
        partnerCardPlayed: isPartnerCard
      };

      // Check if trick is complete
      if (gameState.currentTrick.cards.length === gameState.players.length) {
        // Ensure ledSuit is properly set before determining winner
        if (!gameState.currentTrick.ledSuit && gameState.currentTrick.cards.length > 0) {
          gameState.currentTrick.ledSuit = gameState.currentTrick.cards[0].card.suit;
        }

        logger.info(`[Trick Evaluation] Led suit: ${gameState.currentTrick.ledSuit}, Trump: ${gameState.trump}`);
        gameState.currentTrick.cards.forEach((played, idx) => {
          logger.info(`  [Card ${idx + 1}] ${played.card.rank} of ${played.card.suit} by Player ${played.playerId.substring(0, 8)}...`);
        });

        const trickWinner = this.determineTrickWinner(gameState.currentTrick, gameState.trump);
        const trickPoints = this.calculateTrickPoints(gameState.currentTrick.cards);

        // Award individual points to trick winner during gameplay
        const winnerPlayer = gameState.players.find(p => p.socketId === trickWinner);
        if (winnerPlayer) {
          winnerPlayer.score += trickPoints;
          logger.info(`Awarded ${trickPoints} points to ${winnerPlayer.name} (${trickWinner.substring(0, 8)}...) - Individual score: ${winnerPlayer.score}`);
        }

        result.trickComplete = true;
        result.trickWinner = trickWinner;
        result.trickPoints = trickPoints;
        result.trickCards = [...gameState.currentTrick.cards];

        // Clear current trick
        gameState.currentTrick = {
          cards: [],
          ledSuit: null,
          currentPlayerIndex: gameState.players.findIndex(p => p.socketId === trickWinner)
        };

        // Check if game is over (all cards played)
        const anyCardsRemaining = Object.values(gameState.hands).some(h => h.length > 0);
        if (!anyCardsRemaining) {
          result.gameOver = true;

          logger.info(`All cards played. Calculating final scores...`);

          // DEBUG: Log partner assignment status
          if (!gameState.partnerId) {
            logger.warn(`[PARTNER ASSIGNMENT WARNING] No partner assigned! Partner card plays: ${JSON.stringify(gameState.partnerCardPlays?.map(p => ({ name: p.playerName, card: `${p.card.rank} of ${p.card.suit}` }))) || '[]'}`);

            // FALLBACK: Try to assign partner based on who played the partner card
            if (gameState.partnerCardPlays && gameState.partnerCardPlays.length > 0) {
              const nonBidderPlays = gameState.partnerCardPlays.filter(p => p.playerId !== gameState.bidWinner);
              if (nonBidderPlays.length > 0) {
                // Assign the first non-bidder who played the partner card as the partner
                const fallbackPartner = nonBidderPlays[0];
                gameState.partnerId = fallbackPartner.playerId;
                logger.warn(`[PARTNER FALLBACK] Assigned ${fallbackPartner.playerName} (${fallbackPartner.playerId.substring(0, 8)}...) as partner (fallback assignment)`);
              }
            }
          }

          // Calculate final team scores
          const finalScores = this.calculateFinalScores(roomId);

          if (!finalScores) {
            logger.error(`Failed to calculate final scores for room ${roomId}`);
            return {
              success: false,
              error: 'SCORE_CALCULATION_FAILED',
              message: 'Failed to calculate final scores'
            };
          }

          result.finalScores = finalScores;
          result.madeBid = finalScores.madeBid;
          result.bidderTeamPoints = finalScores.bidderTeamPoints;
          result.opponentTeamPoints = finalScores.opponentTeamPoints;

          // Store final scores in game state for retrieval
          gameState.finalScores = finalScores;

          // Determine game winner
          let gameWinner = null;
          const bidderScore = finalScores.playerScores[finalScores.bidder];
          const partnerScore = finalScores.playerScores[finalScores.partner];

          // Bidder's team wins if they have positive combined score
          if (bidderScore + partnerScore > 0) {
            gameWinner = finalScores.bidder;
          } else {
            // Opponent with highest score wins
            let maxOpponentScore = -Infinity;
            // Calculate opponent team from players who are not bidder or partner
            const opponentTeam = gameState.players
              .filter(p => p.socketId !== finalScores.bidder && p.socketId !== finalScores.partner)
              .map(p => p.socketId);
            opponentTeam.forEach(socketId => {
              if (finalScores.playerScores[socketId] > maxOpponentScore) {
                maxOpponentScore = finalScores.playerScores[socketId];
                gameWinner = socketId;
              }
            });
          }

          result.gameWinner = gameWinner;
          gameState.phase = 'completed';

          logger.info(`GAME OVER! Winner: ${gameWinner.substring(0, 8)}...`);
        }
      } else {
        // Move to next player
        gameState.currentTrick.currentPlayerIndex =
          (gameState.currentTrick.currentPlayerIndex + 1) % gameState.players.length;
      }

      return result;
    } catch (error) {
      logger.error(`Error in playCard: ${error.message}`, error);
      return {
        success: false,
        error: 'INTERNAL_ERROR',
        message: `Server error: ${error.message}`
      };
    }
  }

  /**
   * Determine the winner of a trick
   */
  determineTrickWinner(trick, trump) {
    // Defensive: Ensure trump and ledSuit are strings and lowercase
    const normalizedTrump = trump ? String(trump).toLowerCase() : null;
    const normalizedLedSuit = trick.ledSuit ? String(trick.ledSuit).toLowerCase() : null;

    logger.info(`[Trick Winner Determination] Led suit: ${normalizedLedSuit}, Trump: ${normalizedTrump}`);

    const winningCard = trick.cards.reduce((winner, played, index) => {
      const card = played.card;
      // Defensive: Normalize card suit
      const normalizedCardSuit = card.suit ? String(card.suit).toLowerCase() : null;
      const normalizedWinnerSuit = winner?.card?.suit ? String(winner.card.suit).toLowerCase() : null;

      // If no winner yet, this card wins
      if (!winner) {
        logger.info(`  [Trick Card ${index + 1}] ${card.rank} of ${normalizedCardSuit} - First card, becomes winner`);
        return played;
      }

      // DEBUG: Check trump comparison
      const cardIsTrump = normalizedCardSuit === normalizedTrump;
      const winnerIsTrump = normalizedWinnerSuit === normalizedTrump;

      logger.info(`  [Trick Card ${index + 1}] ${card.rank} of ${normalizedCardSuit} (isTrump: ${cardIsTrump}), Current winner: ${winner.card.rank} of ${normalizedWinnerSuit} (isTrump: ${winnerIsTrump})`);

      // FIX: Priority-based winner determination
      // 1. Trump always beats non-trump (regardless of led suit)
      if (cardIsTrump && !winnerIsTrump) {
        logger.info(`  [Trick Card ${index + 1}] ${card.rank} of ${normalizedCardSuit} (TRUMP: ${normalizedTrump}) beats ${winner.card.rank} of ${normalizedWinnerSuit} (non-trump) - TRUMP WINS`);
        return played;
      }

      // 2. If both are trump, higher rank wins (second card wins tie)
      if (cardIsTrump && winnerIsTrump) {
        const rankComparison = this.compareRanks(card.rank, winner.card.rank);
        if (rankComparison > 0) {
          logger.info(`  [Trick Card ${index + 1}] ${card.rank} of ${normalizedCardSuit} (TRUMP) beats ${winner.card.rank} of ${normalizedWinnerSuit} (higher rank)`);
          return played;
        } else if (rankComparison === 0) {
          // SAME CARD TIEBREAKER: Second card played wins
          logger.info(`  [Trick Card ${index + 1}] ${card.rank} of ${normalizedCardSuit} (TRUMP) TIES with ${winner.card.rank} of ${normalizedWinnerSuit} - Second card wins`);
          return played;
        }
      }

      // 3. If neither is trump, check led suit
      if (!cardIsTrump && !winnerIsTrump) {
        // Led suit beats off-suit
        if (normalizedLedSuit && normalizedCardSuit === normalizedLedSuit && normalizedWinnerSuit !== normalizedLedSuit) {
          logger.info(`  [Trick Card ${index + 1}] ${card.rank} of ${normalizedCardSuit} (LED SUIT: ${normalizedLedSuit}) beats ${winner.card.rank} of ${normalizedWinnerSuit} (off-suit)`);
          return played;
        }

        // If both are led suit, higher rank wins (second card wins tie)
        if (normalizedLedSuit && normalizedCardSuit === normalizedLedSuit && normalizedWinnerSuit === normalizedLedSuit) {
          const rankComparison = this.compareRanks(card.rank, winner.card.rank);
          if (rankComparison > 0) {
            logger.info(`  [Trick Card ${index + 1}] ${card.rank} of ${normalizedCardSuit} (LED SUIT) beats ${winner.card.rank} of ${normalizedWinnerSuit} (higher rank)`);
            return played;
          } else if (rankComparison === 0) {
            // SAME CARD TIEBREAKER: Second card played wins
            logger.info(`  [Trick Card ${index + 1}] ${card.rank} of ${normalizedCardSuit} (LED SUIT) TIES with ${winner.card.rank} of ${normalizedWinnerSuit} - Second card wins`);
            return played;
          }
        }
      }

      // Otherwise, current winner still wins
      logger.info(`  [Trick Card ${index + 1}] ${card.rank} of ${normalizedCardSuit} loses to current winner ${winner.card.rank} of ${normalizedWinnerSuit}`);
      return winner;
    }, null);

    const winnerId = winningCard.playerId;
    logger.info(`[Trick Winner] Player ${winnerId.substring(0, 8)}... with ${winningCard.card.rank} of ${winningCard.card.suit}`);
    return winnerId;
  }

  /**
   * Compare two ranks and return which is higher
   */
  compareRanks(rank1, rank2) {
    const rankOrder = {
      'A': 14, 'K': 13, 'Q': 12, 'J': 11,
      '10': 10, '9': 9, '8': 8, '7': 7,
      '6': 6, '5': 5, '4': 4, '3': 3, '2': 2
    };
    return rankOrder[rank1] - rankOrder[rank2];
  }

  /**
   * Calculate points in a trick
   */
  calculateTrickPoints(playedCards) {
    return playedCards.reduce((sum, played) => sum + played.card.points, 0);
  }

  /**
   * Award trick points to winner's team
   */
  awardTrickPoints(roomId, winnerSocketId, points) {
    const gameState = this.activeGames.get(roomId);
    if (!gameState) return;

    const winner = gameState.players.find(p => p.socketId === winnerSocketId);
    if (!winner) return;

    // Award points to winner
    winner.score += points;

    logger.info(`Awarded ${points} points to ${winner.name} (${winnerSocketId.substring(0, 8)}...)`);
  }

  /**
   * Determine the game winner based on scores
   */
  determineGameWinner(roomId) {
    const gameState = this.activeGames.get(roomId);
    if (!gameState) return null;

    // Find team with highest score
    let highestScore = -1;
    let winner = null;

    gameState.players.forEach(player => {
      if (player.score > highestScore) {
        highestScore = player.score;
        winner = player.socketId;
      }
    });

    return winner;
  }

  /**
   * Calculate final team scores based on bidding results
   */
  calculateFinalScores(roomId) {
    const gameState = this.activeGames.get(roomId);
    if (!gameState) return null;

    // Calculate total points collected by each player
    const playerPoints = {};
    gameState.players.forEach(player => {
      playerPoints[player.socketId] = player.score;
    });

    // Determine teams
    const bidderTeam = [gameState.bidWinner];
    if (gameState.partnerId) {
      bidderTeam.push(gameState.partnerId);
    }

    const opponentTeam = gameState.players
      .filter(p => p.socketId !== gameState.bidWinner && p.socketId !== gameState.partnerId)
      .map(p => p.socketId);

    // Calculate team totals
    const bidderTeamPoints = bidderTeam.reduce((sum, socketId) => sum + (playerPoints[socketId] || 0), 0);
    const opponentTeamPoints = opponentTeam.reduce((sum, socketId) => sum + (playerPoints[socketId] || 0), 0);

    logger.info(`[Final Scores] Bidder: ${gameState.bidWinner?.substring(0, 8)}..., Partner: ${gameState.partnerId?.substring(0, 8) || 'NOT ASSIGNED'}`);
    logger.info(`[Final Scores] Bidder Team: [${bidderTeam.map(id => id.substring(0, 8)).join(', ')}] = ${bidderTeamPoints} points`);
    logger.info(`[Final Scores] Opponent Team: [${opponentTeam.map(id => id.substring(0, 8)).join(', ')}] = ${opponentTeamPoints} points`);
    logger.info(`[Final Scores] Winning Bid: ${gameState.winningBid}, Made Bid: ${bidderTeamPoints >= gameState.winningBid}`);

    // Calculate scores based on whether bid was made
    const madeBid = bidderTeamPoints >= gameState.winningBid;

    const finalScores = {};
    gameState.players.forEach(player => {
      if (player.socketId === gameState.bidWinner) {
        // Bidder
        if (madeBid) {
          finalScores[player.socketId] = gameState.winningBid * 2;
          logger.info(`[SCORE] ${player.name} (Bidder) MADE BID ${gameState.winningBid}: Score = ${gameState.winningBid * 2}`);
        } else {
          finalScores[player.socketId] = -gameState.winningBid * 2;
          logger.info(`[SCORE] ${player.name} (Bidder) FAILED BID ${gameState.winningBid}: Score = -${gameState.winningBid * 2}`);
        }
      } else if (player.socketId === gameState.partnerId) {
        // Partner
        if (madeBid) {
          finalScores[player.socketId] = gameState.winningBid;
          logger.info(`[SCORE] ${player.name} (Partner) MADE BID ${gameState.winningBid}: Score = ${gameState.winningBid}`);
        } else {
          finalScores[player.socketId] = 0;
          logger.info(`[SCORE] ${player.name} (Partner) FAILED BID ${gameState.winningBid}: Score = 0`);
        }
      } else {
        // Opponents
        if (!madeBid) {
          finalScores[player.socketId] = gameState.winningBid;
          logger.info(`[SCORE] ${player.name} (Opponent) Bidder FAILED: Score = ${gameState.winningBid}`);
        } else {
          finalScores[player.socketId] = 0;
          logger.info(`[SCORE] ${player.name} (Opponent) Bidder MADE BID: Score = 0`);
        }
      }
    });

    // Update player scores with calculated values
    gameState.players.forEach(player => {
      player.score = finalScores[player.socketId];
    });

    return {
      playerScores: finalScores,
      bidderTeamPoints,
      opponentTeamPoints,
      winningBid: gameState.winningBid,
      madeBid,
      bidder: gameState.bidWinner,
      partner: gameState.partnerId
    };
  }

  /**
   * Get final scores for all players
   */
  getFinalScores(roomId) {
    const gameState = this.activeGames.get(roomId);
    if (!gameState) return null;

    // Use stored final scores if available, otherwise calculate
    const finalScores = gameState.finalScores || this.calculateFinalScores(roomId);

    // Store if not already stored
    if (!gameState.finalScores) {
      gameState.finalScores = finalScores;
    }

    return gameState.players.map(p => ({
      socketId: p.socketId,
      name: p.name,
      score: finalScores.playerScores[p.socketId],
      isPartner: p.socketId === gameState.partnerId,
      isBidder: p.socketId === finalScores.bidder,
      team: p.socketId === finalScores.bidder || p.socketId === finalScores.partner ? 'bidder' : 'opponent'
    }));
  }

  /**
   * End game and clean up (but keep room active for next round)
   */
  endGame(roomId) {
    logger.info(`[DEBUG] endGame called for room ${roomId}`);
    const gameState = this.activeGames.get(roomId);

    if (!gameState) {
      logger.warn(`[DEBUG] endGame: No game state found for room ${roomId}`);
      return {
        success: false,
        error: 'GAME_NOT_FOUND',
        message: 'Game does not exist'
      };
    }

    // Store final scores for cumulative tracking
    const finalScores = this.calculateFinalScores(roomId);
    const room = roomService.getRoom(roomId);

    if (room) {
      // Initialize cumulative scores if not exists
      if (!room.cumulativeScores) {
        room.cumulativeScores = {};
        gameState.players.forEach(p => {
          room.cumulativeScores[p.socketId] = 0;
        });
      }

      // Add current round scores to cumulative
      Object.keys(finalScores.playerScores).forEach(socketId => {
        room.cumulativeScores[socketId] = (room.cumulativeScores[socketId] || 0) + finalScores.playerScores[socketId];
      });

      // Update round number
      room.currentRound = gameState.roundNumber || 1;

      logger.info(`Round ${room.currentRound} completed in room ${roomId}`);
      logger.info(`Cumulative Scores:`, room.cumulativeScores);
    }

    // Clean up bidding state
    biddingService.cleanup(roomId);

    // Remove current game state but keep room in 'playing' status
    this.activeGames.delete(roomId);
    roomService.updateRoomStatus(roomId, 'waiting'); // Set to waiting for next round

    logger.info(`Game ended in room ${roomId} - Room ready for next round`);

    return {
      success: true,
      message: 'Game ended successfully',
      cumulativeScores: room?.cumulativeScores,
      currentRound: room?.currentRound
    };
  }

  /**
   * Get cumulative scores for a room
   */
  getCumulativeScores(roomId) {
    const room = roomService.getRoom(roomId);
    if (!room || !room.cumulativeScores) {
      return null;
    }

    return room.cumulativeScores;
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
