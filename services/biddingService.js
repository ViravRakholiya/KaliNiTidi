import { logger } from '../utils/logger.js';

class BiddingService {
  constructor() {
    this.activeBiddings = new Map(); // roomId -> bidding state
  }

  /**
   * Calculate total points from all cards in hands
   */
  calculateTotalPoints(hands) {
    let totalPoints = 0;

    for (const socketId in hands) {
      const hand = hands[socketId];
      for (const card of hand) {
        totalPoints += card.points;
      }
    }

    return totalPoints;
  }

  /**
   * Calculate minimum bid based on number of sets
   * 2 sets → 250
   * 3 sets → 375
   * 4 sets → 500
   * Formula: sets * 125
   */
  calculateMinimumBid(totalPoints, numberOfSets = 2) {
    // Simple formula: 125 per set
    const minimumBid = numberOfSets * 125;

    logger.info(`Calculated minimum bid: ${minimumBid} (sets: ${numberOfSets})`);

    return minimumBid;
  }

  /**
   * Initialize bidding state for a room
   */
  initializeBidding(roomId, gameState, numberOfSets = 2, roundNumber = 1) {
    const hands = gameState.hands;
    const players = gameState.players;

    // Calculate total points and minimum bid
    const totalPoints = this.calculateTotalPoints(hands);
    const minimumBid = this.calculateMinimumBid(totalPoints, numberOfSets);

    // Calculate number of partners needed
    // 4 players → 1 partner, 6 players → 2 partners, etc.
    const numberOfPartners = Math.floor(players.length / 2) - 1;

    // Create player order in join sequence
    const playersOrder = players.map(p => p.socketId);

    // Debug: Log the player order
    logger.info(`[DEBUG BIDDING] Room ${roomId}: Initializing bidding with ${players.length} players`);
    playersOrder.forEach((socketId, index) => {
      const player = players[index];
      logger.info(`[DEBUG BIDDING]   ${index}: ${socketId.substring(0, 8)}... (${player.name})`);
    });

    // Calculate starting index based on round number (rotate starting player each round)
    // Round 1: start at index 0, Round 2: start at index 1, etc.
    const startingIndex = (roundNumber - 1) % players.length;
    logger.info(`[DEBUG BIDDING] Round ${roundNumber}, Starting index: ${startingIndex} (${playersOrder[startingIndex].substring(0, 8)}...)`);

    // Initialize bidding state
    const biddingState = {
      currentBid: minimumBid,
      highestBidder: null, // No initial bidder - first player must bid to become highest bidder
      currentTurnIndex: startingIndex,
      playersOrder: playersOrder,
      passedPlayers: [],
      completed: false,
      minimumBid: minimumBid,
      totalPoints: totalPoints,
      numberOfPartners: numberOfPartners,
      partnerCards: [], // Array to store multiple partner cards
      playerCount: players.length,
      numberOfSets: numberOfSets,
      roundNumber: roundNumber
    };

    this.activeBiddings.set(roomId, biddingState);

    logger.info(`Bidding initialized for room ${roomId}: round=${roundNumber}, startingIndex=${startingIndex}, minBid=${minimumBid}, totalPoints=${totalPoints}, partners=${numberOfPartners}, sets=${numberOfSets}`);

    return biddingState;
  }

  /**
   * Get bidding state for a room
   */
  getBiddingState(roomId) {
    return this.activeBiddings.get(roomId);
  }

  /**
   * Get next player in turn order
   */
  getNextPlayer(currentIndex, playersOrder, passedPlayers) {
    let nextIndex = (currentIndex + 1) % playersOrder.length;
    let iterations = 0;

    // Skip players who have passed
    while (passedPlayers.includes(playersOrder[nextIndex]) && iterations < playersOrder.length) {
      nextIndex = (nextIndex + 1) % playersOrder.length;
      iterations++;
    }

    return nextIndex;
  }

