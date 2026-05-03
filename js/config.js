// =====================
// Layout regions
// =====================
const CANVAS_W = 1000;
const CANVAS_H = 700;
const VIEW3D    = { x: 0,   y: 0,   w: 740, h: 500 };
const MINIMAP   = { x: 740, y: 0,   w: 260, h: 260 };
const UI_RIGHT  = { x: 740, y: 260, w: 260, h: 240 };
const UI_BOTTOM = { x: 0,   y: 500, w: 1000, h: 200 };

// =====================
// Maze params
// =====================
const GRID_SIZE  = 51;
const LOOP_COUNT = 200;

// =====================
// 固定設定
// =====================
const CELL_SIZE              = 40;
const RAY_COUNT              = 300;
const WALL_HEIGHT_CONST      = 18000;
const MIN_DIST               = 0.0001;
const SAME_CELL_DEPTH_OFFSET = 8;  // 同一マス複数ユニットの奥行きオフセット（world単位）

const MOVE_FRAMES   = 8;
const ROT_FRAMES    = 6;
const ROT_SPRING_K  = 0.10;  // 回転スプリング係数（0.10=なめらか〜0.40=キビキビ）

// 向き定義: 0=N 1=E 2=S 3=W
const FACING_DIRS = [
  { dr: -1, dc:  0 },
  { dr:  0, dc:  1 },
  { dr:  1, dc:  0 },
  { dr:  0, dc: -1 },
];
const FACING_ANGLES = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];
const FACING_NAMES  = ['N', 'E', 'S', 'W'];

// Monster AI
const PATH_REFRESH = 3;   // ターン数ごとに BFS を再計算
const TARGET_RESELECT_INTERVAL = 15; // ターゲットクリスタルを定期再評価するターン数

// Retro texture
const RETRO_STEP     = 5;
const TEXTURE_PERIOD = 40;
const TEXTURE_PILLAR = 8;

const MINIMAP_VIEW_CELLS    = 7;
const MINIMAP_DETAIL_RADIUS = 2;  // プレイヤー中心の詳細表示半径（チェビシェフ距離・5×5相当）

// クリスタルグロー（床と壁を陣営色で照らす）
const CRYSTAL_GLOW_RADIUS_CELLS = 3.0;   // 半径（セル単位）
const CRYSTAL_GLOW_ALPHA_CENTER = 0.65;  // 中心の濃度（線形フォールオフ）
const CRYSTAL_GLOW_WALL_RATIO   = 0.7;   // 壁の濃度比（白飛び抑制）

// 床の陣営占有色（ブロック支配を3D側で可視化）
const FLOOR_FACTION_TINT_ALPHA  = 0.15;  // 床に乗せる陣営色の濃度（中立は塗らない）

// =====================
// Factions（4 陣営 + 中立）
// =====================
const FACTIONS = {
  human:   { name: '人間族',   color: '#4488ff' },
  goblin:  { name: 'ゴブリン', color: '#44cc44' },
  lizard:  { name: 'リザード', color: '#ff8844' },
  ogre:    { name: 'オーガ',   color: '#cc44cc' },
  neutral: { name: '中立',     color: '#666666' },
};

// =====================
// ブロック分割（5×5 = 25ブロック、プレイ範囲 row/col 1〜49）
// 列幅: 10,10,9,10,10 / 行高: 10,10,9,10,10（歪みを中央に集約）
// =====================
const BLOCK_COL_STARTS = [1,  11, 21, 30, 40];
const BLOCK_COL_ENDS   = [10, 20, 29, 39, 49];
const BLOCK_ROW_STARTS = [1,  11, 21, 30, 40];
const BLOCK_ROW_ENDS   = [10, 20, 29, 39, 49];

// 5×5 初期所有者マップ（行index × 列index）
const BLOCK_INIT_OWNER = [
  ['human',   'human',   'neutral', 'goblin',  'goblin' ],
  ['human',   'neutral', 'neutral', 'neutral', 'goblin' ],
  ['neutral', 'neutral', 'neutral', 'neutral', 'neutral'],
  ['lizard',  'neutral', 'neutral', 'neutral', 'ogre'   ],
  ['lizard',  'lizard',  'neutral', 'ogre',    'ogre'   ],
];

