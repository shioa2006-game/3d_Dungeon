// =====================
// gamelog v1 — バランス調整用の独立ログ
// 1ゲーム = 1ファイル / イベント駆動 / ゲーム終了時にブラウザダウンロード
// 詳細仕様：IMPL_NOTES.md ## 15
// =====================

const GAMELOG_SCHEMA_VERSION    = 1;
const GAMELOG_SNAPSHOT_INTERVAL = 10;   // ターン毎の factionTimeline サンプリング間隔

const GameLog = (() => {
  let session = null;
  let enabled = true;  // タイトル画面のチェックボックスで設定。false なら全メソッドが no-op

  function setEnabled(b) {
    enabled = !!b;
    if (!enabled) session = null;  // 無効化時は進行中セッションも破棄
  }

  function _uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function _ts()   { return new Date().toISOString(); }
  function _turn() { return Game.state.worldTurn; }

  function _snapshotCounts() {
    const factionCrystals = { human: 0, goblin: 0, lizard: 0, ogre: 0, neutral: 0 };
    for (const cr of Game.state.crystals) factionCrystals[cr.owner]++;
    const factionUnits = { human: 0, goblin: 0, lizard: 0, ogre: 0 };
    for (const m of Game.state.monsters) factionUnits[m.faction]++;
    return { factionCrystals, factionUnits };
  }

  // 新規セッション開始（newMaze から呼ばれる。既存セッションは破棄）
  function start() {
    if (!enabled) { session = null; return; }
    session = {
      schemaVersion: GAMELOG_SCHEMA_VERSION,
      sessionId:     _uuid(),
      startedAt:     _ts(),
      endedAt:       null,
      result:        null,
      totalTurns:    0,
      config: {
        gridSize:           GRID_SIZE,
        unitStats:          Object.fromEntries(
          Object.entries(UNIT_DEFS).map(([k, v]) =>
            [k, { hp: v.hp, atk: v.atk, faction: v.faction }]
          )
        ),
        spawnIntervals:     { human: HUMAN_SPAWN_COOLDOWN, ...AI_SPAWN },
        compatibilityTable: Array.from(AFFINITY_DEBUFF),
        playerInitial:      { ...PLAYER_INIT },
        unitCapPerCrystal:  UNIT_CAP_PER_CRYSTAL,
        unitCapMax:         UNIT_CAP_MAX,
      },
      events: [],
    };
    event('session_start', {
      crystals: Game.state.crystals.map(cr => ({
        r: cr.r, c: cr.c, blockR: cr.blockR, blockC: cr.blockC, owner: cr.owner,
      })),
      monsters: Game.state.monsters.map(m => ({
        type: m.type, faction: m.faction, r: m.gridR, c: m.gridC,
      })),
      ..._snapshotCounts(),
    });
  }

  function event(type, payload) {
    if (!session) return;
    // Why: payload に type/turn キーがあった場合の上書き事故を防ぐため、これらは spread 後に書く
    session.events.push({ ...payload, turn: _turn(), type });
  }

  // 10 ターン毎に勢力数のサンプルを events に積む（utility）
  function snapshot() {
    if (!session) return;
    const turn = _turn();
    if (turn === 0 || turn % GAMELOG_SNAPSHOT_INTERVAL !== 0) return;
    const last = session.events[session.events.length - 1];
    if (last && last.type === 'timeline_snapshot' && last.turn === turn) return;
    event('timeline_snapshot', _snapshotCounts());
  }

  // ─────────── 終了時の summary 集計 ───────────
  function _computeSummary() {
    const finalCrystalsByFaction = { human: 0, goblin: 0, lizard: 0, ogre: 0, neutral: 0 };
    for (const cr of Game.state.crystals) finalCrystalsByFaction[cr.owner]++;

    const killMatrix          = {};
    const totalKillsByFaction = { human: 0, goblin: 0, lizard: 0, ogre: 0, player: 0 };
    const totalKillsByRace    = {};

    let directKills    = 0;
    let totalKillsAll  = 0;
    const directKillsByVictimRace = {};

    let crystalsCapturedByPlayer  = 0;
    let crystalsCapturedByHumanAI = 0;

    let battlesWon = 0, battlesEscaped = 0, battlesLost = 0;
    let goldEarned = 0, goldSpent = 0, deaths = 0;
    let healUses   = 0, healHpTotal = 0;
    let shopOpens  = 0, shopPurchases = 0;

    const factionCrystalTimeline = { human: [], goblin: [], lizard: [], ogre: [], neutral: [] };
    const factionUnitTimeline    = { human: [], goblin: [], lizard: [], ogre: [] };

    const bumpKill = (obj, key) => { obj[key] = (obj[key] || 0) + 1; };

    for (const e of session.events) {
      switch (e.type) {
        case 'ai_battle_kill': {
          bumpKill(killMatrix,          `${e.attackerType}→${e.defenderType}`);
          bumpKill(totalKillsByFaction, e.attackerFaction);
          bumpKill(totalKillsByRace,    e.attackerType);
          totalKillsAll++;
          break;
        }
        case 'battle_kill': {
          const attackerKey = e.attacker.kind === 'player' ? 'player' : e.attacker.race;
          bumpKill(killMatrix,       `${attackerKey}→${e.victim.race}`);
          bumpKill(totalKillsByRace, attackerKey);
          if (e.attacker.kind === 'player') {
            bumpKill(totalKillsByFaction, 'player');
            directKills++;
            bumpKill(directKillsByVictimRace, e.victim.race);
          } else {
            bumpKill(totalKillsByFaction, 'human');
          }
          totalKillsAll++;
          break;
        }
        case 'crystal_capture': {
          if (e.toOwner === 'human') {
            if (e.capturer.kind === 'player') crystalsCapturedByPlayer++;
            else                              crystalsCapturedByHumanAI++;
          }
          break;
        }
        case 'battle_end': {
          if      (e.outcome === 'win')    battlesWon++;
          else if (e.outcome === 'escape') battlesEscaped++;
          else if (e.outcome === 'lose')   battlesLost++;
          if (e.goldGained) goldEarned += e.goldGained;
          break;
        }
        case 'shop_purchase': {
          shopPurchases++;
          if (typeof e.netPrice === 'number') goldSpent += e.netPrice;
          break;
        }
        case 'shop_open':    { shopOpens++; break; }
        case 'player_death': { deaths++;    break; }
        case 'player_heal':  {
          healUses++;
          healHpTotal += (e.hpAfter - e.hpBefore);
          break;
        }
        case 'timeline_snapshot': {
          for (const k of Object.keys(factionCrystalTimeline)) {
            factionCrystalTimeline[k].push({ turn: e.turn, n: e.factionCrystals[k] ?? 0 });
          }
          for (const k of Object.keys(factionUnitTimeline)) {
            factionUnitTimeline[k].push({ turn: e.turn, n: e.factionUnits[k] ?? 0 });
          }
          break;
        }
      }
    }

    const player = Game.state.player;
    const finalEquip = {
      weapon:    player.equip.weapon?.name    ?? null,
      armor:     player.equip.armor?.name     ?? null,
      accessory: player.equip.accessory?.name ?? null,
    };

    return {
      finalCrystalsByFaction,
      totalKills: { byFaction: totalKillsByFaction, byRace: totalKillsByRace },
      killMatrix,
      playerStats: {
        directKills,
        directKillsByVictimRace,
        totalKillsAll,
        playerKillRatio: totalKillsAll > 0 ? directKills / totalKillsAll : 0,
        deaths,
        goldEarned,
        goldSpent,
        goldFinal: player.gold,
        battlesWon, battlesEscaped, battlesLost,
        crystalsCapturedByPlayer,
        crystalsCapturedByHumanAI,
        healUses, healHpTotal,
        shopOpens, shopPurchases,
        finalEquip,
      },
      factionTimeline: {
        crystals: factionCrystalTimeline,
        units:    factionUnitTimeline,
      },
    };
  }

  function _filenameFor(result) {
    const d   = new Date();
    const pad = n => String(n).padStart(2, '0');
    const ymd = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`;
    const hms = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    return `gamelog_${ymd}_${hms}_${result}.json`;
  }

  function _download(filename, json) {
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
  }

  function end(result) {
    if (!session) return;
    session.endedAt    = _ts();
    session.result     = result;
    session.totalTurns = _turn();
    session.summary    = _computeSummary();
    _download(_filenameFor(result), session);
    session = null;
  }

  return { start, event, snapshot, end, setEnabled };
})();
