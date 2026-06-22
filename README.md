# Blacks 3 Backend

Real-time multiplayer card game backend built with Node.js, Express, and Socket.io.

## Tech Stack

- **Node.js** (Latest LTS)
- **Express.js** - Web framework
- **Socket.io** - Real-time bidirectional communication
- **React + Vite** - Client (app/client)
- **Docker** - Containerization

> Game state is held in-memory; there is no external database.

## Project Structure

```
.
├── app/                 # Express app configuration
│   ├── index.js
│   └── public/          # Static game client
├── config/              # Configuration files
│   └── index.js         # Main config
├── controllers/         # Route controllers
│   └── healthController.js
├── services/            # Business logic
│   ├── roomService.js   # Room/lobby management
│   ├── gameService.js   # Game start, card distribution, trick & score logic
│   └── biddingService.js # Bidding/auction system
├── engine/              # Game logic engine
│   └── deckService.js   # Deck generation, shuffling & distribution
├── sockets/             # Socket.io handlers
│   ├── handler.js       # Connection entry point
│   └── gameSocket.js    # Room & gameplay socket events
├── utils/               # Utility functions
│   ├── logger.js
│   └── middleware.js
├── examples/            # Test clients & usage examples
├── index.js             # Application entry point
├── package.json
├── .env.example
├── Dockerfile
└── docker-compose.yml
```

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables (optional)

All variables are optional; the server runs with sensible defaults.

- `PORT` - Server port (default: 3000)
- `NODE_ENV` - `development` or `production`
- `CORS_ORIGIN` - Allowed origin (default: `*`)

### 3. Run the Server

**Development mode:**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

### 4. Docker Deployment

**Build and run with Docker Compose:**
```bash
docker-compose up -d
```

**Manual build and run:**
```bash
npm run docker:build
npm run docker:run
```

## API Endpoints

### Health Check
```
GET /health
```

Returns server health status including database connectivity.

## Room System

The room system provides real-time multiplayer lobby functionality using in-memory storage.

### Room Structure

Each room maintains the following state:

```javascript
{
  roomId: "ABC123",           // Unique 6-character room ID
  hostId: "socket_id",        // Socket ID of the host
  players: [                  // Array of player objects
    {
      socketId: "socket_id",
      name: "Player Name",
      isHost: true
    }
  ],
  maxPlayers: 4,              // Maximum players allowed
  status: "waiting",          // Room status: "waiting" | "playing" | "completed"
  createdAt: "2024-01-01T00:00:00.000Z"
}
```

### Room Lifecycle

1. **Creation**: A player creates a room and becomes the host
2. **Waiting**: Other players join until maxPlayers is reached
3. **Playing**: Host starts the game, status changes to "playing"
4. **Host Transfer**: If host leaves, first player becomes new host
5. **Deletion**: When last player leaves, room is deleted from memory

### Usage Example

```javascript
// Client-side code
import io from 'socket.io-client';

const socket = io('http://localhost:3000');

// Create a room
socket.emit('CREATE_ROOM', {
  name: 'PlayerName',
  maxPlayers: 4
}, (response) => {
  if (response.success) {
    console.log('Room created:', response.roomId);
  }
});

// Listen for room creation
socket.on('ROOM_CREATED', (data) => {
  console.log('Room ID:', data.roomId);
  console.log('Share this ID with friends:', data.roomId);
});

// Join a room
socket.emit('JOIN_ROOM', {
  roomId: 'ABC123',
  name: 'AnotherPlayer'
}, (response) => {
  if (response.success) {
    console.log('Joined room:', response.roomId);
  }
});

// Listen for player joins
socket.on('PLAYER_JOINED', (data) => {
  console.log(data.player.name, 'joined the game');
  console.log('Players:', data.playerCount);
});

// Start game (host only)
socket.emit('START_GAME', {}, (response) => {
  if (response.success) {
    console.log('Game started!');
  }
});

// Leave room
socket.emit('LEAVE_ROOM');
```

