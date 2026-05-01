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
// Crystal lookup tables を再構築
// initCrystals() の最後で呼ぶ。クリスタル位置は不変なので所有者変更時の再構築は不要
// =====================
/** @returns {void} */
function rebuildCrystalLookups() {
  Game.state.crystalAtCell  = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
  Game.state.crystalByBlock = Array.from({ length: 5 }, () => Array(5).fill(null));
  for (const cr of Game.state.crystals) {
    Game.state.crystalAtCell[cr.r][cr.c]            = cr;
    Game.state.crystalByBlock[cr.blockR][cr.blockC] = cr;
  }
}

// 通路セルのリストを返す（範囲内）
function openCells(r1, r2, c1, c2) {
  const out = [];
  const grid = Game.state.grid;
  for (let r = r1; r <= r2; r++)
    for (let c = c1; c <= c2; c++)
      if (grid[r] && grid[r][c] === 0) out.push([r, c]);
  return out;
}

// 迷路再生成が必要な場合は false を返す（main.js でリトライ）
/** @returns {boolean} 全25ブロックにクリスタルを配置できれば true */
function initCrystals() {
  Game.state.crystals = [];
  Game.state.humanAutoSpawnIndex = 0;

  for (let bR = 0; bR < 5; bR++) {
    for (let bC = 0; bC < 5; bC++) {
      const r1 = BLOCK_ROW_STARTS[bR], r2 = BLOCK_ROW_ENDS[bR];
      const c1 = BLOCK_COL_STARTS[bC], c2 = BLOCK_COL_ENDS[bC];
      const cells = shuffle(openCells(r1, r2, c1, c2));
      if (cells.length === 0) return false;   // このブロックに通路なし → 再生成

      const [r, c] = cells[0];
      const owner  = BLOCK_INIT_OWNER[bR][bC];
      const interval = owner === 'human' ? HUMAN_SPAWN_COOLDOWN : AI_SPAWN[owner];
      Game.state.crystals.push({
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
  const crystals = Game.state.crystals;
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
      const cr = Game.state.crystalByBlock[bR][bC];
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
    ? HUMAN_AUTO_TYPES[Game.state.humanAutoSpawnIndex % HUMAN_AUTO_TYPES.length]
    : AI_UNIT[cr.owner];
  if (!type) return;

  const ownCrystals = Game.state.crystals.filter(c => c.owner === cr.owner).length;
  const cap     = Math.min(UNIT_CAP_MAX, ownCrystals * UNIT_CAP_PER_CRYSTAL);
  const current = Game.state.monsters.filter(m => m.faction === cr.owner).length;
  if (current >= cap) return;

  Game.state.monsters.push(makeUnit(type, cr.r, cr.c));
  if (cr.owner === 'human') Game.state.humanAutoSpawnIndex++;
}

function updateCrystals() {
  for (const cr of Game.state.crystals) {
    if (cr.owner === 'neutral') continue;
    cr.spawnTimer += 1;
    const interval = cr.owner === 'human' ? HUMAN_SPAWN_COOLDOWN : AI_SPAWN[cr.owner];
    if (cr.spawnTimer >= interval) {
      cr.spawnTimer -= interval;
      trySpawnFromCrystal(cr);
    }
  }
}
