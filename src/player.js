// Constants for player movement and interactions
const MOVEMENT_COOLDOWN = 200;
const NORMAL_SPEED = 100;
const BOOSTED_SPEED = 150;
const WATER_MOVEMENT_DURATION = 200;
const NORMAL_MOVEMENT_DURATION = 100;
const GRID_WIDTH = 20;
const GRID_HEIGHT = 12;
const TILE_SIZE = 48;

/**
 * Sets up the player sprite and input controls.
 * @param {Phaser.Scene} scene - The current game scene
 * @returns {Phaser.Physics.Arcade.Sprite} - The player sprite
 */
export function setupPlayer(scene) {
    const player = scene.physics.add.sprite(GRID_WIDTH / 2 * TILE_SIZE, GRID_HEIGHT / 2 * TILE_SIZE, 'curaleaf')
        .setScale(0.15);
    player.gridX = Math.floor(GRID_WIDTH / 2);
    player.gridY = Math.floor(GRID_HEIGHT / 2);
    player.setCollideWorldBounds(true);

    scene.cursors = scene.input.keyboard.createCursorKeys();
    scene.xbiteKey = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X);

    scene.player = player;
    player.shootNugget = () => {
        const pointer = scene.input.activePointer;
        const angle = Phaser.Math.Angle.Between(player.x, player.y, pointer.x, pointer.y);
        if (scene.gameState.tripleShotTimer > 0) {
            const offsets = [-0.2, 0, 0.2];
            offsets.forEach(offset => {
                const bullet = scene.bullets.get(player.x, player.y);
                if (bullet) {
                    bullet.setActive(true).setVisible(true);
                    scene.physics.velocityFromRotation(angle + offset, 300, bullet.body.velocity);
                    bullet.setScale(0.1).rotation = angle + offset;
                    if (scene.gameState.slowShotTimer > 0) bullet.slowsEnemies = true;
                    bullet.damage = 11;
                }
            });
        } else {
            const bullet = scene.bullets.get(player.x, player.y);
            if (bullet) {
                bullet.setActive(true).setVisible(true);
                scene.physics.velocityFromRotation(angle, 300, bullet.body.velocity);
                bullet.setScale(0.1).rotation = angle;
                if (scene.gameState.slowShotTimer > 0) bullet.slowsEnemies = true;
                bullet.damage = 11;
            }
        }
    };

    return player;
}

/**
 * Updates the player's position and interactions based on input and game state.
 * @param {Phaser.Scene} scene - The current game scene
 * @param {number} time - The current game time
 * @param {number} delta - Time since the last update
 */
export function updatePlayer(scene, time, delta) {
    const { cursors, gameState, player } = scene;

    if (gameState.lastMoveTime === undefined) gameState.lastMoveTime = 0;
    if (time - gameState.lastMoveTime < MOVEMENT_COOLDOWN) return;

    if (!scene.dungeonGrid) {
        console.error('dungeonGrid is undefined in updatePlayer');
        return;
    }

    const canMove = (newX, newY) => {
        const tile = scene.dungeonGrid[newY][newX];
        const isCollidable = [1, 2, 7, 13, 14].includes(tile);
        return !isCollidable && newX >= 0 && newX < GRID_WIDTH && newY >= 0 && newY < GRID_HEIGHT;
    };

    let moved = false;
    let newGridX = player.gridX;
    let newGridY = player.gridY;

    player.body.velocity.set(0);

    const currentTile = scene.dungeonGrid[player.gridY][player.gridX];
    if (currentTile === 9) { // Wind gust right
        if (canMove(player.gridX + 1, player.gridY)) {
            newGridX = player.gridX + 1;
            moved = true;
            scene.physics.velocityFromRotation(0, 50, player.body.velocity);
        }
    } else if (currentTile === 10) { // Wind gust left
        if (canMove(player.gridX - 1, player.gridY)) {
            newGridX = player.gridX - 1;
            moved = true;
            scene.physics.velocityFromRotation(Math.PI, 50, player.body.velocity);
        }
    }

    const speed = gameState.speedBoostTimer > 0 ? BOOSTED_SPEED : NORMAL_SPEED;
    if (cursors.left.isDown && canMove(player.gridX - 1, player.gridY)) {
        newGridX--;
        moved = true;
        scene.physics.velocityFromRotation(Math.PI, speed, player.body.velocity);
    } else if (cursors.right.isDown && canMove(player.gridX + 1, player.gridY)) {
        newGridX++;
        moved = true;
        scene.physics.velocityFromRotation(0, speed, player.body.velocity);
    } else if (cursors.up.isDown && canMove(player.gridX, player.gridY - 1)) {
        newGridY--;
        moved = true;
        scene.physics.velocityFromRotation(-Math.PI / 2, speed, player.body.velocity);
    } else if (cursors.down.isDown && canMove(player.gridX, player.gridY + 1)) {
        newGridY++;
        moved = true;
        scene.physics.velocityFromRotation(Math.PI / 2, speed, player.body.velocity);
    }

    if (moved) {
        const duration = scene.dungeonGrid[newGridY][newGridX] === 12 ? WATER_MOVEMENT_DURATION : NORMAL_MOVEMENT_DURATION;
        scene.tweens.add({
            targets: player,
            x: newGridX * TILE_SIZE,
            y: newGridY * TILE_SIZE,
            duration: duration,
            ease: 'Linear',
            onComplete: () => {
                player.gridX = newGridX;
                player.gridY = newGridY;
                player.x = player.gridX * TILE_SIZE;
                player.y = player.gridY * TILE_SIZE;
                handleTileInteraction(scene, player.gridX, player.gridY);
            }
        });
        gameState.lastMoveTime = time;
    }

    // Handle key pickup
    if (scene.key && scene.physics.overlap(player, scene.key)) {
        gameState.hasKey = true;
        scene.key.destroy();
        scene.key = null;
        scene.add.text(GRID_WIDTH * TILE_SIZE / 2, GRID_HEIGHT * TILE_SIZE / 2, 'KEY GET!', 
            { fontSize: '32px', fill: '#FFF' }).setOrigin(0.5).setDepth(10).destroy(1000);
    }

    // Handle shield animation and enemy collisions
    updateShieldAndCollisions(scene, delta);
}