  /**
   * Validate if it's player's turn
   */
  isPlayerTurn(roomId, socketId) {
    const bidding = this.activeBiddings.get(roomId);
    if (!bidding) return false;

    const currentPlayerId = bidding.playersOrder[bidding.currentTurnIndex];
    return currentPlayerId === socketId;
  }

  /**
   * Validate a bid
   */
  validateBid(roomId, bidValue) {
    const bidding = this.activeBiddings.get(roomId);
    if (!bidding) {
      return { isValid: false, error: 'BIDDING_NOT_FOUND', message: 'Bidding not found' };
    }

    // Check if bid is a number
    if (typeof bidValue !== 'number' || isNaN(bidValue)) {
      return { isValid: false, error: 'INVALID_BID', message: 'Bid must be a number' };
    }

    // Check if bid is higher than current bid
    if (bidValue <= bidding.currentBid) {
      return {
        isValid: false,
        error: 'BID_TOO_LOW',
        message: `Bid must be higher than current bid (${bidding.currentBid})`
      };
    }

    // Check if bid is in multiples of 5
    if (bidValue % 5 !== 0) {
      return {
        isValid: false,
        error: 'INVALID_BID_INCREMENT',
        message: 'Bid must be in multiples of 5'
      };
    }

    return { isValid: true };
  }

  /**
   * Place a bid
   */
  placeBid(roomId, socketId, bidValue) {
    const bidding = this.activeBiddings.get(roomId);
    if (!bidding) {
      return { success: false, error: 'BIDDING_NOT_FOUND', message: 'Bidding not found' };
    }

    // Check if it's player's turn
    if (!this.isPlayerTurn(roomId, socketId)) {
      return {
        success: false,
        error: 'NOT_YOUR_TURN',
        message: 'It is not your turn to bid'
      };
    }

    // Validate the bid
    const validation = this.validateBid(roomId, bidValue);
    if (!validation.isValid) {
      return { success: false, ...validation };
    }

    // Update bidding state
    bidding.currentBid = bidValue;
    bidding.highestBidder = socketId;

    // Move to next player
    bidding.currentTurnIndex = this.getNextPlayer(
      bidding.currentTurnIndex,
      bidding.playersOrder,
      bidding.passedPlayers
    );

    logger.info(`Player ${socketId.substring(0, 8)}... bid ${bidValue} in room ${roomId}`);

    return {
      success: true,
      currentBid: bidding.currentBid,
      highestBidder: bidding.highestBidder,
      nextTurn: bidding.playersOrder[bidding.currentTurnIndex]
    };
  }

