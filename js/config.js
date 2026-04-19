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
const CELL_SIZE         = 40;
const RAY_COUNT         = 300;
const WALL_HEIGHT_CONST = 18000;
const MIN_DIST          = 0.0001;

const MOVE_FRAMES = 8;
const ROT_FRAMES  = 6;

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
const DETECT_RANGE      = 5;
const LOSE_RANGE        = 7;
const LOSE_TIMER_TURNS  = 8;
const ALERT_DURATION    = 90;
const PATH_REFRESH      = 3;   // ターン数ごとに BFS を再計算

// Retro texture
const RETRO_STEP     = 5;
const TEXTURE_PERIOD = 40;
const TEXTURE_PILLAR = 8;

const MINIMAP_VIEW_CELLS = 7;

// =====================
// Factions（4 陣営 + 中立）
// zone: [r1, r2, c1, c2]
// =====================
const FACTIONS = {
  human:   { name: '人間族',   color: '#4488ff', zone: [0,  12, 0,  12] },
  goblin:  { name: 'ゴブリン', color: '#44cc44', zone: [0,  12, 38, 50] },
  lizard:  { name: 'リザード', color: '#ff8844', zone: [38, 50, 0,  12] },
  ogre:    { name: 'オーガ',   color: '#cc44cc', zone: [38, 50, 38, 50] },
  neutral: { name: '中立',     color: '#666666', zone: null },
};

// =====================
// Crystal spawn intervals (turns)
// =====================
const HUMAN_SPAWN_COOLDOWN = 10;
const AI_SPAWN             = { goblin: 11, lizard: 13, ogre: 18 };
const UNIT_CAP_MAX         = 100;
const UNIT_CAP_PER_CRYSTAL = 5;

// =====================
// Unit definitions（playtest.html と同値）
// =====================
const UNIT_DEFS = {
  human:  { hp: 35, atk: 5, faction: 'human'  },
  elf:    { hp: 30, atk: 6, faction: 'human'  },
  dwarf:  { hp: 40, atk: 4, faction: 'human'  },
  goblin: { hp: 28, atk: 5, faction: 'goblin' },
  lizard: { hp: 28, atk: 7, faction: 'lizard' },
  ogre:   { hp: 52, atk: 6, faction: 'ogre'   },
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
