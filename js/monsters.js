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
/**
 * @param {'human'|'elf'|'dwarf'|'goblin'|'lizard'|'ogre'} type
 * @param {number} r
 * @param {number} c
 * @returns {Monster}
 */
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
    facing:           2,
    path:             [],
    // 陣営 AI 用フィールド
    targetCrystal:    null,
    retreating:       false,
    retreatTarget:    null,
    healing:          false,
    pathRefreshTimer:   0,
    targetRefreshTimer: 0,
    battleLocked:       false,
    aggroed:            false,
  };
}

// 初期スポーン：各 AI 陣営のクリスタル近くに 1 体ずつ
function spawnMonsters() {
  Game.state.monsters = [];
  for (const [owner, type] of Object.entries(AI_UNIT)) {
    const fCrystals = Game.state.crystals.filter(c => c.owner === owner);
    if (fCrystals.length === 0) continue;
    const cr = fCrystals[Math.floor(Math.random() * fCrystals.length)];
    Game.state.monsters.push(makeUnit(type, cr.r, cr.c));
  }
}

// =====================
// 陣営 AI ヘルパー
// =====================
function nearestFriendlyCrystal(m) {
  let best = null, bestDist = Infinity;
  for (const cr of Game.state.crystals) {
    if (cr.owner !== m.faction || !cr.valid) continue;  // 飛び地は撤退先にしない
    const d = Math.abs(cr.r - m.gridR) + Math.abs(cr.c - m.gridC);
    if (d < bestDist) { bestDist = d; best = cr; }
  }
  return best;
}

