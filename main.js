const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Set canvas to full screen
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// Resize handler
window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    player.groundY = canvas.height - 80;
    if (!player.isJumping) {
        player.y = player.groundY;
    }
});

// Game states
let gameState = 'menu'; // 'menu', 'nameEntry', 'playing', 'gameOver', 'victory', 'leaderboard'
let score = 0;
let lives = 3;
let gameOver = false;
let level = 1;
let ghostsKilledThisLevel = 0;
let ghostsNeededForNextLevel = 10;
let playerName = localStorage.getItem('ghostShooterPlayerName') || '';
let nameInput = '';

// Leaderboard - will be loaded from server
let leaderboard = [];
let isLoadingLeaderboard = false;

// Wait for Firebase to be ready
function waitForFirebase() {
    return new Promise((resolve) => {
        if (window.firebaseReady) {
            resolve();
        } else {
            const checkInterval = setInterval(() => {
                if (window.firebaseReady) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 100);
        }
    });
}

// Load leaderboard from Firebase
async function loadLeaderboard() {
    try {
        await waitForFirebase();
        isLoadingLeaderboard = true;
        
        const { collection, getDocs, query, orderBy, limit } = window.firebaseModules;
        const db = window.firebaseDB;
        
        const q = query(
            collection(db, 'leaderboard'),
            orderBy('score', 'desc'),
            limit(10)
        );
        
        const querySnapshot = await getDocs(q);
        leaderboard = [];
        
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            leaderboard.push({
                id: doc.id,
                name: data.name,
                score: data.score,
                level: data.level,
                timestamp: data.timestamp
            });
        });
        
        console.log('Leaderboard loaded from Firebase:', leaderboard.length, 'entries');
    } catch (error) {
        console.log('Firebase error, using local leaderboard:', error);
        // Fallback to localStorage
        leaderboard = JSON.parse(localStorage.getItem('ghostShooterLeaderboard')) || [];
    } finally {
        isLoadingLeaderboard = false;
    }
}

// Save score to Firebase
async function saveScoreToFirebase(name, score, level) {
    try {
        await waitForFirebase();
        
        const { collection, addDoc, getDocs, query, where, updateDoc, doc } = window.firebaseModules;
        const db = window.firebaseDB;
        
        // Check if player already exists
        const q = query(collection(db, 'leaderboard'), where('name', '==', name));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
            // Update existing player
            const docRef = querySnapshot.docs[0].ref;
            await updateDoc(docRef, {
                score: score,
                level: level,
                timestamp: Date.now()
            });
            console.log('Score updated in Firebase for:', name);
        } else {
            // Add new player
            await addDoc(collection(db, 'leaderboard'), {
                name: name,
                score: score,
                level: level,
                timestamp: Date.now()
            });
            console.log('New score added to Firebase for:', name);
        }
        
        await loadLeaderboard();
        return true;
    } catch (error) {
        console.log('Could not save to Firebase:', error);
        return false;
    }
}

// Initialize leaderboard on load
loadLeaderboard();

// Audio Context for sound effects
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

function playShootSound() {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(200, audioContext.currentTime + 0.1);
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);
}

