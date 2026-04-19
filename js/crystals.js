// =====================
// Crystal images
// =====================
const CRYSTAL_IMGS = {};
['human', 'goblin', 'lizard', 'ogre', 'neutral'].forEach(name => {
  const img = new Image();
  img.src = `assets/crystals/crystal_${name}.png`;
  CRYSTAL_IMGS[name] = img;
});

// =====================
// Crystal data
// =====================
let crystals = [];
let humanAutoSpawnIndex = 0;

// 通路セルのリストを返す（範囲内）
function openCells(r1, r2, c1, c2) {
  const out = [];
  for (let r = r1; r <= r2; r++)
    for (let c = c1; c <= c2; c++)
      if (grid[r] && grid[r][c] === 0) out.push([r, c]);
  return out;
}

function shuffleArr(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function initCrystals() {
  crystals = [];
  const E = GRID_SIZE - 2;   // 49
  const Z = 11;
  const usedCells = new Set();

  function pickCells(r1, r2, c1, c2, n) {
    const candidates = shuffleArr(openCells(r1, r2, c1, c2))
      .filter(([r, c]) => !usedCells.has(`${r},${c}`));
    const picked = candidates.slice(0, n);
    picked.forEach(([r, c]) => usedCells.add(`${r},${c}`));
    return picked;
  }

  // 四隅の陣営ゾーン（各 3 個・陣営所有）
  const cornerZones = [
    { owner: 'human',  r1: 1,   r2: Z,   c1: 1,   c2: Z   },
    { owner: 'goblin', r1: 1,   r2: Z,   c1: E-Z, c2: E   },
    { owner: 'lizard', r1: E-Z, r2: E,   c1: 1,   c2: Z   },
    { owner: 'ogre',   r1: E-Z, r2: E,   c1: E-Z, c2: E   },
  ];
  for (const z of cornerZones) {
    const interval = z.owner === 'human' ? HUMAN_SPAWN_COOLDOWN : AI_SPAWN[z.owner];
    for (const [r, c] of pickCells(z.r1, z.r2, z.c1, z.c2, 3)) {
      crystals.push({ r, c, owner: z.owner, spawnTimer: Math.random() * interval });
    }
  }

  // 陣営ゾーン隣接の中立エリア（各 2 個）
  const nearZones = [
    { r1: 1,     r2: Z+6, c1: Z+1,   c2: Z+6   },
    { r1: 1,     r2: Z+6, c1: E-Z-6, c2: E-1   },
    { r1: E-Z-6, r2: E-1, c1: Z+1,   c2: Z+6   },
    { r1: E-Z-6, r2: E-1, c1: E-Z-6, c2: E-1   },
  ];
  for (const z of nearZones) {
    for (const [r, c] of pickCells(z.r1, z.r2, z.c1, z.c2, 2)) {
      crystals.push({ r, c, owner: 'neutral', spawnTimer: 0 });
    }
  }

  // 中央エリア（8 個・中立）
  for (const [r, c] of pickCells(Z+2, E-Z-2, Z+2, E-Z-2, 8)) {
    crystals.push({ r, c, owner: 'neutral', spawnTimer: 0 });
  }
}

// =====================
// ターン処理（プレイヤー移動ごとに呼び出し）
// =====================
function trySpawnFromCrystal(cr) {
  const type = cr.owner === 'human'
    ? HUMAN_AUTO_TYPES[humanAutoSpawnIndex % HUMAN_AUTO_TYPES.length]
    : AI_UNIT[cr.owner];
  if (!type) return;

  const ownCrystals = crystals.filter(c => c.owner === cr.owner).length;
  const cap     = Math.min(UNIT_CAP_MAX, ownCrystals * UNIT_CAP_PER_CRYSTAL);
  const current = monsters.filter(m => m.faction === cr.owner).length;
  if (current >= cap) return;

  monsters.push(makeUnit(type, cr.r, cr.c));
  if (cr.owner === 'human') humanAutoSpawnIndex++;
}

function updateCrystals() {
  for (const cr of crystals) {
    if (cr.owner === 'neutral') continue;
    cr.spawnTimer += 1;
    const interval = cr.owner === 'human' ? HUMAN_SPAWN_COOLDOWN : AI_SPAWN[cr.owner];
    if (cr.spawnTimer >= interval) {
      cr.spawnTimer -= interval;
      trySpawnFromCrystal(cr);
    }
  }
}

// =====================
// ミニマップ上のクリスタルドット
// =====================
function drawCrystalsOnMinimap() {
  const R        = MINIMAP;
  const pad      = 10;
  const mapArea  = Math.min(R.w - pad * 2, R.h - pad * 2);
  const cellDraw = mapArea / MINIMAP_VIEW_CELLS;
  const mapX0    = R.x + (R.w - mapArea) / 2;
  const mapY0    = R.y + (R.h - mapArea) / 2;

  const pcx      = player.pos.x / CELL_SIZE;
  const pcy      = player.pos.y / CELL_SIZE;
  const half     = MINIMAP_VIEW_CELLS / 2;
  const viewLeft = pcx - half;
  const viewTop  = pcy - half;

  for (const cr of crystals) {
    const gx = cr.c + 0.5 - viewLeft;
    const gy = cr.r + 0.5 - viewTop;
    if (gx < 0 || gx > MINIMAP_VIEW_CELLS ||
        gy < 0 || gy > MINIMAP_VIEW_CELLS) continue;

    const sx = mapX0 + gx * cellDraw;
    const sy = mapY0 + gy * cellDraw;
    const f  = FACTIONS[cr.owner];
    const dotR = cellDraw * 0.32;

    // 外縁（黒枠）
    ctx.beginPath();
    ctx.arc(sx, sy, dotR + 1.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fill();
    // 本体（陣営色）
    ctx.beginPath();
    ctx.arc(sx, sy, dotR, 0, Math.PI * 2);
    ctx.fillStyle = f ? f.color : '#888888';
    ctx.fill();
    // ハイライト
    ctx.beginPath();
    ctx.arc(sx - dotR * 0.3, sy - dotR * 0.3, dotR * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fill();
  }
}
