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
  initializeBidding(roomId, gameState, numberOfSets = 2) {
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

    // Initialize bidding state
    const biddingState = {
      currentBid: minimumBid,
      highestBidder: playersOrder[0], // First player is initial bidder
      currentTurnIndex: 0,
      playersOrder: playersOrder,
      passedPlayers: [],
      completed: false,
      minimumBid: minimumBid,
      totalPoints: totalPoints,
      numberOfPartners: numberOfPartners,
      partnerCards: [], // Array to store multiple partner cards
      playerCount: players.length,
      numberOfSets: numberOfSets
    };

    this.activeBiddings.set(roomId, biddingState);

    logger.info(`Bidding initialized for room ${roomId}: minBid=${minimumBid}, totalPoints=${totalPoints}, partners=${numberOfPartners}, sets=${numberOfSets}`);

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

    // Check if it's player's turn
    if (!this.isPlayerTurn(roomId, socketId)) {
      return {
        success: false,
        error: 'NOT_YOUR_TURN',
        message: 'It is not your turn'
      };
    }

    // Check if player has already passed
    if (bidding.passedPlayers.includes(socketId)) {
      return {
        success: false,
        error: 'ALREADY_PASSED',
        message: 'You have already passed'
      };
    }

    // Check if all players except one have passed (can't pass if you're the last one)
    const activePlayers = bidding.playersOrder.length - bidding.passedPlayers.length;
    if (activePlayers <= 1) {
      return {
        success: false,
        error: 'MUST_BID',
        message: 'You cannot pass - you are the last active bidder'
      };
    }

    // Add to passed players
    bidding.passedPlayers.push(socketId);

    // Move to next player
    bidding.currentTurnIndex = this.getNextPlayer(
      bidding.currentTurnIndex,
      bidding.playersOrder,
      bidding.passedPlayers
    );

    logger.info(`Player ${socketId.substring(0, 8)}... passed in room ${roomId}`);

    return {
      success: true,
      passedPlayer: socketId,
      nextTurn: bidding.playersOrder[bidding.currentTurnIndex],
      remainingPlayers: bidding.playersOrder.length - bidding.passedPlayers.length
    };
  }

  /**
   * Check if bidding should end
   */
  shouldEndBidding(roomId) {
    const bidding = this.activeBiddings.get(roomId);
    if (!bidding) return false;

    // End when only one player hasn't passed
    const activePlayers = bidding.playersOrder.length - bidding.passedPlayers.length;
    return activePlayers <= 1;
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
   */
  selectPartnerCard(roomId, socketId, rank, suit, preferredPosition = null) {
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

    // Validate preferred position (only if provided)
    if (preferredPosition !== null) {
      if (preferredPosition !== 1 && preferredPosition !== 2) {
        return {
          success: false,
          error: 'INVALID_POSITION',
          message: 'Preferred position must be 1 or 2'
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
