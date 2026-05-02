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

// =====================
// 床描画（ピクセル単位）
//
// 各床ピクセルから逆算したワールド座標で、近傍クリスタルの陣営色を
// 加算合成（中心α 0.55 / 2乗フォールオフ）する。Step 3 で陣営占有色も同居予定。
// ImageData は再利用してアロケーションを避ける。
// =====================
const _floorBaseR = 20, _floorBaseG = 15, _floorBaseB = 10;
let _floorImageData = null;
const _rayCos  = new Float32Array(VIEW3D.w);
const _raySin  = new Float32Array(VIEW3D.w);
const _cosCorr = new Float32Array(VIEW3D.w);
const _glowsBuf = [];
let   _nGlows   = 0;

// ブロック陣営占有色の事前計算バッファ（5×5 = 25 + sentinel 26番目）
// 中立は 0、sentinel（ブロック外セル）も 0 を入れて常に加算（条件分岐を避ける）
const _blockTintR = new Float32Array(26);
const _blockTintG = new Float32Array(26);
const _blockTintB = new Float32Array(26);

function drawFloor() {
  const player = Game.state.player;
  const R = VIEW3D;
  const fw = R.w | 0;
  const fh = (R.h / 2) | 0;

  if (!_floorImageData) _floorImageData = ctx.createImageData(fw, fh);
  const data = _floorImageData.data;

  // 列単位のレイ方向と歪み補正（FOVに沿って画面幅で線形補間）
  const half = player.fov / 2;
  const base = player.visualAngle - half;
  const span = player.fov;
  const denom = fw - 1;
  for (let x = 0; x < fw; x++) {
    const rayAngle = base + span * x / denom;
    _rayCos[x]  = Math.cos(rayAngle);
    _raySin[x]  = Math.sin(rayAngle);
    _cosCorr[x] = Math.cos(rayAngle - player.visualAngle);
  }

  const glowR  = CRYSTAL_GLOW_RADIUS_CELLS * CELL_SIZE;
  const glowR2 = glowR * glowR;
  const glowA  = CRYSTAL_GLOW_ALPHA_CENTER;
  const tintA  = FLOOR_FACTION_TINT_ALPHA;
  const px = player.pos.x;
  const py = player.pos.y;

  // 25ブロックの陣営占有色 × α を事前計算（中立は 0 → 常に加算）
  for (let bR = 0; bR < 5; bR++) {
    for (let bC = 0; bC < 5; bC++) {
      const idx = bR * 5 + bC;
      const cr = Game.state.crystalByBlock[bR][bC];
      if (cr && cr.owner !== 'neutral') {
        const [tR, tG, tB] = hexToRgb(FACTIONS[cr.owner].color);
        _blockTintR[idx] = tR * tintA;
        _blockTintG[idx] = tG * tintA;
        _blockTintB[idx] = tB * tintA;
      } else {
        _blockTintR[idx] = 0;
        _blockTintG[idx] = 0;
        _blockTintB[idx] = 0;
      }
    }
  }

  // 視錐台（FOV + αマージン）に入るクリスタルのみを内側ループに渡す
  _nGlows = 0;
  for (const cr of Game.state.crystals) {
    const f = FACTIONS[cr.owner];
    if (!f) continue;
    const wx = (cr.c + 0.5) * CELL_SIZE;
    const wy = (cr.r + 0.5) * CELL_SIZE;
    const dx = wx - px, dy = wy - py;
    const d2 = dx * dx + dy * dy;

    // クリスタルがプレイヤーから glowR より外なら FOV+αマージンでカット
    if (d2 > glowR2) {
      const D = Math.sqrt(d2);
      const rel = Math.abs(normalizeAngle(Math.atan2(dy, dx) - player.visualAngle));
      if (rel > half + Math.asin(glowR / D)) continue;
    }

    const [cR, cG, cB] = hexToRgb(f.color);
    let g = _glowsBuf[_nGlows];
    if (!g) { g = { wx, wy, cR, cG, cB }; _glowsBuf.push(g); }
    else    { g.wx = wx; g.wy = wy; g.cR = cR; g.cG = cG; g.cB = cB; }
    _nGlows++;
  }

  // 1行目（地平線）はベース色だけ
  let idx = 0;
  for (let x = 0; x < fw; x++) {
    data[idx++] = _floorBaseR;
    data[idx++] = _floorBaseG;
    data[idx++] = _floorBaseB;
    data[idx++] = 255;
  }

  // 2行目以降：各ピクセル → ワールド座標 → 陣営占有色 + クリスタルグロー加算
  for (let y = 1; y < fh; y++) {
    const corrDist = WALL_HEIGHT_CONST / (2 * y);
    for (let x = 0; x < fw; x++) {
      const actualDist = corrDist / _cosCorr[x];
      const wx = px + actualDist * _rayCos[x];
      const wy = py + actualDist * _raySin[x];

      let r = _floorBaseR, g = _floorBaseG, b = _floorBaseB;

      // 陣営占有色（cellBlockIdx の sentinel スロットで条件分岐を回避）
      const gridR = (wy / CELL_SIZE) | 0;
      const gridC = (wx / CELL_SIZE) | 0;
      if (gridR >= 0 && gridR < GRID_SIZE && gridC >= 0 && gridC < GRID_SIZE) {
        const bIdx = cellBlockIdx[gridR * GRID_SIZE + gridC];
        r += _blockTintR[bIdx];
        g += _blockTintG[bIdx];
        b += _blockTintB[bIdx];
      }

      // クリスタルグロー加算
      for (let i = 0; i < _nGlows; i++) {
        const cg = _glowsBuf[i];
        const dx = wx - cg.wx, dy = wy - cg.wy;
        const d2 = dx * dx + dy * dy;
        if (d2 > glowR2) continue;
        const t = 1 - Math.sqrt(d2) / glowR;  // 線形フォールオフ
        const inten = t * glowA;
        r += cg.cR * inten;
        g += cg.cG * inten;
        b += cg.cB * inten;
      }

      if (r > 255) r = 255;
      if (g > 255) g = 255;
      if (b > 255) b = 255;

      data[idx++] = r;
      data[idx++] = g;
      data[idx++] = b;
      data[idx++] = 255;
    }
  }

  ctx.putImageData(_floorImageData, R.x, R.y + fh);
}

