// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from the current directory
app.use(express.static(path.join(__dirname)));

// Serve index.html for the root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Game constants
const MAX_PLAYERS_PER_ROOM = 8;
const GAME_TIME = 900; // 15 minutes in seconds
const INITIAL_FLOWERS = 50;
const COLORS = [
  '#FF6B8B', // pink
  '#64B5F6', // blue
  '#81C784', // green
  '#FFD54F', // yellow
  '#BA68C8', // purple
  '#4FC3F7', // light blue
  '#AED581', // light green
  '#FF9E80'  // orange
];

// Game state
const rooms = {};
const players = {};

// Helper function to generate room code
function generateRoomCode() {
  return Math.random().toString(36).substr(2, 6).toUpperCase();
}

// Helper function to create initial game state
function createInitialGameState(room) {
  const gameState = {
    players: [],
    flowers: [],
    powerUps: [],
    bosses: [],
    timeRemaining: GAME_TIME,
    playArea: {
      x: 500, // Will be adjusted by client
      y: 300, // Will be adjusted by client
      radius: 400,
      targetRadius: 400
    }
  };

  // Add players
  for (const playerId of room.players) {
    const player = players[playerId];
    gameState.players.push({
      id: player.id,
      name: player.name,
      x: gameState.playArea.x + (Math.random() * 200 - 100),
      y: gameState.playArea.y + (Math.random() * 200 - 100),
      color: player.color,
      score: 0
    });
  }

  // Generate initial flowers
  for (let i = 0; i < INITIAL_FLOWERS; i++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * gameState.playArea.radius * 0.9;
    gameState.flowers.push({
      id: i,
      x: gameState.playArea.x + Math.cos(angle) * distance,
      y: gameState.playArea.y + Math.sin(angle) * distance,
      type: Math.floor(Math.random() * 5),
      collected: false
    });
  }

  return gameState;
}