### Test Client

A test client HTML file is provided in `examples/test-client.html`. Open it in a browser to test the room system:

```bash
# Start the server first
npm run dev

# Then open examples/test-client.html in multiple browser tabs
```

## Socket Events

### Room System

#### Client → Server Events

| Event | Payload | Description |
|-------|---------|-------------|
| `CREATE_ROOM` | `{ name, maxPlayers }` | Create a new room |
| `JOIN_ROOM` | `{ roomId, name }` | Join an existing room |
| `LEAVE_ROOM` | `{ roomId }` (optional) | Leave current room |
| `GET_ROOM_STATE` | `{ roomId }` (optional) | Get current room state |
| `START_GAME` | `{ roomId, cardsPerPlayer }` | Start the game with card distribution (host only) |
| `PLACE_BID` | `{ roomId, bidValue }` | Place a bid during bidding phase |
| `PASS_BID` | `{ roomId }` | Pass your turn during bidding |
| `SELECT_TRUMP` | `{ roomId, suit }` | Select trump suit (leader only) |
| `SELECT_PARTNER_CARD` | `{ roomId, rank, suit }` | Select partner card (leader only) |
| `GET_BIDDING_STATE` | `{ roomId }` | Get current bidding state |

#### Server → Client Events

| Event | Payload | Description |
|-------|---------|-------------|
| `CONNECTED` | `{ socketId, timestamp }` | Connection established |
| `ROOM_CREATED` | `{ roomId, players, hostId, maxPlayers, status }` | Room created successfully |
| `ROOM_JOINED` | `{ roomId, players, hostId, maxPlayers, status }` | Joined room successfully |
| `ROOM_LEFT` | `{ roomId }` | Left room confirmation |
| `PLAYER_JOINED` | `{ player, playerCount }` | New player joined |
| `PLAYER_LEFT` | `{ player, playerCount, newHostId, disconnected }` | Player left room |
| `HOST_ASSIGNED` | `{ roomId, hostId }` | New host assigned |
| `GAME_STARTED` | `{ roomId, players, cardsPerPlayer, totalCards }` | Game started with public info |
| `PLAYER_HAND` | `{ cards, cardsPerPlayer, totalCards }` | Private card distribution (to each player) |
| `BIDDING_STARTED` | `{ minBid, totalPoints, currentTurn }` | Bidding phase started |
| `BID_UPDATED` | `{ roomId, bidValue, bidder, nextTurn }` | New bid placed |
| `PLAYER_PASSED` | `{ roomId, player, nextTurn, remainingPlayers }` | Player passed |
| `BIDDING_ENDED` | `{ roomId, leader, winningBid, minimumBid, totalPoints }` | Bidding ended, leader declared |
| `TRUMP_SELECTED` | `{ roomId, suit, selectedBy }` | Trump suit selected |
| `PARTNER_CARD_SELECTED` | `{ roomId, partnerCard, selectedBy }` | Partner card selected |
| `SELECTION_DONE` | `{ roomId, leader, trump, partnerCard, winningBid, phase }` | Selection complete, game moves to playing |
| `YOU_ARE_PARTNER` | `{ roomId, leader, partnerCard }` | Private notification to partner |
| `ROOM_STATE` | `{ roomId, hostId, players, maxPlayers, status, playerCount }` | Current room state |
| `BIDDING_STATE` | `{ currentBid, highestBidder, currentTurn, passedPlayers, completed, ... }` | Current bidding state |
| `ROOM_ERROR` | `{ success: false, error, message }` | Room operation error |

## Game System

The game system handles card distribution and point tracking with in-memory state.

### Card Model

Each card has the following structure:

```javascript
{
  id: "spades_A_d0_spades_A_0",  // Unique identifier
  rank: "A",                      // A, K, Q, J, 10, 9, 8, 7, 6, 5, 4, 3, 2
  suit: "spades",                 // spades, hearts, diamonds, clubs
  points: 10                      // Based on point system
}
```

