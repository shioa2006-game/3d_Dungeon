// Ray Casting 3D Dungeon
// Vanilla JS + Canvas API
// グリッド移動（補間アニメーション付き）+ 霧of戦争 + コンパス

// =====================
// Layout regions
// =====================
const CANVAS_W = 1000;
const CANVAS_H = 700;
const VIEW3D    = { x: 0,   y: 0,   w: 740, h: 500 };
const MINIMAP   = { x: 740, y: 0,   w: 260, h: 260 };
const UI_RIGHT  = { x: 740, y: 260, w: 260, h: 240 };
const UI_BOTTOM = { x: 0,   y: 500, w: 1000, h: 200 };

// =====================
// Maze params（スライダーで変わる）
// =====================
let GRID_SIZE  = 13;
let LOOP_COUNT = 10;

// =====================
// 固定設定
// =====================
const CELL_SIZE         = 40;
const RAY_COUNT         = 300;
const WALL_HEIGHT_CONST = 18000;
const MIN_DIST          = 0.0001;

// グリッド移動アニメーション
const MOVE_FRAMES = 8;   // 1マス移動にかけるフレーム数
const ROT_FRAMES  = 6;   // 90度回転にかけるフレーム数

// 向き定義: 0=N 1=E 2=S 3=W
const FACING_DIRS = [
  { dr: -1, dc:  0 },
  { dr:  0, dc:  1 },
  { dr:  1, dc:  0 },
  { dr:  0, dc: -1 },
];
const FACING_ANGLES = [-Math.PI / 2, 0, Math.PI / 2, Math.PI]; // N,E,S,W の angle
const FACING_NAMES  = ['N', 'E', 'S', 'W'];

// Monster AI
const DETECT_RANGE      = 5;    // 発見セル距離
const LOSE_RANGE        = 7;    // 見失いセル距離
const LOSE_TIMER_TURNS  = 8;    // 視線遮断後に諦めるターン数（移動ターンごとにカウント）
const ALERT_DURATION    = 90;   // !エフェクト表示フレーム数（視覚エフェクトなのでフレーム基準）

// Retro
const RETRO_STEP     = 5;
const TEXTURE_PERIOD = 40;
const TEXTURE_PILLAR = 8;

const MINIMAP_VIEW_CELLS = 7;

// =====================
// Assets
// =====================
const goblinImg     = new Image();
goblinImg.src     = 'assets/DaggerGoblin.png';
const goblinBackImg = new Image();
goblinBackImg.src = 'assets/DaggerGoblin_back.png';

// =====================
// Math helpers
// =====================
class Vec2 {
  constructor(x, y) { this.x = x; this.y = y; }
  add(v) { return new Vec2(this.x + v.x, this.y + v.y); }
  sub(v) { return new Vec2(this.x - v.x, this.y - v.y); }
  mul(s) { return new Vec2(this.x * s, this.y * s); }
  len() { return Math.hypot(this.x, this.y); }
}

class Segment {
  constructor(a, b, col = [150, 160, 150]) {
    this.a = a; this.b = b; this.col = col;
  }
}

function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

function normalizeAngle(a) {
  while (a >  Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

function intersectRaySegment(rayOrigin, rayDir, segA, segB) {
  const r   = rayDir;
  const s   = segB.sub(segA);
  const rxs = r.x * s.y - r.y * s.x;
  const q_p = segA.sub(rayOrigin);
  if (Math.abs(rxs) < 1e-9) return { hit: false };
  const t = (q_p.x * s.y - q_p.y * s.x) / rxs;
  const u = (q_p.x * r.y - q_p.y * r.x) / rxs;
  if (t >= 0 && u >= 0 && u <= 1) {
    return { hit: true, point: rayOrigin.add(r.mul(t)), t, u };
  }
  return { hit: false };
}

function wallTextureU(segA, segB, u01) {
  return u01 * segB.sub(segA).len();
}

// イージング（滑らかな補間）
function smoothstep(t) { return t * t * (3 - 2 * t); }

// =====================
// 穴掘り法（DFS Recursive Backtracker）
// =====================
function generateMaze(size) {
  const g = Array.from({ length: size }, () => Array(size).fill(1));

  function carve(r, c) {
    g[r][c] = 0;
    const dirs = [
      { dr: -2, dc:  0 }, { dr:  2, dc:  0 },
      { dr:  0, dc: -2 }, { dr:  0, dc:  2 },
    ];
    for (let i = dirs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
    }
    for (const { dr, dc } of dirs) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 1 && nr < size - 1 && nc >= 1 && nc < size - 1 && g[nr][nc] === 1) {
        g[r + dr / 2][c + dc / 2] = 0;
        carve(nr, nc);
      }
    }
  }
  carve(1, 1);
  return g;
}

