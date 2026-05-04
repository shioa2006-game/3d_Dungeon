const depthBuffer = new Array(RAY_COUNT).fill(Infinity);

// hits バッファは固定長で再利用（毎フレーム new しない）
const _hitsBuffer = new Array(RAY_COUNT);
for (let i = 0; i < RAY_COUNT; i++) {
  _hitsBuffer[i] = { hit: false, dist: Infinity, wall: null, rayAngle: 0, wallU01: 0 };
}

// =====================
// テクスチャロード（Lv.1）
//
// 壁は drawImage(slice) でカラム描画、床/天井は per-pixel サンプリングのため
// オフスクリーンキャンバス経由で生 Uint8ClampedArray を取り出してキャッシュする。
// 1セル = CELL_SIZE ワールド単位 = テクスチャ全幅で繰り返す（タイル）。
// テクスチャは pow2 サイズを前提（マスクで mod を回避）。
// =====================
const WALL_TEXTURE    = new Image();
const FLOOR_TEXTURE   = new Image();
const CEILING_TEXTURE = new Image();
WALL_TEXTURE.src    = 'assets/textures/wall_stone.png';
FLOOR_TEXTURE.src   = 'assets/textures/floor_stone.png';
CEILING_TEXTURE.src = 'assets/textures/ceiling_stone.png';

let _floorTexData = null, _floorTexW = 0, _floorTexMaskX = 0, _floorTexMaskY = 0;
let _ceilTexData  = null, _ceilTexW  = 0, _ceilTexMaskX  = 0, _ceilTexMaskY  = 0;

function _bakeTextureBuffer(img) {
  const w = img.naturalWidth, h = img.naturalHeight;
  let oc;
  if (typeof OffscreenCanvas !== 'undefined') {
    oc = new OffscreenCanvas(w, h);
  } else {
    oc = document.createElement('canvas');
    oc.width = w; oc.height = h;
  }
  const oc2d = oc.getContext('2d');
  oc2d.drawImage(img, 0, 0);
  return { data: oc2d.getImageData(0, 0, w, h).data, w, h };
}

FLOOR_TEXTURE.onload = () => {
  const t = _bakeTextureBuffer(FLOOR_TEXTURE);
  _floorTexData  = t.data;
  _floorTexW     = t.w;
  _floorTexMaskX = t.w - 1;
  _floorTexMaskY = t.h - 1;
};
CEILING_TEXTURE.onload = () => {
  const t = _bakeTextureBuffer(CEILING_TEXTURE);
  _ceilTexData  = t.data;
  _ceilTexW     = t.w;
  _ceilTexMaskX = t.w - 1;
  _ceilTexMaskY = t.h - 1;
};

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
// Lv.2 距離ライティング
//
// ① 指数フォールオフ：shade = exp(-d / LIGHT_SCALE)
// ② 方向別シェーディング：縦壁(E/W面)を WALL_DIR_SHADE_V 倍に減光
// ③ 環境光カラー：暗い暖茶色 (FOG_R, FOG_G, FOG_B) に向けて減衰
// ④ 天井のフォグスケールを短く（早く暗くなる → 上方向の閉塞感）
// =====================
const LIGHT_SCALE_FLOOR   = 160;   // 床/壁の exp スケール（小さいほど早く暗くなる）
const LIGHT_SCALE_CEILING = 110;   // 天井の exp スケール（より速く暗くなる）
const WALL_DIR_SHADE_V    = 0.60;  // 縦壁(E/W面)を 40% 暗く（明確な方向別シェーディング）
const FOG_R = 14, FOG_G = 9, FOG_B = 5;  // 暗い暖茶色（松明の届かない深い闇）
const FOG_RGB = `rgb(${FOG_R},${FOG_G},${FOG_B})`;