### Point System

| Card | Points |
|------|--------|
| 3 of Spades | 30 |
| A, K, Q, J, 10 | 10 |
| 5 | 5 |
| All others | 0 |

### Game Start Flow

1. **Validation**: Minimum 3 players required
2. **Deck Generation**: Dynamic deck based on total cards needed
3. **Shuffling**: Fisher-Yates shuffle algorithm
4. **Distribution**: Equal cards distributed to all players
5. **Private Emission**: Each player receives only their cards

### Usage Example

```javascript
// Start game with 5 cards per player
socket.emit('START_GAME', {
  roomId: 'ABC123',
  cardsPerPlayer: 5
}, (response) => {
  if (response.success) {
    console.log('Game started!');
    console.log('Players:', response.players.length);
    console.log('Cards per player:', response.cardsPerPlayer);
  }
});

// Receive your private hand
socket.on('PLAYER_HAND', (data) => {
  console.log('Your cards:', data.cards);
  // [
  //   { id: "hearts_A_0", rank: "A", suit: "hearts", points: 10 },
  //   { id: "spades_3_0", rank: "3", suit: "spades", points: 30 },
  //   ...
  // ]
});

// Listen for game started broadcast
socket.on('GAME_STARTED', (data) => {
  console.log('Game started!');
  console.log('Total cards:', data.totalCards);
  // Note: Does not include actual cards, only public info
});
```

### Validation Rules

| Rule | Requirement |
|------|-------------|
| Minimum players | 3 |
| Maximum cards per player | 52 |
| Total cards maximum | 208 (4 standard decks) |
| Host only | Only host can start game |
| Room status | Must be in "waiting" status |

## Bidding System

The bidding system determines the leader (highest bidder) who selects trump suit and partner card.

### Bidding Phase

After card distribution, the game enters the **bidding phase**:

1. **Calculate Total Points**: Sum of all card points in play
2. **Minimum Bid**: `floor(totalPoints / 2)`
3. **Player Turn Order**: Follows join order
4. **Bid Rules**:
   - Must be higher than current bid
   - Must be in multiples of 5
   - Players can pass once
5. **End Condition**: When all but one player have passed

### Bidding Flow

```
Cards Distributed
    ↓
BIDDING_STARTED (minBid, totalPoints, currentTurn)
    ↓
Players: PLACE_BID or PASS_BID
    ↓
BID_UPDATED (bidValue, bidder, nextTurn)
    ↓
...repeat until one player remains...
    ↓
BIDDING_ENDED (leader, winningBid)
    ↓
Selection Phase (Leader only)
    ↓
TRUMP_SELECTED + PARTNER_CARD_SELECTED
    ↓
SELECTION_DONE → Playing Phase
```

### Bidding State Structure

```javascript
{
  currentBid: 80,           // Current highest bid
  highestBidder: "socket_id", // Who made the highest bid
  currentTurn: 0,           // Index of current player
  playersOrder: ["id1", "id2", "id3"], // Turn order
  passedPlayers: ["id1"],   // Players who passed
  completed: false,         // Is bidding done?
  minimumBid: 75,          // Starting minimum bid
  totalPoints: 150         // Total card points
}
```

### Selection Phase

After bidding ends, the **leader** (highest bidder) must:

1. **Select Trump Suit**: Choose spades, hearts, diamonds, or clubs
2. **Select Partner Card**: Choose a rank + suit combination
   - The player who has this card becomes the leader's partner

### Partner Identification

```javascript
// Server finds the player with the partner card
for (player in hands) {
  if (player has partnerCard) {
    partnerId = player.socketId;
    send private YOU_ARE_PARTNER event to partnerId;
  }
}
```

### Bidding Usage Example

