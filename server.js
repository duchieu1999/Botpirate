const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Game state
const gameState = {
    rooms: {},
    players: {}
};

// Constants
const GRAVITY = 0.2;
const MAX_PLAYERS_PER_ROOM = 4;

// Character definitions
const characters = [
    { id: 'tank', name: 'Tank', icon: '🔫', color: '#FF5722', maxHealth: 120, damageMultiplier: 1 },
    { id: 'scout', name: 'Scout', icon: '🏃', color: '#4CAF50', maxHealth: 80, damageMultiplier: 1.2 },
    { id: 'heavy', name: 'Heavy', icon: '🛡️', color: '#2196F3', maxHealth: 150, damageMultiplier: 0.9 },
    { id: 'medic', name: 'Medic', icon: '❤️', color: '#F44336', maxHealth: 100, damageMultiplier: 0.8 }
];

// Map options
const mapOptions = [
    { id: 'hills', name: 'Rolling Hills' },
    { id: 'mountains', name: 'Mountain Range' },
    { id: 'canyon', name: 'Deep Canyon' },
    { id: 'islands', name: 'Floating Islands' }
];

// Helper function to get available rooms
function getAvailableRooms() {
    const rooms = [];
    
    for (const [roomId, room] of Object.entries(gameState.rooms)) {
        if (room.status === 'waiting' && room.players.length < MAX_PLAYERS_PER_ROOM) {
            rooms.push({
                id: roomId,
                name: `${room.owner.name}'s Room`,
                players: room.players.length,
                maxPlayers: MAX_PLAYERS_PER_ROOM,
                status: room.status
            });
        }
    }
    
    return rooms;
}

// Generate game map
function generateMap(mapType) {
    const mapWidth = 3000;
    const mapHeight = 1500;
    
    // Create terrain based on map type
    let terrain = [];
    let platforms = [];
    
    switch(mapType) {
        case 'hills':
            terrain = generateHillsTerrain(mapWidth, mapHeight);
            break;
        case 'mountains':
            terrain = generateMountainsTerrain(mapWidth, mapHeight);
            break;
        case 'canyon':
            terrain = generateCanyonTerrain(mapWidth, mapHeight);
            break;
        case 'islands':
            terrain = generateFlatTerrain(mapWidth, mapHeight);
            platforms = generateFloatingIslands(mapWidth, mapHeight);
            break;
        default:
            terrain = generateHillsTerrain(mapWidth, mapHeight);
    }
    
    return {
        width: mapWidth,
        height: mapHeight,
        terrain: terrain,
        platforms: platforms
    };
}

// Generate different terrain types
function generateHillsTerrain(width, height) {
    const terrain = [];
    const TERRAIN_SEGMENTS = 100;
    const segmentWidth = width / TERRAIN_SEGMENTS;
    
    // Generate a smooth, rolling terrain
    let lastHeight = height * 0.7;
    
    for (let i = 0; i <= TERRAIN_SEGMENTS; i++) {
        const x = i * segmentWidth;
        
        // Generate a smooth height change
        const noise = Math.sin(i * 0.2) * 100 + Math.sin(i * 0.05) * 200;
        const y = height * 0.7 + noise;
        
        terrain.push({ x, y });
        lastHeight = y;
    }
    
    return terrain;
}

function generateMountainsTerrain(width, height) {
    const terrain = [];
    const TERRAIN_SEGMENTS = 100;
    const segmentWidth = width / TERRAIN_SEGMENTS;
    
    // Generate jagged mountain terrain
    for (let i = 0; i <= TERRAIN_SEGMENTS; i++) {
        const x = i * segmentWidth;
        
        // Create jagged mountains with occasional plateaus
        let y;
        
        if (i % 20 < 2) {
            // Plateau
            y = height * 0.4 + Math.random() * 100;
        } else {
            // Mountain peaks and valleys
            const noise = Math.sin(i * 0.3) * 250 + Math.sin(i * 0.7) * 100;
            y = height * 0.5 + noise;
        }
        
        terrain.push({ x, y });
    }
    
    return terrain;
}

