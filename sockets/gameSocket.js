import { logger } from '../utils/logger.js';
import { roomService } from '../services/roomService.js';
import { gameService } from '../services/gameService.js';
import { deckService } from '../engine/deckService.js';
import { biddingService } from '../services/biddingService.js';

// How long a disconnected player is kept in their room before being removed.
// Covers the common "switched apps / locked phone and came back" case.
const GRACE_PERIOD_MS = 120000; // 2 minutes

// Pending eviction timers, keyed by stable playerId (NOT socketId, which
// changes on reconnect).
const disconnectTimers = new Map();

function clearDisconnectTimer(playerId) {
  const timer = disconnectTimers.get(playerId);
  if (timer) {
    clearTimeout(timer);
    disconnectTimers.delete(playerId);
  }
}

// Remove a player for good if they never came back within the grace period.
function scheduleEviction(io, roomId, playerId) {
  clearDisconnectTimer(playerId);

  const timer = setTimeout(() => {
    disconnectTimers.delete(playerId);

    const currentRoomId = roomService.findRoomByPlayerId(playerId) || roomId;
    const room = roomService.getRoom(currentRoomId);
    if (!room) return;

    const player = roomService.findPlayerByPlayerId(room, playerId);
    if (!player || player.connected) return; // reconnected in time

    const result = roomService.leaveRoom(currentRoomId, player.socketId);

    if (result.success && !result.roomEmpty && result.room) {
      io.to(currentRoomId).emit('PLAYER_LEFT', {
        player: { socketId: player.socketId, name: player.name, wasHost: player.isHost },
        playerCount: result.room.players.length,
        newHostId: result.newHostId,
        disconnected: true,
        graceExpired: true
      });

      if (result.newHostId) {
        io.to(result.newHostId).emit('HOST_ASSIGNED', {
          roomId: currentRoomId,
          hostId: result.newHostId
        });
      }
    }

    logger.info(`Grace period expired - removed ${player.name} (${playerId}) from room ${currentRoomId}`);
  }, GRACE_PERIOD_MS);

  disconnectTimers.set(playerId, timer);
}

// Helper function to get player name
function getPlayerName(roomId, socketId) {
  const room = roomService.getRoom(roomId);
  if (!room) return 'Unknown';

  const player = room.players.find(p => p.socketId === socketId);
  return player ? player.name : 'Unknown';
}

// ============================================
// BOTS
// ============================================
const BOT_DELAY_MS = parseInt(process.env.BOT_DELAY_MS, 10) || 800; // pause before a bot acts, so play feels natural
const RANK_VALUE = { A: 14, K: 13, Q: 12, J: 11, '10': 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2 };

function isBotId(room, socketId) {
  const p = room && room.players.find(x => x.socketId === socketId);
  return !!(p && p.isBot);
}

// ---- shared broadcasters (used by bots; mirror the human handler emits) ----
function broadcastBidUpdated(io, roomId, result) {
  io.to(roomId).emit('BID_UPDATED', {
    roomId, bidValue: result.currentBid, bidder: result.highestBidder, nextTurn: result.nextTurn
  });
}

function broadcastPass(io, roomId, result) {
  io.to(roomId).emit('PLAYER_PASSED', {
    roomId, player: result.passedPlayer, nextTurn: result.nextTurn, remainingPlayers: result.remainingPlayers
  });

  if (result.biddingEnded && result.endResult && result.endResult.leader) {
    const gameState = gameService.activeGames.get(roomId);
    const pool = new Set();
    if (gameState && gameState.hands) {
      for (const sid in gameState.hands) for (const c of gameState.hands[sid]) pool.add(`${c.rank}_${c.suit}`);
    }
    io.to(roomId).emit('BIDDING_ENDED', {
      roomId,
      leader: result.endResult.leader,
      winningBid: result.endResult.winningBid,
      minimumBid: result.endResult.minimumBid,
      totalPoints: result.endResult.totalPoints,
      allowedPartners: result.endResult.allowedPartners,
      cardPool: Array.from(pool).sort()
    });
  }
}

function broadcastCardPlayed(io, roomId, playerId, result) {
  const gameState = gameService.activeGames.get(roomId);
  const nextPlayerId = gameState && gameState.currentTrick && gameState.currentTrick.currentPlayerIndex !== undefined
    ? gameState.players[gameState.currentTrick.currentPlayerIndex] && gameState.players[gameState.currentTrick.currentPlayerIndex].socketId
    : null;

  io.to(roomId).emit('CARD_PLAYED', {
    roomId, playerId, playerName: getPlayerName(roomId, playerId), card: result.card,
    cardsRemaining: result.cardsRemaining, nextPlayerId, trickComplete: result.trickComplete,
    partnerCardPlayed: result.partnerCardPlayed, partnerAssigned: result.partnerAssigned,
    partnerId: result.partnerId, partnerName: result.partnerName,
    partnerLost: result.partnerLost, partnerLostReason: result.partnerLostReason,
    partnerIds: result.partnerIds
  });

  if (result.trickComplete) {
    const gs = gameService.activeGames.get(roomId);
    const currentScores = gs.players.map(p => ({ socketId: p.socketId, name: p.name, score: p.score }));
    io.to(roomId).emit('TRICK_COMPLETE', {
      roomId, winner: result.trickWinner, winnerName: getPlayerName(roomId, result.trickWinner),
      points: result.trickPoints, cards: result.trickCards, currentScores, nextPlayerId: result.trickWinner
    });
  }

  if (result.gameOver) {
    const finalScores = gameService.getFinalScores(roomId);
    io.to(roomId).emit('GAME_OVER', { roomId, scores: finalScores, winner: result.gameWinner });
  }
}