```javascript
// After START_GAME, listen for bidding start
socket.on('BIDDING_STARTED', (data) => {
  console.log('Minimum bid:', data.minBid);  // e.g., 75
  console.log('Total points:', data.totalPoints);  // e.g., 150
  console.log('Current turn:', data.currentTurn);  // socket ID
});

// Place a bid
socket.emit('PLACE_BID', {
  roomId: 'ABC123',
  bidValue: 80  // Must be > currentBid, multiple of 5
}, (response) => {
  if (response.success) {
    console.log('Bid placed!');
  }
});

// Listen for bid updates
socket.on('BID_UPDATED', (data) => {
  console.log(`${data.bidder} bid ${data.bidValue}`);
  console.log('Next turn:', data.nextTurn);
});

// Pass your turn
socket.emit('PASS_BID', { roomId: 'ABC123' });

// Listen for bidding ended
socket.on('BIDDING_ENDED', (data) => {
  console.log('Leader:', data.leader);
  console.log('Winning bid:', data.winningBid);

  // If you're the leader
  if (data.leader === socket.id) {
    // Select trump
    socket.emit('SELECT_TRUMP', {
      roomId: 'ABC123',
      suit: 'spades'
    });

    // Select partner card
    socket.emit('SELECT_PARTNER_CARD', {
      roomId: 'ABC123',
      rank: 'A',
      suit: 'hearts'
    });
  }
});

// Listen for selection complete
socket.on('SELECTION_DONE', (data) => {
  console.log('Trump:', data.trump);
  console.log('Partner card:', `${data.partnerCard.rank} of ${data.partnerCard.suit}`);
  console.log('Phase:', data.phase);  // "playing"
});

// If you're the partner (private notification)
socket.on('YOU_ARE_PARTNER', (data) => {
  console.log('You are the partner!');
  console.log('Your leader:', data.leader);
});
```

### Bidding Validation Rules

| Rule | Description |
|------|-------------|
| Turn-based | Only current player can bid/pass |
| Bid increment | Must be multiple of 5 |
| Bid value | Must be higher than current bid |
| Pass limit | Each player can pass only once |
| End condition | Bidding ends when only 1 player hasn't passed |
| Leader selection | Only leader can select trump/partner |
| Suit validity | Must be spades, hearts, diamonds, or clubs |

### Bidding Test Client

A dedicated bidding test client is available: `examples/bidding-test-client.html`

```bash
# Start the server
npm run dev

# Open in browser
http://localhost:3001/bidding-test
```

The bidding test UI shows:
- Current bid and minimum bid
- Turn indicator with your turn highlights
- Quick bid buttons (+5, +10, +15, +20)
- Trump and partner card selection (for leader)
- Real-time player status (passed, leader, partner)
- Event log with all bidding actions

## Validation Rules

| Rule | Requirement |
|------|-------------|
| Minimum players | 3 |
| Maximum cards per player | 52 |
| Total cards maximum | 208 (4 standard decks) |
| Host only | Only host can start game |
| Room status | Must be in "waiting" status |

### Test Clients

Three test clients are available for different testing scenarios:

#### 1. Bidding Test Client (Latest)
**URL:** `http://localhost:3001/bidding-test`

Features:
- Complete bidding phase testing
- Trump and partner card selection
- Turn indicators and bid controls
- Real-time player status (passed, leader, partner)
- Visual event log

#### 2. Game Start Test Client
**URL:** `http://localhost:3001/game-test`

Features:
- Card distribution testing
- Visual card display with points
- Point calculation
- Player hand management

#### 3. Room System Test Client
**URL:** `http://localhost:3001/test-client`

Features:
- Basic room creation and joining
- Player management
- Room state tracking

```bash
# Start the server
npm run dev

# Open any test client in your browser
http://localhost:3001/bidding-test  # Recommended for full flow
```

## Game Rules (Blacks 3)

A card game where players match cards by suit, rank, or color.

### Special Cards
- **Jacks (J)** - Skip next player's turn
- **Aces (A)** - Reverse game direction
- **Twos (2)** - Next player draws 2 cards

### Winning
First player to empty their hand wins.

## License

MIT