// =====================
// 床/天井描画（ピクセル単位 + テクスチャサンプリング）
//
// テクスチャをワールド座標で UV サンプリング → 距離フォグ → 陣営占有色
// → 近傍クリスタルグロー加算（中心α 0.65 / 線形フォールオフ）。
// 床と天井は対称（horizon 距離が同じピクセルは同じ corrDist）なので
// 1ループで両方を埋める。ImageData は再利用してアロケーションを避ける。
// =====================
const _floorBaseR = 20, _floorBaseG = 15, _floorBaseB = 10;
let _floorImageData   = null;
let _ceilingImageData = null;
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

  // 共通の事前計算：レイ方向、陣営タイント、グロー
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

  // テクスチャ未ロード時はベース色フォールバック
  const texReady = _floorTexData && _ceilTexData;

  if (!_floorImageData)   _floorImageData   = ctx.createImageData(fw, fh);
  if (!_ceilingImageData) _ceilingImageData = ctx.createImageData(fw, fh);
  const fData = _floorImageData.data;
  const cData = _ceilingImageData.data;

  // 1行目（地平線）：暗いベース色
  let fIdx = 0;
  for (let x = 0; x < fw; x++) {
    fData[fIdx++] = _floorBaseR;
    fData[fIdx++] = _floorBaseG;
    fData[fIdx++] = _floorBaseB;
    fData[fIdx++] = 255;
  }
  // 天井の地平線行 = 天井バッファの最終行（fh-1）
  const cHor = (fh - 1) * fw * 4;
  for (let x = 0; x < fw; x++) {
    const o = cHor + x * 4;
    cData[o] = 4; cData[o + 1] = 3; cData[o + 2] = 3; cData[o + 3] = 255;
  }

  // テクスチャ参照定数（内側ループで頻繁に使うのでローカル変数に展開）
  const ftw = _floorTexW, fmx = _floorTexMaskX, fmy = _floorTexMaskY;
  const fpC = texReady ? ftw / CELL_SIZE : 0;
  const ftBuf = _floorTexData;
  const ctw = _ceilTexW, cmx = _ceilTexMaskX, cmy = _ceilTexMaskY;
  const cpC = texReady ? ctw / CELL_SIZE : 0;
  const ctBuf = _ceilTexData;

  // 距離フォグ：指数フォールオフ（床/天井で別スケール、暖茶色のフォグへ減衰）
  const FLOOR_FOG_INV = 1 / LIGHT_SCALE_FLOOR;
  const CEIL_FOG_INV  = 1 / LIGHT_SCALE_CEILING;

  for (let y = 1; y < fh; y++) {
    const corrDist = WALL_HEIGHT_CONST / (2 * y);
    const cRowBase = (fh - 1 - y) * fw * 4;

    for (let x = 0; x < fw; x++) {
      const actualDist = corrDist / _cosCorr[x];
      const wx = px + actualDist * _rayCos[x];
      const wy = py + actualDist * _raySin[x];

      const shade     = Math.exp(-actualDist * FLOOR_FOG_INV);
      const ceilShade = Math.exp(-actualDist * CEIL_FOG_INV);
      const fogA      = 1 - shade;
      const fogCA     = 1 - ceilShade;

      // === 共有: クリスタルグロー寄与（床/天井で同じ wx,wy → 1回計算で両方に流用） ===
      let glowAR = 0, glowAG = 0, glowAB = 0;
      for (let i = 0; i < _nGlows; i++) {
        const cg = _glowsBuf[i];
        const dx = wx - cg.wx, dy = wy - cg.wy;
        const d2 = dx * dx + dy * dy;
        if (d2 > glowR2) continue;
        const t = 1 - Math.sqrt(d2) / glowR;
        const inten = t * glowA;
        glowAR += cg.cR * inten;
        glowAG += cg.cG * inten;
        glowAB += cg.cB * inten;
      }

      // === 床 ===
      let r, g, b;
      if (texReady) {
        const fX = ((wx * fpC) | 0) & fmx;
        const fY = ((wy * fpC) | 0) & fmy;
        const fT = (fY * ftw + fX) * 4;
        r = ftBuf[fT]     * shade + FOG_R * fogA + glowAR;
        g = ftBuf[fT + 1] * shade + FOG_G * fogA + glowAG;
        b = ftBuf[fT + 2] * shade + FOG_B * fogA + glowAB;
      } else {
        r = _floorBaseR; g = _floorBaseG; b = _floorBaseB;
      }

      // 陣営占有色（cellBlockIdx の sentinel スロットで条件分岐を回避）
      const gridR = (wy / CELL_SIZE) | 0;
      const gridC = (wx / CELL_SIZE) | 0;
      if (gridR >= 0 && gridR < GRID_SIZE && gridC >= 0 && gridC < GRID_SIZE) {
        const bIdx = cellBlockIdx[gridR * GRID_SIZE + gridC];
        r += _blockTintR[bIdx];
        g += _blockTintG[bIdx];
        b += _blockTintB[bIdx];
      }

      if (r > 255) r = 255;
      if (g > 255) g = 255;
      if (b > 255) b = 255;

      fData[fIdx++] = r;
      fData[fIdx++] = g;
      fData[fIdx++] = b;
      fData[fIdx++] = 255;

      // === 天井（テクスチャ + 短スケールの指数フォグ + クリスタルグロー減衰版） ===
      const cOff = cRowBase + x * 4;
      if (texReady) {
        const cX = ((wx * cpC) | 0) & cmx;
        const cY = ((wy * cpC) | 0) & cmy;
        const cT = (cY * ctw + cX) * 4;
        const cgMult = CRYSTAL_GLOW_WALL_RATIO;  // 天井は壁と同等の減衰比
        let cr = ctBuf[cT]     * ceilShade + FOG_R * fogCA + glowAR * cgMult;
        let cg = ctBuf[cT + 1] * ceilShade + FOG_G * fogCA + glowAG * cgMult;
        let cb = ctBuf[cT + 2] * ceilShade + FOG_B * fogCA + glowAB * cgMult;
        if (cr > 255) cr = 255;
        if (cg > 255) cg = 255;
        if (cb > 255) cb = 255;
        cData[cOff]     = cr;
        cData[cOff + 1] = cg;
        cData[cOff + 2] = cb;
        cData[cOff + 3] = 255;
      } else {
        cData[cOff] = 15; cData[cOff + 1] = 18; cData[cOff + 2] = 25; cData[cOff + 3] = 255;
      }
    }
  }

  ctx.putImageData(_ceilingImageData, R.x, R.y);
  ctx.putImageData(_floorImageData, R.x, R.y + fh);
}

