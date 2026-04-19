let monsters = [];
let monstersAnimating = false;

// =====================
// 視野・視線判定
// =====================
function isPlayerInFrontHemisphere(m) {
  const fd  = FACING_DIRS[m.facing];
  const tpx = player.pos.x - m.pos.x;
  const tpy = player.pos.y - m.pos.y;
  return (fd.dc * tpx + fd.dr * tpy) > 0;
}

function hasLineOfSight(fromPos, toPos) {
  const dx = toPos.x - fromPos.x, dy = toPos.y - fromPos.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.001) return true;
  const invDist = 1 / dist;
  const rdx = dx * invDist, rdy = dy * invDist;
  for (const w of walls) {
    const sx  = w.b.x - w.a.x, sy = w.b.y - w.a.y;
    const rxs = rdx * sy - rdy * sx;
    if (rxs > -1e-9 && rxs < 1e-9) continue;
    const qpx  = w.a.x - fromPos.x, qpy = w.a.y - fromPos.y;
    const t    = (qpx * sy - qpy * sx) / rxs;
    if (t < 0 || t >= dist - 1) continue;
    const u = (qpx * rdy - qpy * rdx) / rxs;
    if (u >= 0 && u <= 1) return false;
  }
  return true;
}

function facingFromMove(fromR, fromC, toR, toC) {
  const dr = toR - fromR, dc = toC - fromC;
  if (dr === -1) return 0;
  if (dc ===  1) return 1;
  if (dr ===  1) return 2;
  return 3;
}

// =====================
// ユニット生成（6 種族共通）
// =====================
function makeUnit(type, r, c) {
  const d   = UNIT_DEFS[type];
  const pos = new Vec2((c + 0.5) * CELL_SIZE, (r + 0.5) * CELL_SIZE);
  return {
    type,
    faction:          d.faction,
    hp:               d.hp,
    maxHp:            d.hp,
    atk:              d.atk,
    pos:              new Vec2(pos.x, pos.y),
    gridR: r,         gridC: c,
    targetR: -1,      targetC: -1,
    moving:           false,
    moveFrom:         new Vec2(pos.x, pos.y),
    moveTo:           new Vec2(pos.x, pos.y),
    moveProgress:     0,
    state:            'WANDER',
    facing:           2,
    path:             [],
    lostTimer:        0,
    alertTimer:       0,
    // 陣営 AI 用フィールド
    targetCrystal:    null,
    retreating:       false,
    retreatTarget:    null,
    healing:          false,
    pathRefreshTimer: 0,
  };
}

// 初期スポーン：各 AI 陣営のクリスタル近くに 1 体ずつ
function spawnMonsters() {
  monsters = [];
  for (const [owner, type] of Object.entries(AI_UNIT)) {
    const fCrystals = crystals.filter(c => c.owner === owner);
    if (fCrystals.length === 0) continue;
    const cr = fCrystals[Math.floor(Math.random() * fCrystals.length)];
    monsters.push(makeUnit(type, cr.r, cr.c));
  }
}

// =====================
// 陣営 AI ヘルパー
// =====================
function nearestFriendlyCrystal(m) {
  let best = null, bestDist = Infinity;
  for (const cr of crystals) {
    if (cr.owner !== m.faction) continue;
    const d = Math.abs(cr.r - m.gridR) + Math.abs(cr.c - m.gridC);
    if (d < bestDist) { bestDist = d; best = cr; }
  }
  return best;
}

