// =====================
// タイトル画面（##17 で導入、##18 で アセットプリロード追加）
//
// - ページロード時に表示
// - 全アセット（テクスチャ・スプライト）の読み込み完了まで START 無効
// - START ボタンまたは Enter でゲーム開始
// - ログ取得 ON/OFF を選択（localStorage に保存）
// - ゲームオーバー/クリア後の「タイトルへ戻る」もここで管理
// =====================

const Title = (() => {
  const LOG_PREF_KEY = 'crystalLib_logEnabled';
  let assetsReady = false;   // 全画像のロード完了フラグ

  function _isShown() {
    const el = document.getElementById('title-screen');
    return el && !el.hidden;
  }

  function show() {
    const el = document.getElementById('title-screen');
    if (el) el.hidden = false;
    Game.flags.titleShown = true;
  }

  function hide() {
    const el = document.getElementById('title-screen');
    if (el) el.hidden = true;
    Game.flags.titleShown = false;
  }

  function _startGame() {
    if (!assetsReady) return;   // ロード未完了時はゲーム開始しない
    const checkbox   = document.getElementById('title-log-toggle');
    const logEnabled = checkbox ? checkbox.checked : true;
    GameLog.setEnabled(logEnabled);
    try { localStorage.setItem(LOG_PREF_KEY, String(logEnabled)); } catch (_) {}
    hide();
    newMaze();   // 新しい迷路を生成して開始（GameLog.start も内部で呼ばれる）
  }

  // ───────────────── アセットプリロード ─────────────────
  // 既存コードで `new Image()` 済みの全画像を収集して load 完了を待つ。
  // GitHub Pages 等の Web 配信時、初回フレームに PNG デコードが集中して
  // ガタつく問題を解消する。
  function _collectAssets() {
    const list = [];
    if (typeof WALL_TEXTURE     !== 'undefined') list.push(WALL_TEXTURE);
    if (typeof FLOOR_TEXTURE    !== 'undefined') list.push(FLOOR_TEXTURE);
    if (typeof CEILING_TEXTURE  !== 'undefined') list.push(CEILING_TEXTURE);
    if (typeof UNIT_SPRITES !== 'undefined' && typeof UNIT_TYPES !== 'undefined' && typeof SPRITE_DIRS !== 'undefined') {
      for (const type of UNIT_TYPES) {
        for (const dir of SPRITE_DIRS) {
          const img = UNIT_SPRITES[type] && UNIT_SPRITES[type][dir];
          if (img) list.push(img);
        }
      }
    }
    if (typeof CRYSTAL_IMGS !== 'undefined') {
      for (const name of Object.keys(CRYSTAL_IMGS)) {
        if (CRYSTAL_IMGS[name]) list.push(CRYSTAL_IMGS[name]);
      }
    }
    return list;
  }

  function _waitForAsset(img) {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    return new Promise(resolve => {
      img.addEventListener('load',  resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });   // エラーでも進める（描画側にフォールバック実装あり）
    });
  }

  function _setLoadingState(loading, totalCount) {
    const startBtn = document.getElementById('title-start-btn');
    const prompt   = document.getElementById('title-prompt');
    if (startBtn) {
      startBtn.disabled = loading;
      startBtn.textContent = loading ? '⏳ LOADING...' : '▶ START';
    }
    if (prompt) {
      prompt.textContent = loading
        ? `アセット読み込み中（${totalCount} 枚）`
        : '[ Enter ] / [ Click ] でゲーム開始';
    }
  }

  async function _preloadAssets() {
    const assets = _collectAssets();
    _setLoadingState(true, assets.length);
    await Promise.all(assets.map(_waitForAsset));
    assetsReady = true;
    _setLoadingState(false, assets.length);
  }

  function init() {
    // 保存された設定の復元（既定は true）
    try {
      const saved = localStorage.getItem(LOG_PREF_KEY);
      if (saved !== null) {
        const checkbox = document.getElementById('title-log-toggle');
        if (checkbox) checkbox.checked = (saved === 'true');
      }
    } catch (_) {}

    // START ボタン
    const startBtn = document.getElementById('title-start-btn');
    if (startBtn) startBtn.addEventListener('click', _startGame);

    // Enter / Space キー（タイトル表示中 + アセット完了後のみ）
    window.addEventListener('keydown', (e) => {
      if (!_isShown()) return;
      if (!assetsReady) return;
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        _startGame();
      }
    });

    // アセットの読み込み待ち開始（非同期で並行）
    _preloadAssets();
  }

  return { show, hide, init };
})();