// 各陣営の本拠ブロック（BFS連結の起点）
const FACTION_HOME_BLOCKS = {
  human:  [[0,0],[0,1],[1,0]],
  goblin: [[0,4],[0,3],[1,4]],
  lizard: [[4,0],[4,1],[3,0]],
  ogre:   [[4,4],[4,3],[3,4]],
};

// セル → 所属ブロック [bR, bC]（範囲外は null）
const cellToBlock = (() => {
  const t = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
  for (let bR = 0; bR < 5; bR++) {
    for (let bC = 0; bC < 5; bC++) {
      for (let r = BLOCK_ROW_STARTS[bR]; r <= BLOCK_ROW_ENDS[bR]; r++) {
        for (let c = BLOCK_COL_STARTS[bC]; c <= BLOCK_COL_ENDS[bC]; c++) {
          t[r][c] = [bR, bC];
        }
      }
    }
  }
  return t;
})();

// 床描画ホットループ用：セル → ブロック平坦インデックス（0〜24、ブロック外は 25 = sentinel）
// ブロック陣営色テーブルの末尾に常に 0 のスロットを置けば条件分岐ゼロで加算できる
const CELL_BLOCK_NONE = 25;
const cellBlockIdx = (() => {
  const t = new Uint8Array(GRID_SIZE * GRID_SIZE);
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const b = cellToBlock[r][c];
      t[r * GRID_SIZE + c] = b ? b[0] * 5 + b[1] : CELL_BLOCK_NONE;
    }
  }
  return t;
})();

// =====================
// Crystal spawn intervals (turns)
// =====================
const HUMAN_SPAWN_COOLDOWN = 13;
const AI_SPAWN             = { goblin: 8, lizard: 13, ogre: 18 };
const UNIT_CAP_MAX         = 100;
const UNIT_CAP_PER_CRYSTAL = 5;

// =====================
// Unit definitions（playtest.html と同値）
// =====================
const UNIT_DEFS = {
  human:  { hp: 35, atk: 5, faction: 'human',  sizeScale: 1.00 },
  elf:    { hp: 30, atk: 6, faction: 'human',  sizeScale: 1.00 },
  dwarf:  { hp: 40, atk: 4, faction: 'human',  sizeScale: 0.85 },
  goblin: { hp: 28, atk: 5, faction: 'goblin', sizeScale: 0.65, aggroRange: 1 },
  lizard: { hp: 28, atk: 7, faction: 'lizard', sizeScale: 1.00, aggroRange: 2 },
  ogre:   { hp: 44, atk: 6, faction: 'ogre',   sizeScale: 1.10, aggroRange: 3 },
};

const AI_UNIT          = { goblin: 'goblin', lizard: 'lizard', ogre: 'ogre' };
const HUMAN_AUTO_TYPES = ['human', 'elf', 'dwarf'];

// 相性デバフ（攻撃側-防御側 → ダメージ×0.7）
const AFFINITY_DEBUFF = new Set([
  'human-goblin', 'elf-lizard',   'dwarf-ogre',
  'goblin-ogre',  'lizard-goblin', 'ogre-lizard',
]);
function getAffinityMult(attackerType, defenderType) {
  return AFFINITY_DEBUFF.has(`${attackerType}-${defenderType}`) ? 0.7 : 1.0;
}

// =====================
// 6 種族 × 4 方向スプライト
// =====================
const UNIT_TYPES  = ['human', 'elf', 'dwarf', 'goblin', 'lizard', 'ogre'];
const SPRITE_DIRS = ['front', 'back', 'left', 'right'];
const UNIT_SPRITES = {};
for (const type of UNIT_TYPES) {
  UNIT_SPRITES[type] = {};
  for (const dir of SPRITE_DIRS) {
    const img = new Image();
    img.src = `assets/monsters/${type}_${dir}.png`;
    UNIT_SPRITES[type][dir] = img;
  }
}

