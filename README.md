# Blacks 3 Backend

Real-time multiplayer card game backend built with Node.js, Express, Socket.io, and Supabase.

## Tech Stack

- **Node.js** (Latest LTS)
- **Express.js** - Web framework
- **Socket.io** - Real-time bidirectional communication
- **Supabase** - PostgreSQL database and authentication
- **Docker** - Containerization

## Project Structure

```
.
├── app/                 # Express app configuration
│   └── index.js
├── src/                 # Source files
├── config/              # Configuration files
│   ├── index.js         # Main config
│   └── supabase.js      # Supabase client
├── controllers/         # Route controllers
│   └── healthController.js
├── services/            # Business logic
│   ├── gameManager.js
│   └── roomService.js   # Room management service
├── engine/              # Game logic engine
│   └── gameEngine.js
├── sockets/             # Socket.io handlers
│   ├── handler.js
│   ├── connectionHandler.js
│   ├── authHandler.js
│   ├── gameHandler.js
│   └── gameSocket.js    # Room system socket events
├── utils/               # Utility functions
│   ├── logger.js
│   └── middleware.js
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

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Required variables:
- `PORT` - Server port (default: 3000)
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_KEY` - Your Supabase anon key

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
| `START_GAME` | `{ roomId }` (optional) | Start the game (host only) |

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
| `GAME_STARTED` | `{ roomId, players }` | Game started |
| `ROOM_STATE` | `{ roomId, hostId, players, maxPlayers, status, playerCount }` | Current room state |
| `ROOM_ERROR` | `{ success: false, error, message }` | Room operation error |

### Legacy Events (still available)

#### Authentication
- `auth:login` - Authenticate with token
- `auth:logout` - Logout user
- `auth:success` - Successful authentication
- `auth:error` - Authentication error

#### Game
- `game:create` - Create a new game
- `game:join` - Join an existing game
- `game:leave` - Leave a game
- `game:start` - Start the game
- `game:play_card` - Play a card

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