  /**
   * Pass bidding
   */
  passBid(roomId, socketId) {
    const bidding = this.activeBiddings.get(roomId);
    if (!bidding) {
      return { success: false, error: 'BIDDING_NOT_FOUND', message: 'Bidding not found' };
    }

    // Debug logging - show full state
    const playerCount = bidding.playersOrder.length;
    const passedCount = bidding.passedPlayers.length;
    const activeCount = playerCount - passedCount;
    const currentPlayerTurnId = bidding.playersOrder[bidding.currentTurnIndex];
    logger.info(`[DEBUG PASS] Room ${roomId}: Total=${playerCount}, Passed=${passedCount}, Active=${activeCount}, CurrentTurn=${currentPlayerTurnId.substring(0, 8)}..., Attempting=${socketId.substring(0, 8)}...`);

    // Show passed players list
    if (passedCount > 0) {
      const passedList = bidding.passedPlayers.map(id => id.substring(0, 8)).join(', ');
      logger.info(`[DEBUG PASS] Already passed: ${passedList}`);
    }

    // Check if it's player's turn
    if (!this.isPlayerTurn(roomId, socketId)) {
      logger.warn(`[DEBUG PASS] NOT YOUR TURN - Current: ${currentPlayerTurnId.substring(0, 8)}..., You: ${socketId.substring(0, 8)}...`);
      return {
        success: false,
        error: 'NOT_YOUR_TURN',
        message: 'It is not your turn'
      };
    }

    // Check if player has already passed
    if (bidding.passedPlayers.includes(socketId)) {
      logger.warn(`[DEBUG PASS] ALREADY PASSED - Player ${socketId.substring(0, 8)}... already passed`);
      return {
        success: false,
        error: 'ALREADY_PASSED',
        message: 'You have already passed'
      };
    }

    // Add to passed players
    bidding.passedPlayers.push(socketId);

    // Check if all players have passed (special case: everyone passes)
    const allPlayersPassed = bidding.passedPlayers.length === bidding.playersOrder.length;
    if (allPlayersPassed) {
      // Everyone passed - first player becomes highest bidder with minimum bid
      const firstPlayer = bidding.playersOrder[bidding.currentTurnIndex]; // Current player who just passed is last, so next (which would be first in order) becomes default
      // Actually, the first player in the order for this round would be the one at startingIndex
      const startingIndex = (bidding.roundNumber - 1) % bidding.playersOrder.length;
      const defaultWinner = bidding.playersOrder[startingIndex];

      logger.info(`All players passed in room ${roomId} - first player ${defaultWinner.substring(0, 8)}... becomes highest bidder with minimum bid (${bidding.minimumBid})`);

      bidding.highestBidder = defaultWinner;
      bidding.currentBid = bidding.minimumBid;
      bidding.completed = true;

      return {
        success: true,
        passedPlayer: socketId,
        biddingEnded: true,
        highestBidder: defaultWinner,
        winningBid: bidding.minimumBid,
        message: 'All players passed - first player becomes highest bidder with minimum bid'
      };
    }

    // Move to next player
    bidding.currentTurnIndex = this.getNextPlayer(
      bidding.currentTurnIndex,
      bidding.playersOrder,
      bidding.passedPlayers
    );

    const nextTurnId = bidding.playersOrder[bidding.currentTurnIndex];
    const activePlayers = bidding.playersOrder.length - bidding.passedPlayers.length;
    logger.info(`[DEBUG PASS] SUCCESS - ${socketId.substring(0, 8)}... passed, next turn: ${nextTurnId.substring(0, 8)}..., remaining: ${activePlayers}`);

    return {
      success: true,
      passedPlayer: socketId,
      nextTurn: bidding.playersOrder[bidding.currentTurnIndex],
      remainingPlayers: activePlayers
    };
  }

  /**
   * Check if bidding should end
   */
  shouldEndBidding(roomId) {
    const bidding = this.activeBiddings.get(roomId);
    if (!bidding) return false;

    // Check if bidding is already completed (including when all passed and first player became default winner)
    if (bidding.completed) {
      return true;
    }

    // End when only one player hasn't passed AND there's a highest bidder
    const activePlayers = bidding.playersOrder.length - bidding.passedPlayers.length;
    const hasBidder = bidding.highestBidder !== null;

    return activePlayers <= 1 && hasBidder;
  }

  /**
   * End bidding and declare winner
   */
  endBidding(roomId) {
    const bidding = this.activeBiddings.get(roomId);
    if (!bidding) {
      return { success: false, error: 'BIDDING_NOT_FOUND', message: 'Bidding not found' };
    }

    bidding.completed = true;

    // If no highest bidder (shouldn't happen after the fix, but keeping for safety)
    if (!bidding.highestBidder) {
      logger.info(`Bidding ended in room ${roomId} with no winner (no bidder)`);

      return {
        success: true,
        leader: null,
        winningBid: bidding.minimumBid,
        minimumBid: bidding.minimumBid,
        totalPoints: bidding.totalPoints,
        noBidder: true
      };
    }

    const result = {
      leader: bidding.highestBidder,
      winningBid: bidding.currentBid,
      minimumBid: bidding.minimumBid,
      totalPoints: bidding.totalPoints
    };

    logger.info(`Bidding ended in room ${roomId}. Leader: ${result.leader.substring(0, 8)}..., Bid: ${result.winningBid}`);

    return { success: true, ...result };
  }