function addLoops(g, count, size) {
  const candidates = [];
  for (let r = 1; r < size - 1; r++) {
    for (let c = 1; c < size - 1; c++) {
      if (g[r][c] !== 1) continue;
      if (r % 2 === 0 && c % 2 === 1 && g[r - 1][c] === 0 && g[r + 1][c] === 0)
        candidates.push({ r, c });
      if (r % 2 === 1 && c % 2 === 0 && g[r][c - 1] === 0 && g[r][c + 1] === 0)
        candidates.push({ r, c });
    }
  }
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  for (let i = 0; i < Math.min(count, candidates.length); i++)
    g[candidates[i].r][candidates[i].c] = 0;
}

// =====================
// Grid → Wall segments
// =====================
function gridToWalls(g) {
  const walls = [];
  const S   = CELL_SIZE;
  const GS  = GRID_SIZE;
  const colH = [120, 150, 140];
  const colV = [90,  120, 110];

  walls.push(new Segment(new Vec2(0, 0),      new Vec2(GS * S, 0),      colH));
  walls.push(new Segment(new Vec2(0, GS * S), new Vec2(GS * S, GS * S), colH));
  walls.push(new Segment(new Vec2(0, 0),      new Vec2(0, GS * S),      colV));
  walls.push(new Segment(new Vec2(GS * S, 0), new Vec2(GS * S, GS * S), colV));

  for (let r = 0; r < GS - 1; r++) {
    let startC = -1;
    for (let c = 0; c <= GS; c++) {
      const hasEdge = c < GS && (g[r][c] !== g[r + 1][c]);
      if (hasEdge && startC === -1) { startC = c; }
      else if (!hasEdge && startC !== -1) {
        walls.push(new Segment(new Vec2(startC * S, (r + 1) * S), new Vec2(c * S, (r + 1) * S), colH));
        startC = -1;
      }
    }
  }
  for (let c = 0; c < GS - 1; c++) {
    let startR = -1;
    for (let r = 0; r <= GS; r++) {
      const hasEdge = r < GS && (g[r][c] !== g[r][c + 1]);
      if (hasEdge && startR === -1) { startR = r; }
      else if (!hasEdge && startR !== -1) {
        walls.push(new Segment(new Vec2((c + 1) * S, startR * S), new Vec2((c + 1) * S, r * S), colV));
        startR = -1;
      }
    }
  }
  return walls;
}

// =====================
// Monster AI ユーティリティ
// =====================
// ゴブリンの向き（facing）に対してプレイヤーが「前半球（180度視野）」にいるか
// facing ベクトルとゴブリン→プレイヤーベクトルのドット積が正 → 前半球
function isPlayerInFrontHemisphere(m) {
  const fd  = FACING_DIRS[m.facing];
  // FACING_DIRS は { dr, dc }：world座標では x=dc, y=dr
  const fvx = fd.dc;
  const fvy = fd.dr;
  const tpx = player.pos.x - m.pos.x;
  const tpy = player.pos.y - m.pos.y;
  return (fvx * tpx + fvy * tpy) > 0;
}

function hasLineOfSight(fromPos, toPos) {
  const dx = toPos.x - fromPos.x, dy = toPos.y - fromPos.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.001) return true;
  const dir = new Vec2(dx / dist, dy / dist);
  for (const w of walls) {
    const res = intersectRaySegment(fromPos, dir, w.a, w.b);
    if (res.hit && res.t < dist - 1) return false;
  }
  return true;
}

function bfsPath(g, startR, startC, goalR, goalC) {
  if (startR === goalR && startC === goalC) return [];
  const queue   = [{ r: startR, c: startC, path: [] }];
  const visited = new Set([`${startR},${startC}`]);
  while (queue.length > 0) {
    const { r, c, path } = queue.shift();
    for (const d of FACING_DIRS) {
      const nr = r + d.dr, nc = c + d.dc;
      if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
      if (g[nr][nc] !== 0) continue;
      const key = `${nr},${nc}`;
      if (visited.has(key)) continue;
      visited.add(key);
      const newPath = [...path, { r: nr, c: nc }];
      if (nr === goalR && nc === goalC) return newPath;
      queue.push({ r: nr, c: nc, path: newPath });
    }
  }
  return [];
}

function facingFromMove(fromR, fromC, toR, toC) {
  const dr = toR - fromR, dc = toC - fromC;
  if (dr === -1) return 0;
  if (dc ===  1) return 1;
  if (dr ===  1) return 2;
  return 3;
}

// ターン制：reserved = 「このターンに既に予約済みのセル」の Set を受け取る
// 移動先セルを返す（移動不可なら null）
function pickWanderTargetTurn(m, reserved) {
  const tryOrder = [
    (m.facing - 1 + 4) % 4, m.facing,
    (m.facing + 1) % 4, (m.facing + 2) % 4,
  ];
  for (const dir of tryOrder) {
    const d  = FACING_DIRS[dir];
    const nr = m.gridR + d.dr, nc = m.gridC + d.dc;
    if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
    if (grid[nr][nc] !== 0) continue;
    if (reserved.has(`${nr},${nc}`)) continue;
    return { r: nr, c: nc };
  }
  return null;
}

