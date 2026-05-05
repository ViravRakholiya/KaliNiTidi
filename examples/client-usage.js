/**
 * Socket.io Client Usage Examples for Blacks 3 Room System
 *
 * This file demonstrates how to interact with the room system
 * from a client-side perspective.
 */

// import io from 'socket.io-client';

// const socket = io('http://localhost:3001', {
//   transports: ['websocket'],
//   reconnection: true
// });

// ============================================
// 1. CREATE ROOM
// ============================================
/**
 * Create a new game room
 */
function createRoom() {
  socket.emit('CREATE_ROOM', {
    name: 'PlayerName',
    maxPlayers: 4
  }, (response) => {
    if (response.success) {
      console.log('Room created:', response.roomId);
      console.log('Players:', response.players);
      console.log('You are the host!');
    } else {
      console.error('Failed to create room:', response.message);
    }
  });
}

// Listen for room creation confirmation
socket.on('ROOM_CREATED', (data) => {
  console.log('Room Created Event:', data);
  // {
  //   roomId: "ABC123",
  //   players: [{ socketId: "...", name: "PlayerName", isHost: true }],
  //   hostId: "...",
  //   maxPlayers: 4,
  //   status: "waiting"
  // }
});


// ============================================
// 2. JOIN ROOM
// ============================================
/**
 * Join an existing room
 */
function joinRoom(roomId) {
  socket.emit('JOIN_ROOM', {
    roomId: roomId,
    name: 'AnotherPlayer'
  }, (response) => {
    if (response.success) {
      console.log('Joined room:', response.roomId);
      console.log('Current players:', response.players);
    } else {
      console.error('Failed to join room:', response.message);
    }
  });
}

// Listen for successful join
socket.on('ROOM_JOINED', (data) => {
  console.log('Room Joined Event:', data);
  // {
  //   roomId: "ABC123",
  //   players: [...],
  //   hostId: "...",
  //   maxPlayers: 4,
  //   status: "waiting"
  // }
});

// Listen for when other players join
socket.on('PLAYER_JOINED', (data) => {
  console.log('New player joined:', data.player.name);
  console.log('Total players:', data.playerCount);
  // {
  //   player: { socketId: "...", name: "...", isHost: false },
  //   playerCount: 2
  // }
});


// ============================================
// 3. LEAVE ROOM
// ============================================
/**
 * Leave the current room
 */
function leaveRoom() {
  socket.emit('LEAVE_ROOM', {}, (response) => {
    if (response.success) {
      console.log('Left room successfully');
    }
  });
}

// Leave specific room (if in multiple)
socket.emit('LEAVE_ROOM', {
  roomId: 'ABC123'
}, (response) => {
  // ...
});

// Listen for leave confirmation
socket.on('ROOM_LEFT', (data) => {
  console.log('Left room:', data.roomId);
});

// Listen for when other players leave
socket.on('PLAYER_LEFT', (data) => {
  console.log('Player left:', data.player.name);
  console.log('Remaining players:', data.playerCount);

  if (data.newHostId) {
    console.log('New host assigned:', data.newHostId);
  }
  // {
  //   player: { socketId: "...", name: "...", wasHost: false },
  //   playerCount: 1,
  //   newHostId: "...",
  //   disconnected: true/false
  // }
});


// ============================================
// 4. GET ROOM STATE
// ============================================
/**
 * Request current room state
 */
function getRoomState() {
  socket.emit('GET_ROOM_STATE', {}, (response) => {
    if (response.success) {
      console.log('Room state:', response.roomState);
    }
  });
}

// Get specific room state
socket.emit('GET_ROOM_STATE', {
  roomId: 'ABC123'
}, (response) => {
  // ...
});

// Listen for room state updates
socket.on('ROOM_STATE', (data) => {
  console.log('Current Room State:', data);
  // {
  //   roomId: "ABC123",
  //   hostId: "...",
  //   players: [...],
  //   maxPlayers: 4,
  //   status: "waiting",
  //   playerCount: 2
  // }
});


// ============================================
// 5. START GAME (Host Only)
// ============================================
/**
 * Start the game (only host can do this)
 */
function startGame() {
  socket.emit('START_GAME', {}, (response) => {
    if (response.success) {
      console.log('Game started!');
    } else {
      console.error('Failed to start:', response.message);
    }
  });
}

// Listen for game start
socket.on('GAME_STARTED', (data) => {
  console.log('Game Started Event:', data);
  // {
  //   roomId: "ABC123",
  //   players: [...]
  // }
});


// ============================================
// 6. HOST ASSIGNED
// ============================================
/**
 * When the original host leaves, a new host is assigned
 */
socket.on('HOST_ASSIGNED', (data) => {
  console.log('You are now the host of room:', data.roomId);
  // {
  //   roomId: "ABC123",
  //   hostId: "yourSocketId"
  // }
});


// ============================================
// 7. ERROR HANDLING
// ============================================
/**
 * Handle room-related errors
 */
socket.on('ROOM_ERROR', (error) => {
  console.error('Room Error:', error.message);
  console.error('Error Code:', error.error);

  // Possible error codes:
  // - ROOM_NOT_FOUND: Room doesn't exist
  // - ROOM_FULL: Room has reached max players
  // - ALREADY_IN_ROOM: Already joined this room
  // - NOT_IN_ROOM: Not in any room
  // - NOT_HOST: Action requires host privileges
  // - NOT_ENOUGH_PLAYERS: Need more players to start
  // - INVALID_NAME: Name is required
  // - INVALID_MAX_PLAYERS: Invalid max players value
});


// ============================================
// 8. CONNECTION EVENTS
// ============================================
/**
 * Handle initial connection
 */
socket.on('CONNECTED', (data) => {
  console.log('Connected to server:', data.socketId);
  console.log('Timestamp:', data.timestamp);
});


// ============================================
// COMPLETE EXAMPLE
// ============================================
/**
 * Complete flow example
 */
// socket.on('CONNECTED', () => {
//   // Option 1: Create a new room
//   createRoom();
//
//   // Option 2: Join existing room
//   // joinRoom('ABC123');
// });

export {
  createRoom,
  joinRoom,
  leaveRoom,
  getRoomState,
  startGame
};
