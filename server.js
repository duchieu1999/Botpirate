const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Route for main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Game state
const games = {};
const rooms = {};
const users = {};

// Generate a random room code
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Player login
  socket.on('login', (data, callback) => {
    const { playerName, playerCharacter } = data;
    
    // Save user info
    users[socket.id] = {
      id: socket.id,
      name: playerName,
      character: playerCharacter,
      roomId: null
    };
    
    callback({ success: true, playerId: socket.id });
  });

  // Create room
  socket.on('create_room', (data, callback) => {
    // Generate room code
    const roomCode = generateRoomCode();
    const roomId = `room_${roomCode}`;
    
    // Create room
    rooms[roomId] = {
      id: roomId,
      code: roomCode,
      hostId: socket.id,
      players: [socket.id],
      terrain: 'hills',
      gameStarted: false
    };
    
    // Join socket to room
    socket.join(roomId);
    
    // Update user's room
    users[socket.id].roomId = roomId;
    
    callback({ success: true, roomId, roomCode });
    
    // Notify user joined room
    socket.emit('room_joined', {
      roomId,
      roomCode,
      isHost: true,
      players: [
        {
          id: socket.id,
          name: users[socket.id].name,
          character: users[socket.id].character
        }
      ]
    });
    
    // Update room list for all users in lobby
    io.emit('rooms_updated', {
      rooms: Object.values(rooms)
        .filter(room => !room.gameStarted && room.players.length < 2)
        .map(room => ({
          id: room.id,
          code: room.code,
          players: room.players.length,
          host: users[room.hostId].name
        }))
    });
  });

  // Join room
  socket.on('join_room', (data, callback) => {
    const { roomCode } = data;
    
    // Find room by code (for direct join)
    let roomToJoin = null;
    
    if (roomCode) {
      // Find specific room by code
      roomToJoin = Object.values(rooms).find(room => 
        room.code.toLowerCase() === roomCode.toLowerCase() && 
        !room.gameStarted && 
        room.players.length < 2
      );
    } else {
      // Find any available room
      roomToJoin = Object.values(rooms).find(room => 
        !room.gameStarted && 
        room.players.length < 2
      );
    }
    
    if (!roomToJoin) {
      return callback({ success: false, error: roomCode ? 'Room not found or full' : 'No rooms available' });
    }
    
    // Join socket to room
    socket.join(roomToJoin.id);
    
    // Add player to room
    roomToJoin.players.push(socket.id);
    
    // Update user's room
    users[socket.id].roomId = roomToJoin.id;
    
    callback({ success: true, roomId: roomToJoin.id, roomCode: roomToJoin.code });
    
    // Create player list
    const playersList = roomToJoin.players.map(playerId => ({
      id: playerId,
      name: users[playerId].name,
      character: users[playerId].character
    }));
    
    // Notify user joined room
    socket.emit('room_joined', {
      roomId: roomToJoin.id,
      roomCode: roomToJoin.code,
      isHost: false,
      players: playersList
    });
    
    // Notify other players in room
    socket.to(roomToJoin.id).emit('player_joined', {
      playerId: socket.id,
      playerName: users[socket.id].name,
      playerCharacter: users[socket.id].character
    });
    
    // Update room list for all users in lobby
    io.emit('rooms_updated', {
      rooms: Object.values(rooms)
        .filter(room => !room.gameStarted && room.players.length < 2)
        .map(room => ({
          id: room.id,
          code: room.code,
          players: room.players.length,
          host: users[room.hostId].name
        }))
    });
  });

  // Start game
  socket.on('start_game', (data) => {
    const { terrain } = data;
    const user = users[socket.id];
    
    if (!user || !user.roomId || !rooms[user.roomId]) {
      return;
    }
    
    const room = rooms[user.roomId];
    
    // Check if user is host
    if (room.hostId !== socket.id) {
      return;
    }
    
    // Check if enough players
    if (room.players.length < 2) {
      return;
    }
    
    // Update terrain if provided
    if (terrain) {
      room.terrain = terrain;
    }
    
    // Mark room as in-game
    room.gameStarted = true;
    
    // Create game state
    games[room.id] = {
      roomId: room.id,
      terrain: room.terrain,
      players: room.players.map(playerId => ({
        id: playerId,
        name: users[playerId].name,
        character: users[playerId].character,
        health: getCharacterHealth(users[playerId].character),
        position: { x: 0, y: 0 } // Will be updated below
      })),
      currentTurn: 0,
      platforms: generatePlatforms(room.terrain),
      worldWidth: 0,
      worldHeight: 1000,
      wind: getRandomWind()
    };
    
    // Set world width based on platforms
    const game = games[room.id];
    const platforms = game.platforms;
    game.worldWidth = platforms[platforms.length - 1].x + platforms[platforms.length - 1].width + 300;
    
    // Set player positions
    game.players[0].position = {
      x: platforms[0].x + platforms[0].width * 0.25,
      y: platforms[0].y - 60
    };
    
    game.players[1].position = {
      x: platforms[platforms.length - 1].x + platforms[platforms.length - 1].width * 0.75,
      y: platforms[platforms.length - 1].y - 60
    };
    
    // Start game for all players in room
    io.to(room.id).emit('game_started', {
      terrain: game.terrain,
      platforms: game.platforms,
      worldWidth: game.worldWidth,
      worldHeight: game.worldHeight,
      playerPositions: {
        [game.players[0].id]: game.players[0].position,
        [game.players[1].id]: game.players[1].position
      },
      wind: game.wind,
      firstPlayer: game.players[game.currentTurn].id
    });
    
    // Update room list (remove this room from available rooms)
    io.emit('rooms_updated', {
      rooms: Object.values(rooms)
        .filter(room => !room.gameStarted && room.players.length < 2)
        .map(room => ({
          id: room.id,
          code: room.code,
          players: room.players.length,
          host: users[room.hostId].name
        }))
    });
  });

  // Fire projectile
  socket.on('fire', (data) => {
    const { angle, power, weapon } = data;
    const user = users[socket.id];
    
    if (!user || !user.roomId || !games[user.roomId]) {
      return;
    }
    
    const game = games[user.roomId];
    const playerIndex = game.players.findIndex(player => player.id === socket.id);
    
    if (playerIndex === -1 || game.players[game.currentTurn].id !== socket.id) {
      return;
    }
    
    // Calculate hit after a delay to simulate projectile flight
    setTimeout(() => {
      // Determine if hit or miss
      const targetPlayer = game.players[(playerIndex + 1) % 2];
      const targetX = targetPlayer.position.x + 30; // Half of character width
      const targetY = targetPlayer.position.y + 30; // Half of character height
      
      // Simplified hit calculation (in a real game, would calculate based on physics)
      const hitChance = 0.7; // 70% chance to hit
      const didHit = Math.random() < hitChance;
      
      let hitPosition;
      let damage = 0;
      let hitPlayer = null;
      
      if (didHit) {
        hitPosition = {
          x: targetX + (Math.random() * 20 - 10),  // Random offset for more realism
          y: targetY + (Math.random() * 20 - 10)
        };
        
        // Calculate damage based on weapon and character stats
        const attackerPower = getCharacterPower(user.character);
        const defenderDefense = getCharacterDefense(targetPlayer.character);
        const weaponDamage = getWeaponDamage(weapon);
        
        damage = Math.max(1, Math.floor(weaponDamage * attackerPower / defenderDefense));
        
        // Apply damage to target player
        targetPlayer.health = Math.max(0, targetPlayer.health - damage);
        hitPlayer = targetPlayer.id;
      } else {
        // Miss - random nearby position
        hitPosition = {
          x: targetX + (Math.random() * 100 - 50),
          y: targetY + (Math.random() * 100 - 50)
        };
      }
      
      // Send hit event to all players in the game
      io.to(user.roomId).emit('projectile_hit', {
        x: hitPosition.x,
        y: hitPosition.y,
        damage: damage,
        weapon: weapon,
        hitPlayer: hitPlayer
      });
      
      // Check for game over
      if (targetPlayer.health <= 0) {
        setTimeout(() => {
          io.to(user.roomId).emit('game_over', {
            winner: socket.id
          });
          
          // Clean up game
          delete games[user.roomId];
        }, 1500);
        return;
      }
      
      // Change turn after a delay
      setTimeout(() => {
        // Change turn
        game.currentTurn = (game.currentTurn + 1) % 2;
        
        // Change wind
        game.wind = getRandomWind();
        
        // Send turn change event
        io.to(user.roomId).emit('turn_change', {
          nextPlayer: game.players[game.currentTurn].id,
          wind: game.wind
        });
      }, 1500);
    }, 2000); // 2-second delay to simulate projectile flight
  });

  // Chat message
  socket.on('chat_message', (data) => {
    const user = users[socket.id];
    if (!user || !user.roomId) return;
    
    io.to(user.roomId).emit('chat_message', {
      sender: user.name,
      message: data.message
    });
  });

  // Get available rooms
  socket.on('get_rooms', (data, callback) => {
    const availableRooms = Object.values(rooms)
      .filter(room => !room.gameStarted && room.players.length < 2)
      .map(room => ({
        id: room.id,
        code: room.code,
        players: room.players.length,
        host: users[room.hostId]?.name || 'Unknown'
      }));
    
    callback({ success: true, rooms: availableRooms });
  });

  // Leave room
  socket.on('leave_room', (data, callback) => {
    const user = users[socket.id];
    if (!user || !user.roomId) {
      if (callback) callback({ success: true });
      return;
    }
    
    const roomId = user.roomId;
    const room = rooms[roomId];
    
    if (!room) {
      user.roomId = null;
      if (callback) callback({ success: true });
      return;
    }
    
    // Remove player from room
    room.players = room.players.filter(id => id !== socket.id);
    
    // Leave socket room
    socket.leave(roomId);
    
    // Update user
    user.roomId = null;
    
    // If room is empty or user was host, delete room
    if (room.players.length === 0 || room.hostId === socket.id) {
      delete rooms[roomId];
      
      // If game exists, delete it too
      if (games[roomId]) {
        delete games[roomId];
      }
    } else {
      // Notify other players in room
      io.to(roomId).emit('player_left', {
        playerId: socket.id,
        playerName: user.name
      });
    }
    
    if (callback) callback({ success: true });
    
    // Update room list for all users in lobby
    io.emit('rooms_updated', {
      rooms: Object.values(rooms)
        .filter(room => !room.gameStarted && room.players.length < 2)
        .map(room => ({
          id: room.id,
          code: room.code,
          players: room.players.length,
          host: users[room.hostId].name
        }))
    });
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    
    const user = users[socket.id];
    if (!user) return;
    
    // If user was in a room, handle leaving
    if (user.roomId) {
      const roomId = user.roomId;
      const room = rooms[roomId];
      
      if (room) {
        // Remove player from room
        room.players = room.players.filter(id => id !== socket.id);
        
        // If room is empty or user was host, delete room
        if (room.players.length === 0 || room.hostId === socket.id) {
          delete rooms[roomId];
          
          // If game exists, delete it too
          if (games[roomId]) {
            delete games[roomId];
          }
        } else {
          // Notify other players in room
          io.to(roomId).emit('player_left', {
            playerId: socket.id,
            playerName: user.name
          });
          
          // If game was in progress, end it
          if (games[roomId]) {
            io.to(roomId).emit('game_over', {
              winner: room.players[0],
              reason: 'opponent_disconnected'
            });
            
            delete games[roomId];
          }
        }
        
        // Update room list for all users in lobby
        io.emit('rooms_updated', {
          rooms: Object.values(rooms)
            .filter(room => !room.gameStarted && room.players.length < 2)
            .map(room => ({
              id: room.id,
              code: room.code,
              players: room.players.length,
              host: users[room.hostId].name
            }))
        });
      }
    }
    
    // Delete user
    delete users[socket.id];
  });
});

