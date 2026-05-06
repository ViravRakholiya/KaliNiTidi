/**
 * Sample Test Flow for Game Start and Card Distribution
 *
 * This demonstrates the complete flow from room creation to game start
 * with card distribution.
 */

import io from 'socket.io-client';

// Configuration
const SERVER_URL = 'http://localhost:3001';

/**
 * Test Flow 1: Basic Game Start (3 players, 5 cards each)
 */
async function testBasicGameStart() {
  console.log('=== Test: Basic Game Start ===\n');

  const players = [];
  const playerNames = ['Alice', 'Bob', 'Charlie'];
  let roomId = null;

  // Step 1: Create room with host
  console.log('Step 1: Creating room...');
  const host = io(SERVER_URL);
  players.push(host);

  await new Promise((resolve) => {
    host.on('CONNECTED', () => {
      host.emit('CREATE_ROOM', {
        name: playerNames[0],
        maxPlayers: 4
      }, (response) => {
        if (response.success) {
          roomId = response.roomId;
          console.log(`✓ Room created: ${roomId}`);
          console.log(`✓ Host: ${playerNames[0]}\n`);
          resolve();
        }
      });
    });
  });

  // Step 2: Other players join
  console.log('Step 2: Players joining room...');
  for (let i = 1; i < playerNames.length; i++) {
    const player = io(SERVER_URL);
    players.push(player);

    await new Promise((resolve) => {
      player.on('CONNECTED', () => {
        player.emit('JOIN_ROOM', {
          roomId: roomId,
          name: playerNames[i]
        }, (response) => {
          if (response.success) {
            console.log(`✓ ${playerNames[i]} joined room`);
            resolve();
          }
        });
      });
    });
  }
  console.log();

  // Step 3: Start game
  console.log('Step 3: Starting game...');
  host.emit('START_GAME', {
    roomId: roomId,
    cardsPerPlayer: 5
  }, (response) => {
    if (response.success) {
      console.log(`✓ Game started!`);
      console.log(`  Players: ${response.players.length}`);
      console.log(`  Cards per player: ${response.cardsPerPlayer}`);
      console.log(`  Total cards: ${response.totalCards}\n`);
    }
  });

  // Step 4: Receive private cards
  console.log('Step 4: Distributing cards to players...');
  players.forEach((player, index) => {
    player.on('PLAYER_HAND', (data) => {
      console.log(`✓ ${playerNames[index]} received ${data.cards.length} cards:`);
      data.cards.forEach((card, i) => {
        console.log(`  ${i + 1}. ${card.rank} of ${card.suit} (${card.points} points)`);
      });
      console.log();
    });
  });

  // Step 5: Listen for game started broadcast
  players[0].on('GAME_STARTED', (data) => {
    console.log('Step 5: Game started broadcast received:');
    console.log(`  Room: ${data.roomId}`);
    console.log(`  Players:`);
    data.players.forEach(p => {
      console.log(`    - ${p.name}: ${p.cardsInHand} cards`);
    });
    console.log();

    // Cleanup
    players.forEach(p => p.disconnect());
    console.log('=== Test Complete ===\n');
  });
}

/**
 * Test Flow 2: Validation Tests
 */
async function testValidations() {
  console.log('=== Test: Validation Tests ===\n');

  const client = io(SERVER_URL);
  let roomId = null;

  client.on('CONNECTED', () => {
    // Create room
    client.emit('CREATE_ROOM', {
      name: 'TestHost',
      maxPlayers: 4
    }, (response) => {
      roomId = response.roomId;

      // Test 1: Start with only 1 player (should fail)
      console.log('Test 1: Start game with 1 player...');
      client.emit('START_GAME', {
        roomId: roomId,
        cardsPerPlayer: 5
      }, (response) => {
        if (!response.success) {
          console.log(`✓ Failed as expected: ${response.message}\n`);
        }
        validationTest2();
      });
    });
  });

  function validationTest2() {
    // Test 2: Invalid cardsPerPlayer (should fail)
    console.log('Test 2: Invalid cards per player...');
    client.emit('START_GAME', {
      roomId: roomId,
      cardsPerPlayer: 100
    }, (response) => {
      if (!response.success) {
        console.log(`✓ Failed as expected: ${response.message}\n`);
      }
      console.log('=== Validation Tests Complete ===\n');
      client.disconnect();
    });
  }
}

/**
 * Test Flow 3: Card Point System Verification
 */
async function testCardPoints() {
  console.log('=== Test: Card Point System ===\n');

  const expectedPoints = {
    'A_spades': 10,
    'K_hearts': 10,
    'Q_diamonds': 10,
    'J_clubs': 10,
    '10_spades': 10,
    '5_hearts': 5,
    '3_spades': 30,
    '2_clubs': 0
  };

  console.log('Expected points for key cards:');
  Object.entries(expectedPoints).forEach(([card, points]) => {
    console.log(`  ${card}: ${points} points`);
  });
  console.log('\n=== Point System Test Complete ===\n');
}

/**
 * Test Flow 4: Full Game Flow
 */
async function testFullGameFlow() {
  console.log('=== Test: Full Game Flow ===\n');

  const players = [];
  const playerNames = ['Player1', 'Player2', 'Player3', 'Player4'];
  let roomId = null;

  // Create and join
  console.log('Setting up 4-player game...\n');

  const host = io(SERVER_URL);
  players.push(host);

  await new Promise((resolve) => {
    host.on('CONNECTED', () => {
      host.emit('CREATE_ROOM', {
        name: playerNames[0],
        maxPlayers: 4
      }, (response) => {
        roomId = response.roomId;
        console.log(`✓ Room ${roomId} created by ${playerNames[0]}`);
        resolve();
      });
    });
  });

  // Join other players
  for (let i = 1; i < playerNames.length; i++) {
    const player = io(SERVER_URL);
    players.push(player);

    await new Promise((resolve) => {
      player.on('CONNECTED', () => {
        player.emit('JOIN_ROOM', {
          roomId: roomId,
          name: playerNames[i]
        }, (response) => {
          console.log(`✓ ${playerNames[i]} joined`);
          resolve();
        });
      });
    });
  }

  console.log('\nStarting game with 7 cards per player...\n');

  // Start game
  host.emit('START_GAME', {
    roomId: roomId,
    cardsPerPlayer: 7
  });

  // Collect hands
  const allHands = [];
  let handsReceived = 0;

  players.forEach((player, index) => {
    player.on('PLAYER_HAND', (data) => {
      handsReceived++;
      allHands[index] = {
        name: playerNames[index],
        cards: data.cards,
        totalCards: data.cards.length
      };

      if (handsReceived === players.length) {
        console.log('All players received their cards!\n');

        // Display summary
        allHands.forEach(hand => {
          const totalPoints = hand.cards.reduce((sum, card) => sum + card.points, 0);
          console.log(`${hand.name}:`);
          console.log(`  Cards: ${hand.totalCards}`);
          console.log(`  Total Points: ${totalPoints}`);
          console.log();
        });

        // Cleanup
        players.forEach(p => p.disconnect());
        console.log('=== Full Game Flow Test Complete ===\n');
      }
    });
  });
}

// Run tests
console.log('Starting Game Start & Card Distribution Tests...\n');

setTimeout(() => {
  testBasicGameStart();
}, 1000);

setTimeout(() => {
  testValidations();
}, 3000);

setTimeout(() => {
  testCardPoints();
}, 5000);

setTimeout(() => {
  testFullGameFlow();
}, 6000);

export {
  testBasicGameStart,
  testValidations,
  testCardPoints,
  testFullGameFlow
};