function pickChaseTargetTurn(m, reserved, pGR, pGC) {
  if (m.path.length === 0)
    m.path = bfsPath(grid, m.gridR, m.gridC, pGR, pGC);
  if (m.path.length === 0) return null;
  const next = m.path[0];
  if (reserved.has(`${next.r},${next.c}`)) return null; // 今ターンは待機
  m.path.shift();
  return { r: next.r, c: next.c };
}

// =====================
// Monsters
// =====================
let monsters = [];

function spawnMonsters() {
  monsters = [];
  const passages = [];
  for (let r = 1; r < GRID_SIZE - 1; r++)
    for (let c = 1; c < GRID_SIZE - 1; c++)
      if (grid[r][c] === 0 && !(r <= 3 && c <= 3))
        passages.push({ r, c });
  for (let i = passages.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [passages[i], passages[j]] = [passages[j], passages[i]];
  }
  const count = Math.max(2, Math.min(8, Math.floor(GRID_SIZE / 3)));
  for (let i = 0; i < Math.min(count, passages.length); i++) {
    const { r, c } = passages[i];
    const startPos = new Vec2((c + 0.5) * CELL_SIZE, (r + 0.5) * CELL_SIZE);
    monsters.push({
      pos:          startPos,
      gridR: r, gridC: c,
      targetR: -1, targetC: -1,
      // ターン制アニメーション
      moving:       false,
      moveFrom:     new Vec2(startPos.x, startPos.y),
      moveTo:       new Vec2(startPos.x, startPos.y),
      moveProgress: 0,
      // AI状態
      state: 'WANDER', facing: 2, path: [], lostTimer: 0, alertTimer: 0,
    });
  }
}

// ─────────────────────────────────────────────────────────────
// ターン制モンスター AI
// ─────────────────────────────────────────────────────────────

// モンスターが現在アニメーション中かどうか
let monstersAnimating = false;

// 1体分の状態遷移（ターンごとに1回呼ぶ）
function updateMonsterAIState(m, pGR, pGC) {
  const dCells = Math.hypot(m.gridR - pGR, m.gridC - pGC);

  // WANDER中は「前半球かつ視線が通る」場合のみ発見
  // CHASE中は振り向いて追跡中なので視線のみで判定
  const inFront  = isPlayerInFrontHemisphere(m);
  const los      = hasLineOfSight(m.pos, player.pos);
  const canSee   = dCells <= DETECT_RANGE && los && (m.state === 'CHASE' || inFront);

  if (m.state === 'WANDER') {
    if (canSee) {
      m.state      = 'CHASE';
      m.lostTimer  = 0;
      m.alertTimer = ALERT_DURATION;
      m.path       = [];
    }
  } else {
    if (canSee) { m.lostTimer = 0; }
    else        { m.lostTimer++; }
    if (dCells > LOSE_RANGE || m.lostTimer >= LOSE_TIMER_TURNS) {
      m.state = 'WANDER';
      m.path  = [];
    }
  }
}

// プレイヤーが移動を開始した瞬間に呼ぶ
//   pDestR/C: プレイヤーが向かうグリッドセル（予約済み扱い）
function triggerMonsterTurn(pDestR, pDestC) {
  const pGR = player.gridR;
  const pGC = player.gridC;

  // プレイヤーの移動先は他モンスターに取らせない
  const reserved = new Set([`${pDestR},${pDestC}`]);

  // Step1: 全モンスターの状態遷移
  for (const m of monsters) {
    updateMonsterAIState(m, pGR, pGC);
    m.targetR = -1;
    m.targetC = -1;
  }

  // Step2: 順番に移動先を決定（先着優先で reserved を埋めていく）
  for (const m of monsters) {
    let target = null;
    if (m.state === 'WANDER') {
      target = pickWanderTargetTurn(m, reserved);
    } else {
      target = pickChaseTargetTurn(m, reserved, pGR, pGC);
    }
    if (target) {
      m.targetR = target.r;
      m.targetC = target.c;
      reserved.add(`${target.r},${target.c}`);
    }
    // 動けないモンスターの現在地も予約（他が入ってこないように）
    if (m.targetR < 0) reserved.add(`${m.gridR},${m.gridC}`);
  }

  // Step3: アニメーション開始
  let anyMoving = false;
  for (const m of monsters) {
    if (m.targetR < 0) continue;
    m.moveFrom     = new Vec2(m.pos.x, m.pos.y);
    m.moveTo       = new Vec2((m.targetC + 0.5) * CELL_SIZE, (m.targetR + 0.5) * CELL_SIZE);
    m.moveProgress = 0;
    m.moving       = true;
    anyMoving      = true;
  }
  monstersAnimating = anyMoving;
}