function playGhostHitSound() {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(400, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(100, audioContext.currentTime + 0.2);
    
    gainNode.gain.setValueAtTime(0.4, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.2);
}

function playGhostAmbientSound() {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(200 + Math.random() * 100, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(150 + Math.random() * 50, audioContext.currentTime + 0.5);
    
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
}

function playPlayerHitSound() {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(150, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(50, audioContext.currentTime + 0.3);
    
    gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
}

// Ghost ambient sound timer
let ghostSoundTimer = 0;

// Player
const player = {
    x: canvas.width / 2,
    y: canvas.height - 80,
    width: 40,
    height: 60,
    speed: 5,
    facingRight: true,
    velocityY: 0,
    gravity: 0.5,
    jumpPower: -12,
    isJumping: false,
    groundY: canvas.height - 80
};

// Controls
const keys = {};
let mouseX = 0;
let mouseY = 0;
let isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
let touchStartX = 0;
let touchStartY = 0;
let lastClickY = 0;

// Arrays
const bullets = [];
const ghosts = [];
const particles = [];
const bossLasers = [];

// Boss state
let bossActive = false;
let boss = null;
let bossShootTimer = 0;

// Ghost spawn timer
let ghostSpawnTimer = 0;
let ghostSpawnInterval = 90;

// New difficulty features
let ghostTypes = ['normal', 'fast', 'tank', 'zigzag'];
let currentWave = 1;
let waveGhostsRemaining = 0;
let betweenWaves = false;
let waveTimer = 0;
let screenShakeIntensity = 0;

function updateDifficulty() {
    // Increase difficulty with each level
    ghostSpawnInterval = Math.max(30, 90 - (level - 1) * 6);
    ghostsNeededForNextLevel = 10 + (level - 1) * 5;
    
    // Wave system - every 3 levels introduces a new wave mechanic
    if (level >= 3) {
        currentWave = Math.floor(level / 3) + 1;
    }
}

// Event listeners
document.addEventListener('keydown', (e) => {
    if (gameState === 'nameEntry') {
        if (e.key === 'Enter' && nameInput.trim().length > 0) {
            playerName = nameInput.trim();
            localStorage.setItem('ghostShooterPlayerName', playerName);
            startGame();
        } else if (e.key === 'Backspace') {
            nameInput = nameInput.slice(0, -1);
        } else if (e.key.length === 1 && nameInput.length < 15) {
            nameInput += e.key;
        }
    } else {
        keys[e.key] = true;
    }
});
document.addEventListener('keyup', (e) => keys[e.key] = false);
canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
});

// Touch controls
let touchShootActive = false;
let activeTouches = new Map();

canvas.addEventListener('touchstart', (e) => {
    if (gameState !== 'playing') return;
    
    const rect = canvas.getBoundingClientRect();
    
    // Handle all touches
    for (let i = 0; i < e.touches.length; i++) {
        const touch = e.touches[i];
        const touchX = touch.clientX - rect.left;
        const touchY = touch.clientY - rect.top;
        
        // Check if touch is in joystick area (bottom left 130px for 90px joystick + padding)
        const isJoystickArea = touchX < 130 && touchY > canvas.height - 130;
        
        if (!isJoystickArea) {
            e.preventDefault();
            mouseX = touchX;
            mouseY = touchY;
            shoot();
            activeTouches.set(touch.identifier, { x: touchX, y: touchY, isShoot: true });
        } else {
            activeTouches.set(touch.identifier, { x: touchX, y: touchY, isShoot: false });
        }
    }
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    if (gameState !== 'playing') return;
    
    const rect = canvas.getBoundingClientRect();
    
    // Handle all touches
    for (let i = 0; i < e.touches.length; i++) {
        const touch = e.touches[i];
        const touchX = touch.clientX - rect.left;
        const touchY = touch.clientY - rect.top;
        
        // Check if this touch was for shooting
        const touchData = activeTouches.get(touch.identifier);
        if (touchData && touchData.isShoot) {
            e.preventDefault();
            mouseX = touchX;
            mouseY = touchY;
            activeTouches.set(touch.identifier, { x: touchX, y: touchY, isShoot: true });
        }
    }
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
    if (gameState === 'playing') {
        e.preventDefault();
        
        // Remove ended touches
        const remainingTouches = new Set();
        for (let i = 0; i < e.touches.length; i++) {
            remainingTouches.add(e.touches[i].identifier);
        }
        
        // Clean up activeTouches
        for (let [id, data] of activeTouches) {
            if (!remainingTouches.has(id)) {
                activeTouches.delete(id);
            }
        }
    }
}, { passive: false });

// Mobile control buttons
let joystickActive = false;
let joystickTouchId = null;
let joystickCenterX = 0;
let joystickCenterY = 0;

if (isMobile) {
    // Wait for DOM to be ready
    setTimeout(() => {
        const joystickContainer = document.querySelector('.joystick-container');
        const joystickStick = document.getElementById('joystickStick');
        
        if (!joystickContainer || !joystickStick) {
            console.error('Joystick elements not found!');
            return;
        }
        
        console.log('Joystick initialized successfully');
        console.log('Joystick size: 90x90px');
        
        // Joystick controls with multi-touch support
        joystickContainer.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (!joystickActive && e.touches.length > 0) {
                joystickActive = true;
                joystickTouchId = e.touches[0].identifier;
                const rect = joystickContainer.getBoundingClientRect();
                joystickCenterX = rect.left + rect.width / 2;
                joystickCenterY = rect.top + rect.height / 2;
                console.log('Joystick activated');
                handleJoystickMove(e.touches[0]);
            }
        }, { passive: false });
        
        joystickContainer.addEventListener('touchmove', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (joystickActive) {
                // Find the touch that belongs to the joystick
                for (let i = 0; i < e.touches.length; i++) {
                    if (e.touches[i].identifier === joystickTouchId) {
                        handleJoystickMove(e.touches[i]);
                        break;
                    }
                }
            }
        }, { passive: false });
        
        joystickContainer.addEventListener('touchend', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Check if the joystick touch ended
            let joystickTouchEnded = true;
            for (let i = 0; i < e.touches.length; i++) {
                if (e.touches[i].identifier === joystickTouchId) {
                    joystickTouchEnded = false;
                    break;
                }
            }
            
            if (joystickTouchEnded) {
                joystickActive = false;
                joystickTouchId = null;
                keys['a'] = false;
                keys['d'] = false;
                // Reset joystick position
                joystickStick.style.left = '22.5px';
                joystickStick.style.top = '22.5px';
            }
        }, { passive: false });
        
        joystickContainer.addEventListener('touchcancel', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            joystickActive = false;
            joystickTouchId = null;
            keys['a'] = false;
            keys['d'] = false;
            // Reset joystick position
            joystickStick.style.left = '22.5px';
            joystickStick.style.top = '22.5px';
        }, { passive: false });
        
        function handleJoystickMove(touch) {
            const deltaX = touch.clientX - joystickCenterX;
            const deltaY = touch.clientY - joystickCenterY;
            
            // Calculate distance and angle (adjusted for 90px joystick, max radius 45px, usable 22.5px)
            const distance = Math.min(22.5, Math.sqrt(deltaX * deltaX + deltaY * deltaY));
            const angle = Math.atan2(deltaY, deltaX);
            
            // Update stick position (center is at 22.5px)
            const stickX = 22.5 + Math.cos(angle) * distance;
            const stickY = 22.5 + Math.sin(angle) * distance;
            joystickStick.style.left = stickX + 'px';
            joystickStick.style.top = stickY + 'px';
            
            // Update movement keys based on joystick position
            // Horizontal movement only (threshold: 8px for better sensitivity)
            if (Math.abs(deltaX) > 8) {
                if (deltaX < 0) {
                    keys['a'] = true;
                    keys['d'] = false;
                } else {
                    keys['d'] = true;
                    keys['a'] = false;
                }
            } else {
                keys['a'] = false;
                keys['d'] = false;
            }
        }
    }, 100);
}
canvas.addEventListener('click', handleClick);
canvas.addEventListener('touchstart', handleClick, { passive: false });