function generateCanyonTerrain(width, height) {
    const terrain = [];
    const TERRAIN_SEGMENTS = 100;
    const segmentWidth = width / TERRAIN_SEGMENTS;
    
    // Generate a canyon in the middle
    for (let i = 0; i <= TERRAIN_SEGMENTS; i++) {
        const x = i * segmentWidth;
        let y;
        
        // Create a canyon in the middle third
        if (i > TERRAIN_SEGMENTS / 3 && i < TERRAIN_SEGMENTS * 2 / 3) {
            y = height * 0.85;
        } else {
            // Higher ground on the sides
            const distFromCenter = Math.abs(i - TERRAIN_SEGMENTS / 2);
            const canyonEdge = TERRAIN_SEGMENTS / 6;
            
            if (distFromCenter < canyonEdge + 5) {
                // Slope down to canyon
                const slopeProgress = (distFromCenter - canyonEdge) / 5;
                if (slopeProgress < 0) {
                    y = height * 0.5;
                } else {
                    y = height * 0.5 + slopeProgress * height * 0.35;
                }
            } else {
                // Flat high ground with small variations
                y = height * 0.5 + Math.sin(i * 0.4) * 30;
            }
        }
        
        terrain.push({ x, y });
    }
    
    return terrain;
}

function generateFlatTerrain(width, height) {
    const terrain = [];
    const TERRAIN_SEGMENTS = 100;
    const segmentWidth = width / TERRAIN_SEGMENTS;
    
    // Generate a flat surface at the bottom
    for (let i = 0; i <= TERRAIN_SEGMENTS; i++) {
        const x = i * segmentWidth;
        const y = height * 0.95; // Put it very low
        terrain.push({ x, y });
    }
    
    return terrain;
}

function generateFloatingIslands(width, height) {
    const platforms = [];
    const islandCount = 5;
    
    // Create several floating islands of various sizes
    for (let i = 0; i < islandCount; i++) {
        const islandWidth = 200 + Math.random() * 300;
        const islandHeight = 30 + Math.random() * 50;
        
        // Distribute islands across the width
        const x = width * (i + 0.5) / islandCount - islandWidth / 2;
        
        // Vary the heights
        const y = height * 0.4 + Math.sin(i * 1.5) * height * 0.2;
        
        platforms.push({
            x, 
            y, 
            width: islandWidth, 
            height: islandHeight, 
            type: 'island'
        });
    }
    
    return platforms;
}