// 毎フレーム呼ぶ：アニメーション進行 + alertTimer のカウントダウン
function animateMonsters() {
  // alertTimer はフレーム基準の視覚エフェクト → 毎フレーム減算
  for (const m of monsters) {
    if (m.alertTimer > 0) m.alertTimer--;
  }

  if (!monstersAnimating) return;

  let anyStillMoving = false;
  for (const m of monsters) {
    if (!m.moving) continue;

    m.moveProgress += 1 / MOVE_FRAMES;
    if (m.moveProgress >= 1) {
      m.facing = facingFromMove(m.gridR, m.gridC, m.targetR, m.targetC);
      m.pos.x  = m.moveTo.x;
      m.pos.y  = m.moveTo.y;
      m.gridR  = m.targetR;
      m.gridC  = m.targetC;
      m.targetR = -1;
      m.targetC = -1;
      m.moving  = false;
    } else {
      const t = smoothstep(m.moveProgress);
      m.pos.x = m.moveFrom.x + (m.moveTo.x - m.moveFrom.x) * t;
      m.pos.y = m.moveFrom.y + (m.moveTo.y - m.moveFrom.y) * t;
      anyStillMoving = true;
    }
  }
  monstersAnimating = anyStillMoving;
}

// グリッドレベルの接触判定（プレイヤー到着後に呼ぶ）
function checkMonsterContact() {
  for (const m of monsters) {
    if (m.gridR === player.gridR && m.gridC === player.gridC) {
      // TODO: バトル画面へ
    }
  }
}

// =====================
// Canvas setup
// =====================
const canvas = document.getElementById('c');
const ctx    = canvas.getContext('2d');
canvas.width  = CANVAS_W;
canvas.height = CANVAS_H;

let grid  = generateMaze(GRID_SIZE);
addLoops(grid, LOOP_COUNT, GRID_SIZE);
let walls = gridToWalls(grid);

// =====================
// Player（グリッド移動）
// =====================
const player = {
  // レンダリング用（補間で動く）
  pos:   new Vec2(1.5 * CELL_SIZE, 1.5 * CELL_SIZE),
  angle: FACING_ANGLES[1], // East
  fov:   60 * Math.PI / 180,

  // グリッド論理座標
  gridR:  1,
  gridC:  1,
  facing: 1, // 0=N 1=E 2=S 3=W

  // 移動アニメーション
  moving:       false,
  moveFrom:     new Vec2(0, 0),
  moveTo:       new Vec2(0, 0),
  moveProgress: 0,
  nextGridR:    1,
  nextGridC:    1,

  // 回転アニメーション
  rotating:       false,
  angleFrom:      0,
  angleTo:        0,
  rotProgress:    0,
  pendingFacing:  1,
};

// =====================
// 霧of戦争（探索済みセル）
// =====================
let explored = [];

function initExplored() {
  explored = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(false));
  markExplored();
}

function markExplored() {
  const r = player.gridR, c = player.gridC;
  explored[r][c] = true;
  // 4方向に視線を伸ばして壁まで開示
  for (const d of FACING_DIRS) {
    for (let step = 1; step <= 6; step++) {
      const nr = r + d.dr * step;
      const nc = c + d.dc * step;
      if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) break;
      explored[nr][nc] = true;
      if (grid[nr][nc] === 1) break; // 壁自体は表示、その先は非表示
    }
  }
}

initExplored();
spawnMonsters();

// =====================
// 新規迷路生成
// =====================
function newMaze() {
  GRID_SIZE  = parseInt(document.getElementById('slider-grid').value);
  LOOP_COUNT = parseInt(document.getElementById('slider-loops').value);

  grid  = generateMaze(GRID_SIZE);
  addLoops(grid, LOOP_COUNT, GRID_SIZE);
  walls = gridToWalls(grid);

  // プレイヤーリセット
  player.gridR = 1; player.gridC = 1; player.facing = 1;
  player.pos   = new Vec2(1.5 * CELL_SIZE, 1.5 * CELL_SIZE);
  player.angle = FACING_ANGLES[1];
  player.moving = false; player.rotating = false;

  initExplored();
  spawnMonsters();
}

// =====================
// Input
// =====================
const keys           = {};   // 押し続けている間ずっと true（移動に使用）
const keysJustPressed = new Set(); // そのフレームで初めて押された瞬間のみ（回転に使用）

window.addEventListener('keydown', e => {
  if (!keys[e.code]) keysJustPressed.add(e.code); // 新規押下のみ登録
  keys[e.code] = true;
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))
    e.preventDefault();
  if (e.code === 'KeyR') newMaze();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

// マウスホイール：前後移動
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  if (player.moving || player.rotating || monstersAnimating) return;
  if (e.deltaY < 0) startMove(player.facing);
  else              startMove((player.facing + 2) % 4);
}, { passive: false });