function randomEnemyCrystal(m) {
  const crystals = Game.state.crystals;
  const candidates = crystals.filter(cr => cr.owner !== m.faction);
  if (candidates.length === 0) return null;

  // 自陣の有効ブロックに4方向隣接するブロックキーを収集
  const adjKeys = new Set();
  for (const cr of crystals) {
    if (cr.owner !== m.faction || !cr.valid) continue;
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nr = cr.blockR + dr, nc = cr.blockC + dc;
      if (nr >= 0 && nr <= 4 && nc >= 0 && nc <= 4) adjKeys.add(`${nr},${nc}`);
    }
  }

  // 有効隣接ブロックに属する敵クリスタルを優先プール、なければ全体にフォールバック
  const preferred = candidates.filter(cr => adjKeys.has(`${cr.blockR},${cr.blockC}`));
  const pool      = preferred.length > 0 ? preferred : candidates;

  // 同陣営で各クリスタルを狙っているユニット数を集計（集中ペナルティ用）
  const targetCount = new Map();
  for (const other of Game.state.monsters) {
    if (other === m || other.faction !== m.faction || !other.targetCrystal) continue;
    const key = `${other.targetCrystal.r},${other.targetCrystal.c}`;
    targetCount.set(key, (targetCount.get(key) || 0) + 1);
  }

  // 距離が近いほど重みが高い + 集中しているクリスタルは二乗ペナルティで重みを下げる
  // count=0: ×1, count=1: ÷2, count=2: ÷5, count=3: ÷10
  const weights = pool.map(cr => {
    const dist  = Math.abs(cr.r - m.gridR) + Math.abs(cr.c - m.gridC) + 1;
    const count = targetCount.get(`${cr.r},${cr.c}`) || 0;
    return (1 / dist) / (1 + count * count);
  });

  const total = weights.reduce((a, b) => a + b, 0);
  let rand = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    rand -= weights[i];
    if (rand <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

// =====================
// 陣営 AI（領土移動・クリスタル奪取・退却・回復）
// playtest.html の updateUnits() を移植
// =====================
function updateTerritoryAI(foughtThisTurn) {
  for (const m of Game.state.monsters) {
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
      // 撤退先が無効（所有者変更 or 飛び地化）なら有効クリスタルへ転向
      if (!m.retreatTarget || m.retreatTarget.owner !== m.faction || !m.retreatTarget.valid) {
        const next = nearestFriendlyCrystal(m);
        if (next) { m.retreatTarget = next; m.path = []; m.pathRefreshTimer = 0; }
        else      { m.retreating = false; m.retreatTarget = null; }
      } else if (m.gridR === m.retreatTarget.r && m.gridC === m.retreatTarget.c) {
        m.retreating = false; m.healing = true; m.path = [];
      }
    }

    // ── 敵クリスタル踏んで奪取 ──
    if (!m.retreating && !m.healing) {
      const cr = Game.state.crystalAtCell[m.gridR][m.gridC];
      if (cr && cr.owner !== m.faction) {
        const prevOwner = cr.owner;
        cr.owner = m.faction;
        cr.spawnTimer = 0;
        if (m.faction === 'human') cr.discovered = true;
        updateCrystalConnectivity();          // 連結判定を再計算
        m.path = []; m.pathRefreshTimer = PATH_REFRESH;
        m.targetCrystal = randomEnemyCrystal(m);
        m.targetRefreshTimer = 0;
        GameLog.event('crystal_capture', {
          r: cr.r, c: cr.c, blockR: cr.blockR, blockC: cr.blockC,
          fromOwner: prevOwner, toOwner: m.faction,
          capturer: { kind: 'unit', race: m.type, faction: m.faction },
        });
        if (prevOwner === 'human') {
          logMessage(`💥 人間族クリスタルが${FACTIONS[m.faction].name}に占領された！`, 'occupy');
        }
        checkWinLoss();
      }
    }

    // ── 目標クリスタルが自陣に変わっていたら再選択 ──
    if (!m.retreating && m.targetCrystal && m.targetCrystal.owner === m.faction) {
      m.targetCrystal = randomEnemyCrystal(m);
      m.targetRefreshTimer = 0;
      m.path = []; m.pathRefreshTimer = PATH_REFRESH;
    }

    // ── 定期ターゲット再評価（集中を防ぐ分散制御） ──
    if (!m.retreating && !m.healing && m.targetCrystal) {
      m.targetRefreshTimer++;
      if (m.targetRefreshTimer >= TARGET_RESELECT_INTERVAL) {
        m.targetRefreshTimer = 0;
        m.targetCrystal = randomEnemyCrystal(m);
        m.path = []; m.pathRefreshTimer = PATH_REFRESH;
      }
    }

    // ── BFS パス更新 ──
    m.pathRefreshTimer++;
    if (m.pathRefreshTimer >= PATH_REFRESH || m.path.length === 0) {
      m.pathRefreshTimer = 0;
      const nav = m.retreating
        ? m.retreatTarget
        : (m.targetCrystal ?? randomEnemyCrystal(m));
      m.path = nav ? bfsPath(Game.state.grid, m.gridR, m.gridC, nav.r, nav.c) : [];
      if (!m.targetCrystal && !m.retreating) m.targetCrystal = randomEnemyCrystal(m);
    }
  }
}

