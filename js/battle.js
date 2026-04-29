let battleState         = null;
let battleNeedsRerender = false;
let gameEnded           = false;

// =====================
// バトル開始
// =====================
function startBattle(contactEnemy) {
  if (battleState) return;
  if (contactEnemy.hp <= 0) return;  // ワールドターン中に撃破済みなら開始しない

  const race = contactEnemy.faction;

  // 敵陣形：接触1体 + 同種族で接触セルから隣接8マス（最大5体）
  const enemies = [contactEnemy];
  for (const m of monsters) {
    if (m === contactEnemy || m.hp <= 0 || m.faction !== race) continue;
    if (Math.abs(m.gridR - contactEnemy.gridR) <= 1 &&
        Math.abs(m.gridC - contactEnemy.gridC) <= 1) {
      if (enemies.length < 5) enemies.push(m);
    }
  }

  // 味方陣形：人間族AIでプレイヤーから隣接8マス（最大4体）
  const allyUnits = [];
  for (const m of monsters) {
    if (m.hp <= 0 || m.faction !== 'human') continue;
    if (Math.abs(m.gridR - player.gridR) <= 1 &&
        Math.abs(m.gridC - player.gridC) <= 1) {
      if (allyUnits.length < 4) allyUnits.push(m);
    }
  }

  for (const e of enemies)   e.battleLocked = true;
  for (const a of allyUnits) a.battleLocked = true;

  battleState = {
    enemyRace:       race,
    enemies,
    allyUnits,
    log:             [`⚔ ${FACTIONS[race].name}との戦闘開始！`],
    selectedTarget:  0,
    selectedCommand: 0,
  };

  document.getElementById('battle-panel').hidden = false;
  renderBattle();
}

// =====================
// バトル画面描画
// =====================
const BATTLE_SLOTS = 5;

function _renderUnitCard(unit, opts) {
  // unit: monster object or { isPlayer: true } or null（空きスロット）
  if (!unit) {
    return `<div class="battle-unit empty"><div class="unit-info"></div></div>`;
  }
  if (unit.isPlayer) {
    const s        = playerStats();
    const pHp      = Math.max(0, Math.ceil(player.hp));
    const pHpPct   = Math.round(pHp / s.hp * 100);
    const pHpColor = hpColorFor(pHp / s.hp);
    return `<div class="battle-unit player">
      <canvas class="unit-sprite" width="48" height="48"
        data-type="player" data-hp="${pHp}" data-maxhp="${s.hp}"></canvas>
      <div class="unit-info">
        <div class="unit-name">プレイヤー</div>
        <div class="unit-stats">HP ${pHp}/${s.hp}　ATK ${playerAtkVs(battleState.enemyRace)}</div>
        <div class="unit-hpbar">
          <div class="unit-hpbar-fill" style="width:${pHpPct}%;background:${pHpColor}"></div>
        </div>
      </div>
    </div>`;
  }
  const dead     = unit.hp <= 0;
  const selected = opts.selected && !dead;
  const hp       = Math.max(0, Math.ceil(unit.hp));
  const hpPct    = Math.round(hp / unit.maxHp * 100);
  const hpColor  = hpColorFor(hp / unit.maxHp);
  const cls = ['battle-unit',
    dead ? 'dead' : (opts.targetable ? 'target-btn' : ''),
    selected ? 'selected' : '',
  ].filter(Boolean).join(' ');
  const onclick = !dead && opts.targetable ? `onclick="selectBattleTarget(${opts.idx})"` : '';
  return `<div class="${cls}" ${onclick}>
    <canvas class="unit-sprite" width="48" height="48"
      data-type="${unit.type}" data-hp="${hp}" data-maxhp="${unit.maxHp}"></canvas>
    <div class="unit-info">
      <div class="unit-name">${UNIT_NAMES[unit.type] ?? unit.type}</div>
      <div class="unit-stats">${dead ? '撃破' : `HP ${hp}/${unit.maxHp}　ATK ${unit.atk}`}</div>
      ${!dead ? `<div class="unit-hpbar">
        <div class="unit-hpbar-fill" style="width:${hpPct}%;background:${hpColor}"></div>
      </div>` : ''}
    </div>
  </div>`;
}