// スライダー
const sliderGrid  = document.getElementById('slider-grid');
const sliderLoops = document.getElementById('slider-loops');
function updateLabels() {
  const gs = sliderGrid.value;
  document.getElementById('label-grid').textContent  = gs;
  document.getElementById('label-grid2').textContent = gs;
  document.getElementById('label-loops').textContent = sliderLoops.value;
}
sliderGrid.addEventListener('input', updateLabels);
sliderLoops.addEventListener('input', updateLabels);
document.getElementById('btn-generate').addEventListener('click', newMaze);

// =====================
// グリッド移動
// =====================
function startMove(dir) {
  const d  = FACING_DIRS[dir];
  const nr = player.gridR + d.dr;
  const nc = player.gridC + d.dc;
  if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) return;
  if (grid[nr][nc] !== 0) return; // 壁

  player.moving       = true;
  player.moveFrom     = new Vec2(player.pos.x, player.pos.y);
  player.moveTo       = new Vec2((nc + 0.5) * CELL_SIZE, (nr + 0.5) * CELL_SIZE);
  player.moveProgress = 0;
  player.nextGridR    = nr;
  player.nextGridC    = nc;

  // ターン制：プレイヤー移動と同時にモンスターも動き出す
  triggerMonsterTurn(nr, nc);
}

function startRotate(dir) { // -1=左, +1=右
  player.rotating      = true;
  player.angleFrom     = player.angle;
  player.angleTo       = player.angle + dir * Math.PI / 2;
  player.rotProgress   = 0;
  player.pendingFacing = (player.facing + dir + 4) % 4;
}

function handleInput() {
  if (player.moving || player.rotating || monstersAnimating) return;

  // 回転: keysJustPressed（押した瞬間のみ）→ 2回転の誤爆を防ぐ
  if (keysJustPressed.has('ArrowLeft')  || keysJustPressed.has('KeyA')) { startRotate(-1); return; }
  if (keysJustPressed.has('ArrowRight') || keysJustPressed.has('KeyD')) { startRotate( 1); return; }

  // 移動
  if (keys['KeyW'] || keys['ArrowUp'])   { startMove(player.facing); return; }
  if (keys['KeyS'] || keys['ArrowDown']) { startMove((player.facing + 2) % 4); return; }
  if (keys['KeyQ']) { startMove((player.facing + 3) % 4); return; } // 左ストレイフ
  if (keys['KeyE']) { startMove((player.facing + 1) % 4); return; } // 右ストレイフ
}

// =====================
// アニメーション更新
// =====================
function updatePlayer() {
  // 移動補間
  if (player.moving) {
    player.moveProgress += 1 / MOVE_FRAMES;
    if (player.moveProgress >= 1) {
      player.moveProgress = 1;
      player.moving   = false;
      player.gridR    = player.nextGridR;
      player.gridC    = player.nextGridC;
      player.pos.x    = player.moveTo.x;
      player.pos.y    = player.moveTo.y;
      markExplored();       // 到着時に周囲を開示
      checkMonsterContact(); // プレイヤーがモンスターのいるセルに踏み込んだか確認
    } else {
      const t = smoothstep(player.moveProgress);
      player.pos.x = player.moveFrom.x + (player.moveTo.x - player.moveFrom.x) * t;
      player.pos.y = player.moveFrom.y + (player.moveTo.y - player.moveFrom.y) * t;
    }
  }

  // 回転補間
  if (player.rotating) {
    player.rotProgress += 1 / ROT_FRAMES;
    if (player.rotProgress >= 1) {
      player.rotating = false;
      player.facing   = player.pendingFacing;
      player.angle    = FACING_ANGLES[player.facing]; // 正規角度にスナップ
    } else {
      const t = smoothstep(player.rotProgress);
      player.angle = player.angleFrom + (player.angleTo - player.angleFrom) * t;
    }
  }
}

// =====================
// Drawing helpers
// =====================
function fillRect(x, y, w, h, r, g, b, a) {
  ctx.fillStyle = a !== undefined ? `rgba(${r},${g},${b},${a})` : `rgb(${r},${g},${b})`;
  ctx.fillRect(x, y, w, h);
}
function strokeRect(x, y, w, h, r, g, b, lw) {
  ctx.strokeStyle = `rgb(${r},${g},${b})`;
  ctx.lineWidth = lw || 1;
  ctx.strokeRect(x, y, w, h);
}
function drawLine(x1, y1, x2, y2, r, g, b, a, width) {
  ctx.strokeStyle = a !== undefined ? `rgba(${r},${g},${b},${a})` : `rgb(${r},${g},${b})`;
  ctx.lineWidth = width || 1;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}
function drawText(text, x, y, color, size, align, baseline) {
  ctx.fillStyle    = color    || '#aaa';
  ctx.font         = `${size || 14}px monospace`;
  ctx.textAlign    = align    || 'left';
  ctx.textBaseline = baseline || 'top';
  ctx.fillText(text, x, y);
}

