/**
 * Bidding System Event Flow Example
 *
 * This demonstrates the complete bidding phase flow from start to finish
 */

import io from 'socket.io-client';

const SERVER_URL = 'http://localhost:3001';

// ============================================
// BIDDING EVENT FLOW
// ============================================

/**
 * Step 1: Game Started (Cards Distributed)
 *
 * After START_GAME, server automatically initiates bidding
 */
socket.on('BIDDING_STARTED', (data) => {
  console.log('=== BIDDING PHASE STARTED ===');
  console.log('Minimum Bid:', data.minBid);
  console.log('Total Points:', data.totalPoints);
  console.log('Current Turn:', data.currentTurn);
  // {
  //   minBid: 75,
  //   totalPoints: 150,
  //   currentTurn: "socket_id_123"
  // }
});

/**
 * Step 2: Players Take Turns Bidding
 *
 * Current player can PLACE_BID or PASS_BID
 */

// Option A: Place a higher bid
socket.emit('PLACE_BID', {
  roomId: 'ABC123',
  bidValue: 80  // Must be multiple of 5, higher than currentBid
}, (response) => {
  if (response.success) {
    console.log('Bid placed successfully!');
    console.log('New current bid:', response.currentBid);
    console.log('Next turn:', response.nextTurn);
  } else {
    console.log('Bid failed:', response.message);
  }
});

// Listen for bid updates
socket.on('BID_UPDATED', (data) => {
  console.log(`${data.bidder} bid ${data.bidValue}`);
  console.log('Next turn:', data.nextTurn);
  // {
  //   roomId: "ABC123",
  //   bidValue: 80,
  //   bidder: "socket_id_456",
  //   nextTurn: "socket_id_789"
  // }
});

// Option B: Pass your turn
socket.emit('PASS_BID', {
  roomId: 'ABC123'
}, (response) => {
  if (response.success) {
    console.log('Passed successfully');
    console.log('Next turn:', response.nextTurn);
    console.log('Remaining players:', response.remainingPlayers);
  }
});

// Listen for player passes
socket.on('PLAYER_PASSED', (data) => {
  console.log(`${data.player} passed`);
  console.log('Remaining players:', data.remainingPlayers);
  // {
  //   roomId: "ABC123",
  //   player: "socket_id_123",
  //   nextTurn: "socket_id_456",
  //   remainingPlayers: 2
  // }
});

/**
 * Step 3: Bidding Ends
 *
 * When all but one player have passed
 */
socket.on('BIDDING_ENDED', (data) => {
  console.log('=== BIDDING ENDED ===');
  console.log('Leader (highest bidder):', data.leader);
  console.log('Winning bid:', data.winningBid);
  console.log('Minimum bid was:', data.minimumBid);
  console.log('Total points:', data.totalPoints);

  // If you are the leader, you can now select trump and partner
  if (data.leader === socket.id) {
    console.log('You are the leader! Select trump and partner card.');
  }
  // {
  //   roomId: "ABC123",
  //   leader: "socket_id_789",
  //   winningBid: 95,
  //   minimumBid: 75,
  //   totalPoints: 150
  // }
});

/**
 * Step 4: Leader Selects Trump (Leader Only)
 *
 * Only the highest bidder can select trump
 */
socket.emit('SELECT_TRUMP', {
  roomId: 'ABC123',
  suit: 'spades'  // 'spades' | 'hearts' | 'diamonds' | 'clubs'
}, (response) => {
  if (response.success) {
    console.log('Trump selected:', response.trump);
  } else {
    console.log('Failed to select trump:', response.message);
  }
});

// Listen for trump selection
socket.on('TRUMP_SELECTED', (data) => {
  console.log(`${data.selectedBy} selected trump: ${data.suit}`);
  // {
  //   roomId: "ABC123",
  //   suit: "spades",
  //   selectedBy: "socket_id_789"
  // }
});

/**
 * Step 5: Leader Selects Partner Card (Leader Only)
 *
 * Leader chooses a card (rank + suit) to determine their partner
 * The player who has this card becomes the leader's partner
 */
socket.emit('SELECT_PARTNER_CARD', {
  roomId: 'ABC123',
  rank: 'A',     // 'A' | 'K' | 'Q' | 'J' | '10' | '9' | '8' | '7' | '6' | '5' | '4' | '3' | '2'
  suit: 'hearts' // 'spades' | 'hearts' | 'diamonds' | 'clubs'
}, (response) => {
  if (response.success) {
    console.log('Partner card selected:', response.partnerCard);
    if (response.phase === 'playing') {
      console.log('Game moving to playing phase!');
      console.log('Partner ID:', response.partnerId);
    }
  } else {
    console.log('Failed to select partner:', response.message);
  }
});