function handleClick(e) {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    let clickX, clickY;
    
    if (e.type === 'touchstart') {
        clickX = e.touches[0].clientX - rect.left;
        clickY = e.touches[0].clientY - rect.top;
    } else {
        clickX = e.clientX - rect.left;
        clickY = e.clientY - rect.top;
    }
    
    lastClickY = clickY;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const isMobileView = canvas.width < 768;
    
    if (gameState === 'menu') {
        // Start Game button (center)
        if (clickX > centerX - 100 && clickX < centerX + 100 &&
            clickY > centerY - 20 && clickY < centerY + 30) {
            // Check if player already has a saved name
            if (playerName && playerName.trim().length > 0) {
                startGame();
            } else {
                gameState = 'nameEntry';
                nameInput = '';
            }
        }
        // Leaderboard button (responsive position)
        else if (isMobileView) {
            // Mobile: Top right corner, below the UI
            const btnWidth = 100;
            const btnHeight = 40;
            const btnX = canvas.width - btnWidth - 10;
            const btnY = 50;
            
            if (clickX > btnX && clickX < btnX + btnWidth &&
                clickY > btnY && clickY < btnY + btnHeight) {
                gameState = 'leaderboard';
            }
        } else {
            // Desktop: Top right corner
            const btnWidth = 180;
            const btnHeight = 50;
            const btnX = canvas.width - btnWidth - 40;
            const btnY = 40;
            
            if (clickX > btnX && clickX < btnX + btnWidth &&
                clickY > btnY && clickY < btnY + btnHeight) {
                gameState = 'leaderboard';
            }
        }
    } else if (gameState === 'leaderboard') {
        // Reload leaderboard when entering leaderboard screen
        loadLeaderboard();
        
        // Back button
        if (clickX > centerX - 80 && clickX < centerX + 80 &&
            clickY > canvas.height - 100 && clickY < canvas.height - 60) {
            gameState = 'menu';
        }
    } else if (gameState === 'nameEntry') {
        // Start button (only if name is entered)
        if (nameInput.trim().length > 0 &&
            clickX > centerX - 80 && clickX < centerX + 80 &&
            clickY > centerY + 80 && clickY < centerY + 120) {
            playerName = nameInput.trim();
            localStorage.setItem('ghostShooterPlayerName', playerName);
            startGame();
        }
        // Back button
        if (clickX > centerX - 80 && clickX < centerX + 80 &&
            clickY > centerY + 140 && clickY < centerY + 180) {
            gameState = 'menu';
        }
    } else if (gameState === 'playing') {
        if (e.type !== 'touchstart') {
            shoot();
        }
    } else if (gameState === 'gameOver' || gameState === 'victory') {
        gameState = 'menu';
    }
}

function startGame() {
    gameState = 'playing';
    score = 0;
    lives = 3;
    level = 1;
    ghostsKilledThisLevel = 0;
    gameOver = false;
    bullets.length = 0;
    ghosts.length = 0;
    particles.length = 0;
    bossLasers.length = 0;
    bossActive = false;
    boss = null;
    bossShootTimer = 0;
    player.x = canvas.width / 2;
    player.groundY = canvas.height - 80;
    player.y = player.groundY;
    updateDifficulty();
    
    // Show mobile controls
    if (isMobile) {
        document.getElementById('mobileControls').classList.add('active');
    }
}

function shoot() {
    if (gameState !== 'playing') return;
    
    const angle = Math.atan2(mouseY - player.y, mouseX - player.x);
    bullets.push({
        x: player.x,
        y: player.y,
        vx: Math.cos(angle) * 8,
        vy: Math.sin(angle) * 8,
        size: 4
    });
    
    playShootSound();
}

function saveScore() {
    // Save to Firebase first
    saveScoreToFirebase(playerName, score, level).then(success => {
        if (!success) {
            // Fallback to local storage
            const existingPlayerIndex = leaderboard.findIndex(entry => entry.name === playerName);
            
            if (existingPlayerIndex !== -1) {
                leaderboard[existingPlayerIndex].score = score;
                leaderboard[existingPlayerIndex].level = level;
            } else {
                leaderboard.push({ name: playerName, score: score, level: level });
            }
            
            leaderboard.sort((a, b) => b.score - a.score);
            leaderboard = leaderboard.slice(0, 10);
            localStorage.setItem('ghostShooterLeaderboard', JSON.stringify(leaderboard));
        }
    });
}