// =====================
// Ray Casting
// =====================
const depthBuffer = new Array(RAY_COUNT).fill(Infinity);

function castRays() {
  const hits  = [];
  const start = player.angle - player.fov / 2;
  const end   = player.angle + player.fov / 2;
  for (let i = 0; i < RAY_COUNT; i++) {
    const t        = i / (RAY_COUNT - 1);
    const rayAngle = start + (end - start) * t;
    const rayDir   = new Vec2(Math.cos(rayAngle), Math.sin(rayAngle));
    let best = null;
    for (const w of walls) {
      const res = intersectRaySegment(player.pos, rayDir, w.a, w.b);
      if (!res.hit) continue;
      if (best === null || res.t < best.dist)
        best = { hit: true, dist: res.t, point: res.point, wall: w, rayAngle, wallU01: res.u };
    }
    hits.push(best ?? {
      hit: false, dist: Infinity,
      point: player.pos.add(rayDir.mul(500)), wall: null, rayAngle, wallU01: 0,
    });
  }
  return hits;
}

// =====================
// 3D View
// =====================
function drawView3D(hits) {
  const R = VIEW3D;
  ctx.save();
  ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); ctx.clip();

  fillRect(R.x, R.y,           R.w, R.h / 2, 15, 18, 25);
  fillRect(R.x, R.y + R.h / 2, R.w, R.h / 2, 20, 15, 10);

  const colW = R.w / RAY_COUNT;
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    depthBuffer[i] = Infinity;
    if (!h.hit) continue;

    const x0       = R.x + i * colW;
    const corrDist = Math.max(MIN_DIST, h.dist * Math.cos(h.rayAngle - player.angle));
    depthBuffer[i] = corrDist;

    let wallH = WALL_HEIGHT_CONST / corrDist;
    wallH = wallH - (wallH % RETRO_STEP);
    wallH = clamp(wallH, 0, R.h * 2);

    const y0    = R.y + R.h / 2 - wallH / 2;
    const base  = h.wall.col;
    const shade = clamp(1.0 - corrDist / 500.0, 0.1, 1.0);
    const texU  = wallTextureU(h.wall.a, h.wall.b, h.wallU01);
    const pillar = (texU % TEXTURE_PERIOD) < TEXTURE_PILLAR;
    let cr = base[0] * shade, cg = base[1] * shade, cb = base[2] * shade;
    if (pillar) { cr *= 0.5; cg *= 0.5; cb *= 0.5; }
    fillRect(x0, y0, colW + 0.5, wallH, cr | 0, cg | 0, cb | 0);
  }

  ctx.restore();
  strokeRect(R.x, R.y, R.w, R.h, 60, 60, 60, 2);
}