  /**
   * Select trump suit (only leader can do this)
   */
  selectTrump(roomId, socketId, suit) {
    const bidding = this.activeBiddings.get(roomId);
    if (!bidding) {
      return { success: false, error: 'BIDDING_NOT_FOUND', message: 'Bidding not found' };
    }

    // Check if bidding is completed
    if (!bidding.completed) {
      return {
        success: false,
        error: 'BIDDING_NOT_COMPLETED',
        message: 'Bidding must be completed before selecting trump'
      };
    }

    // Check if player is the leader (highest bidder)
    if (bidding.highestBidder !== socketId) {
      return {
        success: false,
        error: 'NOT_LEADER',
        message: 'Only the leader can select trump'
      };
    }

    // Validate suit
    const validSuits = ['spades', 'hearts', 'diamonds', 'clubs'];
    if (!validSuits.includes(suit)) {
      return {
        success: false,
        error: 'INVALID_SUIT',
        message: 'Invalid suit. Must be spades, hearts, diamonds, or clubs'
      };
    }

    bidding.trump = suit;

    logger.info(`Trump selected in room ${roomId}: ${suit} by leader ${socketId.substring(0, 8)}...`);

    return { success: true, trump: suit };
  }

  /**
   * Select partner card (only leader can do this)
   * Supports position preference for leaders without the card
   * @param {number} leaderCardCount - Number of copies of this card the leader has (0, 1, or 2)
   */
  selectPartnerCard(roomId, socketId, rank, suit, preferredPosition = null, leaderCardCount = 0) {
    const bidding = this.activeBiddings.get(roomId);
    if (!bidding) {
      return { success: false, error: 'BIDDING_NOT_FOUND', message: 'Bidding not found' };
    }

    // Check if trump has been selected
    if (!bidding.trump) {
      return {
        success: false,
        error: 'TRUMP_NOT_SELECTED',
        message: 'Trump must be selected before choosing partner card'
      };
    }

    // Check if player is the leader
    if (bidding.highestBidder !== socketId) {
      return {
        success: false,
        error: 'NOT_LEADER',
        message: 'Only the leader can select partner card'
      };
    }

    // Check if already selected this card
    const alreadySelected = bidding.partnerCards.some(
      pc => pc.rank === rank && pc.suit === suit
    );
    if (alreadySelected) {
      return {
        success: false,
        error: 'CARD_ALREADY_SELECTED',
        message: 'This partner card has already been selected'
      };
    }

    // Validate rank
    const validRanks = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
    if (!validRanks.includes(rank)) {
      return {
        success: false,
        error: 'INVALID_RANK',
        message: 'Invalid rank'
      };
    }

    // Validate suit
    const validSuits = ['spades', 'hearts', 'diamonds', 'clubs'];
    if (!validSuits.includes(suit)) {
      return {
        success: false,
        error: 'INVALID_SUIT',
        message: 'Invalid suit'
      };
    }

    // Calculate max position based on number of sets and leader's card count
    const maxPosition = bidding.numberOfSets - leaderCardCount;

    // Validate preferred position (only if provided)
    if (preferredPosition !== null) {
      if (preferredPosition < 1 || preferredPosition > maxPosition) {
        return {
          success: false,
          error: 'INVALID_POSITION',
          message: `Preferred position must be between 1 and ${maxPosition}`
        };
      }
    }

    // Add to partner cards array with position preference
    bidding.partnerCards.push({
      rank,
      suit,
      preferredPosition: preferredPosition
    });

    logger.info(`Partner card ${bidding.partnerCards.length}/${bidding.numberOfPartners} selected in room ${roomId}: ${rank} of ${suit} (Preferred position: ${preferredPosition || 'not specified'})`);

    return {
      success: true,
      partnerCard: { rank, suit },
      selectedCount: bidding.partnerCards.length,
      requiredCount: bidding.numberOfPartners
    };
  }