// Position players on the map
function positionPlayers(room) {
    const { map, players } = room;
    const { width, terrain, platforms } = map;
    
    // Clone players array and add initial game stats
    const gamePlayers = players.map((player, index) => {
        const character = characters.find(c => c.id === player.character);
        
        // Distribute players evenly across the map
        const positionX = width * (index + 1) / (players.length + 1);
        
        // Find the height of terrain at this x position
        let positionY = 0;
        
        // Check if we're on an island map
        if (room.mapId === 'islands' && platforms.length > 0) {
            // Find the closest platform
            let closestPlatform = null;
            let minDistance = Infinity;
            
            for (const platform of platforms) {
                if (positionX >= platform.x && positionX <= platform.x + platform.width) {
                    positionY = platform.y;
                    closestPlatform = platform;
                    break;
                }
                
                const distance = Math.min(
                    Math.abs(positionX - platform.x),
                    Math.abs(positionX - (platform.x + platform.width))
                );
                
                if (distance < minDistance) {
                    minDistance = distance;
                    closestPlatform = platform;
                }
            }
            
            if (closestPlatform) {
                positionX = closestPlatform.x + closestPlatform.width / 2;
                positionY = closestPlatform.y;
            }
        } else {
            // Find height on regular terrain
            const TERRAIN_SEGMENTS = 100;
            const segmentWidth = width / TERRAIN_SEGMENTS;
            const index = Math.floor(positionX / segmentWidth);
            
            if (index >= 0 && index < terrain.length) {
                positionY = terrain[index].y;
            }
        }
        
        return {
            id: player.id,
            name: player.name,
            character: player.character,
            isOwner: player.isOwner,
            x: positionX,
            y: positionY - 40, // Position above the terrain/platform
            health: character.maxHealth,
            maxHealth: character.maxHealth,
            damageMultiplier: character.damageMultiplier,
            alive: true,
            effects: []
        };
    });
    
    return gamePlayers;
}

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);
    
    // Initialize player data
    gameState.players[socket.id] = {
        id: socket.id,
        name: '',
        room: null,
        character: 'tank',
        isReady: false
    };
    
    // Join game
    socket.on('join-game', (data, callback) => {
        try {
            console.log(`Player ${socket.id} joined game with name: ${data.playerName}`);
            gameState.players[socket.id].name = data.playerName || `Player${Math.floor(Math.random() * 1000)}`;
            callback({ success: true });
        } catch (error) {
            console.error("Error in join-game:", error);
            callback({ success: false, message: error.message });
        }
    });
    
    // Create room
    socket.on('create-room', (data, callback) => {
        try {
            const roomId = 'R' + Math.floor(Math.random() * 10000);
            const playerName = data.playerName || `Player${Math.floor(Math.random() * 1000)}`;
            const character = data.character || 'tank';
            
            // Update player data
            gameState.players[socket.id].name = playerName;
            gameState.players[socket.id].character = character;
            gameState.players[socket.id].isReady = true;
            gameState.players[socket.id].room = roomId;
            
            // Create player object
            const player = {
                id: socket.id,
                name: playerName,
                character: character,
                isReady: true,
                isOwner: true
            };
            
            // Create room
            gameState.rooms[roomId] = {
                id: roomId,
                owner: player,
                players: [player],
                status: 'waiting',
                mapId: 'hills',
                map: null,
                currentTurn: null,
                projectiles: [],
                wind: 0
            };
            
            // Join socket room
            socket.join(roomId);
            
            console.log(`Player ${socket.id} created room ${roomId}`);
            
            // Notify lobby about new room
            io.emit('rooms-updated');
            
            callback({ success: true, roomId, players: [player] });
        } catch (error) {
            console.error("Error in create-room:", error);
            callback({ success: false, message: error.message });
        }
    });
    
    // Get rooms
    socket.on('get-rooms', (callback) => {
        try {
            const rooms = getAvailableRooms();
            callback({ success: true, rooms });
        } catch (error) {
            console.error("Error in get-rooms:", error);
            callback({ success: false, message: error.message });
        }
    });
    
    // Join room
    socket.on('join-room', (data, callback) => {
        try {
            const { roomId, playerName, character } = data;
            
            if (!gameState.rooms[roomId]) {
                return callback({ success: false, message: 'Room not found' });
            }
            
            const room = gameState.rooms[roomId];
            
            if (room.status !== 'waiting') {
                return callback({ success: false, message: 'Game already started' });
            }
            
            if (room.players.length >= MAX_PLAYERS_PER_ROOM) {
                return callback({ success: false, message: 'Room is full' });
            }
            
            // Update player data
            gameState.players[socket.id].name = playerName || `Player${Math.floor(Math.random() * 1000)}`;
            gameState.players[socket.id].character = character || 'tank';
            gameState.players[socket.id].isReady = true;
            gameState.players[socket.id].room = roomId;
            
            // Create player object
            const player = {
                id: socket.id,
                name: gameState.players[socket.id].name,
                character: gameState.players[socket.id].character,
                isReady: true,
                isOwner: false
            };
            
            // Add player to room
            room.players.push(player);
            
            // Join socket room
            socket.join(roomId);
            
            console.log(`Player ${socket.id} joined room ${roomId}`);
            
            // Notify room about new player
            socket.to(roomId).emit('player-joined', { player });
            
            // Notify lobby about updated room
            io.emit('rooms-updated');
            
            callback({ success: true, roomId, players: room.players });
        } catch (error) {
            console.error("Error in join-room:", error);
            callback({ success: false, message: error.message });
        }
    });
    
    // Leave room
    socket.on('leave-room', () => {
        try {
            const player = gameState.players[socket.id];
            
            if (!player || !player.room) return;
            
            const roomId = player.room;
            const room = gameState.rooms[roomId];
            
            if (!room) return;
            
            console.log(`Player ${socket.id} left room ${roomId}`);
            
            // Remove player from room
            room.players = room.players.filter(p => p.id !== socket.id);
            
            // Leave socket room
            socket.leave(roomId);
            
            // Reset player data
            player.room = null;
            player.isReady = false;
            
            // Notify room about player leaving
            io.to(roomId).emit('player-left', {
                playerId: socket.id,
                playerName: player.name
            });
            
            // If room is empty, remove it
            if (room.players.length === 0) {
                delete gameState.rooms[roomId];
            } else {
                // If room owner left, assign a new owner
                if (room.owner.id === socket.id) {
                    room.owner = room.players[0];
                    room.owner.isOwner = true;
                    
                    // Notify room about new owner
                    io.to(roomId).emit('owner-changed', { owner: room.owner });
                }
            }
            
            // Notify lobby about updated rooms
            io.emit('rooms-updated');
        } catch (error) {
            console.error("Error in leave-room:", error);
        }
    });
    
    // Start game
    socket.on('start-game', (data) => {
        try {
            const player = gameState.players[socket.id];
            
            if (!player || !player.room) return;
            
            const roomId = player.room;
            const room = gameState.rooms[roomId];
            
            if (!room || room.owner.id !== socket.id) return;
            
            console.log(`Game started in room ${roomId}`);
            
            // Update room status
            room.status = 'playing';
            
            // Update map
            const mapId = data.mapId || 'hills';
            room.mapId = mapId;
            room.map = generateMap(mapId);
            
            // Position players on map
            const gamePlayers = positionPlayers(room);
            
            // Set current turn
            room.currentTurn = gamePlayers[0].id;
            
            // Generate initial wind
            room.wind = (Math.random() * 10 - 5).toFixed(1);
            
            // Notify room about game starting
            io.to(roomId).emit('game-started', {
                map: room.map,
                players: gamePlayers,
                currentTurn: room.currentTurn,
                wind: room.wind
            });
            
            // Notify lobby about updated rooms
            io.emit('rooms-updated');
        } catch (error) {
            console.error("Error in start-game:", error);
        }
    });
    
    // Fire weapon
    socket.on('fire', (data) => {
        try {
            const player = gameState.players[socket.id];
            
            if (!player || !player.room) return;
            
            const roomId = player.room;
            const room = gameState.rooms[roomId];
            
            if (!room || room.status !== 'playing' || room.currentTurn !== socket.id) return;
            
            console.log(`Player ${socket.id} fired in room ${roomId}`);
            
            // Add projectile to room
            room.projectiles.push(data.projectile);
            
            // Send projectile update to room
            io.to(roomId).emit('projectile-update', data);
        } catch (error) {
            console.error("Error in fire:", error);
        }
    });
    
    // Turn complete
    socket.on('turn-complete', () => {
        try {
            const player = gameState.players[socket.id];
            
            if (!player || !player.room) return;
            
            const roomId = player.room;
            const room = gameState.rooms[roomId];
            
            if (!room || room.status !== 'playing' || room.currentTurn !== socket.id) return;
            
            console.log(`Turn completed in room ${roomId}`);
            
            // Find next player's turn
            const currentIndex = room.players.findIndex(p => p.id === room.currentTurn);
            const nextIndex = (currentIndex + 1) % room.players.length;
            const nextPlayerId = room.players[nextIndex].id;
            
            // Generate new wind for next turn
            room.wind = (Math.random() * 10 - 5).toFixed(1);
            
            // Update current turn
            room.currentTurn = nextPlayerId;
            
            // Clear room projectiles
            room.projectiles = [];
            
            // Notify room about turn change
            io.to(roomId).emit('turn-changed', {
                playerId: nextPlayerId,
                wind: room.wind
            });
        } catch (error) {
            console.error("Error in turn-complete:", error);
        }
    });
    
    // Chat message
    socket.on('chat-message', (data) => {
        try {
            const player = gameState.players[socket.id];
            
            if (!player || !player.room) return;
            
            const roomId = player.room;
            
            console.log(`Chat message in room ${roomId}: ${data.message}`);
            
            // Send chat message to room
            io.to(roomId).emit('chat-message', {
                sender: data.sender,
                message: data.message
            });
        } catch (error) {
            console.error("Error in chat-message:", error);
        }
    });
    
    // Ready for new game
    socket.on('ready-for-new-game', () => {
        try {
            const player = gameState.players[socket.id];
            
            if (!player || !player.room) return;
            
            const roomId = player.room;
            const room = gameState.rooms[roomId];
            
            if (!room) return;
            
            console.log(`Player ${socket.id} is ready for a new game in room ${roomId}`);
            
            // Set player as ready
            player.isReady = true;
            
            // Check if all players are ready
            const allReady = room.players.every(p => {
                const playerData = gameState.players[p.id];
                return playerData && playerData.isReady;
            });
            
            if (allReady && room.players.length > 0) {
                // Reset room for new game
                room.status = 'waiting';
                room.map = null;
                room.currentTurn = null;
                room.projectiles = [];
                
                // Notify room that all players are ready
                io.to(roomId).emit('all-players-ready');
                
                // If room owner is still in room, auto-start new game
                if (room.owner && gameState.players[room.owner.id]) {
                    setTimeout(() => {
                        // Generate map
                        room.map = generateMap(room.mapId);
                        
                        // Position players on map
                        const gamePlayers = positionPlayers(room);
                        
                        // Set current turn
                        room.currentTurn = gamePlayers[0].id;
                        
                        // Generate initial wind
                        room.wind = (Math.random() * 10 - 5).toFixed(1);
                        
                        // Update room status
                        room.status = 'playing';
                        
                        // Notify room about game starting
                        io.to(roomId).emit('game-started', {
                            map: room.map,
                            players: gamePlayers,
                            currentTurn: room.currentTurn,
                            wind: room.wind
                        });
                    }, 2000);
                }
            }
        } catch (error) {
            console.error("Error in ready-for-new-game:", error);
        }
    });
    
    // Disconnect
    socket.on('disconnect', () => {
        try {
            console.log(`Player disconnected: ${socket.id}`);
            
            // Handle player leaving room
            const player = gameState.players[socket.id];
            
            if (player && player.room) {
                const roomId = player.room;
                const room = gameState.rooms[roomId];
                
                if (room) {
                    // Remove player from room
                    room.players = room.players.filter(p => p.id !== socket.id);
                    
                    // Notify room about player disconnecting
                    io.to(roomId).emit('player-left', {
                        playerId: socket.id,
                        playerName: player.name
                    });
                    
                    // If room is empty, remove it
                    if (room.players.length === 0) {
                        delete gameState.rooms[roomId];
                    } else {
                        // If room owner disconnected, assign a new owner
                        if (room.owner.id === socket.id) {
                            room.owner = room.players[0];
                            room.owner.isOwner = true;
                            
                            // Notify room about new owner
                            io.to(roomId).emit('owner-changed', { owner: room.owner });
                        }
                    }
                    
                    // Notify lobby about updated rooms
                    io.emit('rooms-updated');
                }
            }
            
            // Remove player from gameState
            delete gameState.players[socket.id];
        } catch (error) {
            console.error("Error in disconnect:", error);
        }
    });
});

// Default route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
