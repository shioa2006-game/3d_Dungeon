// =====================
// Drawing helpers（Canvas 描画ユーティリティ）
// =====================
function fillRect(x, y, w, h, r, g, b, a) {
  ctx.fillStyle = a !== undefined ? `rgba(${r},${g},${b},${a})` : `rgb(${r},${g},${b})`;
  ctx.fillRect(x, y, w, h);
}

function strokeRect(x, y, w, h, r, g, b, lw) {
  ctx.strokeStyle = `rgb(${r},${g},${b})`;
  ctx.lineWidth = lw || 1;
  ctx.strokeRect(x, y, w, h);
}

function drawLine(x1, y1, x2, y2, r, g, b, a, width) {
  ctx.strokeStyle = a !== undefined ? `rgba(${r},${g},${b},${a})` : `rgb(${r},${g},${b})`;
  ctx.lineWidth = width || 1;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}

function drawText(text, x, y, color, size, align, baseline) {
  ctx.fillStyle    = color    || '#aaa';
  ctx.font         = `${size || 14}px monospace`;
  ctx.textAlign    = align    || 'left';
  ctx.textBaseline = baseline || 'top';
  ctx.fillText(text, x, y);
}

// =====================
// メッセージログ・ワールドターン
// =====================
let worldTurn  = 0;
const messageLog = [];

function logMessage(text) {
  messageLog.unshift(text);
  if (messageLog.length > 40) messageLog.pop();
}

// =====================
// 右パネル → メッセージログ（260×240）
// =====================
function drawUIRight() {
  const R = UI_RIGHT;
  fillRect(R.x, R.y, R.w, R.h, 15, 15, 20);
  strokeRect(R.x, R.y, R.w, R.h, 60, 60, 80, 1);

  drawText('[ Message Log ]', R.x + 10, R.y + 8, '#aabbcc', 12);

  const colors = [
    '#cccccc', '#bbbbbb', '#aaaaaa', '#999999',
    '#888888', '#777777', '#666666', '#555566', '#444455',
  ];
  const recent = messageLog.slice(0, 9);
  for (let i = 0; i < recent.length; i++) {
    drawText(recent[i], R.x + 10, R.y + 28 + i * 22, colors[i] ?? '#444455', 12);
  }
}

// =====================
// 底部パネル（1000×200）→ 左：ステータス  右：勢力
// =====================
function drawUIBottom() {
  _drawUIStatus();
  _drawUIFactions();
}

function _drawUIStatus() {
  const R  = { x: 0, y: 500, w: 500, h: 200 };
  const tx = R.x + 16;
  let   ty = R.y + 10;

  fillRect(R.x, R.y, R.w, R.h, 15, 15, 20);
  strokeRect(R.x, R.y, R.w, R.h, 60, 60, 80, 1);

  // ── ターン ──
  drawText(`Turn: ${worldTurn}`, tx, ty, '#7799bb', 13);
  ty += 20;

  // ── ステータス ──
  const s     = playerStats();
  const pHp   = Math.ceil(player.hp);
  const hpPct = Math.max(0, Math.min(1, pHp / s.hp));
  const hpCol = hpPct > 0.5 ? '#44cc44' : hpPct > 0.25 ? '#cccc44' : '#cc4444';

  drawText('[ Status ]', tx, ty, '#aabbcc', 13);
  ty += 18;

  // HP 値 + バー
  drawText(`HP  ${pHp} / ${s.hp}`, tx, ty, hpCol, 14);
  const bx = tx + 130, bw = 200, bh = 13;
  ctx.fillStyle = '#1a1a2a';
  ctx.fillRect(bx, ty + 1, bw, bh);
  ctx.fillStyle = hpCol;
  ctx.fillRect(bx, ty + 1, Math.round(bw * hpPct), bh);
  ty += 20;

  drawText(`ATK ${s.atk}   REC ${s.rec}   AGI ${s.agi}   GOLD ${player.gold}`, tx, ty, '#aaaaaa', 13);
  ty += 18;

  drawLine(R.x + 8, ty, R.x + R.w - 8, ty, 42, 42, 64, 1, 1);
  ty += 8;

  // ── 装備 ──
  drawText('[ Equip ]', tx, ty, '#aabbcc', 13);
  ty += 18;

  const ew  = player.equip.weapon;
  const ea  = player.equip.armor;
  const eac = player.equip.accessory;
  const cx2 = tx + 248;

  drawText(`W : ${ew  ? ew.name  : '---'}`, tx,  ty, ew  ? '#ccddff' : '#555566', 13);
  drawText(`A : ${ea  ? ea.name  : '---'}`, cx2, ty, ea  ? '#ccddff' : '#555566', 13);
  ty += 18;
  drawText(`Ac: ${eac ? eac.name : '---'}`, tx,  ty, eac ? '#ccddff' : '#555566', 13);
  ty += 22;

  // ── クリスタル上ヒント ──
  if (onCrystal) {
    fillRect(R.x + 8, ty, R.w - 16, 18, 50, 40, 10);
    drawText('💎 クリスタル上 : Q = 回復   E = ショップ', R.x + 12, ty + 3, '#ffcc44', 12);
  }
}

function _drawUIFactions() {
  const R  = { x: 500, y: 500, w: 500, h: 200 };
  const tx = R.x + 16;
  let   ty = R.y + 10;

  fillRect(R.x, R.y, R.w, R.h, 15, 15, 20);
  strokeRect(R.x, R.y, R.w, R.h, 60, 60, 80, 1);

  drawText('[ Factions ]', tx, ty, '#aabbcc', 13);
  ty += 22;

  const totalCr = crystals.length;

  const factionRGB = {
    human:  [68,  136, 255],
    goblin: [68,  204,  68],
    lizard: [255, 136,  68],
    ogre:   [204,  68, 204],
  };

  for (const [id, f] of Object.entries(FACTIONS)) {
    if (!f.zone) continue;
    const cr  = crystals.filter(c => c.owner === id).length;
    const un  = monsters.filter(m => m.faction === id).length;
    const [fr, fg, fb] = factionRGB[id];

    drawText(`■ ${f.name}`, tx, ty, f.color, 14);

    // クリスタル占有バー
    const barX = tx + 76, barW = 200, barH = 14;
    ctx.fillStyle = '#1a1a2a';
    ctx.fillRect(barX, ty, barW, barH);
    const fillW = totalCr > 0 ? Math.round(barW * cr / totalCr) : 0;
    ctx.fillStyle = `rgba(${fr},${fg},${fb},0.55)`;
    ctx.fillRect(barX, ty, fillW, barH);
    ctx.strokeStyle = `rgba(${fr},${fg},${fb},0.4)`;
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, ty, barW, barH);

    drawText(`Cr:${String(cr).padStart(2,'0')}  U:${un}`, barX + barW + 10, ty, '#999999', 13);

    ty += 38;
  }
}