function drawView3D(hits) {
  const player = Game.state.player;
  const R = VIEW3D;
  ctx.save();
  ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); ctx.clip();

  // 床/天井（テクスチャサンプリング、グロー/タイント込み）
  drawFloor();

  const colW   = R.w / RAY_COUNT;
  const px     = player.pos.x;
  const py     = player.pos.y;
  const glowR  = CRYSTAL_GLOW_RADIUS_CELLS * CELL_SIZE;
  const glowR2 = glowR * glowR;
  const glowAW = CRYSTAL_GLOW_ALPHA_CENTER * CRYSTAL_GLOW_WALL_RATIO;

  // 壁テクスチャの参照（未ロード時はベタ色フォールバック）
  const wallTex = WALL_TEXTURE;
  const wallTexReady = wallTex.complete && wallTex.naturalWidth > 0;
  const wTW = wallTexReady ? wallTex.naturalWidth : 0;
  const wTH = wallTexReady ? wallTex.naturalHeight : 0;

  // 距離フォグオーバーレイ用に暖茶色を初期セット
  ctx.fillStyle = FOG_RGB;

  const WALL_FOG_INV = 1 / LIGHT_SCALE_FLOOR;

  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    depthBuffer[i] = Infinity;
    if (!h.hit) continue;

    const x0       = R.x + i * colW;
    const corrDist = Math.max(MIN_DIST, h.dist * Math.cos(h.rayAngle - player.visualAngle));
    depthBuffer[i] = corrDist;

    let wallH = WALL_HEIGHT_CONST / corrDist;
    wallH = clamp(wallH, 0, R.h * 2);

    const y0    = R.y + R.h / 2 - wallH / 2;
    const texU  = wallTextureU(h.wall.a, h.wall.b, h.wallU01);
    // ① 指数フォールオフ + ② 方向別シェーディング（縦壁=E/W面を暗く）
    const distShade = Math.exp(-corrDist * WALL_FOG_INV);
    const dirShade  = (h.wall.a.x === h.wall.b.x) ? WALL_DIR_SHADE_V : 1.0;
    const shade     = distShade * dirShade;

    if (wallTexReady) {
      // テクスチャの 1セル分（=CELL_SIZE ワールド単位）が画像幅にマップされる前提でタイル
      const u01  = (((texU % CELL_SIZE) + CELL_SIZE) % CELL_SIZE) / CELL_SIZE;
      const texX = (u01 * wTW) | 0;
      ctx.drawImage(wallTex, texX, 0, 1, wTH, x0, y0, colW + 0.5, wallH);

      // 距離フォグ（黒オーバーレイ）
      if (shade < 1) {
        ctx.globalAlpha = 1 - shade;
        ctx.fillRect(x0, y0, colW + 0.5, wallH);
        ctx.globalAlpha = 1;
      }

      // 壁ヒット点のクリスタルグロー加算（lighter 合成）
      if (_nGlows > 0) {
        const wx = px + Math.cos(h.rayAngle) * h.dist;
        const wy = py + Math.sin(h.rayAngle) * h.dist;
        let gR = 0, gG = 0, gB = 0;
        for (let k = 0; k < _nGlows; k++) {
          const cgw = _glowsBuf[k];
          const dx = wx - cgw.wx, dy = wy - cgw.wy;
          const d2 = dx * dx + dy * dy;
          if (d2 > glowR2) continue;
          const t = 1 - Math.sqrt(d2) / glowR;
          const inten = t * glowAW;
          gR += cgw.cR * inten;
          gG += cgw.cG * inten;
          gB += cgw.cB * inten;
        }
        if (gR > 0 || gG > 0 || gB > 0) {
          if (gR > 255) gR = 255;
          if (gG > 255) gG = 255;
          if (gB > 255) gB = 255;
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = `rgb(${gR | 0},${gG | 0},${gB | 0})`;
          ctx.fillRect(x0, y0, colW + 0.5, wallH);
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = FOG_RGB;
        }
      }
    } else {
      // フォールバック：旧来のベタ色 + ピラー
      const base   = h.wall.col;
      const pillar = (texU % TEXTURE_PERIOD) < TEXTURE_PILLAR;
      let cr = base[0] * shade, cg = base[1] * shade, cb = base[2] * shade;
      if (pillar) { cr *= 0.5; cg *= 0.5; cb *= 0.5; }
      fillRect(x0, y0, colW + 0.5, wallH, cr | 0, cg | 0, cb | 0);
    }
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

