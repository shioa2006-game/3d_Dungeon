const depthBuffer = new Array(RAY_COUNT).fill(Infinity);

// hits バッファは固定長で再利用（毎フレーム new しない）
const _hitsBuffer = new Array(RAY_COUNT);
for (let i = 0; i < RAY_COUNT; i++) {
  _hitsBuffer[i] = { hit: false, dist: Infinity, wall: null, rayAngle: 0, wallU01: 0 };
}

/**
 * Ray-casting：プレイヤー視点から RAY_COUNT 本のレイを発射し、
 * 各レイが最初に当たる壁を見つける。
 *
 * 最適化:
 *  - 水平壁/垂直壁を別々に持ち、レイ方向の符号で半分を即カット（wallsH/V）
 *  - 戻り値は固定バッファ _hitsBuffer を再利用（GC圧低減）
 */
function castRays() {
  const player = Game.state.player;
  const wallsH = Game.state.wallsH;
  const wallsV = Game.state.wallsV;
  const ox   = player.pos.x, oy = player.pos.y;
  const half = player.fov / 2;
  const base = player.visualAngle - half;
  const span = player.fov;

  for (let i = 0; i < RAY_COUNT; i++) {
    const rayAngle = base + span * i / (RAY_COUNT - 1);
    const rdx = Math.cos(rayAngle);
    const rdy = Math.sin(rayAngle);

    let bestDist = Infinity;
    let bestWall = null;
    let bestU    = 0;

    // 水平壁：レイの y 方向にある側のみ走査
    for (let k = 0; k < wallsH.length; k++) {
      const w = wallsH[k];
      // 半カット：水平壁は y 一定 → レイ y 方向に応じて前方のみ
      if (rdy > 0 ? w.a.y < oy : w.a.y > oy) continue;

      const sx  = w.b.x - w.a.x;        // sy=0（水平壁）
      const rxs = -rdy * sx;
      if (rxs > -1e-9 && rxs < 1e-9) continue;
      const qpx = w.a.x - ox, qpy = w.a.y - oy;
      const tVal = -qpy * sx / rxs;
      if (tVal < 0 || tVal >= bestDist) continue;
      const uVal = (qpx * rdy - qpy * rdx) / rxs;
      if (uVal < 0 || uVal > 1) continue;
      bestDist = tVal;
      bestWall = w;
      bestU    = uVal;
    }

    // 垂直壁：レイの x 方向にある側のみ走査
    for (let k = 0; k < wallsV.length; k++) {
      const w = wallsV[k];
      if (rdx > 0 ? w.a.x < ox : w.a.x > ox) continue;

      const sy  = w.b.y - w.a.y;        // sx=0（垂直壁）
      const rxs = rdx * sy;
      if (rxs > -1e-9 && rxs < 1e-9) continue;
      const qpx = w.a.x - ox, qpy = w.a.y - oy;
      const tVal = qpx * sy / rxs;
      if (tVal < 0 || tVal >= bestDist) continue;
      const uVal = (qpx * rdy - qpy * rdx) / rxs;
      if (uVal < 0 || uVal > 1) continue;
      bestDist = tVal;
      bestWall = w;
      bestU    = uVal;
    }

    // バッファに in-place 書き込み
    const h = _hitsBuffer[i];
    if (bestWall !== null) {
      h.hit = true; h.dist = bestDist; h.wall = bestWall; h.rayAngle = rayAngle; h.wallU01 = bestU;
    } else {
      h.hit = false; h.dist = Infinity; h.wall = null; h.rayAngle = rayAngle; h.wallU01 = 0;
    }
  }
  return _hitsBuffer;
}

function drawView3D(hits) {
  const player = Game.state.player;
  const R = VIEW3D;
  ctx.save();
  ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); ctx.clip();

  fillRect(R.x, R.y,           R.w, R.h / 2, 15, 18, 25);
  fillRect(R.x, R.y + R.h / 2, R.w, R.h / 2, 20, 15, 10);

  const colW = R.w / RAY_COUNT;
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    depthBuffer[i] = Infinity;
    if (!h.hit) continue;

    const x0       = R.x + i * colW;
    const corrDist = Math.max(MIN_DIST, h.dist * Math.cos(h.rayAngle - player.visualAngle));
    depthBuffer[i] = corrDist;

    let wallH = WALL_HEIGHT_CONST / corrDist;
    wallH = wallH - (wallH % RETRO_STEP);
    wallH = clamp(wallH, 0, R.h * 2);

    const y0     = R.y + R.h / 2 - wallH / 2;
    const base   = h.wall.col;
    const shade  = clamp(1.0 - corrDist / 500.0, 0.1, 1.0);
    const texU   = wallTextureU(h.wall.a, h.wall.b, h.wallU01);
    const pillar = (texU % TEXTURE_PERIOD) < TEXTURE_PILLAR;
    let cr = base[0] * shade, cg = base[1] * shade, cb = base[2] * shade;
    if (pillar) { cr *= 0.5; cg *= 0.5; cb *= 0.5; }
    fillRect(x0, y0, colW + 0.5, wallH, cr | 0, cg | 0, cb | 0);
  }

  ctx.restore();
  strokeRect(R.x, R.y, R.w, R.h, 60, 60, 60, 2);
}