// Socket.io events
io.on('connection', (socket) => {
  console.log('A user connected', socket.id);

  // Create a new room
  socket.on('createRoom', (data) => {
    // Generate a unique room code
    let roomId;
    do {
      roomId = generateRoomCode();
    } while (rooms[roomId]);

    // Create a new player
    const playerId = socket.id;
    players[playerId] = {
      id: playerId,
      name: data.playerName,
      socketId: socket.id,
      roomId: roomId,
      color: COLORS[0],
      isOwner: true
    };

    // Create a new room
    rooms[roomId] = {
      id: roomId,
      owner: playerId,
      players: [playerId],
      gameActive: false,
      gameState: null
    };

    // Join the socket to the room
    socket.join(roomId);

    // Send room info back to client
    socket.emit('roomCreated', {
      roomId: roomId,
      playerId: playerId,
      players: [players[playerId]]
    });

    console.log(`Room created: ${roomId} by player ${playerId}`);
  });

  // Join an existing room
  socket.on('joinRoom', (data) => {
    const roomId = data.roomId;
    const room = rooms[roomId];

    if (!room) {
      socket.emit('roomNotFound');
      return;
    }

    if (room.players.length >= MAX_PLAYERS_PER_ROOM) {
      socket.emit('roomNotFound');
      return;
    }

    if (room.gameActive) {
      socket.emit('roomNotFound');
      return;
    }

    // Create a new player
    const playerId = socket.id;
    players[playerId] = {
      id: playerId,
      name: data.playerName,
      socketId: socket.id,
      roomId: roomId,
      color: COLORS[room.players.length % COLORS.length],
      isOwner: false
    };

    // Add player to room
    room.players.push(playerId);
    socket.join(roomId);

    // Get all players in the room
    const roomPlayers = room.players.map(id => players[id]);

    // Send room info back to client
    socket.emit('roomJoined', {
      roomId: roomId,
      playerId: playerId,
      isOwner: false,
      players: roomPlayers
    });

    // Notify other players
    socket.to(roomId).emit('playerJoined', {
      playerId: playerId,
      playerName: data.playerName,
      players: roomPlayers
    });

    console.log(`Player ${playerId} joined room ${roomId}`);
  });

  // Leave room
  socket.on('leaveRoom', (data) => {
    const roomId = data.roomId;
    const playerId = socket.id;
    const room = rooms[roomId];

    if (!room) return;

    // Remove player from room
    const playerIndex = room.players.indexOf(playerId);
    if (playerIndex !== -1) {
      room.players.splice(playerIndex, 1);
    }

    // Get player info before removing
    const playerName = players[playerId]?.name;

    // Remove player from players
    delete players[playerId];

    // Leave socket room
    socket.leave(roomId);

    // If room is empty, delete it
    if (room.players.length === 0) {
      delete rooms[roomId];
      console.log(`Room ${roomId} deleted`);
      return;
    }

    // If owner left, assign new owner
    if (room.owner === playerId) {
      room.owner = room.players[0];
      players[room.owner].isOwner = true;
      
      // Notify new owner
      io.to(players[room.owner].socketId).emit('ownerChanged', {
        newOwnerId: room.owner,
        players: room.players.map(id => players[id])
      });
    }

    // Notify remaining players
    io.to(roomId).emit('playerLeft', {
      playerId: playerId,
      playerName: playerName,
      players: room.players.map(id => players[id])
    });

    console.log(`Player ${playerId} left room ${roomId}`);
  });

  // Start game
  socket.on('startGame', (data) => {
    const roomId = data.roomId;
    const room = rooms[roomId];

    if (!room || room.gameActive) return;
    if (room.owner !== socket.id) return;
    if (room.players.length < 1) return; // For testing, allow 1 player games

    // Create initial game state
    const initialState = createInitialGameState(room);
    room.gameState = initialState;
    room.gameActive = true;

    // Notify all players in the room
    io.to(roomId).emit('gameStarted', {
      initialState: initialState
    });

    console.log(`Game started in room ${roomId}`);
  });

  // Player movement
  socket.on('playerMove', (data) => {
    const roomId = data.roomId;
    const playerId = socket.id;
    const room = rooms[roomId];

    if (!room || !room.gameActive) return;

    // Broadcast player movement to other players
    socket.to(roomId).emit('playerMoved', {
      playerId: playerId,
      x: data.x,
      y: data.y,
      targetX: data.targetX,
      targetY: data.targetY,
      moveDirection: data.moveDirection
    });
  });

  // Flower collection
  socket.on('collectFlower', (data) => {
    const roomId = data.roomId;
    const flowerId = data.flowerId;
    const playerId = data.playerId;
    const room = rooms[roomId];

    if (!room || !room.gameActive) return;

    // Find flower in game state
    const flower = room.gameState.flowers.find(f => f.id === flowerId);
    if (flower && !flower.collected) {
      flower.collected = true;
      flower.collectedBy = playerId;

      // Update player score
      const player = room.gameState.players.find(p => p.id === playerId);
      if (player) {
        player.score++;
      }

      // Broadcast flower collection to all players
      io.to(roomId).emit('flowerCollected', {
        flowerId: flowerId,
        playerId: playerId
      });
    }
  });

  // Spawn flowers
  socket.on('spawnFlowers', (data) => {
    const roomId = data.roomId;
    const room = rooms[roomId];

    if (!room || !room.gameActive) return;
    if (room.owner !== socket.id) return;

    // Add flowers to game state
    for (const flower of data.flowers) {
      room.gameState.flowers.push({
        id: flower.id,
        x: flower.x,
        y: flower.y,
        type: flower.type,
        collected: false
      });
    }

    // Broadcast flower spawns to all players
    socket.to(roomId).emit('flowersSpawned', {
      flowers: data.flowers
    });
  });
  
  // Spawn power-up
  socket.on('spawnPowerUp', (data) => {
    const roomId = data.roomId;
    const room = rooms[roomId];

    if (!room || !room.gameActive) return;
    if (room.owner !== socket.id) return;

    // Add power-up to game state
    room.gameState.powerUps.push({
      id: data.powerUp.id,
      x: data.powerUp.x,
      y: data.powerUp.y,
      type: data.powerUp.type,
      collected: false
    });

    // Broadcast power-up spawn to all players
    io.to(roomId).emit('powerUpSpawned', {
      powerUp: data.powerUp
    });
  });

  // Collect power-up
  socket.on('collectPowerUp', (data) => {
    const roomId = data.roomId;
    const powerUpId = data.powerUpId;
    const playerId = data.playerId;
    const powerUpType = data.type;
    const room = rooms[roomId];

    if (!room || !room.gameActive) return;

    // Find power-up in game state
    const powerUp = room.gameState.powerUps.find(p => p.id === powerUpId);
    if (powerUp && !powerUp.collected) {
      powerUp.collected = true;
      powerUp.collectedBy = playerId;

      // Broadcast power-up collection to all players
      io.to(roomId).emit('powerUpCollected', {
        powerUpId: powerUpId,
        playerId: playerId,
        type: powerUpType
      });
    }
  });

  // Spawn boss
  socket.on('spawnBoss', (data) => {
    const roomId = data.roomId;
    const room = rooms[roomId];

    if (!room || !room.gameActive) return;
    if (room.owner !== socket.id) return;

    const boss = {
      id: data.boss.id,
      x: data.boss.x,
      y: data.boss.y,
      health: 50,
      maxHealth: 50,
      defeated: false,
      specialAttackType: null,
      isChargingAttack: false,
      specialAttackCharge: 0,
      specialAttackDuration: 0
    };

    // Add boss to game state
    room.gameState.bosses.push(boss);

    // Broadcast boss spawn to all players
    io.to(roomId).emit('bossSpawned', {
      boss: boss
    });
  });

  // Attack boss
  socket.on('attackBoss', (data) => {
    const roomId = data.roomId;
    const bossId = data.bossId;
    const playerId = data.playerId;
    const damageMultiplier = data.damageMultiplier || 1;
    const room = rooms[roomId];

    if (!room || !room.gameActive) return;

    // Find boss in game state
    const boss = room.gameState.bosses.find(b => b.id === bossId);
    if (boss && !boss.defeated) {
      boss.health -= 1 * damageMultiplier;

      if (boss.health <= 0) {
        boss.defeated = true;
        
        // Update player score
        const player = room.gameState.players.find(p => p.id === playerId);
        if (player) {
          player.score += (damageMultiplier > 1) ? 30 : 20; // More bonus for giant power-up
        }
      }

      // Broadcast boss update to all players
      io.to(roomId).emit('bossUpdated', {
        boss: boss
      });
    }
  });

  // Update game time
  socket.on('updateTime', (data) => {
    const roomId = data.roomId;
    const room = rooms[roomId];

    if (!room || !room.gameActive) return;
    if (room.owner !== socket.id) return;

    room.gameState.timeRemaining = data.timeRemaining;

    // Broadcast time update to other players
    socket.to(roomId).emit('updateTime', {
      timeRemaining: data.timeRemaining
    });
  });

  // End game
  socket.on('endGame', (data) => {
    const roomId = data.roomId;
    const room = rooms[roomId];

    if (!room || !room.gameActive) return;
    if (room.owner !== socket.id) return;

    // Sort players by score
    const winners = [...room.gameState.players].sort((a, b) => b.score - a.score);

    // Reset game state
    room.gameActive = false;
    room.gameState = null;

    // Broadcast game end to all players
    io.to(roomId).emit('gameEnded', {
      winners: winners
    });

    console.log(`Game ended in room ${roomId}`);
  });

  // Restart game
  socket.on('restartGame', (data) => {
    const roomId = data.roomId;
    const room = rooms[roomId];

    if (!room) return;
    if (room.owner !== socket.id) return;

    // Create new game state
    const initialState = createInitialGameState(room);
    room.gameState = initialState;
    room.gameActive = true;

    // Notify all players in the room
    io.to(roomId).emit('gameStarted', {
      initialState: initialState
    });

    console.log(`Game restarted in room ${roomId}`);
  });

  // Chat message
  socket.on('chatMessage', (data) => {
    const roomId = data.roomId;
    const room = rooms[roomId];

    if (!room) return;

    // Broadcast chat message to all players in the room
    io.to(roomId).emit('chatMessage', {
      playerName: data.playerName,
      message: data.message
    });
  });

  // Disconnect
  socket.on('disconnect', () => {
    const playerId = socket.id;
    const player = players[playerId];

    if (!player) return;

    const roomId = player.roomId;
    const room = rooms[roomId];

    if (!room) return;

    // Remove player from room
    const playerIndex = room.players.indexOf(playerId);
    if (playerIndex !== -1) {
      room.players.splice(playerIndex, 1);
    }

    // Remove player from players
    delete players[playerId];

    // If room is empty, delete it
    if (room.players.length === 0) {
      delete rooms[roomId];
      console.log(`Room ${roomId} deleted`);
      return;
    }

    // If owner left, assign new owner
    if (room.owner === playerId) {
      room.owner = room.players[0];
      players[room.owner].isOwner = true;
      
      // Notify new owner
      io.to(players[room.owner].socketId).emit('ownerChanged', {
        newOwnerId: room.owner,
        players: room.players.map(id => players[id])
      });
    }

    // Notify remaining players
    io.to(roomId).emit('playerLeft', {
      playerId: playerId,
      playerName: player.name,
      players: room.players.map(id => players[id])
    });

    console.log(`Player ${playerId} disconnected from room ${roomId}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