// =====================
// コンパス表示（3Dビュー上部中央）
// =====================
function drawCompass() {
  const R = VIEW3D;

  // 回転中は補間された角度から方向を割り出す
  // 回転完了後は player.facing を使う
  let displayFacing = player.facing;
  if (player.rotating) displayFacing = player.pendingFacing;

  const cx  = R.x + R.w / 2;
  const cy  = R.y + 30;
  const bw  = 200;
  const bh  = 38;

  // 背景
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.roundRect(cx - bw / 2, cy - bh / 2, bw, bh, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(100,140,120,0.4)';
  ctx.lineWidth   = 1;
  ctx.stroke();

  // 左・右の隣接方角
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#445544';
  ctx.font      = '16px monospace';
  ctx.fillText(FACING_NAMES[(displayFacing - 1 + 4) % 4], cx - 62, cy);
  ctx.fillText(FACING_NAMES[(displayFacing + 1)     % 4], cx + 62, cy);

  // 区切り線
  ctx.fillStyle = '#334433';
  ctx.font      = '14px monospace';
  ctx.fillText('─', cx - 32, cy);
  ctx.fillText('─', cx + 32, cy);

  // 現在向き（ハイライト）
  ctx.fillStyle = '#7ecfb0';
  ctx.font      = 'bold 22px monospace';
  ctx.fillText(FACING_NAMES[displayFacing], cx, cy);

  // 移動中インジケーター
  if (player.moving) {
    ctx.fillStyle = 'rgba(126,207,176,0.4)';
    ctx.font      = '13px monospace';
    ctx.fillText('▶ moving', cx + 80, cy);
  }
}

// =====================
// Sprites（モンスター + ! エフェクト）
// =====================
function drawSprites() {
  if (!goblinImg.complete     || goblinImg.naturalWidth     === 0) return;
  if (!goblinBackImg.complete || goblinBackImg.naturalWidth === 0) return;
  const R    = VIEW3D;
  const colW = R.w / RAY_COUNT;

  const sorted = monsters.map(m => {
    const dx = m.pos.x - player.pos.x, dy = m.pos.y - player.pos.y;
    return { m, dist: Math.hypot(dx, dy), dx, dy };
  }).sort((a, b) => b.dist - a.dist);

  ctx.save();
  ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); ctx.clip();

  for (const { m, dist, dx, dy } of sorted) {
    if (dist < 1) continue;
    let relAngle = normalizeAngle(Math.atan2(dy, dx) - player.angle);
    if (Math.abs(relAngle) > player.fov / 2 + 0.4) continue;

    const corrDist = Math.max(MIN_DIST, dist * Math.cos(relAngle));
    const spriteH  = clamp(WALL_HEIGHT_CONST / corrDist, 0, R.h * 2);

    // ── 画像選択 ────────────────────────────────────────────
    // CHASE中（追跡モード）: 振り向いているので常に前向き画像
    // WANDER中: プレイヤーが前半球にいれば前向き、後半球なら後ろ向き
    const showFront = m.state === 'CHASE' || isPlayerInFrontHemisphere(m);
    const img       = showFront ? goblinImg : goblinBackImg;
    // ────────────────────────────────────────────────────────

    const aspect   = img.naturalWidth / img.naturalHeight;
    const spriteW  = spriteH * aspect;
    const colF         = (relAngle + player.fov / 2) / player.fov * (RAY_COUNT - 1);
    const screenXCent  = colF * colW;
    const spriteLeft   = screenXCent - spriteW / 2;
    const spriteTop    = R.h / 2 - spriteH / 2;

    const colStart = Math.max(0,             Math.floor(spriteLeft / colW));
    const colEnd   = Math.min(RAY_COUNT - 1, Math.ceil((spriteLeft + spriteW) / colW));

    for (let col = colStart; col <= colEnd; col++) {
      if (depthBuffer[col] < corrDist) continue;
      const progress = (col * colW - spriteLeft) / spriteW;
      if (progress < 0 || progress > 1) continue;
      const srcX = progress * img.naturalWidth;
      const srcW = Math.max(1, (colW / spriteW) * img.naturalWidth);
      ctx.drawImage(
        img,
        srcX, 0, srcW, img.naturalHeight,
        R.x + col * colW, R.y + spriteTop, colW + 0.5, spriteH
      );
    }

    // ! エフェクト
    if (m.alertTimer > 0) {
      const alpha    = m.alertTimer > 20 ? 1.0 : m.alertTimer / 20;
      const bangSize = clamp(spriteH * 0.25, 12, 60);
      const bangX    = R.x + screenXCent;
      const bangY    = R.y + spriteTop - bangSize * 0.8;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(bangX, bangY, bangSize * 0.55, 0, Math.PI * 2);
      ctx.fillStyle = 'rgb(255,220,0)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle    = '#1a1a00';
      ctx.font         = `bold ${Math.floor(bangSize * 0.7)}px monospace`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', bangX, bangY);
      ctx.globalAlpha = 1.0;
    }
  }
  ctx.restore();
}