function randomEnemyCrystal(m) {
  const candidates = crystals.filter(cr => cr.owner !== m.faction);
  if (candidates.length === 0) return null;
  // 距離の逆数で重み付けしてランダム選択
  const weights = candidates.map(cr =>
    1 / (Math.abs(cr.r - m.gridR) + Math.abs(cr.c - m.gridC) + 1)
  );
  const total = weights.reduce((a, b) => a + b, 0);
  let rand = Math.random() * total;
  for (let i = 0; i < candidates.length; i++) {
    rand -= weights[i];
    if (rand <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

// =====================
// プレイヤー検知 AI（WANDER ↔ CHASE）
// =====================
function updateMonsterAIState(m, pGR, pGC) {
  const dCells = Math.hypot(m.gridR - pGR, m.gridC - pGC);
  const inFront = isPlayerInFrontHemisphere(m);
  const los     = hasLineOfSight(m.pos, player.pos);
  const canSee  = dCells <= DETECT_RANGE && los && (m.state === 'CHASE' || inFront);

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

// =====================
// 陣営 AI（領土移動・クリスタル奪取・退却・回復）
// playtest.html の updateUnits() を移植
// =====================
function updateTerritoryAI(foughtThisTurn) {
  for (const m of monsters) {
    if (m.state === 'CHASE') continue;
    if (foughtThisTurn.has(m)) { m.healing = false; continue; }

    // ── 回復中 ──
    if (m.healing) {
      const atCr = m.retreatTarget &&
        m.retreatTarget.owner === m.faction &&
        m.gridR === m.retreatTarget.r && m.gridC === m.retreatTarget.c;
      if (atCr) {
        m.hp = Math.min(m.maxHp, m.hp + Math.ceil(m.maxHp / 8));
        if (m.hp >= m.maxHp) {
          m.healing = false; m.retreatTarget = null;
          m.path = []; m.pathRefreshTimer = PATH_REFRESH;
        }
      } else {
        // 回復中のクリスタルが奪われた
        const next = nearestFriendlyCrystal(m);
        if (next) { m.retreatTarget = next; m.retreating = true; m.healing = false; m.path = []; m.pathRefreshTimer = 0; }
        else      { m.healing = false; m.retreatTarget = null; }
      }
      continue;
    }

    // ── HP 1/3 以下 → 退却開始 ──
    if (!m.retreating && m.hp <= m.maxHp / 3) {
      const cr = nearestFriendlyCrystal(m);
      if (cr) { m.retreatTarget = cr; m.retreating = true; m.path = []; m.pathRefreshTimer = 0; }
    }

    // ── 退却中 ──
    if (m.retreating) {
      if (!m.retreatTarget || m.retreatTarget.owner !== m.faction) {
        const next = nearestFriendlyCrystal(m);
        if (next) { m.retreatTarget = next; m.path = []; m.pathRefreshTimer = 0; }
        else      { m.retreating = false; m.retreatTarget = null; }
      } else if (m.gridR === m.retreatTarget.r && m.gridC === m.retreatTarget.c) {
        m.retreating = false; m.healing = true; m.path = [];
      }
    }

    // ── 敵クリスタル踏んで奪取 ──
    if (!m.retreating && !m.healing) {
      const cr = crystals.find(x =>
        x.r === m.gridR && x.c === m.gridC && x.owner !== m.faction
      );
      if (cr) {
        cr.owner = m.faction;
        cr.spawnTimer = 0;
        m.path = []; m.pathRefreshTimer = PATH_REFRESH;
        m.targetCrystal = randomEnemyCrystal(m);
      }
    }

    // ── 目標クリスタルが自陣に変わっていたら再選択 ──
    if (!m.retreating && m.targetCrystal && m.targetCrystal.owner === m.faction) {
      m.targetCrystal = randomEnemyCrystal(m);
      m.path = []; m.pathRefreshTimer = PATH_REFRESH;
    }

    // ── BFS パス更新 ──
    m.pathRefreshTimer++;
    if (m.pathRefreshTimer >= PATH_REFRESH || m.path.length === 0) {
      m.pathRefreshTimer = 0;
      const nav = m.retreating
        ? m.retreatTarget
        : (m.targetCrystal ?? randomEnemyCrystal(m));
      m.path = nav ? bfsPath(grid, m.gridR, m.gridC, nav.r, nav.c) : [];
      if (!m.targetCrystal && !m.retreating) m.targetCrystal = randomEnemyCrystal(m);
    }
  }
}

// =====================
// 移動先選択
// =====================
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
  if (reserved.has(`${next.r},${next.c}`)) return null;
  m.path.shift();
  return { r: next.r, c: next.c };
}

function pickTerritoryMoveTurn(m, reserved) {
  if (m.healing) return null;   // 回復中は移動しない

  if (m.path.length > 0) {
    const next = m.path[0];
    if (grid[next.r]?.[next.c] === 0 && !reserved.has(`${next.r},${next.c}`)) {
      m.path.shift();
      return { r: next.r, c: next.c };
    }
    // 道がふさがれた → 次ターンに再 BFS
    m.path = []; m.pathRefreshTimer = PATH_REFRESH;
  }

  return pickWanderTargetTurn(m, reserved);
}

// =====================
// メインターン処理
// =====================
function triggerMonsterTurn(pDestR, pDestC) {
  const pGR = player.gridR;
  const pGC = player.gridC;
  const reserved = new Set([`${pDestR},${pDestC}`]);

  // ① CHASE / WANDER 状態更新
  for (const m of monsters) {
    updateMonsterAIState(m, pGR, pGC);
    m.targetR = -1; m.targetC = -1;
  }

  // ② AI vs AI 戦闘（同一セル・異陣営）
  const foughtThisTurn = new Set();
  for (const m of monsters) {
    if (m.hp <= 0) continue;
    for (const e of monsters) {
      if (e === m || e.hp <= 0 || e.faction === m.faction) continue;
      if (e.gridR !== m.gridR || e.gridC !== m.gridC) continue;
      e.hp -= m.atk * getAffinityMult(m.type, e.type);
      foughtThisTurn.add(m);
      foughtThisTurn.add(e);
    }
  }
  // 死亡ユニット除去
  monsters = monsters.filter(m => m.hp > 0);

  // ③ 陣営 AI 状態更新（回復・退却・クリスタル奪取・パス計算）
  updateTerritoryAI(foughtThisTurn);

  // ④ 移動先を決定
  for (const m of monsters) {
    let target = null;
    if (foughtThisTurn.has(m)) {
      target = null;   // 戦闘ターンは移動しない
    } else if (m.state === 'CHASE') {
      target = pickChaseTargetTurn(m, reserved, pGR, pGC);
    } else {
      target = pickTerritoryMoveTurn(m, reserved);
    }
    if (target) {
      m.targetR = target.r; m.targetC = target.c;
      reserved.add(`${target.r},${target.c}`);
    } else {
      reserved.add(`${m.gridR},${m.gridC}`);
    }
  }

  // ⑤ アニメーション開始
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

  // ⑥ クリスタルスポーンタイマー
  updateCrystals();
}

// =====================
// アニメーション更新（毎フレーム）
// =====================
function animateMonsters() {
  for (const m of monsters) {
    if (m.alertTimer > 0) m.alertTimer--;
  }

  if (!monstersAnimating) return;

  let anyStillMoving = false;
  for (const m of monsters) {
    if (!m.moving) continue;
    m.moveProgress += 1 / MOVE_FRAMES;
    if (m.moveProgress >= 1) {
      m.facing  = facingFromMove(m.gridR, m.gridC, m.targetR, m.targetC);
      m.pos.x   = m.moveTo.x;
      m.pos.y   = m.moveTo.y;
      m.gridR   = m.targetR;
      m.gridC   = m.targetC;
      m.targetR = -1; m.targetC = -1;
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

// =====================
// プレイヤー接触チェック（Phase 6 でバトル画面へ）
// =====================
function checkMonsterContact() {
  for (const m of monsters) {
    if (m.gridR === player.gridR && m.gridC === player.gridC) {
      // TODO: Phase 6 で startBattle(m) を呼び出す
    }
  }
}