function spawnGhost() {
    const side = Math.random() < 0.5 ? 'left' : 'right';
    const speedMultiplier = 1 + (level - 1) * 0.2;
    
    // Determine ghost type based on level
    let ghostType = 'normal';
    const rand = Math.random();
    
    if (level >= 2) {
        // Level 2+: 30% chance of fast ghost
        if (rand < 0.3) ghostType = 'fast';
    }
    if (level >= 4) {
        // Level 4+: 20% chance of tank ghost
        if (rand > 0.7 && rand < 0.9) ghostType = 'tank';
    }
    if (level >= 6) {
        // Level 6+: 15% chance of zigzag ghost
        if (rand > 0.85) ghostType = 'zigzag';
    }
    
    const ghost = {
        x: side === 'left' ? -50 : canvas.width + 50,
        y: Math.random() * (canvas.height - 200) + 50,
        vx: 0,
        vy: 0,
        speed: 2.0 * speedMultiplier,
        size: 30,
        health: 1,
        type: ghostType,
        zigzagTimer: 0,
        zigzagDirection: 1
    };
    
    // Adjust stats based on type
    switch(ghostType) {
        case 'fast':
            ghost.speed *= 1.8;
            ghost.size = 25;
            ghost.color = '#00ffff'; // Cyan
            break;
        case 'tank':
            ghost.speed *= 0.6;
            ghost.size = 45;
            ghost.health = 3;
            ghost.color = '#ff6600'; // Orange
            break;
        case 'zigzag':
            ghost.speed *= 1.3;
            ghost.size = 28;
            ghost.color = '#ff00ff'; // Magenta
            break;
        default:
            ghost.color = '#00ff88'; // Green (normal)
    }
    
    ghosts.push(ghost);
    
    // Play ghost spawn sound
    if (Math.random() < 0.3) {
        playGhostAmbientSound();
    }
}

function spawnBoss() {
    bossActive = true;
    boss = {
        x: canvas.width / 2,
        y: 100,
        vx: 2,
        size: 80,
        health: 50,
        maxHealth: 50
    };
    ghosts.length = 0; // Clear regular ghosts
}

function shootBossLaser() {
    if (!boss) return;
    
    bossLasers.push({
        x: boss.x,
        y: boss.y + boss.size,
        vy: 6,
        size: 3
    });
    
    playGhostAmbientSound();
}

function createParticles(x, y, color) {
    for (let i = 0; i < 12; i++) {
        particles.push({
            x, y,
            vx: (Math.random() - 0.5) * 4,
            vy: (Math.random() - 0.5) * 4,
            life: 40,
            color,
            size: Math.random() * 3 + 2
        });
    }
}