function renderBattle() {
  if (!battleState) return;

  document.getElementById('battle-enemy-name').textContent =
    FACTIONS[battleState.enemyRace].name;

  // 味方/敵 数表示
  const enemyAlive = battleState.enemies.filter(e => e.hp > 0).length;
  const allyAlive  = 1 + battleState.allyUnits.filter(a => a.hp > 0).length; // +player
  const countEl = document.getElementById('battle-counts');
  if (countEl) countEl.textContent = `味方 ${allyAlive} / 敵 ${enemyAlive}`;

  // 敵リスト：5スロット固定
  let enemyHtml = '';
  for (let i = 0; i < BATTLE_SLOTS; i++) {
    const e = battleState.enemies[i];
    enemyHtml += _renderUnitCard(e ?? null, {
      idx: i,
      selected:   battleState.selectedTarget === i,
      targetable: true,
    });
  }
  document.getElementById('battle-enemy-list').innerHTML = enemyHtml;

  // 味方リスト：プレイヤー先頭 + AI 4枠 = 5スロット固定
  let allyHtml = _renderUnitCard({ isPlayer: true }, {});
  for (let i = 0; i < BATTLE_SLOTS - 1; i++) {
    const a = battleState.allyUnits[i];
    allyHtml += _renderUnitCard(a ?? null, { idx: i, selected: false, targetable: false });
  }
  document.getElementById('battle-ally-list').innerHTML = allyHtml;

  // ── 行動情報欄 ──
  const target = battleState.selectedTarget !== null
    ? battleState.enemies[battleState.selectedTarget]
    : null;
  const isFlee   = battleState.selectedCommand === 1;
  const cmdLabel = isFlee ? '逃げる' : '戦う';
  let targetText  = '—';
  let dmgText     = '—';
  let affinText   = '—';
  if (!isFlee && target && target.hp > 0) {
    targetText = UNIT_NAMES[target.type] ?? target.type;
    dmgText    = String(playerAtkVs(target.type));
    affinText  = AFFINITY_DEBUFF.has(`human-${target.type}`) ? '相性不利 ×0.7' : '通常';
  } else if (isFlee) {
    const { agi } = playerStats();
    const chance  = Math.min(0.95, Math.max(0.1, FLEE_BASE + (agi - 10) * 0.02));
    targetText = '—';
    dmgText    = `成功率 ${Math.round(chance * 100)}%`;
    affinText  = '—';
  }
  const setField = (id, txt) => {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  };
  setField('battle-info-target', targetText);
  setField('battle-info-cmd',    cmdLabel);
  setField('battle-info-dmg',    dmgText);
  setField('battle-info-affin',  affinText);

  // ボタン状態
  const fightBtn = document.getElementById('btn-fight');
  const fleeBtn  = document.getElementById('btn-flee');
  fightBtn.disabled = battleState.selectedCommand === 0 && battleState.selectedTarget === null;
  fightBtn.classList.toggle('kb-selected', battleState.selectedCommand === 0);
  fleeBtn.classList.toggle('kb-selected',  battleState.selectedCommand === 1);

  // ログ
  document.getElementById('battle-log').innerHTML =
    battleState.log.slice(0, 20).map(l => `<p>${l}</p>`).join('');

  // スプライト描画
  _renderBattleSprites();
}

function _renderBattleSprites() {
  document.querySelectorAll('#battle-panel .unit-sprite').forEach(el => {
    const type  = el.dataset.type;
    const hp    = parseFloat(el.dataset.hp);
    const maxHp = parseFloat(el.dataset.maxhp);
    const ratio = maxHp > 0 ? hp / maxHp : 0;
    const oc    = _getSpriteCanvas(type, ratio);
    const c2    = el.getContext('2d');
    c2.clearRect(0, 0, el.width, el.height);
    c2.drawImage(oc, 0, 0, el.width, el.height);
  });
}