// =====================
// Math helpers
// =====================
class Vec2 {
  constructor(x, y) { this.x = x; this.y = y; }
  add(v) { return new Vec2(this.x + v.x, this.y + v.y); }
  sub(v) { return new Vec2(this.x - v.x, this.y - v.y); }
  mul(s) { return new Vec2(this.x * s, this.y * s); }
  len() { return Math.hypot(this.x, this.y); }
}

class Segment {
  constructor(a, b, col = [150, 160, 150]) {
    this.a = a; this.b = b; this.col = col;
  }
}

function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

function normalizeAngle(a) {
  while (a >  Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

function intersectRaySegment(rayOrigin, rayDir, segA, segB) {
  const r   = rayDir;
  const s   = segB.sub(segA);
  const rxs = r.x * s.y - r.y * s.x;
  const q_p = segA.sub(rayOrigin);
  if (Math.abs(rxs) < 1e-9) return { hit: false };
  const t = (q_p.x * s.y - q_p.y * s.x) / rxs;
  const u = (q_p.x * r.y - q_p.y * r.x) / rxs;
  if (t >= 0 && u >= 0 && u <= 1) {
    return { hit: true, point: rayOrigin.add(r.mul(t)), t, u };
  }
  return { hit: false };
}

function wallTextureU(segA, segB, u01) {
  return u01 * segB.sub(segA).len();
}

function smoothstep(t) { return t * t * (3 - 2 * t); }

// 配列をその場でシャッフル（Fisher-Yates）
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// HP比率（0-1）→ 表示色
function hpColorFor(ratio) {
  return ratio > 0.5 ? '#44cc44' : ratio > 0.25 ? '#cccc44' : '#cc4444';
}

// '#rrggbb' → [r, g, b]
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

// =====================
// プレイヤー定数
// =====================
const PLAYER_INIT = { hp: 40, atk: 7, rec: 5, agi: 10 };
const FLEE_BASE   = 0.5;
function goldDrop() { return 10 + Math.floor(Math.random() * 11); }

const UNIT_NAMES = {
  human: '人間', elf: 'エルフ', dwarf: 'ドワーフ',
  goblin: 'ゴブリン', lizard: 'リザード', ogre: 'オーガ',
};

// =====================
// Shop pool（playtest.html より移植）
// =====================
const SHOP_POOL = [
  { slot: 'weapon', name: '鉄の剣',             price: 30,  mod: { atk: 2 } },
  { slot: 'weapon', name: '鋼の剣',             price: 90,  mod: { atk: 4 } },
  { slot: 'weapon', name: 'ミスリル剣',         price: 200, mod: { atk: 7 } },
  { slot: 'weapon', name: 'ゴブリン特攻の剣',   price: 70,  mod: { atk: 3 }, bonus: { goblin: 2.0 } },
  { slot: 'weapon', name: 'リザード特攻の槍',   price: 70,  mod: { atk: 3 }, bonus: { lizard: 2.0 } },
  { slot: 'weapon', name: 'オーガ特攻の大剣',   price: 70,  mod: { atk: 3 }, bonus: { ogre:   2.0 } },
  { slot: 'armor',  name: '革の鎧',             price: 30,  mod: { hp: 8 } },
  { slot: 'armor',  name: '鎖帷子',             price: 80,  mod: { hp: 18 } },
  { slot: 'armor',  name: '板金鎧',             price: 180, mod: { hp: 35 } },
  { slot: 'accessory', name: '治癒の指輪',       price: 40,  mod: { rec: 3 } },
  { slot: 'accessory', name: '大治癒の指輪',     price: 120, mod: { rec: 8 } },
  { slot: 'accessory', name: '疾風のブーツ',     price: 50,  mod: { agi: 10 } },
  { slot: 'accessory', name: '駿足のブーツ',     price: 130, mod: { agi: 25 } },
  { slot: 'accessory', name: '力のブレスレット', price: 60,  mod: { atk: 1 } },
];
const SHOP_ROLL_N = 5;