function update() {
    if (gameState !== 'playing') return;

    // Player movement (left/right only)
    if (keys['a'] || keys['ArrowLeft']) {
        player.x -= player.speed;
        player.facingRight = false;
    }
    if (keys['d'] || keys['ArrowRight']) {
        player.x += player.speed;
        player.facingRight = true;
    }

    // Keep player in bounds
    player.x = Math.max(20, Math.min(canvas.width - 20, player.x));

    // Update bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
        bullets[i].x += bullets[i].vx;
        bullets[i].y += bullets[i].vy;
        
        if (bullets[i].x < 0 || bullets[i].x > canvas.width || 
            bullets[i].y < 0 || bullets[i].y > canvas.height) {
            bullets.splice(i, 1);
        }
    }

    // Spawn ghosts
    ghostSpawnTimer++;
    if (ghostSpawnTimer > ghostSpawnInterval && !bossActive) {
        spawnGhost();
        ghostSpawnTimer = 0;
    }

    // Boss logic for level 10
    if (level === 10 && !bossActive && ghostsKilledThisLevel === 0) {
        spawnBoss();
    }

    if (bossActive && boss) {
        // Boss movement (left and right at top)
        boss.x += boss.vx;
        
        // Bounce off walls
        if (boss.x - boss.size < 0 || boss.x + boss.size > canvas.width) {
            boss.vx *= -1;
        }
        
        // Boss shooting
        bossShootTimer++;
        if (bossShootTimer > 60) {
            shootBossLaser();
            bossShootTimer = 0;
        }
        
        // Check collision with player
        const dx = boss.x - player.x;
        const dy = boss.y - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < boss.size + 20) {
            lives = 0;
            gameOver = true;
            gameState = 'gameOver';
            saveScore();
            if (isMobile) {
                document.getElementById('mobileControls').classList.remove('active');
            }
        }
    }

    // Update boss lasers
    for (let i = bossLasers.length - 1; i >= 0; i--) {
        bossLasers[i].y += bossLasers[i].vy;
        
        // Remove if off screen
        if (bossLasers[i].y > canvas.height) {
            bossLasers.splice(i, 1);
            continue;
        }
        
        // Check collision with player
        const dx = bossLasers[i].x - player.x;
        const dy = bossLasers[i].y - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < 20) {
            bossLasers.splice(i, 1);
            lives = 0;
            createParticles(player.x, player.y, '#ff0066');
            playPlayerHitSound();
            gameOver = true;
            gameState = 'gameOver';
            saveScore();
            if (isMobile) {
                document.getElementById('mobileControls').classList.remove('active');
            }
        }
    }

    // Update ghosts - move toward player (only if not boss level)
    for (let i = ghosts.length - 1; i >= 0; i--) {
        const ghost = ghosts[i];
        
        // Calculate direction to player
        const dx = player.x - ghost.x;
        const dy = player.y - ghost.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // Special movement based on ghost type
        if (ghost.type === 'zigzag') {
            // Zigzag ghosts move in a wave pattern
            ghost.zigzagTimer++;
            if (ghost.zigzagTimer > 30) {
                ghost.zigzagDirection *= -1;
                ghost.zigzagTimer = 0;
            }
            
            if (dist > 0) {
                ghost.vx = (dx / dist) * ghost.speed;
                ghost.vy = (dy / dist) * ghost.speed;
                // Add perpendicular zigzag motion
                ghost.vx += ghost.zigzagDirection * 2;
                ghost.vy += ghost.zigzagDirection * 2;
            }
        } else {
            // Normal movement toward player
            if (dist > 0) {
                ghost.vx = (dx / dist) * ghost.speed;
                ghost.vy = (dy / dist) * ghost.speed;
            }
        }
        
        ghost.x += ghost.vx;
        ghost.y += ghost.vy;
        
        // Check collision with player
        if (dist < ghost.size + 20) {
            ghosts.splice(i, 1);
            lives--;
            createParticles(player.x, player.y, '#ff0066');
            playPlayerHitSound();
            screenShakeIntensity = 10; // Add screen shake on hit
            if (lives <= 0) {
                gameOver = true;
                gameState = 'gameOver';
                saveScore();
                // Hide mobile controls
                if (isMobile) {
                    document.getElementById('mobileControls').classList.remove('active');
                }
            }
            continue;
        }
    }

    // Check bullet-ghost collisions
    for (let i = bullets.length - 1; i >= 0; i--) {
        // Check boss collision
        if (bossActive && boss) {
            const dx = bullets[i].x - boss.x;
            const dy = bullets[i].y - boss.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist < boss.size) {
                createParticles(bullets[i].x, bullets[i].y, '#00ff88');
                playGhostHitSound();
                bullets.splice(i, 1);
                boss.health--;
                score += 10;
                
                // Boss defeated
                if (boss.health <= 0) {
                    createParticles(boss.x, boss.y, '#00ff88');
                    createParticles(boss.x, boss.y, '#8a2be2');
                    bossActive = false;
                    boss = null;
                    gameState = 'victory';
                    saveScore();
                    if (isMobile) {
                        document.getElementById('mobileControls').classList.remove('active');
                    }
                }
                continue;
            }
        }
        
        // Check regular ghost collisions
        for (let j = ghosts.length - 1; j >= 0; j--) {
            const dx = bullets[i].x - ghosts[j].x;
            const dy = bullets[i].y - ghosts[j].y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist < ghosts[j].size) {
                const ghost = ghosts[j];
                createParticles(ghost.x, ghost.y, ghost.color || '#00ff88');
                playGhostHitSound();
                bullets.splice(i, 1);
                
                // Reduce ghost health
                ghost.health--;
                
                // Ghost defeated
                if (ghost.health <= 0) {
                    ghosts.splice(j, 1);
                    
                    // Different points for different ghost types
                    let points = 10;
                    if (ghost.type === 'fast') points = 15;
                    if (ghost.type === 'tank') points = 30;
                    if (ghost.type === 'zigzag') points = 20;
                    
                    score += points;
                    ghostsKilledThisLevel++;
                    
                    // Check for level up
                    if (ghostsKilledThisLevel >= ghostsNeededForNextLevel && level < 10) {
                        level++;
                        ghostsKilledThisLevel = 0;
                        updateDifficulty();
                        createParticles(canvas.width / 2, canvas.height / 2, '#8a2be2');
                        screenShakeIntensity = 15; // Shake on level up
                    }
                } else {
                    // Tank ghost hit but not dead - visual feedback
                    screenShakeIntensity = 3;
                }
                
                break;
            }
        }
    }
    
    // Update screen shake
    if (screenShakeIntensity > 0) {
        screenShakeIntensity *= 0.9;
        if (screenShakeIntensity < 0.1) screenShakeIntensity = 0;
    }

    // Update particles
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].x += particles[i].vx;
        particles[i].y += particles[i].vy;
        particles[i].life--;
        if (particles[i].life <= 0) particles.splice(i, 1);
    }
    
    // Play ambient ghost sounds occasionally
    ghostSoundTimer++;
    if (ghostSoundTimer > 120 && ghosts.length > 0 && Math.random() < 0.05) {
        playGhostAmbientSound();
        ghostSoundTimer = 0;
    }

    // Update UI
    document.getElementById('score').textContent = score;
    document.getElementById('lives').textContent = lives;
    document.getElementById('level').textContent = level;
}

function drawPlayer() {
    ctx.save();
    ctx.translate(player.x, player.y);
    if (!player.facingRight) ctx.scale(-1, 1);
    
    // Glow effect
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#8a2be2';
    
    // Body
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(-15, -20, 30, 40);
    
    // Head
    ctx.fillStyle = '#d4a574';
    ctx.fillRect(-12, -35, 24, 20);
    
    // Hat
    ctx.fillStyle = '#0f0f1e';
    ctx.fillRect(-15, -40, 30, 8);
    
    // Gun with purple glow
    ctx.fillStyle = '#2d2d44';
    ctx.fillRect(10, -10, 25, 8);
    
    ctx.shadowBlur = 0;
    
    ctx.restore();
}

