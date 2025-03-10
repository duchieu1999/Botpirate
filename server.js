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
const TURN_TIME = 30; // seconds
const MAX_MISSED_TURNS = 2;
const WIND_FACTOR = 0.03; // Increased from 0.01 for stronger wind effect
const MAX_POWER = 150; // Increased from 100 for longer range

// Character definitions with unique weapons and stats
const characters = [
    { 
        id: 'gunman', 
        name: 'Lính', 
        viName: 'Lính',
        icon: '🔫', 
        color: '#FF5722', 
        maxHealth: 120, 
        damageMultiplier: 1,
        moveSpeed: 5,
        defaultWeapon: 'basic',
        description: 'Nhân vật cơ bản, dễ chơi, phù hợp cho người mới.',
        specialAbility: 'none'
    },
    { 
        id: 'tarzan', 
        name: 'Tarzan', 
        viName: 'Tarzan',
        icon: '🦍', 
        color: '#8BC34A', 
        maxHealth: 100, 
        damageMultiplier: 0.9,
        moveSpeed: 8,
        defaultWeapon: 'vine',
        description: 'Có khả năng di chuyển tốt và sử dụng vũ khí linh hoạt.',
        specialAbility: 'fastMove'
    },
    { 
        id: 'viking', 
        name: 'Viking', 
        viName: 'Vikings',
        icon: '⚔️', 
        color: '#F44336', 
        maxHealth: 150, 
        damageMultiplier: 1.4,
        moveSpeed: 3,
        defaultWeapon: 'axe',
        description: 'Sát thương cao, nhưng tầm bắn không xa.',
        specialAbility: 'strongHit'
    },
    { 
        id: 'apache', 
        name: 'Apache', 
        viName: 'Apache',
        icon: '🚁', 
        color: '#9C27B0', 
        maxHealth: 90, 
        damageMultiplier: 1.1,
        moveSpeed: 4,
        defaultWeapon: 'missile',
        description: 'Chuyên dùng máy bay để tấn công từ trên cao.',
        specialAbility: 'airStrike'
    },
    { 
        id: 'mafia', 
        name: 'Mafia', 
        viName: 'Mafia',
        icon: '🕴️', 
        color: '#212121', 
        maxHealth: 110, 
        damageMultiplier: 1.2,
        moveSpeed: 4,
        defaultWeapon: 'shotgun',
        description: 'Nhân vật có vũ khí mạnh với 3 tia đạn chuyên đục phá địa hình nhưng khó sử dụng.',
        specialAbility: 'tripleShot'
    },
    { 
        id: 'wind', 
        name: 'Wind', 
        viName: 'Thần Gió',
        icon: '🌪️', 
        color: '#03A9F4', 
        maxHealth: 100, 
        damageMultiplier: 1.0,
        moveSpeed: 6,
        defaultWeapon: 'tornado',
        description: 'Nhân vật có thể tận dụng gió để tấn công chính xác hơn.',
        specialAbility: 'windControl'
    },
    { 
        id: 'robot', 
        name: 'Robot', 
        viName: 'Robot',
        icon: '🤖', 
        color: '#607D8B', 
        maxHealth: 140, 
        damageMultiplier: 1.3,
        moveSpeed: 3,
        defaultWeapon: 'laser',
        description: 'Có khả năng bắn ra tia laze.',
        specialAbility: 'laserBeam'
    },
    { 
        id: 'chicken', 
        name: 'Chicken', 
        viName: 'Gà',
        icon: '🐔', 
        color: '#FFC107', 
        maxHealth: 95, 
        damageMultiplier: 0.9,
        moveSpeed: 7,
        defaultWeapon: 'egg',
        description: 'Bắn ra con gà và sẽ nhả ra quả trứng rơi xuống khi bay lên cao.',
        specialAbility: 'eggDrop'
    }
];

