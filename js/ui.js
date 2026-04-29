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
const messageLog = [];   // [{ text, category, count }]

// カテゴリ別の色（バッジ＋アクセント用）
const LOG_CATEGORY_COLORS = {
  occupy:   '#66aaff',
  battle:   '#ff7766',
  discover: '#ffcc66',
  reward:   '#ffd84a',
  system:   '#aaaaaa',
};
const LOG_CATEGORY_LABELS = {
  occupy:   '占領',
  battle:   '戦闘',
  discover: '発見',
  reward:   '報酬',
  system:   'シス',
};

function logMessage(text, category = 'system') {
  // 直前ログと本文一致なら count を増やす（連続重複のみ統合）
  const last = messageLog[0];
  if (last && last.text === text && last.category === category) {
    last.count = (last.count || 1) + 1;
    return;
  }
  messageLog.unshift({ text, category, count: 1 });
  if (messageLog.length > 40) messageLog.pop();
}

// =====================
// 右パネル → メッセージログ（260×240）
// =====================
function drawUIRight() {
  const R = UI_RIGHT;
  fillRect(R.x, R.y, R.w, R.h, 15, 15, 20);
  strokeRect(R.x, R.y, R.w, R.h, 60, 60, 80, 1);

  // 戦闘中はタイトル切替
  const title = battleState ? '[ 外の戦況 ]' : '[ Message Log ]';
  drawText(title, R.x + 10, R.y + 8, '#aabbcc', 12);

  // パネル内クリップ（長文の右端はみ出しを防ぐ）
  ctx.save();
  ctx.beginPath();
  ctx.rect(R.x + 4, R.y + 24, R.w - 8, R.h - 28);
  ctx.clip();

  const recent = messageLog.slice(0, 9);
  const lineH  = 22;
  for (let i = 0; i < recent.length; i++) {
    const entry = recent[i];
    const fadeFactor = 1 - (i / 11);
    const baseAlpha  = Math.max(0.35, fadeFactor);

    const y     = R.y + 28 + i * lineH;
    const badge = `[${LOG_CATEGORY_LABELS[entry.category] ?? 'シス'}]`;
    const cColor = LOG_CATEGORY_COLORS[entry.category] ?? '#aaaaaa';

    ctx.globalAlpha = baseAlpha;
    drawText(badge, R.x + 8, y, cColor, 11);

    const bodyText = entry.count > 1 ? `${entry.text} ×${entry.count}` : entry.text;
    drawText(bodyText, R.x + 42, y, '#bbbbbb', 11);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
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
  let   ty = R.y + 8;

  fillRect(R.x, R.y, R.w, R.h, 15, 15, 20);
  strokeRect(R.x, R.y, R.w, R.h, 60, 60, 80, 1);

  // ── ヘッダー：[Status] と Turn を横並び ──
  drawText('[ Status ]', tx, ty, '#aabbcc', 13);
  drawText(`Turn ${worldTurn}`, R.x + R.w - 16, ty, '#7799bb', 13, 'right');
  ty += 20;

  // ── HP（大型表示）──
  const s     = playerStats();
  const pHp   = Math.ceil(player.hp);
  const hpPct = Math.max(0, Math.min(1, pHp / s.hp));
  const hpCol = hpPct > 0.5 ? '#44cc44' : hpPct > 0.25 ? '#cccc44' : '#cc4444';

  drawText('HP', tx, ty + 8, '#aaaaaa', 13);
  drawText(`${pHp}`, tx + 30, ty + 2, hpCol, 26);
  drawText(`/ ${s.hp}`, tx + 90, ty + 12, '#888888', 14);

  // HPバー（HP値の右）
  const bx = tx + 150, by = ty + 14, bw = 180, bh = 14;
  ctx.fillStyle = '#1a1a2a';
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = hpCol;
  ctx.fillRect(bx, by, Math.round(bw * hpPct), bh);
  ctx.strokeStyle = 'rgba(80,80,100,0.6)';
  ctx.lineWidth   = 1;
  ctx.strokeRect(bx, by, bw, bh);
  ty += 38;

  // ── ATK / REC / AGI / GOLD（横一列）──
  const colW = 110;
  drawText(`ATK ${s.atk}`,        tx + colW * 0, ty, '#cccccc', 13);
  drawText(`REC ${s.rec}`,        tx + colW * 1, ty, '#cccccc', 13);
  drawText(`AGI ${s.agi}`,        tx + colW * 2, ty, '#cccccc', 13);
  drawText(`GOLD ${player.gold}`, tx + colW * 3, ty, '#ffcc66', 13);
  ty += 18;

  drawLine(R.x + 8, ty, R.x + R.w - 8, ty, 42, 42, 64, 1, 1);
  ty += 6;

  // ── 装備（3行縦並び）──
  drawText('[ Equip ]', tx, ty, '#aabbcc', 13);
  ty += 18;

  const ew  = player.equip.weapon;
  const ea  = player.equip.armor;
  const eac = player.equip.accessory;
  const labelX = tx;
  const valueX = tx + 88;

  drawText('武器',       labelX, ty, '#888899', 13);
  drawText(ew  ? ew.name  : '—', valueX, ty, ew  ? '#ccddff' : '#555566', 13);
  ty += 17;
  drawText('防具',       labelX, ty, '#888899', 13);
  drawText(ea  ? ea.name  : '—', valueX, ty, ea  ? '#ccddff' : '#555566', 13);
  ty += 17;
  drawText('アクセサリ', labelX, ty, '#888899', 13);
  drawText(eac ? eac.name : '—', valueX, ty, eac ? '#ccddff' : '#555566', 13);
  ty += 12;

  // ── クリスタル上アクションバー（キーキャップ風）──
  if (onCrystal) {
    _drawActionBar(R.x + 8, R.y + R.h - 32, R.w - 16);
  }
}

// クリスタル上のアクションバー（[Q] 回復　[E] ショップ）
function _drawActionBar(x, y, w) {
  // 背景帯
  ctx.fillStyle = 'rgba(60, 50, 20, 0.55)';
  ctx.fillRect(x, y, w, 26);
  ctx.strokeStyle = 'rgba(255, 200, 80, 0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, 26);

  // ヒント先頭
  drawText('💎 クリスタル上', x + 8, y + 6, '#ffcc44', 12);

  // [Q] 回復
  _drawKeyCap(x + 130, y + 4, 'Q');
  drawText('回復', x + 158, y + 6, '#ffeecc', 13);

  // [E] ショップ
  _drawKeyCap(x + 220, y + 4, 'E');
  drawText('ショップ', x + 248, y + 6, '#ffeecc', 13);
}

// キーキャップ風の角丸ボックス
function _drawKeyCap(x, y, keyLabel) {
  const w = 22, h = 18;
  ctx.fillStyle   = '#ffcc44';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#aa7711';
  ctx.lineWidth   = 1;
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle    = '#1a1a20';
  ctx.font         = 'bold 12px monospace';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(keyLabel, x + w / 2, y + h / 2 + 1);
}

function _drawUIFactions() {
  const R  = { x: 500, y: 500, w: 500, h: 200 };
  const tx = R.x + 16;
  let   ty = R.y + 8;

  fillRect(R.x, R.y, R.w, R.h, 15, 15, 20);
  strokeRect(R.x, R.y, R.w, R.h, 60, 60, 80, 1);

  drawText('[ 勢力情報 ]', tx, ty, '#aabbcc', 13);

  // ── 解放進捗（自陣営の有効クリスタル比率）──
  const totalCr   = crystals.length;
  const humanValid = crystals.filter(c => c.owner === 'human' && c.valid).length;
  const progress  = totalCr > 0 ? Math.round(humanValid / totalCr * 100) : 0;
  drawText(`解放進捗 ${progress}%`, R.x + R.w - 16, ty, '#aaccff', 13, 'right');
  ty += 22;

  const factionRGB = {
    human:  [68,  136, 255],
    goblin: [68,  204,  68],
    lizard: [255, 136,  68],
    ogre:   [204,  68, 204],
  };

  for (const [id, f] of Object.entries(FACTIONS)) {
    if (id === 'neutral') continue;
    const cr  = crystals.filter(c => c.owner === id).length;
    const un  = monsters.filter(m => m.faction === id).length;
    const [fr, fg, fb] = factionRGB[id];

    drawText(`■ ${f.name}`, tx, ty, f.color, 14);

    // クリスタル占有バー
    const barX = tx + 80, barW = 160, barH = 12;
    const barY = ty + 2;
    ctx.fillStyle = '#1a1a2a';
    ctx.fillRect(barX, barY, barW, barH);
    const fillW = totalCr > 0 ? Math.round(barW * cr / totalCr) : 0;
    ctx.fillStyle = `rgba(${fr},${fg},${fb},0.65)`;
    ctx.fillRect(barX, barY, fillW, barH);
    ctx.strokeStyle = `rgba(${fr},${fg},${fb},0.4)`;
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, barH);

    // 結晶 / 兵数（日本語表記）
    drawText(`結晶 ${cr}/${totalCr}`, barX + barW + 12, ty, '#cccccc', 13);
    drawText(`兵数 ${un}`,            barX + barW + 100, ty, '#cccccc', 13);

    ty += 32;
  }
}
