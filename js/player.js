const player = {
  pos:   new Vec2(1.5 * CELL_SIZE, 1.5 * CELL_SIZE),
  angle:       FACING_ANGLES[1],
  visualAngle: FACING_ANGLES[1],  // スプリングで追従する描画専用角度
  fov:         60 * Math.PI / 180,

  gridR:  1,
  gridC:  1,
  facing: 1,

  moving:       false,
  moveFrom:     new Vec2(0, 0),
  moveTo:       new Vec2(0, 0),
  moveProgress: 0,
  nextGridR:    1,
  nextGridC:    1,

  hp:    PLAYER_INIT.hp,
  gold:  0,
  equip: { weapon: null, armor: null, accessory: null },
};

let explored = [];

function initExplored() {
  explored = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(false));
  markExplored();
}

function markExplored() {
  const r = player.gridR, c = player.gridC;
  explored[r][c] = true;
  for (const d of FACING_DIRS) {
    for (let step = 1; step <= 6; step++) {
      const nr = r + d.dr * step;
      const nc = c + d.dc * step;
      if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) break;
      explored[nr][nc] = true;
      if (grid[nr][nc] === 1) break;
    }
  }
}

function initPlayerStats() {
  player.hp   = PLAYER_INIT.hp;
  player.gold = 0;
  player.equip = { weapon: null, armor: null, accessory: null };
}

function playerStats() {
  let s = { hp: PLAYER_INIT.hp, atk: PLAYER_INIT.atk, rec: PLAYER_INIT.rec, agi: PLAYER_INIT.agi };
  for (const slot of ['weapon', 'armor', 'accessory']) {
    const eq = player.equip[slot];
    if (!eq?.mod) continue;
    if (eq.mod.hp)  s.hp  += eq.mod.hp;
    if (eq.mod.atk) s.atk += eq.mod.atk;
    if (eq.mod.rec) s.rec += eq.mod.rec;
    if (eq.mod.agi) s.agi += eq.mod.agi;
  }
  return s;
}

function playerAtkVs(raceOrType) {
  const { atk } = playerStats();
  const w = player.equip.weapon;
  if (w?.bonus?.[raceOrType]) return Math.max(1, Math.floor(atk * w.bonus[raceOrType]));
  return atk;
}

function spawnPlayerAtHome() {
  let best = null, bestDist = Infinity;
  // 有効な人間族クリスタルのみ復活先候補とする
  for (const cr of crystals) {
    if (cr.owner !== 'human' || !cr.valid) continue;
    const d = Math.abs(cr.r - player.gridR) + Math.abs(cr.c - player.gridC);
    if (d < bestDist) { bestDist = d; best = cr; }
  }
  // フォールバック：有効クリスタルがゼロの場合は所有クリスタル全体から探す
  if (!best) {
    for (const cr of crystals) {
      if (cr.owner !== 'human') continue;
      const d = Math.abs(cr.r - player.gridR) + Math.abs(cr.c - player.gridC);
      if (d < bestDist) { bestDist = d; best = cr; }
    }
  }
  const target = best ?? { r: 1, c: 1 };
  player.gridR = target.r;
  player.gridC = target.c;
  player.pos   = new Vec2((target.c + 0.5) * CELL_SIZE, (target.r + 0.5) * CELL_SIZE);
  player.moving      = false;
  player.visualAngle = player.angle;  // テレポート時はスプリングをスナップ
  markExplored();
  updateOnCrystal();
}

function checkCrystalClaim() {
  const cr = crystalAtCell[player.gridR][player.gridC];
  if (!cr || cr.owner === 'human') return;
  cr.owner      = 'human';
  cr.spawnTimer = 0;
  updateCrystalConnectivity();   // 連結判定を再計算
  updateOnCrystal();
  logMessage(`💎 クリスタルを人間族に転換！`, 'occupy');
  checkWinLoss();
}

function startMove(dir) {
  const d  = FACING_DIRS[dir];
  const nr = player.gridR + d.dr;
  const nc = player.gridC + d.dc;
  if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) return;
  if (grid[nr][nc] !== 0) return;

  // 移動先に敵がいれば通過せずその場でバトル開始
  if (!battleState) {
    const contact = monsters.find(m =>
      m.hp > 0 && !m.battleLocked &&
      m.gridR === nr && m.gridC === nc &&
      m.faction !== 'human'
    );
    if (contact) {
      triggerMonsterTurn(player.gridR, player.gridC, true); // 即時・バンプ扱い
      startBattle(contact);
      return;
    }
  }

  player.moving       = true;
  player.moveFrom     = new Vec2(player.pos.x, player.pos.y);
  player.moveTo       = new Vec2((nc + 0.5) * CELL_SIZE, (nr + 0.5) * CELL_SIZE);
  player.moveProgress = 0;
  player.nextGridR    = nr;
  player.nextGridC    = nc;

  triggerMonsterTurn(nr, nc); // 通常移動：アニメーション付き
}

function startRotate(dir) {
  // ゲームロジック（facing / angle）を即時確定
  // visualAngle は updatePlayer() のスプリングで滑らかに追従する
  player.facing = (player.facing + dir + 4) % 4;
  player.angle  = FACING_ANGLES[player.facing];
}

function updatePlayer() {
  if (player.moving) {
    player.moveProgress += 1 / MOVE_FRAMES;
    if (player.moveProgress >= 1) {
      player.moveProgress = 1;
      player.moving  = false;
      player.gridR   = player.nextGridR;
      player.gridC   = player.nextGridC;
      player.pos.x   = player.moveTo.x;
      player.pos.y   = player.moveTo.y;
      markExplored();
      updateOnCrystal();
      checkMonsterContact();
      if (!battleState) checkCrystalClaim();
    } else {
      const t = smoothstep(player.moveProgress);
      player.pos.x = player.moveFrom.x + (player.moveTo.x - player.moveFrom.x) * t;
      player.pos.y = player.moveFrom.y + (player.moveTo.y - player.moveFrom.y) * t;
    }
  }

  // スプリングモデル: visualAngle が player.angle に向かって毎フレーム追従
  const rotDiff = normalizeAngle(player.angle - player.visualAngle);
  player.visualAngle += rotDiff * ROT_SPRING_K;
}
