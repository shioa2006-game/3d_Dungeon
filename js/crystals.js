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

// Lookup tables (initCrystals 内で再構築)
let crystalAtCell  = null;   // [r][c] -> crystal | null
let crystalByBlock = null;   // [bR][bC] -> crystal | null

function rebuildCrystalLookups() {
  crystalAtCell  = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
  crystalByBlock = Array.from({ length: 5 }, () => Array(5).fill(null));
  for (const cr of crystals) {
    crystalAtCell[cr.r][cr.c]            = cr;
    crystalByBlock[cr.blockR][cr.blockC] = cr;
  }
}

// 通路セルのリストを返す（範囲内）
function openCells(r1, r2, c1, c2) {
  const out = [];
  for (let r = r1; r <= r2; r++)
    for (let c = c1; c <= c2; c++)
      if (grid[r] && grid[r][c] === 0) out.push([r, c]);
  return out;
}

// 迷路再生成が必要な場合は false を返す（main.js でリトライ）
function initCrystals() {
  crystals = [];
  humanAutoSpawnIndex = 0;

  for (let bR = 0; bR < 5; bR++) {
    for (let bC = 0; bC < 5; bC++) {
      const r1 = BLOCK_ROW_STARTS[bR], r2 = BLOCK_ROW_ENDS[bR];
      const c1 = BLOCK_COL_STARTS[bC], c2 = BLOCK_COL_ENDS[bC];
      const cells = shuffle(openCells(r1, r2, c1, c2));
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

  rebuildCrystalLookups();
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
      const cr = crystalByBlock[bR][bC];
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

