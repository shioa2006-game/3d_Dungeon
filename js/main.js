// =====================
// Canvas setup
// =====================
const canvas = document.getElementById('c');
const ctx    = canvas.getContext('2d');
canvas.width  = CANVAS_W;
canvas.height = CANVAS_H;

// Wheel（canvas 参照が必要なため main.js で登録）
canvas.addEventListener('wheel', e => {
  if (Game.flags.titleShown) return;  // タイトル中は無効
  e.preventDefault();
  const player = Game.state.player;
  if (player.moving || Game.flags.monstersAnimating) return;
  if (e.deltaY < 0) startMove(player.facing);
  else              startMove((player.facing + 2) % 4);
}, { passive: false });

// =====================
// 静的UI要素のクリックハンドラ
// =====================
document.getElementById('btn-shop-close')   .addEventListener('click', () => closeShop());
document.getElementById('btn-result-restart').addEventListener('click', () => {
  document.getElementById('result-screen').hidden = true;
  Title.show();
});
document.getElementById('btn-restart-yes')  .addEventListener('click', () => confirmRestart());
document.getElementById('btn-restart-no')   .addEventListener('click', () => cancelRestartConfirm());

// =====================
// リセット確認ダイアログ
// =====================
function showRestartConfirm() {
  Game.flags.restartConfirmOpen = true;
  document.getElementById('restart-confirm').hidden = false;
}

function cancelRestartConfirm() {
  Game.flags.restartConfirmOpen = false;
  document.getElementById('restart-confirm').hidden = true;
}

function confirmRestart() {
  cancelRestartConfirm();
  newMaze();
}

// =====================
// World 初期化
// =====================
function _setWalls(walls) {
  Game.state.walls  = walls;
  // 水平/垂直に分割しておくと castRays が方向半カットを使える
  Game.state.wallsH = walls.filter(w => w.a.y === w.b.y);
  Game.state.wallsV = walls.filter(w => w.a.x === w.b.x);
}

Game.state.grid = generateMaze(GRID_SIZE);
addLoops(Game.state.grid, LOOP_COUNT, GRID_SIZE);
_setWalls(gridToWalls(Game.state.grid));

// ブロック全 25 個に通路セルが存在することを保証する再生成ヘルパー
function generateMazeUntilValid() {
  while (true) {
    Game.state.grid = generateMaze(GRID_SIZE);
    addLoops(Game.state.grid, LOOP_COUNT, GRID_SIZE);
    _setWalls(gridToWalls(Game.state.grid));
    if (initCrystals()) break;   // 全ブロックに通路あり → 成功
  }
}

// =====================
// 新規迷路生成 / リスタート（R キー・リスタートボタンで呼び出し）
// =====================
function newMaze() {
  // 全モーダルを閉じる
  Game.flags.gameEnded           = false;
  Game.state.battleState         = null;
  Game.flags.battleNeedsRerender = false;
  Game.state.shopItems           = null;
  Game.state.onCrystal           = null;
  Game.state.worldTurn           = 0;
  Game.state.messageLog.length   = 0;
  Game.flags.fullMapOpen         = false;
  Game.flags.restartConfirmOpen  = false;
  Game.state.respawnCountdown    = 0;
  document.getElementById('battle-panel').hidden    = true;
  document.getElementById('shop-modal').hidden      = true;
  document.getElementById('result-screen').hidden   = true;
  document.getElementById('restart-confirm').hidden = true;
  _updateRespawnUI();

  generateMazeUntilValid();   // grid/walls/crystals を一括確定（initCrystals 内包）

  const player = Game.state.player;
  player.gridR  = 1; player.gridC  = 1; player.facing = 1;
  player.pos    = new Vec2(1.5 * CELL_SIZE, 1.5 * CELL_SIZE);
  player.angle  = FACING_ANGLES[1];
  player.moving      = false;
  player.visualAngle = FACING_ANGLES[1];  // テレポート時にスナップ

  initExplored();
  spawnMonsters();
  initPlayerStats();
  spawnPlayerAtHome();
  updateOnCrystal();

  GameLog.start();
}

// =====================
// 初期化
// =====================
// 起動時はタイトル画面を表示。ゲーム開始は Title 経由で newMaze() が呼ばれる。
// 初期マップはタイトル背景の裏で空回しするため、最低限の状態だけ整えておく。
initExplored();
generateMazeUntilValid();   // grid/walls/crystals を一括確定
spawnMonsters();
initPlayerStats();
Title.init();

// =====================
// 復活待機オーバーレイ UI
// =====================
function _updateRespawnUI() {
  const overlay = document.getElementById('respawn-overlay');
  if (!overlay) return;
  if (Game.state.respawnCountdown > 0) {
    overlay.hidden = false;
    document.getElementById('respawn-counter').textContent =
      String(Game.state.respawnCountdown);
  } else {
    overlay.hidden = true;
  }
}

// =====================
// 復活待機の進行（1秒1ターン）
// 死亡中は ワールドターンを進めながら GAMEOVER 判定し、最後に本拠地復活
// =====================
function _advanceRespawnIfDue() {
  if (Game.state.respawnCountdown <= 0 || Game.flags.gameEnded) return;
  const now = performance.now();
  if (now < Game.state.respawnNextTickAt) return;

  // 1ターン進行（アニメーションは省略：UI で「N → N-1」だけ見せたい）
  // プレイヤーは戦線に存在しない扱いにするため、グリッド外の値を渡して
  // 死亡セルを「予約済み」にしない（モンスターがそこを通過・占領できる）
  triggerMonsterTurn(-1, -1, true);
  Game.state.respawnCountdown--;
  _updateRespawnUI();

  // 詰みなら即打ち切り
  if (checkWinLoss()) {
    Game.state.respawnCountdown = 0;
    _updateRespawnUI();
    return;
  }

  if (Game.state.respawnCountdown === 0) {
    // 復活：HPを再計算し、本拠地優先で配置
    Game.state.player.hp = playerStats().hp;
    spawnPlayerAtHome();
    logMessage('✨ 拠点で復活', 'system');
  } else {
    Game.state.respawnNextTickAt = now + 1000;
  }
}

// =====================
// Game loop
// =====================
function gameLoop() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  fillRect(0, 0, CANVAS_W, CANVAS_H, 10, 10, 10);

  _advanceRespawnIfDue();

  handleInput();
  updatePlayer();
  animateMonsters();

  // NPCアグロバンプ：プレイヤーとモンスター両方のアニメーションが完了したタイミングで発火
  if (Game.flags.pendingBumpCheck && !Game.state.player.moving &&
      !Game.flags.monstersAnimating && !Game.state.battleState && !Game.flags.gameEnded) {
    Game.flags.pendingBumpCheck = false;
    checkMonsterBumpPlayer();
  }

  // Q3b: アニメーション完了後にバトル画面を再描画
  if (Game.flags.battleNeedsRerender && !Game.flags.monstersAnimating) {
    Game.flags.battleNeedsRerender = false;
    if (Game.state.battleState) renderBattle();
  }

  if (!Game.state.battleState) {
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