/**
 * Handles interactions when the player lands on a tile.
 * @param {Phaser.Scene} scene - The current game scene
 * @param {number} x - The player's grid X position
 * @param {number} y - The player's grid Y position
 */
function handleTileInteraction(scene, x, y) {
    const { dungeonGrid, gameState } = scene;
    const tile = dungeonGrid[y][x];

    if (tile === 5 || tile === 8) { // Spike or fire pit
        gameState.playerHealth -= 20;
        scene.add.text(scene.player.x, scene.player.y - 20, '-20 HP!', { fontSize: '16px', fill: '#FF0000' })
            .setOrigin(0.5).setDepth(10).destroy(500);
        if (gameState.playerHealth <= 0) {
            scene.physics.world.isPaused = true;
            scene.gameOver = true;
        }
    } else if (tile === 6) { // Treasure
        gameState.score += 50;
        dungeonGrid[y][x] = 0;
        scene.dungeonTexts[y * GRID_WIDTH + x].setText('.').setFill('#666');
        scene.add.text(scene.player.x, scene.player.y - 20, '+50 Score!', { fontSize: '16px', fill: '#FFD700' })
            .setOrigin(0.5).setDepth(10).destroy(500);
    } else if (tile >= 19 && tile <= 23) { // Power-ups
        applyPowerUp(scene, tile, x, y);
    }
}

/**
 * Applies the effect of a power-up when collected.
 * @param {Phaser.Scene} scene - The current game scene
 * @param {number} tile - The power-up tile type
 * @param {number} x - The grid X position
 * @param {number} y - The grid Y position
 */
function applyPowerUp(scene, tile, x, y) {
    const { gameState, dungeonGrid } = scene;
    dungeonGrid[y][x] = 0;
    scene.dungeonTexts[y * GRID_WIDTH + x].setText('.').setFill('#666');
    const sprite = scene.powerUpSprites.find(s => s.gridX === x && s.gridY === y);
    if (sprite) {
        sprite.destroy();
        scene.powerUpSprites = scene.powerUpSprites.filter(s => s !== sprite);
    }

    switch (tile) {
        case 19: // Shield
            gameState.shieldHP = 3;
            if (!scene.shieldSprite) {
                scene.shieldSprite = scene.add.image(scene.player.x, scene.player.y, 'preroll')
                    .setScale(0.2).setDepth(1).setOrigin(0.5);
            }
            break;
        case 20: // Triple shot
            gameState.tripleShotTimer = 30000;
            break;
        case 21: // Speed boost
            gameState.speedBoostTimer = 30000;
            break;
        case 22: // Slow shot
            gameState.slowShotTimer = 30000;
            break;
        case 23: // Health boost
            gameState.playerHealth = Math.min(gameState.playerHealth + 25, 100);
            scene.add.text(scene.player.x, scene.player.y - 20, '+25 HP!', { fontSize: '16px', fill: '#00FF00' })
                .setOrigin(0.5).setDepth(10).destroy(500);
            break;
    }
}

/**
 * Updates the player's shield animation and handles enemy collisions.
 * @param {Phaser.Scene} scene - The current game scene
 * @param {number} delta - Time since the last update
 */
function updateShieldAndCollisions(scene, delta) {
    const { gameState, player } = scene;

    if (gameState.shieldHP > 0) {
        if (!scene.shieldSprite) {
            scene.shieldSprite = scene.add.image(player.x, player.y, 'preroll').setScale(0.2).setDepth(1).setOrigin(0.5);
        }
        const radius = 30;
        const angleSpeed = 0.005;
        player.shieldAngle = (player.shieldAngle || 0) + angleSpeed * delta;
        scene.shieldSprite.x = player.x + Math.cos(player.shieldAngle) * radius;
        scene.shieldSprite.y = player.y + Math.sin(player.shieldAngle) * radius;
    } else if (scene.shieldSprite) {
        scene.shieldSprite.destroy();
        scene.shieldSprite = null;
    }

    scene.enemies.children.each(enemy => {
        if (enemy && enemy.active && scene.physics.overlap(player, enemy)) {
            if (gameState.shieldHP > 0) {
                gameState.shieldHP--;
                enemy.destroy();
                if (gameState.shieldHP === 0 && scene.shieldSprite) {
                    scene.shieldSprite.destroy();
                    scene.shieldSprite = null;
                }
            } else {
                enemy.destroy();
                gameState.playerHealth -= 10;
                if (gameState.playerHealth <= 0) {
                    scene.physics.world.isPaused = true;
                    scene.gameOver = true;
                }
            }
        }
    });

    if (Phaser.Input.Keyboard.JustDown(scene.xbiteKey) && gameState.chargeLevel >= 1000) {
        scene.enemies.clear(true, true);
        scene.enemyProjectiles.clear(true, true);
        gameState.chargeLevel = 0;
        scene.add.text(GRID_WIDTH * TILE_SIZE / 2, GRID_HEIGHT * TILE_SIZE / 2, 'XBITE NUKE!', 
            { fontSize: '32px', fill: '#FFF' }).setOrigin(0.5).destroy(1500);
    }
}