// ---- bot decision helpers ----
function mostCommonSuit(hand) {
  const counts = {};
  hand.forEach(c => { counts[c.suit] = (counts[c.suit] || 0) + 1; });
  let best = null, n = -1;
  for (const s in counts) if (counts[s] > n) { n = counts[s]; best = s; }
  return best;
}

function pickPartnerCards(gameState, botId, count) {
  const botSet = new Set((gameState.hands[botId] || []).map(c => `${c.rank}_${c.suit}`));
  const pool = new Set();
  for (const sid in gameState.hands) {
    if (sid === botId) continue;
    for (const c of gameState.hands[sid]) pool.add(`${c.rank}_${c.suit}`);
  }
  const order = ['A', 'K', 'Q', 'J', '10', '9', '8', '5', '3'];
  const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
  const picks = [];
  for (const r of order) {
    for (const s of suits) {
      if (picks.length >= count) break;
      const key = `${r}_${s}`;
      if (pool.has(key) && !botSet.has(key)) picks.push({ rank: r, suit: s, occurrence: 1 });
    }
    if (picks.length >= count) break;
  }
  // Fallback: if nothing suitable, just take any pool cards
  if (picks.length === 0) {
    const first = Array.from(pool)[0];
    if (first) { const [rank, suit] = first.split('_'); picks.push({ rank, suit, occurrence: 1 }); }
    else picks.push({ rank: 'A', suit: 'spades', occurrence: 1 });
  }
  return picks;
}

function lowestLegalCard(hand, ledSuit) {
  let legal = hand;
  if (ledSuit) { const follow = hand.filter(c => c.suit === ledSuit); if (follow.length) legal = follow; }
  return legal.slice().sort((a, b) => (RANK_VALUE[a.rank] || 0) - (RANK_VALUE[b.rank] || 0))[0];
}

// One pending bot action per room at a time. Prevents a bot from being
// scheduled twice for the same turn (which caused "two cards in one go").
const botTimers = new Map();
function scheduleBot(roomId, fn) {
  clearTimeout(botTimers.get(roomId));
  const t = setTimeout(() => { botTimers.delete(roomId); fn(); }, BOT_DELAY_MS);
  botTimers.set(roomId, t);
}

// ---- the driver: if the current turn belongs to a bot, make it act ----
function driveBots(io, roomId) {
  const room = roomService.getRoom(roomId);
  const game = gameService.activeGames.get(roomId);
  if (!room || !game) return;

  if (game.phase === 'bidding') {
    const bidding = biddingService.getBiddingState(roomId);
    if (!bidding) return;
    const turnId = bidding.playersOrder[bidding.currentTurnIndex];
    if (isBotId(room, turnId)) scheduleBot(roomId, () => botBid(io, roomId, turnId));
  } else if (game.phase === 'selection') {
    const bidding = biddingService.getBiddingState(roomId);
    if (bidding && isBotId(room, bidding.highestBidder)) scheduleBot(roomId, () => botLead(io, roomId, bidding.highestBidder));
  } else if (game.phase === 'playing' && game.currentTrick) {
    const turnId = game.players[game.currentTrick.currentPlayerIndex] && game.players[game.currentTrick.currentPlayerIndex].socketId;
    if (isBotId(room, turnId)) scheduleBot(roomId, () => botPlay(io, roomId, turnId));
  }
}

// Bots always pass in bidding (keeps a human in control of the contract).
function botBid(io, roomId, botId) {
  const bidding = biddingService.getBiddingState(roomId);
  if (!bidding || bidding.playersOrder[bidding.currentTurnIndex] !== botId) return;
  const result = gameService.passBid(roomId, botId);
  if (result.success) { broadcastPass(io, roomId, result); driveBots(io, roomId); }
  else logger.warn(`Bot pass failed in ${roomId}: ${result.message}`);
}

// If everyone passed and a bot ended up the leader, it auto-picks trump + partner.
function botLead(io, roomId, botId) {
  const game = gameService.activeGames.get(roomId);
  const bidding = biddingService.getBiddingState(roomId);
  if (!game || !bidding || bidding.highestBidder !== botId || game.phase !== 'selection') return;
  const hand = game.hands[botId] || [];

  if (!bidding.trump) {
    const trump = mostCommonSuit(hand) || 'spades';
    const tr = gameService.selectTrump(roomId, botId, trump);
    if (!tr.success) { logger.warn(`Bot trump failed: ${tr.message}`); return; }
    io.to(roomId).emit('TRUMP_SELECTED', { roomId, suit: trump, selectedBy: botId });
  }

  // Declare up to `numberOfPartners` distinct high cards the bot doesn't hold,
  // each at occurrence 1.
  const partners = pickPartnerCards(game, botId, bidding.numberOfPartners);
  const pr = biddingService.setPartnerCards(roomId, botId, partners);
  if (!pr.success) { logger.warn(`Bot partner declaration failed: ${pr.message}`); return; }
  io.to(roomId).emit('PARTNERS_DECLARED', { roomId, partners: pr.partnerCards, selectedBy: botId });

  const gp = gameService.startGameplay(roomId, botId);
  if (gp.success) {
    io.to(roomId).emit('GAMEPLAY_STARTED', {
      roomId,
      players: gp.gameState.players.map(p => ({ socketId: p.socketId, name: p.name, isHost: p.isHost })),
      trump: gp.trump, partnerCard: gp.partnerCard, partnerCards: gp.partnerCards, leader: gp.leader,
      winningBid: gp.winningBid, totalPoints: gp.gameState.totalPointsInDeck
    });
    driveBots(io, roomId);
  } else logger.warn(`Bot start gameplay failed: ${gp.message}`);
}