function drawGhost(ghost) {
    ctx.save();
    
    // Use ghost color or default
    const ghostColor = ghost.color || '#00ff88';
    
    // Ghostly glow - different colors for different types
    ctx.shadowBlur = ghost.type === 'fast' ? 25 : 20;
    ctx.shadowColor = ghostColor;
    
    // Semi-transparent body
    ctx.globalAlpha = ghost.type === 'fast' ? 0.9 : 0.8;
    ctx.fillStyle = ghostColor;
    ctx.beginPath();
    ctx.arc(ghost.x, ghost.y, ghost.size, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    
    // Eyes - different for tank ghosts
    const eyeSize = ghost.type === 'tank' ? 8 : 5;
    const eyeSpacing = ghost.type === 'tank' ? 12 : 8;
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#ff0000';
    ctx.fillStyle = '#ff0000';
    ctx.beginPath();
    ctx.arc(ghost.x - eyeSpacing, ghost.y - 5, eyeSize, 0, Math.PI * 2);
    ctx.arc(ghost.x + eyeSpacing, ghost.y - 5, eyeSize, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.shadowBlur = 0;
    
    // Wavy bottom
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = ghostColor;
    ctx.beginPath();
    ctx.moveTo(ghost.x - ghost.size, ghost.y);
    const waves = ghost.type === 'tank' ? 6 : 4;
    const waveWidth = (ghost.size * 2) / waves;
    for (let i = 0; i < waves; i++) {
        ctx.lineTo(ghost.x - ghost.size + i * waveWidth, ghost.y + ghost.size - 5);
        ctx.lineTo(ghost.x - ghost.size + i * waveWidth + waveWidth / 2, ghost.y + ghost.size);
    }
    ctx.lineTo(ghost.x + ghost.size, ghost.y);
    ctx.fill();
    
    // Health bar for tank ghosts
    if (ghost.type === 'tank' && ghost.health > 0) {
        const barWidth = ghost.size * 1.5;
        const barHeight = 5;
        const barX = ghost.x - barWidth / 2;
        const barY = ghost.y - ghost.size - 15;
        
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(barX, barY, barWidth, barHeight);
        
        ctx.fillStyle = '#ff6600';
        const healthPercent = ghost.health / 3;
        ctx.fillRect(barX, barY, barWidth * healthPercent, barHeight);
        
        ctx.strokeStyle = '#8a2be2';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barWidth, barHeight);
    }
    
    // Speed trail for fast ghosts
    if (ghost.type === 'fast') {
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = ghostColor;
        ctx.beginPath();
        ctx.arc(ghost.x - ghost.vx * 2, ghost.y - ghost.vy * 2, ghost.size * 0.7, 0, Math.PI * 2);
        ctx.fill();
    }
    
    ctx.restore();
}

function drawBoss() {
    if (!boss) return;
    
    ctx.save();
    
    // Boss glow
    ctx.shadowBlur = 40;
    ctx.shadowColor = '#ff0066';
    
    // Boss body
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#ff0066';
    ctx.beginPath();
    ctx.arc(boss.x, boss.y, boss.size, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    
    // Eyes (glowing red)
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#ff0000';
    ctx.fillStyle = '#ff0000';
    ctx.beginPath();
    ctx.arc(boss.x - 20, boss.y - 15, 12, 0, Math.PI * 2);
    ctx.arc(boss.x + 20, boss.y - 15, 12, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.shadowBlur = 0;
    
    // Wavy bottom
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#ff0066';
    ctx.beginPath();
    ctx.moveTo(boss.x - boss.size, boss.y);
    for (let i = 0; i < 8; i++) {
        ctx.lineTo(boss.x - boss.size + i * 20, boss.y + boss.size - 10);
        ctx.lineTo(boss.x - boss.size + i * 20 + 10, boss.y + boss.size);
    }
    ctx.lineTo(boss.x + boss.size, boss.y);
    ctx.fill();
    
    // Health bar
    const barWidth = boss.size * 2;
    const barHeight = 10;
    const barX = boss.x - barWidth / 2;
    const barY = boss.y - boss.size - 30;
    
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(barX, barY, barWidth, barHeight);
    
    ctx.fillStyle = '#ff0066';
    const healthPercent = boss.health / boss.maxHealth;
    ctx.fillRect(barX, barY, barWidth * healthPercent, barHeight);
    
    ctx.strokeStyle = '#8a2be2';
    ctx.lineWidth = 2;
    ctx.strokeRect(barX, barY, barWidth, barHeight);
    
    // Boss name
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#ff0066';
    ctx.fillStyle = '#ff0066';
    ctx.font = '20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('BOSS GHOST', boss.x, barY - 10);
    
    ctx.restore();
}

function drawBackground() {
    // Clear canvas with dark gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#0a0a1e');
    gradient.addColorStop(1, '#16213e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw fog effect
    ctx.fillStyle = 'rgba(138, 43, 226, 0.05)';
    for (let i = 0; i < 3; i++) {
        ctx.fillRect(0, i * 200 + (Date.now() / 50) % 200, canvas.width, 100);
    }
    
    // Draw ground
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, canvas.height - 100, canvas.width, 100);
    
    // Ground details
    ctx.fillStyle = '#0f0f1e';
    ctx.fillRect(0, canvas.height - 100, canvas.width, 5);
}

function drawNameEntry() {
    drawBackground();
    
    const fontSize = Math.min(48, canvas.width / 15);
    const inputBoxWidth = Math.min(400, canvas.width * 0.8);
    
    // Title
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#8a2be2';
    ctx.fillStyle = '#8a2be2';
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.fillText('ENTER YOUR NAME', canvas.width / 2, canvas.height / 2 - 100);
    
    // Input box
    ctx.shadowBlur = 15;
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(canvas.width / 2 - inputBoxWidth / 2, canvas.height / 2 - 30, inputBoxWidth, 60);
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 3;
    ctx.strokeRect(canvas.width / 2 - inputBoxWidth / 2, canvas.height / 2 - 30, inputBoxWidth, 60);
    
    // Display name input
    ctx.fillStyle = '#00ff88';
    ctx.font = `${Math.min(32, canvas.width / 20)}px Arial`;
    const displayText = nameInput || 'Type here...';
    ctx.fillStyle = nameInput ? '#00ff88' : '#666';
    ctx.fillText(displayText, canvas.width / 2, canvas.height / 2 + 10);
    
    // Blinking cursor
    if (Math.floor(Date.now() / 500) % 2 === 0 && nameInput.length < 15) {
        const textWidth = ctx.measureText(nameInput).width;
        ctx.fillStyle = '#00ff88';
        ctx.fillRect(canvas.width / 2 + textWidth / 2 + 5, canvas.height / 2 - 20, 3, 35);
    }
    
    // Instructions
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#8a2be2';
    ctx.font = `${Math.min(20, canvas.width / 30)}px Arial`;
    if (!isMobile) {
        ctx.fillText('Press ENTER to start', canvas.width / 2, canvas.height / 2 + 60);
    }
    
    // Start button (if name entered)
    if (nameInput.trim().length > 0) {
        ctx.shadowBlur = 15;
        ctx.fillStyle = '#00ff88';
        ctx.fillRect(canvas.width / 2 - 80, canvas.height / 2 + 80, 160, 40);
        ctx.fillStyle = '#0a0a1e';
        ctx.font = `${Math.min(24, canvas.width / 25)}px Arial`;
        ctx.fillText('START', canvas.width / 2, canvas.height / 2 + 107);
    }
    
    // Back button
    ctx.shadowBlur = 15;
    ctx.fillStyle = '#8a2be2';
    ctx.fillRect(canvas.width / 2 - 80, canvas.height / 2 + 140, 160, 40);
    ctx.fillStyle = '#0a0a1e';
    ctx.font = `${Math.min(24, canvas.width / 25)}px Arial`;
    ctx.fillText('BACK', canvas.width / 2, canvas.height / 2 + 167);
    
    ctx.shadowBlur = 0;
}

function drawMenu() {
    drawBackground();
    
    const titleSize = Math.min(72, canvas.width / 10);
    const buttonSize = Math.min(24, canvas.width / 30);
    const isMobileView = canvas.width < 768;
    
    // Title
    ctx.shadowBlur = 30;
    ctx.shadowColor = '#8a2be2';
    ctx.fillStyle = '#8a2be2';
    ctx.font = `bold ${titleSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.fillText("GLOCK 'D' GHOOST", canvas.width / 2, canvas.height / 2 - 120);
    
    // Welcome message if player name exists
    if (playerName && playerName.trim().length > 0) {
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#00ff88';
        ctx.font = `${Math.min(20, canvas.width / 35)}px Arial`;
        ctx.fillText(`Welcome back, ${playerName}!`, canvas.width / 2, canvas.height / 2 - 70);
    }
    
    // Start Game button (center)
    ctx.shadowBlur = 15;
    ctx.fillStyle = '#00ff88';
    ctx.fillRect(canvas.width / 2 - 100, canvas.height / 2 - 20, 200, 50);
    ctx.fillStyle = '#0a0a1e';
    ctx.font = `${buttonSize}px Arial`;
    ctx.fillText('START GAME', canvas.width / 2, canvas.height / 2 + 10);
    
    // Leaderboard button (side position - responsive)
    if (isMobileView) {
        // Mobile: Top right corner, below the UI
        const btnWidth = 100;
        const btnHeight = 40;
        const btnX = canvas.width - btnWidth - 10;
        const btnY = 50;
        
        ctx.shadowBlur = 15;
        ctx.fillStyle = '#8a2be2';
        ctx.fillRect(btnX, btnY, btnWidth, btnHeight);
        ctx.fillStyle = '#0a0a1e';
        ctx.font = `${Math.min(16, canvas.width / 35)}px Arial`;
        ctx.fillText('LEADERBOARD', btnX + btnWidth / 2, btnY + btnHeight / 2 + 5);
    } else {
        // Desktop: Top right corner
        const btnWidth = 180;
        const btnHeight = 50;
        const btnX = canvas.width - btnWidth - 40;
        const btnY = 40;
        
        ctx.shadowBlur = 15;
        ctx.fillStyle = '#8a2be2';
        ctx.fillRect(btnX, btnY, btnWidth, btnHeight);
        ctx.fillStyle = '#0a0a1e';
        ctx.font = `${buttonSize}px Arial`;
        ctx.fillText('LEADERBOARD', btnX + btnWidth / 2, btnY + btnHeight / 2 + 5);
    }
    
    ctx.shadowBlur = 0;
}

function drawLeaderboard() {
    drawBackground();
    
    const titleSize = Math.min(48, canvas.width / 12);
    const entrySize = Math.min(24, canvas.width / 25);
    
    // Title
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#8a2be2';
    ctx.fillStyle = '#8a2be2';
    ctx.font = `bold ${titleSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.fillText('GLOBAL LEADERBOARD', canvas.width / 2, 100);
    
    // Loading indicator
    if (isLoadingLeaderboard) {
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#00ff88';
        ctx.font = `${entrySize}px Arial`;
        ctx.fillText('Loading...', canvas.width / 2, canvas.height / 2);
    } else {
        // Leaderboard entries
        ctx.shadowBlur = 10;
        ctx.font = `${entrySize}px Arial`;
        ctx.fillStyle = '#00ff88';
        
        if (leaderboard.length === 0) {
            ctx.fillText('No scores yet!', canvas.width / 2, canvas.height / 2);
        } else {
            const maxWidth = Math.min(500, canvas.width * 0.9);
            for (let i = 0; i < Math.min(10, leaderboard.length); i++) {
                const entry = leaderboard[i];
                const y = 180 + i * 40;
                ctx.fillStyle = i < 3 ? '#00ff88' : '#8a2be2';
                ctx.textAlign = 'left';
                ctx.fillText(`${i + 1}. ${entry.name}`, canvas.width / 2 - maxWidth / 2, y);
                ctx.textAlign = 'right';
                ctx.fillText(`${entry.score} pts (Lvl ${entry.level})`, canvas.width / 2 + maxWidth / 2, y);
            }
        }
    }
    
    // Back button
    ctx.textAlign = 'center';
    ctx.shadowBlur = 15;
    ctx.fillStyle = '#00ff88';
    ctx.fillRect(canvas.width / 2 - 80, canvas.height - 100, 160, 40);
    ctx.fillStyle = '#0a0a1e';
    ctx.font = `${Math.min(24, canvas.width / 25)}px Arial`;
    ctx.fillText('BACK', canvas.width / 2, canvas.height - 73);
    
    ctx.shadowBlur = 0;
}

function draw() {
    if (gameState === 'menu') {
        drawMenu();
        return;
    }
    
    if (gameState === 'nameEntry') {
        drawNameEntry();
        return;
    }
    
    if (gameState === 'leaderboard') {
        drawLeaderboard();
        return;
    }
    
    drawBackground();
    
    // Draw particles with glow
    particles.forEach(p => {
        ctx.shadowBlur = 10;
        ctx.shadowColor = p.color;
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life / 40;
        ctx.fillRect(p.x, p.y, p.size, p.size);
    });
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    
    // Draw bullets with glow
    bullets.forEach(b => {
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#8a2be2';
        ctx.fillStyle = '#8a2be2';
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.shadowBlur = 0;
    
    // Draw boss lasers
    bossLasers.forEach(laser => {
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#ff0000';
        ctx.fillStyle = '#ff0000';
        ctx.beginPath();
        ctx.arc(laser.x, laser.y, laser.size, 0, Math.PI * 2);
        ctx.fill();
        
        // Laser trail
        ctx.globalAlpha = 0.5;
        ctx.fillRect(laser.x - 1, laser.y - 20, 2, 20);
        ctx.globalAlpha = 1;
    });
    ctx.shadowBlur = 0;
    
    // Draw boss or ghosts
    if (bossActive && boss) {
        drawBoss();
    } else {
        ghosts.forEach(drawGhost);
    }
    
    // Draw player
    drawPlayer();
    
    // Game over screen
    if (gameState === 'gameOver') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        const titleSize = Math.min(48, canvas.width / 12);
        const textSize = Math.min(24, canvas.width / 25);
        
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#8a2be2';
        ctx.fillStyle = '#8a2be2';
        ctx.font = `${titleSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 60);
        
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#00ff88';
        ctx.font = `${textSize}px Arial`;
        ctx.fillText('Final Score: ' + score, canvas.width / 2, canvas.height / 2 - 10);
        ctx.fillText('Level Reached: ' + level, canvas.width / 2, canvas.height / 2 + 30);
        ctx.fillText(isMobile ? 'Tap to Continue' : 'Click to Continue', canvas.width / 2, canvas.height / 2 + 70);
        ctx.shadowBlur = 0;
    }
    
    // Victory screen
    if (gameState === 'victory') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        const titleSize = Math.min(48, canvas.width / 12);
        const textSize = Math.min(24, canvas.width / 25);
        
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#00ff88';
        ctx.fillStyle = '#00ff88';
        ctx.font = `${titleSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.fillText('VICTORY!', canvas.width / 2, canvas.height / 2 - 60);
        
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#8a2be2';
        ctx.font = `${textSize}px Arial`;
        ctx.fillText('You completed all 10 levels!', canvas.width / 2, canvas.height / 2 - 10);
        ctx.fillText('Final Score: ' + score, canvas.width / 2, canvas.height / 2 + 30);
        ctx.fillText(isMobile ? 'Tap to Continue' : 'Click to Continue', canvas.width / 2, canvas.height / 2 + 70);
        ctx.shadowBlur = 0;
    }
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

gameLoop();