  /**
   * Complete bidding phase and transition to playing
   */
  completeSelection(roomId) {
    const bidding = this.activeBiddings.get(roomId);
    if (!bidding) {
      return { success: false, error: 'BIDDING_NOT_FOUND', message: 'Bidding not found' };
    }

    // Verify trump and all partner cards are selected
    if (!bidding.trump) {
      return {
        success: false,
        error: 'SELECTION_INCOMPLETE',
        message: 'Trump must be selected'
      };
    }

    if (!bidding.partnerCards || bidding.partnerCards.length < bidding.numberOfPartners) {
      return {
        success: false,
        error: 'SELECTION_INCOMPLETE',
        message: `Must select ${bidding.numberOfPartners} partner card(s) (${bidding.partnerCards.length}/${bidding.numberOfPartners} selected)`
      };
    }

    // Clean up and return final state
    const result = {
      leader: bidding.highestBidder,
      trump: bidding.trump,
      partnerCards: bidding.partnerCards,
      numberOfPartners: bidding.numberOfPartners,
      winningBid: bidding.currentBid,
      totalPoints: bidding.totalPoints,
      playerCount: bidding.playerCount
    };

    // Keep bidding state for reference during gameplay
    // Don't delete it yet as we might need it for partner identification

    logger.info(`Selection complete for room ${roomId}. Leader: ${result.leader.substring(0, 8)}..., Trump: ${result.trump}, Partners: ${result.numberOfPartners}`);

    return { success: true, ...result };
  }

  /**
   * Get bidding info for a room
   */
  getBiddingInfo(roomId) {
    const bidding = this.activeBiddings.get(roomId);
    if (!bidding) {
      return { success: false, error: 'BIDDING_NOT_FOUND', message: 'Bidding not found' };
    }

    return {
      success: true,
      bidding: {
        currentBid: bidding.currentBid,
        highestBidder: bidding.highestBidder,
        currentTurn: bidding.playersOrder[bidding.currentTurnIndex],
        passedPlayers: bidding.passedPlayers,
        completed: bidding.completed,
        minimumBid: bidding.minimumBid,
        totalPoints: bidding.totalPoints,
        trump: bidding.trump || null,
        partnerCard: bidding.partnerCard || null
      }
    };
  }

  /**
   * Find all partners based on partner cards
   * Returns array of socket IDs of players who have the partner cards
   */
  findPartners(roomId, hands) {
    const bidding = this.activeBiddings.get(roomId);
    if (!bidding || !bidding.partnerCards || bidding.partnerCards.length === 0) {
      return [];
    }

    const partners = [];

    // Find players who have each partner card
    for (const partnerCard of bidding.partnerCards) {
      for (const socketId in hands) {
        // Skip if already found as partner or is the leader
        if (partners.includes(socketId) || socketId === bidding.highestBidder) {
          continue;
        }

        const hand = hands[socketId];
        const hasCard = hand.some(c =>
          c.rank === partnerCard.rank &&
          c.suit === partnerCard.suit
        );

        if (hasCard) {
          partners.push(socketId);
          break; // Found a player for this card, move to next card
        }
      }
    }

    logger.info(`Found ${partners.length} partners for room ${roomId} (needed ${bidding.numberOfPartners})`);

    return partners;
  }

  /**
   * Find partner based on partner card (deprecated, use findPartners)
   * @deprecated Use findPartners instead for multiple partner support
   */
  findPartner(roomId, hands) {
    const partners = this.findPartners(roomId, hands);
    return partners.length > 0 ? partners[0] : null;
  }

  /**
   * Clean up bidding state when game ends
   */
  cleanup(roomId) {
    this.activeBiddings.delete(roomId);
    logger.info(`Bidding state cleaned up for room ${roomId}`);
  }
}

export const biddingService = new BiddingService();