function botPlay(io, roomId, botId) {
  const game = gameService.activeGames.get(roomId);
  if (!game || game.phase !== 'playing' || !game.currentTrick) return;
  const cur = game.players[game.currentTrick.currentPlayerIndex];
  if (!cur || cur.socketId !== botId) return;
  const hand = game.hands[botId] || [];
  if (!hand.length) return;
  const card = lowestLegalCard(hand, game.currentTrick.ledSuit);
  const result = gameService.playCard(roomId, botId, card.id);
  if (result.success) { broadcastCardPlayed(io, roomId, botId, result); driveBots(io, roomId); }
  else logger.warn(`Bot play failed in ${roomId}: ${result.message}`);
}

export const handleGameSocket = (io, socket) => {
  socket.on('CREATE_ROOM', (data, callback) => {
    const { name, maxPlayers, playerId, config } = data;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      const error = { success: false, error: 'INVALID_NAME', message: 'Player name is required' };
      if (typeof callback === 'function') callback(error);
      socket.emit('ROOM_ERROR', error);
      return;
    }

    if (maxPlayers && maxPlayers < 4) {
      const error = { success: false, error: 'INVALID_MAX_PLAYERS', message: 'Minimum 4 players required' };
      if (typeof callback === 'function') callback(error);
      socket.emit('ROOM_ERROR', error);
      return;
    }

    const result = roomService.createRoom(socket.id, name.trim(), { maxPlayers, playerId, config });

    if (result.success) {
      socket.join(result.room.roomId);

      const hostPlayer = result.room.players.find(p => p.socketId === socket.id);

      const response = {
        roomId: result.room.roomId,
        playerId: hostPlayer?.playerId,
        players: result.room.players,
        hostId: result.room.hostId,
        maxPlayers: result.room.maxPlayers,
        status: result.room.status,
        config: result.room.config
      };

      if (typeof callback === 'function') callback({ success: true, ...response });
      socket.emit('ROOM_CREATED', response);

      logger.info(`Socket ${socket.id} created and joined room ${result.room.roomId}`);
    } else {
      if (typeof callback === 'function') callback(result);
      socket.emit('ROOM_ERROR', result);
    }
  });

  socket.on('JOIN_ROOM', (data, callback) => {
    const { roomId, name, playerId } = data;

    if (!roomId || typeof roomId !== 'string') {
      const error = { success: false, error: 'INVALID_ROOM_ID', message: 'Room ID is required' };
      if (typeof callback === 'function') callback(error);
      socket.emit('ROOM_ERROR', error);
      return;
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      const error = { success: false, error: 'INVALID_NAME', message: 'Player name is required' };
      if (typeof callback === 'function') callback(error);
      socket.emit('ROOM_ERROR', error);
      return;
    }

    const result = roomService.joinRoom(roomId, socket.id, name.trim(), playerId);

    if (result.success) {
      socket.join(roomId);

      const playerInfo = {
        socketId: result.player.socketId,
        name: result.player.name,
        isHost: result.player.isHost
      };

      const roomStateResponse = {
        roomId: result.room.roomId,
        playerId: result.player.playerId,
        players: result.room.players,
        hostId: result.room.hostId,
        maxPlayers: result.room.maxPlayers,
        status: result.room.status,
        config: result.room.config,
        waitingForNextRound: !!result.waitingForNextRound
      };

      if (typeof callback === 'function') callback({ success: true, ...roomStateResponse });
      socket.emit('ROOM_JOINED', roomStateResponse);

      socket.to(roomId).emit('PLAYER_JOINED', {
        player: { ...playerInfo, waiting: !!result.player.waiting },
        playerCount: result.room.players.length
      });

      logger.info(`Socket ${socket.id} (${name}) joined room ${roomId}`);
    } else {
      if (typeof callback === 'function') callback(result);
      socket.emit('ROOM_ERROR', result);
    }
  });

  socket.on('LEAVE_ROOM', (data, callback) => {
    const roomId = data?.roomId || roomService.findRoomBySocketId(socket.id);

    if (!roomId) {
      const error = { success: false, error: 'NOT_IN_ROOM', message: 'Not in any room' };
      if (typeof callback === 'function') callback(error);
      socket.emit('ROOM_ERROR', error);
      return;
    }

    const result = roomService.leaveRoom(roomId, socket.id);

    if (result.success) {
      socket.leave(roomId);

      const playerInfo = {
        socketId: result.leavingPlayer.socketId,
        name: result.leavingPlayer.name,
        wasHost: result.leavingPlayer.isHost
      };

      if (typeof callback === 'function') callback({ success: true });
      socket.emit('ROOM_LEFT', { roomId });

      if (!result.roomEmpty && result.room) {
        io.to(roomId).emit('PLAYER_LEFT', {
          player: playerInfo,
          playerCount: result.room.players.length,
          newHostId: result.newHostId
        });

        if (result.newHostId) {
          io.to(result.newHostId).emit('HOST_ASSIGNED', {
            roomId,
            hostId: result.newHostId
          });
        }
      }

      logger.info(`Socket ${socket.id} left room ${roomId}`);
    } else {
      if (typeof callback === 'function') callback(result);
      socket.emit('ROOM_ERROR', result);
    }
  });

  socket.on('ADD_BOT', (data, callback) => {
    const roomId = data?.roomId || roomService.findRoomBySocketId(socket.id);
    const room = roomId ? roomService.getRoom(roomId) : null;

    if (!room) {
      const error = { success: false, error: 'ROOM_NOT_FOUND', message: 'Room does not exist' };
      if (typeof callback === 'function') callback(error);
      socket.emit('ROOM_ERROR', error);
      return;
    }
    if (room.hostId !== socket.id) {
      const error = { success: false, error: 'NOT_HOST', message: 'Only the host can add bots' };
      if (typeof callback === 'function') callback(error);
      socket.emit('ROOM_ERROR', error);
      return;
    }
    if (room.status !== 'waiting') {
      const error = { success: false, error: 'GAME_IN_PROGRESS', message: 'Add bots before starting a round' };
      if (typeof callback === 'function') callback(error);
      socket.emit('ROOM_ERROR', error);
      return;
    }

    const result = roomService.addBot(roomId);
    if (result.success) {
      io.to(roomId).emit('PLAYER_JOINED', {
        player: { socketId: result.player.socketId, name: result.player.name, isHost: false, isBot: true },
        playerCount: result.room.players.length
      });
      if (typeof callback === 'function') callback({ success: true, player: result.player, playerCount: result.room.players.length });
    } else {
      if (typeof callback === 'function') callback(result);
      socket.emit('ROOM_ERROR', result);
    }
  });

  socket.on('REMOVE_BOT', (data, callback) => {
    const roomId = data?.roomId || roomService.findRoomBySocketId(socket.id);
    const room = roomId ? roomService.getRoom(roomId) : null;

    if (!room || room.hostId !== socket.id) {
      const error = { success: false, error: 'NOT_HOST', message: 'Only the host can remove bots' };
      if (typeof callback === 'function') callback(error);
      socket.emit('ROOM_ERROR', error);
      return;
    }

    const result = roomService.removeBot(roomId);
    if (result.success) {
      io.to(roomId).emit('PLAYER_LEFT', {
        player: { socketId: result.player.socketId, name: result.player.name, wasHost: false },
        playerCount: result.room.players.length,
        newHostId: null
      });
      if (typeof callback === 'function') callback({ success: true, playerCount: result.room.players.length });
    } else {
      if (typeof callback === 'function') callback(result);
      socket.emit('ROOM_ERROR', result);
    }
  });

  socket.on('GET_ROOM_STATE', (data, callback) => {
    const roomId = data?.roomId || roomService.findRoomBySocketId(socket.id);

    if (!roomId) {
      const error = { success: false, error: 'NOT_IN_ROOM', message: 'Not in any room' };
      if (typeof callback === 'function') callback(error);
      socket.emit('ROOM_ERROR', error);
      return;
    }

    const result = roomService.getRoomState(roomId);

    if (result.success) {
      if (typeof callback === 'function') callback(result);
      socket.emit('ROOM_STATE', result.roomState);
    } else {
      if (typeof callback === 'function') callback(result);
      socket.emit('ROOM_ERROR', result);
    }
  });

  socket.on('START_GAME', (data, callback) => {
    logger.info(`[DEBUG] START_GAME event received from socket ${socket.id}`);
    logger.info(`[DEBUG] Data received:`, JSON.stringify(data));

    const roomId = data?.roomId || roomService.findRoomBySocketId(socket.id);
    logger.info(`[DEBUG] Resolved roomId: ${roomId}`);

    if (!roomId) {
      logger.error(`[DEBUG] No roomId found for socket ${socket.id}`);
      const error = { success: false, error: 'NOT_IN_ROOM', message: 'Not in any room' };
      if (typeof callback === 'function') callback(error);
      socket.emit('ROOM_ERROR', error);
      return;
    }

    const room = roomService.getRoom(roomId);
    logger.info(`[DEBUG] Room found: ${room ? 'YES' : 'NO'}, hostId: ${room?.hostId}, requesting socket: ${socket.id}`);

    if (!room) {
      logger.error(`[DEBUG] Room ${roomId} not found`);
      const error = { success: false, error: 'ROOM_NOT_FOUND', message: 'Room does not exist' };
      if (typeof callback === 'function') callback(error);
      socket.emit('ROOM_ERROR', error);
      return;
    }

    const numberOfPlayers = room.players.length; // Use actual room player count

    if (numberOfPlayers < 4) {
      const error = { success: false, error: 'INVALID_PLAYER_COUNT', message: 'At least 4 players are required to start' };
      if (typeof callback === 'function') callback(error);
      socket.emit('ROOM_ERROR', error);
      return;
    }

    // Host may tweak settings from the start screen; persist them on the room.
    if (data.config && room.hostId === socket.id) {
      roomService.updateConfig(roomId, data.config);
    }

    // Card setup is host-configured on the room (decks, cards-per-player, etc.)
    logger.info(`Starting game in room ${roomId}:`, JSON.stringify(room.config));

    try {
      const result = gameService.startGame(roomId, socket.id, {});

      logger.info(`[DEBUG] gameService.startGame returned:`, JSON.stringify(result));

      if (result.success) {
        logger.info(`Game started successfully, preparing to emit events...`);

        const gameState = result.gameState;

        // Log game state for debugging
        logger.info(`[DEBUG] Game state: players=${gameState.players.length}, phase=${gameState.phase}`);

        // Send each player their private hand
        gameState.players.forEach(player => {
          const playerSocket = io.of('/').sockets.get(player.socketId);
          if (playerSocket) {
            const playerHand = gameService.getPlayerHand(roomId, player.socketId);
            if (playerHand.success) {
              logger.info(`[DEBUG] Sending ${playerHand.cards.length} cards to player ${player.name} (${player.socketId.substring(0, 8)}...)`);
              playerSocket.emit('PLAYER_HAND', {
                cards: playerHand.cards,
                cardsPerPlayer: result.cardsPerPlayer,
                totalCards: result.totalCards
              });
              logger.info(`Sent ${playerHand.cards.length} cards to player ${player.name} (${player.socketId.substring(0, 8)}...)`);
            } else {
              logger.error(`[DEBUG] Failed to get hand for player ${player.name}: ${playerHand.message}`);
            }
          } else {
            logger.warn(`Could not find socket for player ${player.name} (${player.socketId.substring(0, 8)}...)`);
          }
        });

        // Broadcast game started to room (without card data)
        io.to(roomId).emit('GAME_STARTED', {
          roomId,
          players: gameState.players.map(p => ({
            socketId: p.socketId,
            name: p.name,
            isHost: p.isHost,
            cardsInHand: p.cardsInHand
          })),
          cardsPerPlayer: result.cardsPerPlayer,
          totalCards: result.totalCards
        });

        logger.info(`[DEBUG] Emitted GAME_STARTED to room ${roomId}`);

        // Emit NEXT_ROUND_STARTED for subsequent rounds
        if (result.isSubsequentRound) {
          io.to(roomId).emit('NEXT_ROUND_STARTED', {
            roomId,
            roundNumber: result.roundNumber,
            cumulativeScores: roomService.getRoom(roomId)?.cumulativeScores
          });
          logger.info(`Next round started: Round ${result.roundNumber}`);
        }

        // Emit BIDDING_STARTED to room
        const biddingStartedData = {
          minBid: result.bidding.minimumBid,
          totalPoints: result.bidding.totalPoints,
          currentTurn: result.bidding.playersOrder[result.bidding.currentTurnIndex],
          numberOfSets: result.bidding.numberOfSets
        };

        logger.info(`Emitting BIDDING_STARTED to room ${roomId}: minBid=${biddingStartedData.minBid}, currentTurn=${biddingStartedData.currentTurn.substring(0, 8)}..., numberOfSets=${biddingStartedData.numberOfSets}`);

        io.to(roomId).emit('BIDDING_STARTED', biddingStartedData);
        logger.info(`[DEBUG] Emitted BIDDING_STARTED to room ${roomId}`);

        // FALLBACK: Also emit directly to each socket to ensure they receive the events
        logger.info(`[DEBUG] FALLBACK: Emitting directly to each socket in room`);
        const allSockets = io.of('/').sockets;
        for (const [socketId, individualSocket] of allSockets) {
          if (gameState.players.find(p => p.socketId === socketId)) {
            logger.info(`[DEBUG] FALLBACK: Emitting GAME_STARTED and BIDDING_STARTED to socket ${socketId.substring(0, 8)}...`);
            individualSocket.emit('GAME_STARTED', {
              roomId,
              players: gameState.players.map(p => ({
                socketId: p.socketId,
                name: p.name,
                isHost: p.isHost,
                cardsInHand: p.cardsInHand
              })),
              cardsPerPlayer: result.cardsPerPlayer,
              totalCards: result.totalCards
            });
            individualSocket.emit('BIDDING_STARTED', biddingStartedData);
          }
        }

        if (typeof callback === 'function') callback({
          success: true,
          players: gameState.players,
          cardsPerPlayer: result.cardsPerPlayer,
          totalCards: result.totalCards,
          bidding: result.bidding
        });

        // Also emit response as event for all clients
        io.to(roomId).emit('START_GAME_RESPONSE', {
          success: true,
          players: gameState.players,
          cardsPerPlayer: result.cardsPerPlayer,
          totalCards: result.totalCards,
          bidding: result.bidding
        });

        // FALLBACK: Also emit START_GAME_RESPONSE directly to each socket
        for (const [socketId, individualSocket] of allSockets) {
          if (gameState.players.find(p => p.socketId === socketId)) {
            individualSocket.emit('START_GAME_RESPONSE', {
              success: true,
              players: gameState.players,
              cardsPerPlayer: result.cardsPerPlayer,
              totalCards: result.totalCards,
              bidding: result.bidding
            });
          }
        }

        logger.info(`Game started in room ${roomId}: ${gameState.players.length} players, ${result.cardsPerPlayer} cards each, phase: bidding`);

        // If the first bidder is a bot, let it act.
        driveBots(io, roomId);
      } else {
        if (typeof callback === 'function') callback(result);
        socket.emit('ROOM_ERROR', result);
      }
    } catch (error) {
      logger.error(`[ERROR] Exception in START_GAME: ${error.message}`);
      logger.error(`[ERROR] Stack: ${error.stack}`);
      const errorResult = {
        success: false,
        error: 'INTERNAL_ERROR',
        message: `Server error: ${error.message}`
      };
      if (typeof callback === 'function') callback(errorResult);
      socket.emit('ROOM_ERROR', errorResult);
    }
  });

  // ============================================
  // BIDDING SYSTEM EVENTS
  // ============================================

  socket.on('PLACE_BID', (data, callback) => {
    const roomId = data?.roomId || roomService.findRoomBySocketId(socket.id);
    const { bidValue } = data;

    if (!roomId) {
      const error = { success: false, error: 'NOT_IN_ROOM', message: 'Not in any room' };
      if (typeof callback === 'function') callback(error);
      socket.emit('ROOM_ERROR', error);
      return;
    }

    if (!bidValue || typeof bidValue !== 'number') {
      const error = { success: false, error: 'INVALID_BID', message: 'Bid value must be a number' };
      if (typeof callback === 'function') callback(error);
      socket.emit('ROOM_ERROR', error);
      return;
    }

    const result = gameService.placeBid(roomId, socket.id, bidValue);

    if (result.success) {
      io.to(roomId).emit('BID_UPDATED', {
        roomId,
        bidValue: result.currentBid,
        bidder: result.highestBidder,
        nextTurn: result.nextTurn
      });

      if (typeof callback === 'function') callback(result);

      logger.info(`Player ${socket.id.substring(0, 8)}... bid ${bidValue} in room ${roomId}`);
      driveBots(io, roomId);
    } else {
      if (typeof callback === 'function') callback(result);
      socket.emit('ROOM_ERROR', result);
    }
  });

  socket.on('PASS_BID', (data, callback) => {
    const roomId = data?.roomId || roomService.findRoomBySocketId(socket.id);

    if (!roomId) {
      const error = { success: false, error: 'NOT_IN_ROOM', message: 'Not in any room' };
      if (typeof callback === 'function') callback(error);
      socket.emit('ROOM_ERROR', error);
      return;
    }

    const result = gameService.passBid(roomId, socket.id);

    if (result.success) {
      io.to(roomId).emit('PLAYER_PASSED', {
        roomId,
        player: result.passedPlayer,
        nextTurn: result.nextTurn,
        remainingPlayers: result.remainingPlayers
      });

      // Check if bidding ended
      if (result.biddingEnded) {
        // If no leader (shouldn't happen with new logic), handle as error
        if (!result.endResult?.leader) {
          logger.error(`Bidding ended in room ${roomId} with no leader`);
          if (typeof callback === 'function') callback(result);
          return;
        }

        // Collect all cards in play for the partner selection dropdown
        const gameState = gameService.activeGames.get(roomId);
        const cardPool = new Set(); // Use Set to avoid duplicates

        if (gameState && gameState.hands) {
          // Collect all unique cards from all hands
          for (const socketId in gameState.hands) {
            const hand = gameState.hands[socketId];
            for (const card of hand) {
              // Add unique card identifier (rank + suit)
              cardPool.add(`${card.rank}_${card.suit}`);
            }
          }
          logger.info(`Collected ${cardPool.size} unique cards from ${Object.keys(gameState.hands).length} players for card pool`);
        } else {
          logger.error(`[BUG] Cannot generate cardPool - gameState: ${!!gameState}, hands: ${!!gameState?.hands}`);
          // Fallback: Create a standard deck card pool if hands are not available
          const standardDeck = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
          const suits = ['spades', 'hearts', 'diamonds', 'clubs'];
          for (const rank of standardDeck) {
            for (const suit of suits) {
              cardPool.add(`${rank}_${suit}`);
            }
          }
          logger.info(`Using fallback standard deck card pool with ${cardPool.size} cards`);
        }

        // Convert Set to array for JSON serialization
        const cardPoolArray = Array.from(cardPool).sort();

        io.to(roomId).emit('BIDDING_ENDED', {
          roomId,
          leader: result.endResult.leader,
          winningBid: result.endResult.winningBid,
          minimumBid: result.endResult.minimumBid,
          totalPoints: result.endResult.totalPoints,
          allowedPartners: result.endResult.allowedPartners,
          cardPool: cardPoolArray
        });

        logger.info(`Bidding ended in room ${roomId}. Leader: ${result.endResult.leader?.substring(0, 8)}..., Bid: ${result.endResult.winningBid}, Card pool size: ${cardPoolArray.length}`);
      }

      if (typeof callback === 'function') callback(result);

      logger.info(`Player ${socket.id.substring(0, 8)}... passed in room ${roomId}`);
      driveBots(io, roomId);
    } else {
      if (typeof callback === 'function') callback(result);
      socket.emit('ROOM_ERROR', result);
    }
  });

  socket.on('SELECT_TRUMP', (data, callback) => {
    const roomId = data?.roomId || roomService.findRoomBySocketId(socket.id);
    const { suit } = data;

    if (!roomId) {
      const error = { success: false, error: 'NOT_IN_ROOM', message: 'Not in any room' };
      if (typeof callback === 'function') callback(error);
      socket.emit('ROOM_ERROR', error);
      return;
    }

    const validSuits = ['spades', 'hearts', 'diamonds', 'clubs'];
    if (!suit || !validSuits.includes(suit)) {
      const error = { success: false, error: 'INVALID_SUIT', message: 'Invalid suit. Must be spades, hearts, diamonds, or clubs' };
      if (typeof callback === 'function') callback(error);
      socket.emit('ROOM_ERROR', error);
      return;
    }

    const result = gameService.selectTrump(roomId, socket.id, suit);

    if (result.success) {
      io.to(roomId).emit('TRUMP_SELECTED', {
        roomId,
        suit: result.trump,
        selectedBy: socket.id
      });

      if (typeof callback === 'function') callback(result);

      logger.info(`Trump selected in room ${roomId}: ${suit} by ${socket.id.substring(0, 8)}...`);
    } else {
      if (typeof callback === 'function') callback(result);
      socket.emit('ROOM_ERROR', result);
    }
  });

  // ============================================
  // GAMEPLAY EVENTS
  // ============================================

  socket.on('PLAY_CARD', (data, callback) => {
    const roomId = data?.roomId || roomService.findRoomBySocketId(socket.id);
    const { cardId } = data;

    if (!roomId) {
      const error = { success: false, error: 'NOT_IN_ROOM', message: 'Not in any room' };
      if (typeof callback === 'function') callback(error);
      socket.emit('ROOM_ERROR', error);
      return;
    }

    if (!cardId) {
      const error = { success: false, error: 'INVALID_CARD', message: 'Card ID is required' };
      if (typeof callback === 'function') callback(error);
      socket.emit('ROOM_ERROR', error);
      return;
    }

    const result = gameService.playCard(roomId, socket.id, cardId);

    if (result.success) {
      // Get next player for turn indication
      const gameState = gameService.activeGames.get(roomId);
      const nextPlayerId = gameState?.currentTrick?.currentPlayerIndex !== undefined
        ? gameState.players[gameState.currentTrick.currentPlayerIndex]?.socketId
        : null;

      // Broadcast card played to room
      io.to(roomId).emit('CARD_PLAYED', {
        roomId,
        playerId: socket.id,
        playerName: getPlayerName(roomId, socket.id),
        card: result.card,
        cardsRemaining: result.cardsRemaining,
        nextPlayerId: nextPlayerId,
        trickComplete: result.trickComplete,
        partnerCardPlayed: result.partnerCardPlayed,
        partnerAssigned: result.partnerAssigned,
        partnerId: result.partnerId,
        partnerName: result.partnerName,
        partnerLost: result.partnerLost,
        partnerLostReason: result.partnerLostReason,
        partnerIds: result.partnerIds
      });

      // Check if trick is complete
      if (result.trickComplete) {
        // Get updated scores
        const gameState = gameService.activeGames.get(roomId);
        const currentScores = gameState.players.map(p => ({
          socketId: p.socketId,
          name: p.name,
          score: p.score
        }));

        io.to(roomId).emit('TRICK_COMPLETE', {
          roomId,
          winner: result.trickWinner,
          winnerName: getPlayerName(roomId, result.trickWinner),
          points: result.trickPoints,
          cards: result.trickCards,
          currentScores: currentScores,
          nextPlayerId: result.trickWinner
        });

        logger.info(`Trick complete in room ${roomId}. Winner: ${result.trickWinner.substring(0, 8)}..., Points: ${result.trickPoints}`);
      }

      // Check if game is over
      if (result.gameOver) {
        const finalScores = gameService.getFinalScores(roomId);
        io.to(roomId).emit('GAME_OVER', {
          roomId,
          scores: finalScores,
          winner: result.gameWinner
        });

        logger.info(`Game over in room ${roomId}. Winner: ${result.gameWinner}`);
      }

      if (typeof callback === 'function') callback(result);

      logger.info(`Player ${socket.id.substring(0, 8)}... played card in room ${roomId}`);
      driveBots(io, roomId);
    } else {
      if (typeof callback === 'function') callback(result);
      socket.emit('ROOM_ERROR', result);
    }
  });

  // ============================================
  // PARTNER SELECTION EVENTS
  // ============================================

  socket.on('START_GAMEPLAY', (data, callback) => {
    const roomId = data?.roomId || roomService.findRoomBySocketId(socket.id);

    if (!roomId) {
      const error = { success: false, error: 'NOT_IN_ROOM', message: 'Not in any room' };
      if (typeof callback === 'function') callback(error);
      socket.emit('ROOM_ERROR', error);
      return;
    }

    // Debug: Log socket rooms
    const rooms = socket.rooms;
    logger.info(`Socket ${socket.id.substring(0, 8)}... rooms:`, Array.from(rooms));
    logger.info(`Socket ${socket.id.substring(0, 8)}... is in room ${roomId}:`, rooms.has(roomId));

    const result = gameService.startGameplay(roomId, socket.id);

    if (result.success) {
      // Broadcast game started to room
      const eventData = {
        roomId,
        players: result.gameState.players.map(p => ({
          socketId: p.socketId,
          name: p.name,
          isHost: p.isHost
        })),
        trump: result.trump,
        partnerCard: result.partnerCard, // legacy single card
        partnerCards: result.partnerCards, // full list of { rank, suit, occurrence }
        leader: result.leader,
        winningBid: result.winningBid,
        totalPoints: result.gameState.totalPointsInDeck // Fixed: Send actual total points, not card count
      };

      logger.info(`Broadcasting GAMEPLAY_STARTED to room ${roomId} with partnerCard:`, JSON.stringify(eventData.partnerCard));
      logger.info(`Broadcasting GAMEPLAY_STARTED to room ${roomId} with data:`, JSON.stringify(eventData));
      io.to(roomId).emit('GAMEPLAY_STARTED', eventData);

      if (typeof callback === 'function') callback(result);

      logger.info(`Gameplay started in room ${roomId}`);
      driveBots(io, roomId);
    } else {
      if (typeof callback === 'function') callback(result);
      socket.emit('ROOM_ERROR', result);
    }
  });

  // Declare the full set of partner cards at once (card + occurrence each).
  socket.on('DECLARE_PARTNERS', (data, callback) => {
    const roomId = data?.roomId || roomService.findRoomBySocketId(socket.id);
    const { partners } = data || {};

    if (!roomId) {
      const error = { success: false, error: 'NOT_IN_ROOM', message: 'Not in any room' };
      if (typeof callback === 'function') callback(error);
      socket.emit('ROOM_ERROR', error);
      return;
    }

    const result = biddingService.setPartnerCards(roomId, socket.id, partners);
    if (result.success) {
      io.to(roomId).emit('PARTNERS_DECLARED', { roomId, partners: result.partnerCards, selectedBy: socket.id });
      if (typeof callback === 'function') callback(result);
      logger.info(`Partners declared in room ${roomId} by ${socket.id.substring(0, 8)}...`);
    } else {
      if (typeof callback === 'function') callback(result);
      socket.emit('ROOM_ERROR', result);
    }
  });

  socket.on('SELECT_PARTNER_CARD', (data, callback) => {
    const roomId = data?.roomId || roomService.findRoomBySocketId(socket.id);
    const { rank, suit, preferredPosition } = data;

    if (!roomId) {
      const error = { success: false, error: 'NOT_IN_ROOM', message: 'Not in any room' };
      if (typeof callback === 'function') callback(error);
      socket.emit('ROOM_ERROR', error);
      return;
    }

    if (!rank || !suit) {
      const error = { success: false, error: 'INVALID_CARD', message: 'Rank and suit are required' };
      if (typeof callback === 'function') callback(error);
      socket.emit('ROOM_ERROR', error);
      return;
    }

    // Get game state to calculate leader's card count
    const gameState = gameService.activeGames.get(roomId);
    let leaderCardCount = 0;

    if (gameState && gameState.hands) {
      const leaderHand = gameState.hands[socket.id] || [];
      leaderCardCount = leaderHand.filter(c => c.rank === rank && c.suit === suit).length;
    }

    const result = biddingService.selectPartnerCard(roomId, socket.id, rank, suit, preferredPosition, leaderCardCount);

    if (result.success) {
      // Calculate max position for frontend
      const bidding = biddingService.activeBiddings.get(roomId);
      const maxPosition = bidding ? (bidding.numberOfSets - leaderCardCount) : 2;

      // Just emit that partner card was selected - leader will start game manually
      io.to(roomId).emit('PARTNER_CARD_SELECTED', {
        roomId,
        partnerCard: result.partnerCard,
        selectedBy: socket.id,
        preferredPosition: preferredPosition,
        leaderCardCount: leaderCardCount,
        maxPosition: maxPosition,
        numberOfSets: bidding?.numberOfSets || 2
      });

      logger.info(`Partner card selected in room ${roomId}: ${rank} of ${suit} by ${socket.id.substring(0, 8)}...` + (preferredPosition ? ` (Preferred position: ${preferredPosition})` : ''));

      if (typeof callback === 'function') callback(result);
    } else {
      if (typeof callback === 'function') callback(result);
      socket.emit('ROOM_ERROR', result);
    }
  });

  socket.on('GET_BIDDING_STATE', (data, callback) => {
    const roomId = data?.roomId || roomService.findRoomBySocketId(socket.id);

    if (!roomId) {
      const error = { success: false, error: 'NOT_IN_ROOM', message: 'Not in any room' };
      if (typeof callback === 'function') callback(error);
      socket.emit('ROOM_ERROR', error);
      return;
    }

    const result = biddingService.getBiddingInfo(roomId);

    if (result.success) {
      if (typeof callback === 'function') callback(result);
      socket.emit('BIDDING_STATE', result.bidding);
    } else {
      if (typeof callback === 'function') callback(result);
      socket.emit('ROOM_ERROR', result);
    }
  });

  // Reconnect after a temporary drop (app backgrounded, network blip, etc).
  // The player keeps their seat for GRACE_PERIOD_MS; here we rebind their
  // stable playerId to the new socket and replay the current state.
  socket.on('REJOIN_ROOM', (data, callback) => {
    const { playerId } = data || {};

    if (!playerId || typeof playerId !== 'string') {
      const error = { success: false, error: 'INVALID_PLAYER_ID', message: 'playerId is required to rejoin' };
      if (typeof callback === 'function') callback(error);
      socket.emit('ROOM_ERROR', error);
      return;
    }

    const roomId = data.roomId || roomService.findRoomByPlayerId(playerId);
    const room = roomId ? roomService.getRoom(roomId) : null;

    if (!room || !roomService.findPlayerByPlayerId(room, playerId)) {
      const error = { success: false, error: 'REJOIN_FAILED', message: 'Your seat is no longer available. Please join again.' };
      if (typeof callback === 'function') callback(error);
      socket.emit('REJOIN_FAILED', error);
      return;
    }

    const oldSocketId = roomService.findPlayerByPlayerId(room, playerId).socketId;

    // Rebind room membership, then the active game/bidding state, to the new id
    const rebind = roomService.rebindSocket(roomId, playerId, socket.id);
    if (!rebind.success) {
      if (typeof callback === 'function') callback(rebind);
      socket.emit('REJOIN_FAILED', rebind);
      return;
    }

    if (gameService.hasGame(roomId)) {
      gameService.rebindSocket(roomId, oldSocketId, socket.id);
    }

    clearDisconnectTimer(playerId);
    socket.join(roomId);

    const roomState = roomService.getRoomState(roomId).roomState;

    let game = null;
    if (gameService.hasGame(roomId)) {
      const snap = gameService.getReconnectSnapshot(roomId, socket.id);
      if (snap.success) game = snap.snapshot;
    }

    const payload = {
      roomId,
      playerId,
      hostId: room.hostId,
      isHost: socket.id === room.hostId,
      players: roomState.players,
      status: room.status,
      config: room.config,
      cumulativeScores: room.cumulativeScores || null,
      game
    };

    if (typeof callback === 'function') callback({ success: true, ...payload });
    socket.emit('REJOINED', payload);

    socket.to(roomId).emit('PLAYER_RECONNECTED', {
      roomId,
      player: { socketId: socket.id, name: rebind.player.name, isHost: rebind.player.isHost },
      playerCount: room.players.length
    });

    logger.info(`Player ${rebind.player.name} (${playerId}) rejoined room ${roomId} as ${socket.id}`);
  });

  socket.on('disconnect', () => {
    const roomId = roomService.findRoomBySocketId(socket.id);
    if (!roomId) return;

    const room = roomService.getRoom(roomId);
    const player = room ? roomService.findPlayerBySocketId(room, socket.id) : null;
    if (!player) return;

    // Keep the player in the room and start the grace period instead of
    // removing them right away, so they can reconnect and resume the game.
    roomService.markDisconnected(roomId, socket.id);

    io.to(roomId).emit('PLAYER_DISCONNECTED', {
      roomId,
      player: {
        socketId: player.socketId,
        playerId: player.playerId,
        name: player.name,
        isHost: player.isHost
      },
      playerCount: room.players.length,
      gracePeriodMs: GRACE_PERIOD_MS
    });

    scheduleEviction(io, roomId, player.playerId);

    logger.info(`Socket ${socket.id} (${player.name}) disconnected from room ${roomId}; grace period ${GRACE_PERIOD_MS}ms`);
  });

  socket.on('error', (error) => {
    logger.error(`Socket error for ${socket.id}:`, error);
  });
};