// スプライト着色用の使い回しオフスクリーンキャンバス
// （source-atop でスプライト形状のみ着色するため、透明背景の場で合成する必要がある）
const _spriteTintCanvas = (typeof OffscreenCanvas !== 'undefined')
  ? new OffscreenCanvas(256, 256)
  : (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 256; return c; })();
const _spriteTintCtx = _spriteTintCanvas.getContext('2d');

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

  // スプライトの環境光計算用定数
  const spGlowR     = CRYSTAL_GLOW_RADIUS_CELLS * CELL_SIZE;
  const spGlowR2    = spGlowR * spGlowR;
  const spGlowA     = CRYSTAL_GLOW_ALPHA_CENTER;
  const SPRITE_GLOW_TINT_MAX = 0.45;  // グロー着色の上限α（強すぎないよう抑制）
  const px = player.pos.x, py = player.pos.y;

  for (const sp of sprites) {
    const { dx, dy, dist } = sp;
    if (dist < 1) continue;

    const relAngle = normalizeAngle(Math.atan2(dy, dx) - player.visualAngle);
    if (Math.abs(relAngle) > player.fov / 2 + 0.4) continue;

    const corrDist    = Math.max(MIN_DIST, dist * Math.cos(relAngle));
    const colF        = (relAngle + player.fov / 2) / player.fov * (RAY_COUNT - 1);
    const screenXCent = colF * colW;

    // === スプライト位置での環境光計算 ===
    // 距離フォグ（壁/床と同じスケール、クリスタルも普通にフェードアウト）
    const distShade = Math.exp(-corrDist / LIGHT_SCALE_FLOOR);

    // クリスタルグロー寄与（モンスターのみ。クリスタル自身は光源なので適用しない）
    let glowAddR = 0, glowAddG = 0, glowAddB = 0;
    if (sp.kind === 'monster' && _nGlows > 0) {
      const spWX = px + dx, spWY = py + dy;
      for (let i = 0; i < _nGlows; i++) {
        const cg = _glowsBuf[i];
        const gdx = spWX - cg.wx, gdy = spWY - cg.wy;
        const gd2 = gdx * gdx + gdy * gdy;
        if (gd2 > spGlowR2) continue;
        const t = 1 - Math.sqrt(gd2) / spGlowR;
        const inten = t * spGlowA;
        glowAddR += cg.cR * inten;
        glowAddG += cg.cG * inten;
        glowAddB += cg.cB * inten;
      }
    }

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

      // === オフスクリーンに「減光 + グロー着色済み」のスプライトを合成 ===
      const totalGlow = glowAddR + glowAddG + glowAddB;
      const needTint  = totalGlow > 1;
      const needShade = distShade < 0.999;
      const tintW     = img.naturalWidth;
      const tintH     = img.naturalHeight;

      let srcImg;
      if (needTint || needShade) {
        if (_spriteTintCanvas.width  < tintW) _spriteTintCanvas.width  = tintW;
        if (_spriteTintCanvas.height < tintH) _spriteTintCanvas.height = tintH;
        _spriteTintCtx.clearRect(0, 0, tintW, tintH);
        // フル不透明で描画（透明にせず、後で source-atop で減光する）
        _spriteTintCtx.drawImage(img, 0, 0);
        // 距離による減光：source-atop で黒オーバーレイ（スプライト形状のみ暗くなる、不透明性は維持）
        if (needShade) {
          _spriteTintCtx.globalCompositeOperation = 'source-atop';
          _spriteTintCtx.fillStyle = `rgba(0,0,0,${1 - distShade})`;
          _spriteTintCtx.fillRect(0, 0, tintW, tintH);
        }
        // クリスタルグロー着色（減光後の色に乗せる）
        if (needTint) {
          const maxCh = glowAddR > glowAddG ? (glowAddR > glowAddB ? glowAddR : glowAddB)
                                            : (glowAddG > glowAddB ? glowAddG : glowAddB);
          const tintA = Math.min(SPRITE_GLOW_TINT_MAX, maxCh / 255 * 1.2);
          const gR = glowAddR > 255 ? 255 : glowAddR | 0;
          const gG = glowAddG > 255 ? 255 : glowAddG | 0;
          const gB = glowAddB > 255 ? 255 : glowAddB | 0;
          if (!needShade) _spriteTintCtx.globalCompositeOperation = 'source-atop';
          _spriteTintCtx.fillStyle = `rgba(${gR},${gG},${gB},${tintA})`;
          _spriteTintCtx.fillRect(0, 0, tintW, tintH);
        }
        if (needShade || needTint) {
          _spriteTintCtx.globalCompositeOperation = 'source-over';
        }
        srcImg = _spriteTintCanvas;
      } else {
        srcImg = img;
      }

      const colStart = Math.max(0,             Math.floor(spriteLeft / colW));
      const colEnd   = Math.min(RAY_COUNT - 1, Math.ceil((spriteLeft + spriteW) / colW));
      for (let col = colStart; col <= colEnd; col++) {
        if (depthBuffer[col] < corrDist) continue;
        const progress = (col * colW - spriteLeft) / spriteW;
        if (progress < 0 || progress > 1) continue;
        const srcX = progress * tintW;
        const srcW = Math.max(1, (colW / spriteW) * tintW);
        ctx.drawImage(srcImg, srcX, 0, srcW, tintH,
          R.x + col * colW, R.y + spriteTop, colW + 0.5, spriteH);
      }

    } else {
      // クリスタル（光源そのもの。距離減光のみ、グロー着色は無し）
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
      ctx.globalAlpha = distShade;
      for (let col = colStart; col <= colEnd; col++) {
        if (depthBuffer[col] < corrDist) continue;
        const progress = (col * colW - spriteLeft) / spriteW;
        if (progress < 0 || progress > 1) continue;
        const srcX = progress * img.naturalWidth;
        const srcW = Math.max(1, (colW / spriteW) * img.naturalWidth);
        ctx.drawImage(img, srcX, 0, srcW, img.naturalHeight,
          R.x + col * colW, R.y + spriteTop, colW + 0.5, spriteH);
      }
      ctx.globalAlpha = 1;
    }
  }

  ctx.restore();
}