// Weapon definitions
const weapons = {
    'basic': { 
        name: 'Basic Cannon', 
        viName: 'Đại Bác',
        icon: '💣', 
        damage: 25, 
        radius: 80, 
        particleCount: 30,
        color: '#FF9800'
    },
    'missile': { 
        name: 'Missile', 
        viName: 'Tên Lửa',
        icon: '🚀', 
        damage: 35, 
        radius: 100, 
        particleCount: 40,
        color: '#F44336'
    },
    'laser': { 
        name: 'Laser Beam', 
        viName: 'Tia Laser',
        icon: '📡', 
        damage: 50, 
        radius: 20, 
        particleCount: 15,
        color: '#00BCD4',
        specialEffect: 'beam'
    },
    'tornado': { 
        name: 'Tornado', 
        viName: 'Lốc Xoáy',
        icon: '🌪️', 
        damage: 30, 
        radius: 90, 
        particleCount: 50,
        color: '#03A9F4',
        specialEffect: 'windPush'
    },
    'shotgun': { 
        name: 'Shotgun', 
        viName: 'Súng Săn',
        icon: '🔫', 
        damage: 15, 
        radius: 60, 
        particleCount: 20,
        color: '#795548',
        specialEffect: 'tripleShot'
    },
    'axe': { 
        name: 'Battle Axe', 
        viName: 'Rìu Chiến',
        icon: '🪓', 
        damage: 45, 
        radius: 60, 
        particleCount: 25,
        color: '#E91E63',
        specialEffect: 'heavyImpact'
    },
    'vine': { 
        name: 'Swinging Vine', 
        viName: 'Dây Leo',
        icon: '🌿', 
        damage: 20, 
        radius: 70, 
        particleCount: 30,
        color: '#4CAF50',
        specialEffect: 'fastTravel'
    },
    'egg': { 
        name: 'Egg Bomb', 
        viName: 'Bom Trứng',
        icon: '🥚', 
        damage: 20, 
        radius: 70, 
        particleCount: 35,
        color: '#FFEB3B',
        specialEffect: 'eggDrop'
    },
    'teleport': { 
        name: 'Teleporter', 
        viName: 'Dịch Chuyển',
        icon: '✨', 
        damage: 0, 
        radius: 10, 
        particleCount: 50,
        color: '#9C27B0',
        specialEffect: 'teleport'
    }
};

// Item definitions
const items = {
    'healthpack': { 
        type: 'item', 
        name: 'Health Pack', 
        viName: 'Hồi Máu',
        icon: '❤️', 
        effect: 'heal',
        value: 30
    },
    'shield': { 
        type: 'item', 
        name: 'Shield', 
        viName: 'Khiên Bảo Vệ',
        icon: '🛡️', 
        effect: 'protect',
        value: 0.5,
        duration: 2
    },
    'teleport': { 
        type: 'item', 
        name: 'Teleport', 
        viName: 'Dịch Chuyển',
        icon: '✨', 
        effect: 'teleport',
        value: 0
    }
};