function drawCompass() {
  const player = Game.state.player;
  const R = VIEW3D;
  const displayFacing = player.facing;  // facing は startRotate() で即時確定

  const cx = R.x + R.w / 2;
  const cy = R.y + 30;
  const bw = 200;
  const bh = 38;

  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.roundRect(cx - bw / 2, cy - bh / 2, bw, bh, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(100,140,120,0.4)';
  ctx.lineWidth   = 1;
  ctx.stroke();

  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#445544';
  ctx.font      = '16px monospace';
  ctx.fillText(FACING_NAMES[(displayFacing - 1 + 4) % 4], cx - 62, cy);
  ctx.fillText(FACING_NAMES[(displayFacing + 1)     % 4], cx + 62, cy);

  ctx.fillStyle = '#334433';
  ctx.font      = '14px monospace';
  ctx.fillText('─', cx - 32, cy);
  ctx.fillText('─', cx + 32, cy);

  ctx.fillStyle = '#7ecfb0';
  ctx.font      = 'bold 22px monospace';
  ctx.fillText(FACING_NAMES[displayFacing], cx, cy);

  if (player.moving) {
    ctx.fillStyle = 'rgba(126,207,176,0.4)';
    ctx.font      = '13px monospace';
    ctx.fillText('▶ moving', cx + 80, cy);
  }
}

// =====================
// 4方向スプライト選択ヘルパー
// dx, dy = player → monster ベクトル
// =====================
function getSpriteDir(m, dx, dy) {
  const fd  = FACING_DIRS[m.facing];
  const fdx = fd.dc, fdy = fd.dr;   // モンスターの向きベクトル (x,y)
  const mpx = -dx, mpy = -dy;       // monster → player ベクトル

  const dot   = fdx * mpx + fdy * mpy;   // 正 = プレイヤーが正面側
  const cross = fdx * mpy - fdy * mpx;   // 正 = プレイヤーがモンスターの右側（canvas y-down）

  if (Math.abs(dot) >= Math.abs(cross)) {
    return dot >= 0 ? 'front' : 'back';
  } else {
    return cross > 0 ? 'right' : 'left';
  }
}

// drawSprites のスプライトリストは固定バッファ＋必要分だけ length で切る方式
const _spritesBuffer = [];
const _cellCounter   = new Map();
const _monsterCellIdx = new Map();

/**
 * モンスターとクリスタルを Z-sort（遠→近）してテクスチャ描画。
 * castRays で更新した depthBuffer と比較して壁裏のスプライトを隠す。
 * 内部バッファ（_spritesBuffer）を再利用して GC 圧を低減。
 */
function drawSprites() {
  const player = Game.state.player;
  const R    = VIEW3D;
  const colW = R.w / RAY_COUNT;

  // 同一マスグルーピング：monsters配列順に奥行きオフセット index を付与
  _cellCounter.clear();
  _monsterCellIdx.clear();
  for (const m of Game.state.monsters) {
    const key = `${m.gridR},${m.gridC}`;
    const idx = _cellCounter.get(key) ?? 0;
    _monsterCellIdx.set(m, idx);
    _cellCounter.set(key, idx + 1);
  }

  // モンスターとクリスタルを距離でまとめてZ-sort（遠→近）
  // 既存バッファに in-place 追加（不足ぶんだけ push、余剰は length で切る）
  let bufIdx = 0;
  const pushSprite = (kind, data, dx, dy, dist) => {
    let s = _spritesBuffer[bufIdx];
    if (!s) {
      s = { kind, data, dx, dy, dist };
      _spritesBuffer.push(s);
    } else {
      s.kind = kind; s.data = data; s.dx = dx; s.dy = dy; s.dist = dist;
    }
    bufIdx++;
  };

  for (const m of Game.state.monsters) {
    const dx = m.pos.x - player.pos.x, dy = m.pos.y - player.pos.y;
    const rawDist = Math.hypot(dx, dy);
    const cellIdx = _monsterCellIdx.get(m) ?? 0;
    // index が大きいほど手前に描画・やや大きく表示（同一マス内で重なりを表現）
    const dist = Math.max(1, rawDist - SAME_CELL_DEPTH_OFFSET * cellIdx);
    pushSprite('monster', m, dx, dy, dist);
  }

  for (const cr of Game.state.crystals) {
    const wx = (cr.c + 0.5) * CELL_SIZE, wy = (cr.r + 0.5) * CELL_SIZE;
    const dx = wx - player.pos.x, dy = wy - player.pos.y;
    pushSprite('crystal', cr, dx, dy, Math.hypot(dx, dy));
  }
  _spritesBuffer.length = bufIdx;
  const sprites = _spritesBuffer;

  sprites.sort((a, b) => b.dist - a.dist);

  ctx.save();
  ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); ctx.clip();

  for (const sp of sprites) {
    const { dx, dy, dist } = sp;
    if (dist < 1) continue;

    const relAngle = normalizeAngle(Math.atan2(dy, dx) - player.visualAngle);
    if (Math.abs(relAngle) > player.fov / 2 + 0.4) continue;

    const corrDist    = Math.max(MIN_DIST, dist * Math.cos(relAngle));
    const colF        = (relAngle + player.fov / 2) / player.fov * (RAY_COUNT - 1);
    const screenXCent = colF * colW;

    if (sp.kind === 'monster') {
      const m      = sp.data;
      const dir    = getSpriteDir(m, dx, dy);
      const imgs   = UNIT_SPRITES[m.type] ?? UNIT_SPRITES['goblin'];
      const img    = imgs[dir];
      if (!img || !img.complete || img.naturalWidth === 0) continue;

      const scale      = UNIT_DEFS[m.type]?.sizeScale ?? 1.0;
      const wallH      = WALL_HEIGHT_CONST / corrDist;
      const floorY     = R.h / 2 + wallH / 2;
      const spriteH    = clamp(wallH * scale, 0, R.h * 2);
      const spriteW    = spriteH * (img.naturalWidth / img.naturalHeight);
      const spriteLeft = screenXCent - spriteW / 2;
      const spriteTop  = floorY - spriteH;

      const colStart = Math.max(0,             Math.floor(spriteLeft / colW));
      const colEnd   = Math.min(RAY_COUNT - 1, Math.ceil((spriteLeft + spriteW) / colW));
      for (let col = colStart; col <= colEnd; col++) {
        if (depthBuffer[col] < corrDist) continue;
        const progress = (col * colW - spriteLeft) / spriteW;
        if (progress < 0 || progress > 1) continue;
        const srcX = progress * img.naturalWidth;
        const srcW = Math.max(1, (colW / spriteW) * img.naturalWidth);
        ctx.drawImage(img, srcX, 0, srcW, img.naturalHeight,
          R.x + col * colW, R.y + spriteTop, colW + 0.5, spriteH);
      }

    } else {
      // クリスタル
      const cr  = sp.data;
      const img = CRYSTAL_IMGS[cr.owner];
      if (!img || !img.complete || img.naturalWidth === 0) continue;

      // 壁の 45% の高さ。底辺を「このdistanceでの床面Y」に合わせる
      // floorY = ホリゾン + 壁高さ/2（= 壁の下端 = 床面）
      const wallH      = WALL_HEIGHT_CONST / corrDist;
      const floorY     = R.h / 2 + wallH / 2;
      const spriteH    = clamp(WALL_HEIGHT_CONST * 0.45 / corrDist, 0, R.h);
      const spriteW    = spriteH * (img.naturalWidth / img.naturalHeight);
      const spriteLeft = screenXCent - spriteW / 2;
      const spriteTop  = floorY - spriteH;    // 底辺 = 床面

      const colStart = Math.max(0,             Math.floor(spriteLeft / colW));
      const colEnd   = Math.min(RAY_COUNT - 1, Math.ceil((spriteLeft + spriteW) / colW));
      for (let col = colStart; col <= colEnd; col++) {
        if (depthBuffer[col] < corrDist) continue;
        const progress = (col * colW - spriteLeft) / spriteW;
        if (progress < 0 || progress > 1) continue;
        const srcX = progress * img.naturalWidth;
        const srcW = Math.max(1, (colW / spriteW) * img.naturalWidth);
        ctx.drawImage(img, srcX, 0, srcW, img.naturalHeight,
          R.x + col * colW, R.y + spriteTop, colW + 0.5, spriteH);
      }
    }
  }

  ctx.restore();
}