// =====================
// ターゲット選択（クリック）
// =====================
function selectBattleTarget(idx) {
  if (!battleState || battleState.enemies[idx]?.hp <= 0) return;
  battleState.selectedTarget = idx;
  renderBattle();
}

// =====================
// 「戦う」実行
// =====================
function battleAttack(targetIdx) {
  if (!battleState) return;
  const target = battleState.enemies[targetIdx];
  if (!target || target.hp <= 0) return;

  // プレイヤー攻撃
  const dmg = playerAtkVs(target.type);
  target.hp -= dmg;
  battleState.log.unshift(`プレイヤー → ${UNIT_NAMES[target.type]}に ${dmg} ダメージ`);
  if (target.hp <= 0) {
    const g = goldDrop();
    player.gold += g;
    battleState.log.unshift(`${UNIT_NAMES[target.type]} 撃破！ +${g} GOLD`);
  }

  // 味方NPC攻撃（各々が生存敵をランダム攻撃）
  for (const a of battleState.allyUnits) {
    if (a.hp <= 0) continue;
    const alive = battleState.enemies.filter(e => e.hp > 0);
    if (alive.length === 0) break;
    const t    = alive[Math.floor(Math.random() * alive.length)];
    const mult = getAffinityMult(a.type, t.type);
    const d    = Math.max(1, Math.floor(a.atk * mult));
    t.hp -= d;
    battleState.log.unshift(`${UNIT_NAMES[a.type]} → ${UNIT_NAMES[t.type]}に ${d} ダメージ`);
    if (t.hp <= 0) {
      const g = goldDrop();
      player.gold += g;
      battleState.log.unshift(`${UNIT_NAMES[t.type]} 撃破！ +${g} GOLD`);
    }
  }

  // 敵全滅判定
  if (battleState.enemies.every(e => e.hp <= 0)) {
    battleState.log.unshift('✨ 戦闘勝利！');
    _worldTurnForBattle();
    endBattle('win');
    return;
  }

  // 敵のカウンター攻撃
  _enemyBattleTurn();

  // ワールドターン（アニメーション開始）
  _worldTurnForBattle();

  if (player.hp <= 0) {
    endBattle('dead');
    return;
  }

  // 次ターゲット自動選択 → 即時再描画
  const nextIdx = battleState.enemies.findIndex(e => e.hp > 0);
  battleState.selectedTarget = nextIdx >= 0 ? nextIdx : null;
  if (battleState) renderBattle();
}

// =====================
// 「逃げる」実行
// =====================
function battleFlee() {
  if (!battleState) return;
  const { agi } = playerStats();
  const chance  = Math.min(0.95, Math.max(0.1, FLEE_BASE + (agi - 10) * 0.02));

  if (Math.random() < chance) {
    battleState.log.unshift(`逃走成功！ (確率 ${Math.round(chance * 100)}%)`);
    _worldTurnForBattle();
    endBattle('flee');
  } else {
    battleState.log.unshift(`逃走失敗！ (確率 ${Math.round(chance * 100)}%)`);
    _enemyBattleTurn();
    _worldTurnForBattle();
    if (player.hp <= 0) {
      endBattle('dead');
      return;
    }
    if (battleState) renderBattle();
  }
}

// =====================
// 敵ターン
// =====================
function _enemyBattleTurn() {
  for (const e of battleState.enemies) {
    if (e.hp <= 0) continue;
    // ターゲットプール：プレイヤー + 生存味方NPC
    const pool = [{ isPlayer: true }].concat(
      battleState.allyUnits.filter(a => a.hp > 0).map(a => ({ isPlayer: false, ref: a }))
    );
    if (pool.length === 0) break;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (pick.isPlayer) {
      const mult = getAffinityMult(e.type, 'human');
      const d    = Math.max(1, Math.floor(e.atk * mult));
      player.hp -= d;
      battleState.log.unshift(`${UNIT_NAMES[e.type]} → プレイヤーに ${d} ダメージ`);
      if (player.hp <= 0) return;
    } else {
      const mult = getAffinityMult(e.type, pick.ref.type);
      const d    = Math.max(1, Math.floor(e.atk * mult));
      pick.ref.hp -= d;
      battleState.log.unshift(`${UNIT_NAMES[e.type]} → ${UNIT_NAMES[pick.ref.type]}に ${d} ダメージ`);
    }
  }
}