// Map options with more complex terrain
const mapOptions = [
    { id: 'hills', name: 'Rolling Hills', viName: 'Đồi Núi' },
    { id: 'mountains', name: 'Mountain Range', viName: 'Dãy Núi' },
    { id: 'canyon', name: 'Deep Canyon', viName: 'Hẻm Núi' },
    { id: 'islands', name: 'Floating Islands', viName: 'Đảo Bay' },
    { id: 'complex', name: 'Complex Terrain', viName: 'Địa Hình Phức Tạp' }
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
        case 'complex':
            terrain = generateComplexTerrain(mapWidth, mapHeight);
            platforms = generateAdvancedPlatforms(mapWidth, mapHeight);
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

// New complex terrain generator
function generateComplexTerrain(width, height) {
    const terrain = [];
    const TERRAIN_SEGMENTS = 100;
    const segmentWidth = width / TERRAIN_SEGMENTS;
    
    // Use Perlin noise approximation for complex terrain
    for (let i = 0; i <= TERRAIN_SEGMENTS; i++) {
        const x = i * segmentWidth;
        
        // Multiple frequencies of noise for more natural terrain
        const noise1 = Math.sin(i * 0.1) * 150;
        const noise2 = Math.sin(i * 0.05) * Math.cos(i * 0.1) * 100;
        const noise3 = Math.sin(i * 0.3) * 50;
        const noise4 = Math.cos(i * 0.2) * Math.sin(i * 0.05) * 80;
        
        // Create occasional plateau or valley
        let specialFeature = 0;
        if (i % 17 === 0) {
            specialFeature = -100; // valley
        } else if (i % 19 === 0) {
            specialFeature = 100; // plateau
        }
        
        // Combine all noise components
        const y = height * 0.6 + noise1 + noise2 + noise3 + noise4 + specialFeature;
        
        terrain.push({ x, y });
    }
    
    return terrain;
}

// New advanced floating platforms generator
function generateAdvancedPlatforms(width, height) {
    const platforms = [];
    const platformCount = 12; // More platforms for complex terrain
    
    // Create primary floating islands
    for (let i = 0; i < platformCount; i++) {
        const islandWidth = 150 + Math.random() * 200;
        const islandHeight = 25 + Math.random() * 40;
        
        // Distribute platforms more randomly
        const x = Math.random() * width * 0.9 + width * 0.05;
        
        // Vary heights significantly
        const y = height * (0.2 + Math.random() * 0.6);
        
        platforms.push({
            x, 
            y, 
            width: islandWidth, 
            height: islandHeight, 
            type: 'island'
        });
    }
    
    // Add some small stepping stones
    for (let i = 0; i < 10; i++) {
        const stoneWidth = 50 + Math.random() * 50;
        const stoneHeight = 15 + Math.random() * 20;
        
        const x = Math.random() * width * 0.9 + width * 0.05;
        const y = height * (0.25 + Math.random() * 0.5);
        
        platforms.push({
            x,
            y,
            width: stoneWidth,
            height: stoneHeight,
            type: 'stone'
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
        
        // Check if we're on a map with platforms
        if (platforms && platforms.length > 0) {
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
                const adjustedX = closestPlatform.x + closestPlatform.width / 2;
                positionY = closestPlatform.y;
                
                return {
                    id: player.id,
                    name: player.name,
                    character: player.character,
                    isOwner: player.isOwner,
                    x: adjustedX,
                    y: positionY - 40, // Position above the platform
                    health: character.maxHealth,
                    maxHealth: character.maxHealth,
                    damageMultiplier: character.damageMultiplier,
                    moveSpeed: character.moveSpeed,
                    alive: true,
                    effects: [],
                    missedTurns: 0,
                    inventory: getCharacterInventory(character)
                };
            }
        }
        
        // Find height on terrain
        const TERRAIN_SEGMENTS = 100;
        const segmentWidth = width / TERRAIN_SEGMENTS;
        const index = Math.floor(positionX / segmentWidth);
        
        if (index >= 0 && index < terrain.length) {
            positionY = terrain[index].y;
        }
        
        return {
            id: player.id,
            name: player.name,
            character: player.character,
            isOwner: player.isOwner,
            x: positionX,
            y: positionY - 40, // Position above the terrain
            health: character.maxHealth,
            maxHealth: character.maxHealth,
            damageMultiplier: character.damageMultiplier,
            moveSpeed: character.moveSpeed,
            alive: true,
            effects: [],
            missedTurns: 0,
            inventory: getCharacterInventory(character)
        };
    });
    
    return gamePlayers;
}

// Get character's starting inventory based on character type
function getCharacterInventory(character) {
    const inventory = {};
    
    // Add character's default weapon
    if (character.defaultWeapon) {
        inventory[character.defaultWeapon] = { 
            type: 'weapon', 
            name: weapons[character.defaultWeapon].name, 
            viName: weapons[character.defaultWeapon].viName,
            icon: weapons[character.defaultWeapon].icon, 
            ammo: -1  // Unlimited for default weapon
        };
    }
    
    // Add basic cannon for all characters
    if (character.defaultWeapon !== 'basic') {
        inventory.basic = { 
            type: 'weapon', 
            name: weapons.basic.name, 
            viName: weapons.basic.viName,
            icon: weapons.basic.icon, 
            ammo: 5
        };
    }
    
    // Add character-specific special weapons
    switch(character.id) {
        case 'apache':
            inventory.missile = { 
                type: 'weapon', 
                name: weapons.missile.name, 
                viName: weapons.missile.viName,
                icon: weapons.missile.icon, 
                ammo: 5
            };
            break;
        case 'robot':
            inventory.laser = { 
                type: 'weapon', 
                name: weapons.laser.name, 
                viName: weapons.laser.viName,
                icon: weapons.laser.icon, 
                ammo: 3
            };
            break;
        case 'wind':
            inventory.tornado = { 
                type: 'weapon', 
                name: weapons.tornado.name, 
                viName: weapons.tornado.viName,
                icon: weapons.tornado.icon, 
                ammo: 3
            };
            break;
    }
    
    // Add items
    inventory.healthpack = { 
        type: 'item', 
        name: items.healthpack.name, 
        viName: items.healthpack.viName,
        icon: items.healthpack.icon, 
        ammo: 2
    };
    
    inventory.shield = { 
        type: 'item', 
        name: items.shield.name, 
        viName: items.shield.viName,
        icon: items.shield.icon, 
        ammo: 1
    };
    
    // Add teleport item
    inventory.teleport = { 
        type: 'item', 
        name: items.teleport.name, 
        viName: items.teleport.viName,
        icon: items.teleport.icon, 
        ammo: 1
    };
    
    return inventory;
}

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);
    
    // Initialize player data
    gameState.players[socket.id] = {
        id: socket.id,
        name: '',
        room: null,
        character: 'gunman',
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
            const character = data.character || 'gunman';
            
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
                mapId: 'complex', // Default to complex terrain
                map: null,
                currentTurn: null,
                turnStartTime: null,
                projectiles: [],
                wind: 0
            };
            
            // Join socket room
            socket.join(roomId);
            
            console.log(`Player ${socket.id} created room ${roomId}`);
            
            // Notify lobby about new room
            io.emit('rooms-updated');
            
            callback({ 
                success: true, 
                roomId, 
                players: [player],
                characters: characters,
                mapOptions: mapOptions
            });
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
            gameState.players[socket.id].character = character || 'gunman';
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
            
            callback({ 
                success: true, 
                roomId, 
                players: room.players,
                characters: characters,
                mapOptions: mapOptions
            });
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
            const mapId = data.mapId || 'complex';
            room.mapId = mapId;
            room.map = generateMap(mapId);
            
            // Position players on map
            const gamePlayers = positionPlayers(room);
            
            // Set current turn
            room.currentTurn = gamePlayers[0].id;
            room.turnStartTime = Date.now();
            
            // Generate initial wind
            room.wind = (Math.random() * 16 - 8).toFixed(1); // Stronger wind range
            
            // Notify room about game starting
            io.to(roomId).emit('game-started', {
                map: room.map,
                players: gamePlayers,
                currentTurn: room.currentTurn,
                turnTime: TURN_TIME,
                wind: room.wind,
                weapons: weapons,
                items: items
            });
            
            // Start turn timer
            startTurnTimer(roomId);
            
            // Notify lobby about updated rooms
            io.emit('rooms-updated');
        } catch (error) {
            console.error("Error in start-game:", error);
        }
    });
    
    // Start turn timer
    function startTurnTimer(roomId) {
        const room = gameState.rooms[roomId];
        
        if (!room || room.status !== 'playing') return;
        
        const timerInterval = setInterval(() => {
            if (!room || room.status !== 'playing') {
                clearInterval(timerInterval);
                return;
            }
            
            const elapsedTime = Math.floor((Date.now() - room.turnStartTime) / 1000);
            const remainingTime = TURN_TIME - elapsedTime;
            
            // Send time update every 5 seconds
            if (elapsedTime % 5 === 0) {
                io.to(roomId).emit('turn-time-update', { 
                    currentTurn: room.currentTurn,
                    remainingTime: remainingTime
                });
            }
            
            // Turn timeout
            if (elapsedTime >= TURN_TIME) {
                clearInterval(timerInterval);
                handleTurnTimeout(roomId);
            }
        }, 1000);
    }
    
    // Handle turn timeout
    function handleTurnTimeout(roomId) {
        const room = gameState.rooms[roomId];
        
        if (!room || room.status !== 'playing') return;
        
        // Find current player
        const currentPlayerIndex = room.players.findIndex(p => p.id === room.currentTurn);
        if (currentPlayerIndex === -1) return;
        
        // Increment missed turns counter
        const gamePlayersIndex = room.players[currentPlayerIndex].id;
        const currentPlayer = room.players.find(p => p.id === gamePlayersIndex);
        
        if (currentPlayer) {
            currentPlayer.missedTurns = (currentPlayer.missedTurns || 0) + 1;
            
            // Check if player should be eliminated
            if (currentPlayer.missedTurns >= MAX_MISSED_TURNS) {
                // Eliminate player
                io.to(roomId).emit('player-eliminated', {
                    playerId: currentPlayer.id,
                    reason: 'missed_turns'
                });
                
                currentPlayer.alive = false;
                
                // Check for game over
                checkGameOver(roomId);
            }
        }
        
        // Change turn
        changeTurn(roomId);
    }
    
    // Check if game is over
    function checkGameOver(roomId) {
        const room = gameState.rooms[roomId];
        
        if (!room || room.status !== 'playing') return;
        
        // Count alive players
        const alivePlayers = room.players.filter(p => p.alive !== false);
        
        // Game is over if only one player remains
        if (alivePlayers.length <= 1) {
            const winner = alivePlayers.length === 1 ? alivePlayers[0] : null;
            
            // Notify room about game over
            io.to(roomId).emit('game-over', {
                winner: winner
            });
            
            // Reset room status
            room.status = 'waiting';
            room.map = null;
            room.currentTurn = null;
            room.turnStartTime = null;
            
            return true;
        }
        
        return false;
    }
    
    // Change turn to next player
    function changeTurn(roomId) {
        const room = gameState.rooms[roomId];
        
        if (!room || room.status !== 'playing') return;
        
        // Find next player's turn
        const currentIndex = room.players.findIndex(p => p.id === room.currentTurn);
        let nextPlayerIndex = (currentIndex + 1) % room.players.length;
        
        // Find next alive player
        let nextPlayer = room.players[nextPlayerIndex];
        
        // Skip dead players
        while (nextPlayer && nextPlayer.alive === false) {
            nextPlayerIndex = (nextPlayerIndex + 1) % room.players.length;
            nextPlayer = room.players[nextPlayerIndex];
            
            // If we've gone full circle, the game is over
            if (nextPlayerIndex === currentIndex) {
                checkGameOver(roomId);
                return;
            }
        }
        
        // Generate new wind for next turn
        room.wind = (Math.random() * 16 - 8).toFixed(1); // Stronger wind range
        
        // Update current turn
        room.currentTurn = nextPlayer.id;
        room.turnStartTime = Date.now();
        
        // Clear room projectiles
        room.projectiles = [];
        
        // Notify room about turn change
        io.to(roomId).emit('turn-changed', {
            playerId: nextPlayer.id,
            wind: room.wind,
            turnTime: TURN_TIME
        });
        
        // Start new turn timer
        startTurnTimer(roomId);
    }
    
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
            
            // Reset missed turns counter
            const currentPlayer = room.players.find(p => p.id === socket.id);
            if (currentPlayer) {
                currentPlayer.missedTurns = 0;
            }
            
            // Send projectile update to room
            io.to(roomId).emit('projectile-update', data);
        } catch (error) {
            console.error("Error in fire:", error);
        }
    });
    
    // Move player
    socket.on('move-player', (data) => {
        try {
            const player = gameState.players[socket.id];
            
            if (!player || !player.room) return;
            
            const roomId = player.room;
            const room = gameState.rooms[roomId];
            
            if (!room || room.status !== 'playing' || room.currentTurn !== socket.id) return;
            
            console.log(`Player ${socket.id} moved in room ${roomId}`);
            
            // Update player position in game state
            const currentPlayer = room.players.find(p => p.id === socket.id);
            if (currentPlayer) {
                currentPlayer.x = data.x;
                currentPlayer.y = data.y;
                
                // Send movement update to all players in room
                io.to(roomId).emit('player-moved', {
                    playerId: socket.id,
                    x: data.x,
                    y: data.y
                });
            }
        } catch (error) {
            console.error("Error in move-player:", error);
        }
    });
    
    // Use item
    socket.on('use-item', (data) => {
        try {
            const player = gameState.players[socket.id];
            
            if (!player || !player.room) return;
            
            const roomId = player.room;
            const room = gameState.rooms[roomId];
            
            if (!room || room.status !== 'playing' || room.currentTurn !== socket.id) return;
            
            console.log(`Player ${socket.id} used item ${data.itemId} in room ${roomId}`);
            
            // Apply item effect
            const currentPlayer = room.players.find(p => p.id === socket.id);
            
            if (!currentPlayer) return;
            
            // Update player state based on item
            switch (data.itemId) {
                case 'healthpack':
                    currentPlayer.health = Math.min(currentPlayer.maxHealth, currentPlayer.health + items.healthpack.value);
                    break;
                case 'shield':
                    currentPlayer.effects.push({
                        type: 'shield',
                        duration: items.shield.duration,
                        value: items.shield.value
                    });
                    break;
                case 'teleport':
                    currentPlayer.x = data.targetX;
                    currentPlayer.y = data.targetY;
                    break;
            }
            
            // Reset missed turns counter
            currentPlayer.missedTurns = 0;
            
            // Notify all players about item use
            io.to(roomId).emit('item-used', {
                playerId: socket.id,
                itemId: data.itemId,
                targetX: data.targetX,
                targetY: data.targetY,
                playerState: {
                    health: currentPlayer.health,
                    effects: currentPlayer.effects,
                    x: currentPlayer.x,
                    y: currentPlayer.y
                }
            });
        } catch (error) {
            console.error("Error in use-item:", error);
        }
    });
    
    // Damage player
    socket.on('damage-player', (data) => {
        try {
            const player = gameState.players[socket.id];
            
            if (!player || !player.room) return;
            
            const roomId = player.room;
            const room = gameState.rooms[roomId];
            
            if (!room || room.status !== 'playing') return;
            
            console.log(`Player ${data.targetId} was damaged in room ${roomId}`);
            
            // Find target player
            const targetPlayer = room.players.find(p => p.id === data.targetId);
            
            if (!targetPlayer || !targetPlayer.alive) return;
            
            // Apply shield effect if present
            let damage = data.damage;
            const shieldEffect = targetPlayer.effects.find(e => e.type === 'shield');
            
            if (shieldEffect) {
                damage = Math.round(damage * (1 - shieldEffect.value));
            }
            
            // Apply damage
            targetPlayer.health = Math.max(0, targetPlayer.health - damage);
            
            // Check if player is dead
            if (targetPlayer.health <= 0) {
                targetPlayer.alive = false;
                
                // Notify about player death
                io.to(roomId).emit('player-killed', {
                    playerId: targetPlayer.id,
                    killerId: data.attackerId
                });
                
                // Check for game over
                checkGameOver(roomId);
            } else {
                // Notify about damage
                io.to(roomId).emit('player-damaged', {
                    playerId: targetPlayer.id,
                    attackerId: data.attackerId,
                    damage: damage,
                    health: targetPlayer.health
                });
            }
        } catch (error) {
            console.error("Error in damage-player:", error);
        }
    });
    
    // Modify terrain
    socket.on('modify-terrain', (data) => {
        try {
            const player = gameState.players[socket.id];
            
            if (!player || !player.room) return;
            
            const roomId = player.room;
            const room = gameState.rooms[roomId];
            
            if (!room || room.status !== 'playing') return;
            
            console.log(`Terrain modified in room ${roomId}`);
            
            // Update terrain in game state
            if (data.terrain) {
                room.map.terrain = data.terrain;
            }
            
            // Update platforms if provided
            if (data.platforms) {
                room.map.platforms = data.platforms;
            }
            
            // Notify all players about terrain modification
            io.to(roomId).emit('terrain-modified', {
                terrain: room.map.terrain,
                platforms: room.map.platforms
            });
        } catch (error) {
            console.error("Error in modify-terrain:", error);
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
            
            // Reset missed turns counter
            const currentPlayer = room.players.find(p => p.id === socket.id);
            if (currentPlayer) {
                currentPlayer.missedTurns = 0;
            }
            
            // Change turn
            changeTurn(roomId);
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
                room.turnStartTime = null;
                room.projectiles = [];
                
                // Notify room that all players are ready
                io.to(roomId).emit('all-players-ready');
                
                // If room owner is still in room, auto-start new game
                if (room.owner && gameState.players[room.owner.id]) {
                    setTimeout(() => {
                        // Generate map
                        room.map = generateMap(room.mapId || 'complex');
                        
                        // Position players on map
                        const gamePlayers = positionPlayers(room);
                        
                        // Set current turn
                        room.currentTurn = gamePlayers[0].id;
                        room.turnStartTime = Date.now();
                        
                        // Generate initial wind
                        room.wind = (Math.random() * 16 - 8).toFixed(1);
                        
                        // Update room status
                        room.status = 'playing';
                        
                        // Notify room about game starting
                        io.to(roomId).emit('game-started', {
                            map: room.map,
                            players: gamePlayers,
                            currentTurn: room.currentTurn,
                            turnTime: TURN_TIME,
                            wind: room.wind,
                            weapons: weapons,
                            items: items
                        });
                        
                        // Start turn timer
                        startTurnTimer(roomId);
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
                        
                        // If game is in progress, mark player as dead
                        if (room.status === 'playing') {
                            const gamePlayer = room.players.find(p => p.id === socket.id);
                            if (gamePlayer) {
                                gamePlayer.alive = false;
                                
                                // Notify room about player elimination
                                io.to(roomId).emit('player-eliminated', {
                                    playerId: socket.id,
                                    reason: 'disconnected'
                                });
                                
                                // If it was this player's turn, change turn
                                if (room.currentTurn === socket.id) {
                                    changeTurn(roomId);
                                }
                                
                                // Check for game over
                                checkGameOver(roomId);
                            }
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