function drawView3D(hits) {
  const player = Game.state.player;
  const R = VIEW3D;
  ctx.save();
  ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); ctx.clip();

  fillRect(R.x, R.y, R.w, R.h / 2, 15, 18, 25);
  drawFloor();

  const colW   = R.w / RAY_COUNT;
  const px     = player.pos.x;
  const py     = player.pos.y;
  const glowR  = CRYSTAL_GLOW_RADIUS_CELLS * CELL_SIZE;
  const glowR2 = glowR * glowR;
  const glowAW = CRYSTAL_GLOW_ALPHA_CENTER * CRYSTAL_GLOW_WALL_RATIO;

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

    // 壁ヒット点のクリスタルグロー加算
    if (_nGlows > 0) {
      const wx = px + Math.cos(h.rayAngle) * h.dist;
      const wy = py + Math.sin(h.rayAngle) * h.dist;
      for (let k = 0; k < _nGlows; k++) {
        const cgw = _glowsBuf[k];
        const dx = wx - cgw.wx, dy = wy - cgw.wy;
        const d2 = dx * dx + dy * dy;
        if (d2 > glowR2) continue;
        const t = 1 - Math.sqrt(d2) / glowR;
        const inten = t * glowAW;
        cr += cgw.cR * inten;
        cg += cgw.cG * inten;
        cb += cgw.cB * inten;
      }
      if (cr > 255) cr = 255;
      if (cg > 255) cg = 255;
      if (cb > 255) cb = 255;
    }

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