// Listen for partner card selection
socket.on('PARTNER_CARD_SELECTED', (data) => {
  console.log(`Partner card: ${data.partnerCard.rank} of ${data.partnerCard.suit}`);
  // {
  //   roomId: "ABC123",
  //   partnerCard: { rank: "A", suit: "hearts" },
  //   selectedBy: "socket_id_789"
  // }
});

/**
 * Step 6: Selection Complete - Game Moves to Playing
 *
 * Both trump and partner card selected
 */
socket.on('SELECTION_DONE', (data) => {
  console.log('=== SELECTION COMPLETE ===');
  console.log('Leader:', data.leader);
  console.log('Trump:', data.trump);
  console.log('Partner Card:', `${data.partnerCard.rank} of ${data.partnerCard.suit}`);
  console.log('Winning Bid:', data.winningBid);
  console.log('Phase:', data.phase);  // "playing"

  // If you receive this, check if you're the partner
  // {
  //   roomId: "ABC123",
  //   leader: "socket_id_789",
  //   trump: "spades",
  //   partnerCard: { rank: "A", suit: "hearts" },
  //   winningBid: 95,
  //   phase: "playing"
  // }
});

/**
 * Step 7: Partner Notification (Private)
 *
 * Only the player with the partner card receives this
 */
socket.on('YOU_ARE_PARTNER', (data) => {
  console.log('=== YOU ARE THE PARTNER ===');
  console.log('Your leader:', data.leader);
  console.log('Partner card (you have this):', `${data.partnerCard.rank} of ${data.partnerCard.suit}`);
  // {
  //   roomId: "ABC123",
  //   leader: "socket_id_789",
  //   partnerCard: { rank: "A", suit: "hearts" }
  // }
});

// ============================================
// ERROR HANDLING
// ============================================

socket.on('ROOM_ERROR', (error) => {
  console.error('Error:', error.message);

  // Common bidding errors:
  // - "NOT_YOUR_TURN" - Not your turn to bid
  // - "BID_TOO_LOW" - Bid must be higher than current bid
  // - "INVALID_BID_INCREMENT" - Bid must be multiple of 5
  // - "ALREADY_PASSED" - You have already passed
  // - "MUST_BID" - You're the last active bidder, cannot pass
  // - "NOT_LEADER" - Only leader can select trump/partner
  // - "NOT_BIDDING_PHASE" - Not in bidding phase
  // - "NOT_SELECTION_PHASE" - Not in selection phase
});

// ============================================
// HELPER: GET BIDDING STATE
// ============================================

socket.emit('GET_BIDDING_STATE', {
  roomId: 'ABC123'
}, (response) => {
  if (response.success) {
    console.log('Current bidding state:', response.bidding);
    // {
    //   currentBid: 80,
    //   highestBidder: "socket_id_456",
    //   currentTurn: "socket_id_789",
    //   passedPlayers: ["socket_id_123"],
    //   completed: false,
    //   minimumBid: 75,
    //   totalPoints: 150,
    //   trump: null,
    //   partnerCard: null
    // }
  }
});

socket.on('BIDDING_STATE', (bidding) => {
  console.log('Bidding state updated:', bidding);
});

// ============================================
// COMPLETE FLOW EXAMPLE
// ============================================

/**
 * Complete bidding flow scenario:
 *
 * 1. START_GAME → Cards distributed → BIDDING_STARTED
 * 2. Player 1: PLACE_BID 80 → BID_UPDATED (current: 80)
 * 3. Player 2: PASS_BID → PLAYER_PASSED
 * 4. Player 3: PLACE_BID 85 → BID_UPDATED (current: 85)
 * 5. Player 1: PASS_BID → PLAYER_PASSED
 * 6. Player 3: PLACE_BID 90 → BID_UPDATED (current: 90)
 * 7. Player 2: Already passed, skip
 * 8. Only Player 3 left → BIDDING_ENDED
 * 9. Player 3 (leader): SELECT_TRUMP 'spades' → TRUMP_SELECTED
 * 10. Player 3 (leader): SELECT_PARTNER_CARD 'A', 'hearts' → PARTNER_CARD_SELECTED
 * 11. If Player 2 has A of hearts → SELECTION_DONE + YOU_ARE_PARTNER
 * 12. Game moves to PLAYING phase
 */

export {
  // The bidding flow is fully documented above
};
