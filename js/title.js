// =====================
// タイトル画面（##17 で導入）
//
// - ページロード時に表示
// - START ボタンまたは Enter でゲーム開始
// - ログ取得 ON/OFF を選択（localStorage に保存）
// - ゲームオーバー/クリア後の「タイトルへ戻る」もここで管理
// =====================

const Title = (() => {
  const LOG_PREF_KEY = 'crystalLib_logEnabled';

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
    const checkbox   = document.getElementById('title-log-toggle');
    const logEnabled = checkbox ? checkbox.checked : true;
    GameLog.setEnabled(logEnabled);
    try { localStorage.setItem(LOG_PREF_KEY, String(logEnabled)); } catch (_) {}
    hide();
    newMaze();   // 新しい迷路を生成して開始（GameLog.start も内部で呼ばれる）
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

    // Enter キー（タイトル表示中のみ）
    window.addEventListener('keydown', (e) => {
      if (!_isShown()) return;
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        _startGame();
      }
    });
  }

  return { show, hide, init };
})();