// =====================
// 移動先選択
// =====================
function pickWanderTargetTurn(m, reserved) {
  const grid = Game.state.grid;
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

function pickTerritoryMoveTurn(m, reserved) {
  if (m.healing) return null;   // 回復中は移動しない

  if (m.path.length > 0) {
    const next = m.path[0];
    if (Game.state.grid[next.r]?.[next.c] === 0 && !reserved.has(`${next.r},${next.c}`)) {
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
/**
 * 1ワールドターン進める。AI vs AI 戦闘 → 領土AI → 移動先決定 →
 * スワップ衝突解決 → 移動適用 → クリスタルスポーン、の順で処理する。
 *
 * @param {number} pDestR  プレイヤー目的地行（モンスターが避けるべきセル）
 * @param {number} pDestC
 * @param {boolean} [skipAnimation=false]  即時に位置を確定（バトル中など）
 */
function triggerMonsterTurn(pDestR, pDestC, skipAnimation = false) {
  Game.state.worldTurn++;
  const reserved = new Set([`${pDestR},${pDestC}`]);

  // ① 各ユニットのターゲットをリセット
  for (const m of Game.state.monsters) {
    m.targetR = -1; m.targetC = -1;
  }

  // ② AI vs AI 戦闘（同一セル・異陣営）
  const foughtThisTurn = new Set();
  for (const m of Game.state.monsters) {
    if (m.hp <= 0 || m.battleLocked) continue;
    for (const e of Game.state.monsters) {
      if (e === m || e.hp <= 0 || e.faction === m.faction || e.battleLocked) continue;
      if (e.gridR !== m.gridR || e.gridC !== m.gridC) continue;
      const compatMul = getAffinityMult(m.type, e.type);
      const dmg       = m.atk * compatMul;
      const hpBefore  = e.hp;
      e.hp -= dmg;
      foughtThisTurn.add(m);
      foughtThisTurn.add(e);
      if (hpBefore > 0 && e.hp <= 0) {
        GameLog.event('ai_battle_kill', {
          r: e.gridR, c: e.gridC,
          attackerType: m.type,    defenderType: e.type,
          attackerFaction: m.faction, defenderFaction: e.faction,
          compatMul, finalDamage: dmg,
        });
      }
    }
  }
  // 死亡ユニット除去
  Game.state.monsters = Game.state.monsters.filter(m => m.hp > 0);

  // ③ 陣営 AI 状態更新（回復・退却・クリスタル奪取・パス計算）
  updateTerritoryAI(foughtThisTurn);

  // ④ 移動先を決定
  for (const m of Game.state.monsters) {
    if (m.battleLocked) {
      reserved.add(`${m.gridR},${m.gridC}`);
      continue;
    }

    // アグロリセット
    m.aggroed = false;

    let target = null;
    if (!foughtThisTurn.has(m)) {
      // アグロ判定（human以外・retreating/healing でない場合のみ）
      const aggroRange = UNIT_DEFS[m.type]?.aggroRange ?? 0;
      if (aggroRange > 0 && m.faction !== 'human' && !m.retreating && !m.healing) {
        const dist = Math.abs(m.gridR - pDestR) + Math.abs(m.gridC - pDestC);
        if (dist <= aggroRange) {
          m.aggroed = true;
          const pathToPlayer = bfsPath(Game.state.grid, m.gridR, m.gridC, pDestR, pDestC);
          if (pathToPlayer.length > 0) {
            const step = pathToPlayer[0];
            if (!reserved.has(`${step.r},${step.c}`)) {
              target = step;
            }
          }
          // プレイヤー方向へ進めない場合は徘徊
          if (!target) target = pickWanderTargetTurn(m, reserved);
        }
      }

      if (!target) target = pickTerritoryMoveTurn(m, reserved);
    }

    if (target) {
      m.targetR = target.r; m.targetC = target.c;
      reserved.add(`${target.r},${target.c}`);
    } else {
      reserved.add(`${m.gridR},${m.gridC}`);
    }
  }

  // ④-b スワップ衝突検出
  // A→Bの現在マス、B→Aの現在マス という位置交換を検出し、
  // 異陣営なら戦闘させて両者の移動をキャンセルする。
  const monsters = Game.state.monsters;
  for (let i = 0; i < monsters.length; i++) {
    const a = monsters[i];
    if (a.targetR < 0) continue;
    for (let j = i + 1; j < monsters.length; j++) {
      const b = monsters[j];
      if (b.targetR < 0) continue;
      if (a.targetR === b.gridR && a.targetC === b.gridC &&
          b.targetR === a.gridR && b.targetC === a.gridC) {
        a.targetR = -1; a.targetC = -1;
        b.targetR = -1; b.targetC = -1;
        if (a.faction !== b.faction) {
          const aHpBefore = a.hp, bHpBefore = b.hp;
          const aMul = getAffinityMult(b.type, a.type);
          const bMul = getAffinityMult(a.type, b.type);
          const aDmg = b.atk * aMul;
          const bDmg = a.atk * bMul;
          a.hp -= aDmg;
          b.hp -= bDmg;
          if (aHpBefore > 0 && a.hp <= 0) {
            GameLog.event('ai_battle_kill', {
              r: a.gridR, c: a.gridC,
              attackerType: b.type, defenderType: a.type,
              attackerFaction: b.faction, defenderFaction: a.faction,
              compatMul: aMul, finalDamage: aDmg,
            });
          }
          if (bHpBefore > 0 && b.hp <= 0) {
            GameLog.event('ai_battle_kill', {
              r: b.gridR, c: b.gridC,
              attackerType: a.type, defenderType: b.type,
              attackerFaction: a.faction, defenderFaction: b.faction,
              compatMul: bMul, finalDamage: bDmg,
            });
          }
        }
      }
    }
  }
  Game.state.monsters = Game.state.monsters.filter(m => m.hp > 0);

  // ⑤ 移動適用（即時 or アニメーション）
  if (skipAnimation) {
    for (const m of Game.state.monsters) {
      if (m.targetR < 0) continue;
      m.facing  = facingFromMove(m.gridR, m.gridC, m.targetR, m.targetC);
      m.gridR   = m.targetR;  m.gridC   = m.targetC;
      m.pos.x   = (m.targetC + 0.5) * CELL_SIZE;
      m.pos.y   = (m.targetR + 0.5) * CELL_SIZE;
      m.targetR = -1;         m.targetC = -1;
      m.moving  = false;
    }
    Game.flags.monstersAnimating = false;
  } else {
    let anyMoving = false;
    for (const m of Game.state.monsters) {
      if (m.targetR < 0) continue;
      m.moveFrom     = new Vec2(m.pos.x, m.pos.y);
      m.moveTo       = new Vec2((m.targetC + 0.5) * CELL_SIZE, (m.targetR + 0.5) * CELL_SIZE);
      m.moveProgress = 0;
      m.moving       = true;
      anyMoving      = true;
    }
    Game.flags.monstersAnimating = anyMoving;
  }

  // ⑥ クリスタルスポーンタイマー
  updateCrystals();

  // ⑦ ログ用 timeline_snapshot（10ターン毎）
  GameLog.snapshot();

  // 通常移動時のみバンプチェックを予約（バトル中ターンや即時処理では発火しない）
  if (!skipAnimation) Game.flags.pendingBumpCheck = true;
}

// =====================
// アニメーション更新（毎フレーム）
// =====================
function animateMonsters() {
  if (!Game.flags.monstersAnimating) return;

  let anyStillMoving = false;
  for (const m of Game.state.monsters) {
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
  Game.flags.monstersAnimating = anyStillMoving;
}

// =====================
// プレイヤー接触チェック（Phase 6 でバトル画面へ）
// =====================
function checkMonsterContact() {
  if (Game.state.battleState) return;
  const player = Game.state.player;
  for (const m of Game.state.monsters) {
    if (m.hp > 0 && !m.battleLocked &&
        m.gridR === player.gridR && m.gridC === player.gridC &&
        m.faction !== 'human') {
      startBattle(m);
      return;
    }
  }
}

// アグロ状態のNPCがプレイヤー隣接マスからバンプ攻撃を仕掛ける
function checkMonsterBumpPlayer() {
  if (Game.state.battleState) return;
  const player = Game.state.player;
  for (const m of Game.state.monsters) {
    if (!m.aggroed || m.hp <= 0 || m.battleLocked) continue;
    const dist = Math.abs(m.gridR - player.gridR) + Math.abs(m.gridC - player.gridC);
    if (dist === 1) {
      logMessage(`⚔ ${FACTIONS[m.faction].name}が襲いかかってきた！`, 'battle');
      startBattle(m);
      return;
    }
  }
}
