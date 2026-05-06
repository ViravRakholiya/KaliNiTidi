import { logger } from '../utils/logger.js';
import { roomService } from '../services/roomService.js';
import { gameService } from '../services/gameService.js';
import { deckService } from '../engine/deckService.js';
import { biddingService } from '../services/biddingService.js';

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
    const roomId = data?.roomId || roomService.findRoomBySocketId(socket.id);

    if (!roomId) {
      const error = { success: false, error: 'NOT_IN_ROOM', message: 'Not in any room' };
      if (typeof callback === 'function') callback(error);
      socket.emit('ROOM_ERROR', error);
      return;
    }

    const room = roomService.getRoom(roomId);
    if (!room) {
      const error = { success: false, error: 'ROOM_NOT_FOUND', message: 'Room does not exist' };
      if (typeof callback === 'function') callback(error);
      socket.emit('ROOM_ERROR', error);
      return;
    }

    const { cardsPerPlayer, numberOfSets } = data;
    const numberOfPlayers = room.players.length; // Use actual room player count

    // Validate cardsPerPlayer
    if (cardsPerPlayer !== undefined && (typeof cardsPerPlayer !== 'number' || cardsPerPlayer < 11 || cardsPerPlayer > 52)) {
      const error = { success: false, error: 'INVALID_CARDS_PER_PLAYER', message: 'Cards per player must be between 11 and 52' };
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

    const result = gameService.startGame(roomId, socket.id, {
      cardsPerPlayer,
      numberOfPlayers,
      numberOfSets
    });

    if (result.success) {
      logger.info(`Game started successfully, preparing to emit events...`);

      const gameState = result.gameState;

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

      // Emit BIDDING_STARTED to room
      const biddingStartedData = {
        minBid: result.bidding.minimumBid,
        totalPoints: result.bidding.totalPoints,
        currentTurn: result.bidding.playersOrder[result.bidding.currentTurnIndex]
      };

      logger.info(`Emitting BIDDING_STARTED to room ${roomId}: minBid=${biddingStartedData.minBid}, currentTurn=${biddingStartedData.currentTurn.substring(0, 8)}...`);

      io.to(roomId).emit('BIDDING_STARTED', biddingStartedData);

      if (typeof callback === 'function') callback({
        success: true,
        players: gameState.players,
        cardsPerPlayer: result.cardsPerPlayer,
        totalCards: result.totalCards,
        bidding: result.bidding
      });

      logger.info(`Game started in room ${roomId}: ${gameState.players.length} players, ${result.cardsPerPlayer} cards each, phase: bidding`);
    } else {
      if (typeof callback === 'function') callback(result);
      socket.emit('ROOM_ERROR', result);
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

  socket.on('SELECT_PARTNER_CARD', (data, callback) => {
    const roomId = data?.roomId || roomService.findRoomBySocketId(socket.id);
    const { rank, suit } = data;

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

    const result = gameService.selectPartnerCard(roomId, socket.id, rank, suit);

    if (result.success) {
      // If selection is complete and game moves to playing
      if (result.phase === 'playing') {
        io.to(roomId).emit('SELECTION_DONE', {
          roomId,
          leader: result.leader,
          trump: result.trump,
          partnerCards: result.partnerCards,
          numberOfPartners: result.numberOfPartners,
          winningBid: result.winningBid,
          phase: 'playing'
        });

        // Notify all partners privately
        if (result.partnerIds && result.partnerIds.length > 0) {
          result.partnerIds.forEach((partnerId, index) => {
            const partnerSocket = io.of('/').sockets.get(partnerId);
            if (partnerSocket) {
              partnerSocket.emit('YOU_ARE_PARTNER', {
                roomId,
                leader: result.leader,
                partnerCards: result.partnerCards,
                yourPartnerIndex: index
              });
              logger.info(`Partner ${index + 1} notified in room ${roomId}: ${partnerId.substring(0, 8)}...`);
            } else {
              logger.warn(`Could not find socket for partner ${partnerId.substring(0, 8)}...`);
            }
          });
        }

        logger.info(`Selection complete in room ${roomId}. Moving to playing phase. Partners: ${result.partnerIds?.length || 0}`);
      } else {
        // Just partner card selected, more may be needed
        io.to(roomId).emit('PARTNER_CARD_SELECTED', {
          roomId,
          partnerCard: result.partnerCard,
          selectedCount: result.selectedCount,
          requiredCount: result.requiredCount,
          selectedBy: socket.id
        });

        logger.info(`Partner card ${result.selectedCount}/${result.requiredCount} selected in room ${roomId}: ${rank} of ${suit}`);
      }

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
