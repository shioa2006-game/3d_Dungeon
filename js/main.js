// =====================
// Canvas setup
// =====================
const canvas = document.getElementById('c');
const ctx    = canvas.getContext('2d');
canvas.width  = CANVAS_W;
canvas.height = CANVAS_H;

// Wheel（canvas 参照が必要なため main.js で登録）
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  if (player.moving || player.rotating || monstersAnimating) return;
  if (e.deltaY < 0) startMove(player.facing);
  else              startMove((player.facing + 2) % 4);
}, { passive: false });

// =====================
// World state
// =====================
let grid  = generateMaze(GRID_SIZE);
addLoops(grid, LOOP_COUNT, GRID_SIZE);
let walls = gridToWalls(grid);

// =====================
// 新規迷路生成 / リスタート（R キー・リスタートボタンで呼び出し）
// =====================
function newMaze() {
  // 全モーダルを閉じる
  gameEnded           = false;
  battleState         = null;
  battleNeedsRerender = false;
  shopItems           = null;
  onCrystal           = null;
  worldTurn           = 0;
  messageLog.length   = 0;
  document.getElementById('battle-panel').hidden = true;
  document.getElementById('shop-modal').hidden   = true;
  document.getElementById('result-screen').hidden = true;

  grid  = generateMaze(GRID_SIZE);
  addLoops(grid, LOOP_COUNT, GRID_SIZE);
  walls = gridToWalls(grid);

  player.gridR  = 1; player.gridC  = 1; player.facing = 1;
  player.pos    = new Vec2(1.5 * CELL_SIZE, 1.5 * CELL_SIZE);
  player.angle  = FACING_ANGLES[1];
  player.moving = false; player.rotating = false;

  initExplored();
  initCrystals();      // spawnMonsters が crystals を参照するため先に実行
  spawnMonsters();
  humanAutoSpawnIndex = 0;
  initPlayerStats();
  spawnPlayerAtHome();
  updateOnCrystal();
}

// =====================
// 初期化
// =====================
initExplored();
initCrystals();
spawnMonsters();
initPlayerStats();

// =====================
// Game loop
// =====================
function gameLoop() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  fillRect(0, 0, CANVAS_W, CANVAS_H, 10, 10, 10);

  handleInput();
  updatePlayer();
  animateMonsters();

  // Q3b: アニメーション完了後にバトル画面を再描画
  if (battleNeedsRerender && !monstersAnimating) {
    battleNeedsRerender = false;
    if (battleState) renderBattle();
  }

  if (!battleState) {
    const hits = castRays();
    drawView3D(hits);
    drawCompass();
    drawSprites();
  }
  drawMinimap();
  drawUIRight();
  drawUIBottom();
  drawFullMap();

  keysJustPressed.clear();
  requestAnimationFrame(gameLoop);
}

gameLoop();