// =====================
// バトル中のワールドターン（Q3b: アニメーション付き）
// =====================
function _worldTurnForBattle() {
  triggerMonsterTurn(player.gridR, player.gridC, true); // Q3(a): 即時処理
}

// =====================
// バトル終了
// =====================
function endBattle(result) {
  for (const e of battleState.enemies)   e.battleLocked = false;
  for (const a of battleState.allyUnits) a.battleLocked = false;
  monsters = monsters.filter(m => m.hp > 0);

  const killerRace = battleState.enemyRace;
  battleState         = null;
  battleNeedsRerender = false;
  document.getElementById('battle-panel').hidden = true;

  updateOnCrystal();

  if (result === 'dead') {
    logMessage('💀 死亡... ゴールド半減、拠点に転送', 'battle');
    playerDeath(killerRace);
    checkWinLoss();
    return;
  }

  if (result === 'win') {
    logMessage('⚔ 戦闘勝利！', 'battle');
    const cr = crystalAtCell[player.gridR][player.gridC];
    if (cr && cr.owner !== 'human') {
      cr.owner = 'human'; cr.spawnTimer = 0;
      logMessage(`💎 クリスタルを占領！`, 'occupy');
    }
  } else if (result === 'flee') {
    logMessage('🏃 逃走成功', 'battle');
  }

  checkWinLoss();
}

// =====================
// 死亡処理
// =====================
function playerDeath(killerRace) {
  const humanCrystals = crystals.filter(c => c.owner === 'human');
  if (humanCrystals.length === 1) {
    // 最後の1拠点 → 敵に陥落させて敗北判定に委ねる
    humanCrystals[0].owner      = killerRace;
    humanCrystals[0].spawnTimer = 0;
    logMessage(`💥 最後の人間族クリスタルが${FACTIONS[killerRace].name}に陥落！`, 'occupy');
    return;
  }
  player.gold = Math.floor(player.gold / 2);
  const { hp } = playerStats();
  player.hp = hp;
  spawnPlayerAtHome();
  updateOnCrystal();
}

// =====================
// 勝敗判定
// =====================
function checkWinLoss() {
  if (gameEnded) return false;
  const humanCr   = crystals.filter(c => c.owner === 'human').length;
  const monsterCr = crystals.filter(c =>
    c.owner === 'goblin' || c.owner === 'lizard' || c.owner === 'ogre'
  ).length;
  if (humanCr === 0) {
    showResult('lose', '人間族のクリスタルが全て失われました');
    return true;
  }
  if (monsterCr === 0) {
    showResult('win', '全てのモンスタークリスタルを封印！');
    return true;
  }
  return false;
}

function showResult(kind, detail) {
  gameEnded = true;
  const title = document.getElementById('result-title');
  title.textContent = kind === 'win' ? '🎉 VICTORY' : '💀 DEFEAT';
  title.className   = 'result-title ' + (kind === 'win' ? 'result-win' : 'result-lose');
  document.getElementById('result-detail').textContent = `${detail}（${worldTurn} ターン）`;
  document.getElementById('result-screen').hidden = false;
  logMessage(kind === 'win' ? '🎉 VICTORY！' : '💀 DEFEAT...', 'system');
}

// =====================
// ボタンイベント登録
// =====================
document.getElementById('btn-fight').addEventListener('click', () => {
  if (monstersAnimating || !battleState) return;
  if (battleState.selectedTarget !== null) battleAttack(battleState.selectedTarget);
});
document.getElementById('btn-flee').addEventListener('click', () => {
  if (monstersAnimating || !battleState) return;
  battleFlee();
});
