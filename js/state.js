// =====================
// 全ファイル共通のゲーム状態（実行時に変わる値）
// 純粋な定数は config.js に置くこと
// =====================

/**
 * @typedef {Object} Crystal
 * @property {number} r              グリッド行
 * @property {number} c              グリッド列
 * @property {'human'|'goblin'|'lizard'|'ogre'|'neutral'} owner
 * @property {number} spawnTimer     スポーン用ターンカウンタ
 * @property {number} blockR         所属ブロック行（0..4）
 * @property {number} blockC         所属ブロック列（0..4）
 * @property {boolean} valid         本拠から連結しているか（飛び地は false）
 * @property {boolean} discovered    一度でも人間族所有になったか（マップ表示判定用、永続）
 */

/**
 * @typedef {Object} Monster
 * @property {'human'|'elf'|'dwarf'|'goblin'|'lizard'|'ogre'} type
 * @property {'human'|'goblin'|'lizard'|'ogre'} faction
 * @property {number} hp
 * @property {number} maxHp
 * @property {number} atk
 * @property {Vec2}   pos                 ピクセル座標
 * @property {number} gridR
 * @property {number} gridC
 * @property {number} targetR             移動先行（-1 は移動なし）
 * @property {number} targetC
 * @property {boolean} moving
 * @property {Vec2}   moveFrom
 * @property {Vec2}   moveTo
 * @property {number} moveProgress        0..1
 * @property {0|1|2|3} facing             N/E/S/W
 * @property {{r:number,c:number}[]} path BFS で得た経路
 * @property {Crystal|null} targetCrystal
 * @property {boolean} retreating
 * @property {Crystal|null} retreatTarget
 * @property {boolean} healing
 * @property {number} pathRefreshTimer
 * @property {number} targetRefreshTimer
 * @property {boolean} battleLocked       バトル中フラグ
 * @property {boolean} aggroed            プレイヤーに反応中
 */

/**
 * @typedef {Object} EquipItem
 * @property {'weapon'|'armor'|'accessory'} slot
 * @property {string} name
 * @property {number} price
 * @property {{ hp?:number, atk?:number, rec?:number, agi?:number }} mod
 * @property {Object<string,number>} [bonus]   種族特攻倍率
 */

/**
 * @typedef {Object} Player
 * @property {Vec2}   pos
 * @property {number} angle              論理角度（即時確定）
 * @property {number} visualAngle        スプリング追従角度（描画用）
 * @property {number} fov
 * @property {number} gridR
 * @property {number} gridC
 * @property {0|1|2|3} facing
 * @property {boolean} moving
 * @property {Vec2}   moveFrom
 * @property {Vec2}   moveTo
 * @property {number} moveProgress
 * @property {number} nextGridR
 * @property {number} nextGridC
 * @property {number} hp
 * @property {number} gold
 * @property {{ weapon: EquipItem|null, armor: EquipItem|null, accessory: EquipItem|null }} equip
 */

/**
 * @typedef {Object} BattleState
 * @property {'human'|'goblin'|'lizard'|'ogre'} enemyRace
 * @property {Monster[]} enemies          敵パーティ（最大5）
 * @property {Monster[]} allyUnits        味方NPC（最大4 / +Player）
 * @property {string[]}  log              新→古
 * @property {number|null} selectedTarget 敵スロットインデックス
 * @property {0|1} selectedCommand        0=戦う / 1=逃げる
 */

/**
 * @typedef {Object} LogEntry
 * @property {string} text
 * @property {'occupy'|'battle'|'discover'|'reward'|'system'} category
 * @property {number} count               連続重複の回数
 */

/**
 * @typedef {Object} Wall
 * @property {Vec2} a
 * @property {Vec2} b
 * @property {[number,number,number]} col RGB
 */

const Game = {
  state: {
    // World
    grid:     null,
    walls:    [],   // 全壁（デバッグ・互換用）
    wallsH:   [],   // 水平壁（a.y === b.y） — castRays が rdy 符号で半カット
    wallsV:   [],   // 垂直壁（a.x === b.x） — castRays が rdx 符号で半カット
    explored: [],

    // Entities
    monsters:            [],
    crystals:            [],
    crystalAtCell:       null,
    crystalByBlock:      null,
    humanAutoSpawnIndex: 0,

    // Player（player.js で初期化）
    player: null,

    // Turn / Log
    worldTurn:  0,
    messageLog: [],

    // Modal / interaction
    battleState:     null,
    shopItems:       null,
    shopSelectedIdx: 0,
    onCrystal:       null,
  },
  flags: {
    monstersAnimating:   false,
    pendingBumpCheck:    false,
    battleNeedsRerender: false,
    gameEnded:           false,
    fullMapOpen:         false,
    restartConfirmOpen:  false,
  },
};
