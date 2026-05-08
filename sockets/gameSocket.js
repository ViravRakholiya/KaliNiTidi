import { logger } from '../utils/logger.js';
import { roomService } from '../services/roomService.js';
import { gameService } from '../services/gameService.js';
import { deckService } from '../engine/deckService.js';
import { biddingService } from '../services/biddingService.js';

// Helper function to get player name
function getPlayerName(roomId, socketId) {
  const room = roomService.getRoom(roomId);
  if (!room) return 'Unknown';

  const player = room.players.find(p => p.socketId === socketId);
  return player ? player.name : 'Unknown';
}

export const handleGameSocket = (io, socket) => {
  socket.on('CREATE_ROOM', (data, callback) => {
    const { name, maxPlayers } = data;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      const error = { success: false, error: 'INVALID_NAME', message: 'Player name is required' };
      if (typeof callback === 'function') callback(error);
      socket.emit('ROOM_ERROR', error);
      return;
    }

    if (maxPlayers && maxPlayers < 4) {
      const error = { success: false, error: 'INVALID_MAX_PLAYERS', message: 'Minimum 4 players required (must be even number)' };
      if (typeof callback === 'function') callback(error);
      socket.emit('ROOM_ERROR', error);
      return;
    }

    if (maxPlayers && maxPlayers % 2 !== 0) {
      const error = { success: false, error: 'INVALID_MAX_PLAYERS', message: 'Number of players must be even (4, 6, 8, 10, ...)' };
      if (typeof callback === 'function') callback(error);
      socket.emit('ROOM_ERROR', error);
      return;
    }

    const result = roomService.createRoom(socket.id, name.trim(), { maxPlayers });

    if (result.success) {
      socket.join(result.room.roomId);

      const response = {
        roomId: result.room.roomId,
        players: result.room.players,
        hostId: result.room.hostId,
        maxPlayers: result.room.maxPlayers,
        status: result.room.status
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
    const { roomId, name } = data;

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

    const result = roomService.joinRoom(roomId, socket.id, name.trim());

    if (result.success) {
      socket.join(roomId);

      const playerInfo = {
        socketId: result.player.socketId,
        name: result.player.name,
        isHost: result.player.isHost
      };

      const roomStateResponse = {
        roomId: result.room.roomId,
        players: result.room.players,
        hostId: result.room.hostId,
        maxPlayers: result.room.maxPlayers,
        status: result.room.status
      };

      if (typeof callback === 'function') callback({ success: true, ...roomStateResponse });
      socket.emit('ROOM_JOINED', roomStateResponse);

      socket.to(roomId).emit('PLAYER_JOINED', {
        player: playerInfo,
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

    const { cardsPerPlayer, numberOfSets } = data;
    const numberOfPlayers = room.players.length; // Use actual room player count

    // Validate cardsPerPlayer
    if (cardsPerPlayer !== undefined && (typeof cardsPerPlayer !== 'number' || cardsPerPlayer < 13 || cardsPerPlayer > 52)) {
      const error = { success: false, error: 'INVALID_CARDS_PER_PLAYER', message: 'Cards per player must be between 13 and 52' };
      if (typeof callback === 'function') callback(error);
      socket.emit('ROOM_ERROR', error);
      return;
    }

    // Validate numberOfPlayers (must be even)
    if (numberOfPlayers < 4 || numberOfPlayers % 2 !== 0) {
      const error = { success: false, error: 'INVALID_PLAYER_COUNT', message: 'Number of players must be at least 4 and even (4, 6, 8, 10, ...)' };
      if (typeof callback === 'function') callback(error);
      socket.emit('ROOM_ERROR', error);
      return;
    }

    // Validate numberOfSets
    if (numberOfSets !== undefined && (typeof numberOfSets !== 'number' || numberOfSets < 2 || numberOfSets > 6)) {
      const error = { success: false, error: 'INVALID_SETS', message: 'Number of sets must be between 2 and 6' };
      if (typeof callback === 'function') callback(error);
      socket.emit('ROOM_ERROR', error);
      return;
    }

    // Start the game with card distribution
    logger.info(`Starting game in room ${roomId}: cardsPerPlayer=${cardsPerPlayer}, numberOfPlayers=${numberOfPlayers}, numberOfSets=${numberOfSets}`);

    try {
      const result = gameService.startGame(roomId, socket.id, {
        cardsPerPlayer,
        numberOfPlayers,
        numberOfSets
      });

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
              playerSocket.emit('PLAYER_HAND', {
                cards: playerHand.cards,
                cardsPerPlayer: result.cardsPerPlayer,
                totalCards: result.totalCards
              });
              logger.info(`Sent ${playerHand.cards.length} cards to player ${player.name} (${player.socketId.substring(0, 8)}...)`);
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
          currentTurn: result.bidding.playersOrder[result.bidding.currentTurnIndex]
        };

        logger.info(`Emitting BIDDING_STARTED to room ${roomId}: minBid=${biddingStartedData.minBid}, currentTurn=${biddingStartedData.currentTurn.substring(0, 8)}...`);

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
        io.to(roomId).emit('BIDDING_ENDED', {
          roomId,
          leader: result.endResult.leader,
          winningBid: result.endResult.winningBid,
          minimumBid: result.endResult.minimumBid,
          totalPoints: result.endResult.totalPoints
        });

        logger.info(`Bidding ended in room ${roomId}. Leader: ${result.endResult.leader.substring(0, 8)}..., Bid: ${result.endResult.winningBid}`);
      }

      if (typeof callback === 'function') callback(result);

      logger.info(`Player ${socket.id.substring(0, 8)}... passed in room ${roomId}`);
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
        secondPartnerCardPlayed: result.secondPartnerCardPlayed,
        opponentId: result.opponentId,
        opponentName: result.opponentName
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
        partnerCard: result.partnerCard,
        leader: result.leader,
        winningBid: result.winningBid,
        totalPoints: result.gameState.totalPoints
      };

      logger.info(`Broadcasting GAMEPLAY_STARTED to room ${roomId} with data:`, JSON.stringify(eventData));
      io.to(roomId).emit('GAMEPLAY_STARTED', eventData);

      if (typeof callback === 'function') callback(result);

      logger.info(`Gameplay started in room ${roomId}`);
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

    const result = biddingService.selectPartnerCard(roomId, socket.id, rank, suit, preferredPosition);

    if (result.success) {
      // Just emit that partner card was selected - leader will start game manually
      io.to(roomId).emit('PARTNER_CARD_SELECTED', {
        roomId,
        partnerCard: result.partnerCard,
        selectedBy: socket.id,
        preferredPosition: preferredPosition
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

  socket.on('disconnect', () => {
    const roomId = roomService.findRoomBySocketId(socket.id);

    if (roomId) {
      const result = roomService.leaveRoom(roomId, socket.id);

      if (result.success && !result.roomEmpty && result.room) {
        const playerInfo = {
          socketId: result.leavingPlayer.socketId,
          name: result.leavingPlayer.name,
          wasHost: result.leavingPlayer.isHost
        };

        io.to(roomId).emit('PLAYER_LEFT', {
          player: playerInfo,
          playerCount: result.room.players.length,
          newHostId: result.newHostId,
          disconnected: true
        });

        if (result.newHostId) {
          io.to(result.newHostId).emit('HOST_ASSIGNED', {
            roomId,
            hostId: result.newHostId
          });
        }
      }

      logger.info(`Socket ${socket.id} disconnected and left room ${roomId}`);
    }
  });

  socket.on('error', (error) => {
    logger.error(`Socket error for ${socket.id}:`, error);
  });
};