// Helper functions
function getRandomWind() {
  return (Math.random() * 2 - 1) * 10; // Between -10 and 10
}

function generatePlatforms(terrain) {
  let config;
  
  switch(terrain) {
    case 'mountains':
      config = {
        platformCount: 5,
        platformWidthMin: 200,
        platformWidthMax: 300,
        platformHeight: 40,
        yVariation: 200
      };
      break;
    case 'desert':
      config = {
        platformCount: 9,
        platformWidthMin: 80,
        platformWidthMax: 150,
        platformHeight: 25,
        yVariation: 150
      };
      break;
    case 'hills':
    default:
      config = {
        platformCount: 7,
        platformWidthMin: 100,
        platformWidthMax: 200,
        platformHeight: 30,
        yVariation: 100
      };
  }
  
  const platforms = [];
  const platformSpacing = 300;
  
  for (let i = 0; i < config.platformCount; i++) {
    const width = Math.random() * (config.platformWidthMax - config.platformWidthMin) + config.platformWidthMin;
    const x = i * platformSpacing;
    const y = 400 + Math.random() * config.yVariation;
    
    platforms.push({
      x,
      y,
      width,
      height: config.platformHeight
    });
  }
  
  return platforms;
}

function getCharacterHealth(character) {
  switch(character) {
    case 'mage': return 80;
    case 'ranger': return 120;
    case 'warrior':
    default: return 100;
  }
}

function getCharacterPower(character) {
  switch(character) {
    case 'mage': return 4;
    case 'ranger': return 2;
    case 'warrior':
    default: return 3;
  }
}

function getCharacterDefense(character) {
  switch(character) {
    case 'mage': return 1;
    case 'ranger': return 3;
    case 'warrior':
    default: return 2;
  }
}

function getWeaponDamage(weapon) {
  switch(weapon) {
    case 'bomb': return 20;
    case 'missile': return 30;
    case 'grenade': return 15;
    case 'nuke': return 50;
    case 'basic':
    default: return 10;
  }
}

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