// =====================
// Minimap（霧of戦争・モンスター非表示）
// =====================
function drawMinimap() {
  const R        = MINIMAP;
  const pad      = 10;
  const mapArea  = Math.min(R.w - pad * 2, R.h - pad * 2);
  const cellDraw = mapArea / MINIMAP_VIEW_CELLS;
  const mapX0    = R.x + (R.w - mapArea) / 2;
  const mapY0    = R.y + (R.h - mapArea) / 2;

  fillRect(R.x, R.y, R.w, R.h, 30, 30, 30);

  ctx.save();
  ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); ctx.clip();

  // 描画の中心はプレイヤーの補間済み位置に追従
  const pcx      = player.pos.x / CELL_SIZE;
  const pcy      = player.pos.y / CELL_SIZE;
  const half     = MINIMAP_VIEW_CELLS / 2;
  const viewLeft = pcx - half;
  const viewTop  = pcy - half;

  for (let dy = -1; dy <= MINIMAP_VIEW_CELLS; dy++) {
    for (let dx = -1; dx <= MINIMAP_VIEW_CELLS; dx++) {
      const gc = Math.floor(viewLeft + dx);
      const gr = Math.floor(viewTop  + dy);
      const sx = mapX0 + (gc - viewLeft) * cellDraw;
      const sy = mapY0 + (gr - viewTop)  * cellDraw;

      const outOfBounds  = gc < 0 || gc >= GRID_SIZE || gr < 0 || gr >= GRID_SIZE;
      const notExplored  = !outOfBounds && !explored[gr][gc];

      if (outOfBounds || notExplored) {
        // 未探索・範囲外は真っ暗
        fillRect(sx, sy, cellDraw + 1, cellDraw + 1, 6, 6, 6);
      } else if (grid[gr][gc] === 1) {
        fillRect(sx, sy, cellDraw + 1, cellDraw + 1, 105, 135, 125);
      } else {
        fillRect(sx, sy, cellDraw + 1, cellDraw + 1, 18, 18, 18);
      }
    }
  }

  // グリッド線
  for (let i = 0; i <= MINIMAP_VIEW_CELLS + 1; i++) {
    const gc = Math.floor(viewLeft) + i;
    const sx = mapX0 + (gc - viewLeft) * cellDraw;
    const gr = Math.floor(viewTop)  + i;
    const sy = mapY0 + (gr - viewTop)  * cellDraw;
    if (sx >= R.x && sx <= R.x + R.w) drawLine(sx, R.y, sx, R.y + R.h, 60, 80, 70, 0.4, 1);
    if (sy >= R.y && sy <= R.y + R.h) drawLine(R.x, sy, R.x + R.w, sy, 60, 80, 70, 0.4, 1);
  }

  // プレイヤー ○
  const px    = mapX0 + (pcx - viewLeft) * cellDraw;
  const py    = mapY0 + (pcy - viewTop)  * cellDraw;
  const circR = cellDraw * 0.28;

  ctx.beginPath();
  ctx.arc(px, py, circR, 0, Math.PI * 2);
  ctx.fillStyle   = 'rgb(0,110,170)';
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth   = 2;
  ctx.fill(); ctx.stroke();

  // プレイヤー方向 △
  const triDist = circR + cellDraw * 0.28;
  const triH    = cellDraw * 0.28;
  const triW    = cellDraw * 0.22;
  const triCx   = px + Math.cos(player.angle) * triDist;
  const triCy   = py + Math.sin(player.angle) * triDist;
  const perpA   = player.angle + Math.PI / 2;
  const tx  = triCx + Math.cos(player.angle) * triH * 0.6;
  const ty  = triCy + Math.sin(player.angle) * triH * 0.6;
  const bx1 = triCx - Math.cos(player.angle) * triH * 0.4 + Math.cos(perpA) * triW;
  const by1 = triCy - Math.sin(player.angle) * triH * 0.4 + Math.sin(perpA) * triW;
  const bx2 = triCx - Math.cos(player.angle) * triH * 0.4 - Math.cos(perpA) * triW;
  const by2 = triCy - Math.sin(player.angle) * triH * 0.4 - Math.sin(perpA) * triW;

  ctx.beginPath();
  ctx.moveTo(tx, ty); ctx.lineTo(bx1, by1); ctx.lineTo(bx2, by2);
  ctx.closePath();
  ctx.fillStyle = 'rgb(0,110,170)'; ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 2; ctx.lineJoin = 'round';
  ctx.fill(); ctx.stroke();

  ctx.restore();
  strokeRect(R.x, R.y, R.w, R.h, 80, 80, 80, 2);
}

// =====================
// UI panels
// =====================
function drawUIRight() {
  const R  = UI_RIGHT;
  fillRect(R.x, R.y, R.w, R.h, 25, 25, 30);
  strokeRect(R.x, R.y, R.w, R.h, 80, 80, 80, 2);

  const lh = 20;
  const tx = R.x + 16;
  let   ty = R.y + 14;

  drawText('[ Controls ]', tx, ty, '#ccc', 15); ty += lh + 4;
  drawText('W / ↑   : 前進',           tx, ty, '#999', 12); ty += lh;
  drawText('S / ↓   : 後退',           tx, ty, '#999', 12); ty += lh;
  drawText('A / ←   : 左回転',         tx, ty, '#999', 12); ty += lh;
  drawText('D / →   : 右回転',         tx, ty, '#999', 12); ty += lh;
  drawText('Q / E   : 左右ストレイフ', tx, ty, '#999', 12); ty += lh;
  drawText('ホイール : 前後移動',       tx, ty, '#999', 12); ty += lh;
  drawText('R       : 新しい迷路',      tx, ty, '#999', 12); ty += lh + 6;

  drawText(`Grid : ${GRID_SIZE}×${GRID_SIZE}`, tx, ty, '#556655', 11); ty += 18;
  drawText(`Loop : ${LOOP_COUNT}`,             tx, ty, '#556655', 11); ty += 18;
  drawText(`Mob  : ${monsters.length}`,        tx, ty, '#556655', 11);
}

function drawUIBottom() {
  const R = UI_BOTTOM;
  fillRect(R.x, R.y, R.w, R.h, 20, 20, 25);
  strokeRect(R.x, R.y, R.w, R.h, 80, 80, 80, 2);
}

// =====================
// Main loop
// =====================
function gameLoop() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  fillRect(0, 0, CANVAS_W, CANVAS_H, 10, 10, 10);

  handleInput();
  updatePlayer();    // プレイヤーアニメーション → 到着時に checkMonsterContact()
  animateMonsters(); // モンスターアニメーション（毎フレーム）

  const hits = castRays();
  drawView3D(hits);
  drawCompass();    // 3Dビューの上にコンパスを重ねる
  drawSprites();
  drawMinimap();
  drawUIRight();
  drawUIBottom();

  keysJustPressed.clear(); // フレーム末尾でリセット（次フレームから新規押下のみ検知）
  requestAnimationFrame(gameLoop);
}

gameLoop();
