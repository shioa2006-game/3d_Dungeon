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

// 迷路再生成が必要な場合は false を返す（main.js でリトライ）
function initCrystals() {
  crystals = [];
  humanAutoSpawnIndex = 0;

  for (let bR = 0; bR < 5; bR++) {
    for (let bC = 0; bC < 5; bC++) {
      const r1 = BLOCK_ROW_STARTS[bR], r2 = BLOCK_ROW_ENDS[bR];
      const c1 = BLOCK_COL_STARTS[bC], c2 = BLOCK_COL_ENDS[bC];
      const cells = shuffleArr(openCells(r1, r2, c1, c2));
      if (cells.length === 0) return false;   // このブロックに通路なし → 再生成

      const [r, c] = cells[0];
      const owner  = BLOCK_INIT_OWNER[bR][bC];
      const interval = owner === 'human' ? HUMAN_SPAWN_COOLDOWN : AI_SPAWN[owner];
      crystals.push({
        r, c,
        owner,
        spawnTimer: owner === 'neutral' ? 0 : Math.random() * (interval ?? 0),
        blockR: bR,
        blockC: bC,
        valid:  false,   // updateCrystalConnectivity() で確定
      });
    }
  }

  updateCrystalConnectivity();
  return true;
}

// =====================
// 連結判定（所有者変更のたびに呼び出す）
// =====================
function updateCrystalConnectivity() {
  // 全クリスタルをいったん無効化
  for (const cr of crystals) cr.valid = false;

  for (const [faction, homeBlocks] of Object.entries(FACTION_HOME_BLOCKS)) {
    // この陣営が所有するブロックキーのセット
    const ownedKeys = new Set(
      crystals.filter(cr => cr.owner === faction)
               .map(cr => `${cr.blockR},${cr.blockC}`)
    );

    // BFS：本拠ブロックから同陣営の隣接ブロックをたどる
    const visited = new Set();
    const queue   = [];
    for (const [hR, hC] of homeBlocks) {
      const key = `${hR},${hC}`;
      if (ownedKeys.has(key) && !visited.has(key)) {
        visited.add(key);
        queue.push([hR, hC]);
      }
    }
    while (queue.length > 0) {
      const [bR, bC] = queue.shift();
      const cr = crystals.find(x => x.blockR === bR && x.blockC === bC);
      if (cr && cr.owner === faction) cr.valid = true;

      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nr = bR + dr, nc = bC + dc;
        if (nr < 0 || nr > 4 || nc < 0 || nc > 4) continue;
        const key = `${nr},${nc}`;
        if (!visited.has(key) && ownedKeys.has(key)) {
          visited.add(key);
          queue.push([nr, nc]);
        }
      }
    }
  }
}

// =====================
// ターン処理（プレイヤー移動ごとに呼び出し）
// =====================
function trySpawnFromCrystal(cr) {
  if (!cr.valid) return;   // 飛び地クリスタルはスポーン不可
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

    const sx   = mapX0 + gx * cellDraw;
    const sy   = mapY0 + gy * cellDraw;
    const f    = FACTIONS[cr.owner];
    const r    = cellDraw * 0.30;

    // 外縁（黒枠・三角形）
    ctx.beginPath();
    ctx.moveTo(sx,               sy - (r + 1.5));
    ctx.lineTo(sx + (r + 1.5) * 0.866, sy + (r + 1.5) * 0.5);
    ctx.lineTo(sx - (r + 1.5) * 0.866, sy + (r + 1.5) * 0.5);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fill();

    // 本体（陣営色・三角形）
    ctx.beginPath();
    ctx.moveTo(sx,           sy - r);
    ctx.lineTo(sx + r * 0.866, sy + r * 0.5);
    ctx.lineTo(sx - r * 0.866, sy + r * 0.5);
    ctx.closePath();
    ctx.fillStyle = f ? f.color : '#888888';
    ctx.fill();

    // 頂点ハイライト
    ctx.beginPath();
    ctx.arc(sx, sy - r * 0.55, r * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fill();
  }
}
