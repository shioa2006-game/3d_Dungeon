const depthBuffer = new Array(RAY_COUNT).fill(Infinity);

function castRays() {
  const hits = [];
  const ox   = player.pos.x, oy = player.pos.y;
  const half = player.fov / 2;
  const base = player.angle - half;
  const span = player.fov;

  for (let i = 0; i < RAY_COUNT; i++) {
    const rayAngle = base + span * i / (RAY_COUNT - 1);
    const rdx = Math.cos(rayAngle);
    const rdy = Math.sin(rayAngle);

    let bestDist = Infinity;
    let bestWall = null;
    let bestU    = 0;

    for (const w of walls) {
      const sx  = w.b.x - w.a.x, sy = w.b.y - w.a.y;
      const rxs = rdx * sy - rdy * sx;
      if (rxs > -1e-9 && rxs < 1e-9) continue;
      const qpx  = w.a.x - ox, qpy = w.a.y - oy;
      const tVal = (qpx * sy - qpy * sx) / rxs;
      if (tVal < 0 || tVal >= bestDist) continue;
      const uVal = (qpx * rdy - qpy * rdx) / rxs;
      if (uVal < 0 || uVal > 1) continue;
      bestDist = tVal;
      bestWall = w;
      bestU    = uVal;
    }

    hits.push(bestWall !== null
      ? { hit: true,  dist: bestDist, wall: bestWall, rayAngle, wallU01: bestU }
      : { hit: false, dist: Infinity, wall: null,     rayAngle, wallU01: 0    }
    );
  }
  return hits;
}

function drawView3D(hits) {
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
    const corrDist = Math.max(MIN_DIST, h.dist * Math.cos(h.rayAngle - player.angle));
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
  const R = VIEW3D;
  let displayFacing = player.facing;
  if (player.rotating) displayFacing = player.pendingFacing;

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

function drawSprites() {
  const R    = VIEW3D;
  const colW = R.w / RAY_COUNT;

  // モンスターとクリスタルを距離でまとめてZ-sort（遠→近）
  const sprites = [];

  for (const m of monsters) {
    const dx = m.pos.x - player.pos.x, dy = m.pos.y - player.pos.y;
    sprites.push({ kind: 'monster', data: m, dx, dy, dist: Math.hypot(dx, dy) });
  }

  for (const cr of crystals) {
    const wx = (cr.c + 0.5) * CELL_SIZE, wy = (cr.r + 0.5) * CELL_SIZE;
    const dx = wx - player.pos.x, dy = wy - player.pos.y;
    sprites.push({ kind: 'crystal', data: cr, dx, dy, dist: Math.hypot(dx, dy) });
  }

  sprites.sort((a, b) => b.dist - a.dist);

  ctx.save();
  ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); ctx.clip();

  for (const sp of sprites) {
    const { dx, dy, dist } = sp;
    if (dist < 1) continue;

    const relAngle = normalizeAngle(Math.atan2(dy, dx) - player.angle);
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

      const spriteH    = clamp(WALL_HEIGHT_CONST / corrDist, 0, R.h * 2);
      const spriteW    = spriteH * (img.naturalWidth / img.naturalHeight);
      const spriteLeft = screenXCent - spriteW / 2;
      const spriteTop  = R.h / 2 - spriteH / 2;

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

      if (m.alertTimer > 0) {
        const alpha    = m.alertTimer > 20 ? 1.0 : m.alertTimer / 20;
        const bangSize = clamp(spriteH * 0.25, 12, 60);
        const bangX    = R.x + screenXCent;
        const bangY    = R.y + spriteTop - bangSize * 0.8;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(bangX, bangY, bangSize * 0.55, 0, Math.PI * 2);
        ctx.fillStyle = 'rgb(255,220,0)'; ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#1a1a00';
        ctx.font = `bold ${Math.floor(bangSize * 0.7)}px monospace`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('!', bangX, bangY);
        ctx.globalAlpha = 1.0;
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
