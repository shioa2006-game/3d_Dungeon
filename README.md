# 3d_Dungeon

地下交易都市クロウネをモンスターから奪還する3Dダンジョン探索ゲーム。

---

## ファイル構成

| ファイル | 役割 |
|---|---|
| `index.html` | 3Dダンジョン（最終版） |
| `prototype.html` | 2D俯瞰・AIのみ。種族バランス調整用シミュレーター |
| `playtest.html` | 2D俯瞰・プレイヤー操作あり。ゲームデザイン確認用 |

---

## 開発フロー

```
prototype.html  →  playtest.html  →  index.html
（バランス調整）    （デザイン確認）    （3D移植・完成）
```

---

## ドキュメント

| ファイル | 内容 |
|---|---|
| `GAME_DESIGN.md` | 世界観・コンセプト・ゲームシステム全体 |
| `INDEX_SPEC.md` | `index.html` の仕様・操作・アセット・技術仕様 |
| `ROADMAP.md` | Phase 1〜10 の実装計画 |
| `IMPL_NOTES.md` | 設計判断・実装メモ（Phase別の決定事項と結果） |
| `PROTOTYPE.md` | `prototype.html` の仕様・定数・バランス記録 |
| `PLAYTEST.md` | `playtest.html` の仕様・操作設計・確認項目 |
| `CLAUDE.md` | Claude向け制約・技術スタック |

## 主要ファイル構成

```
index.html          3Dダンジョン本体（DOMモーダル・モンスター/クリスタル等の構造）
css/
  style.css         全UI・モーダル・ページレイアウトのCSS
js/
  config.js         定数・ユニット定義・相性補正・各種ヘルパー（shuffle / hpColorFor / hexToRgb / cellToBlock）
  state.js          全可変状態の集約（Game.state / Game.flags）— 最初にロード
  sprites.js        ドット絵スプライト定義＋HPバケット別キャッシュ
  maze.js           迷路生成（再帰バックトラック）・ループ追加・grid→walls 変換・BFS経路
  player.js         プレイヤー状態（Game.state.player）・移動・回転・装備
  monsters.js       ユニットAI（領土争奪・アグロ・退却・回復・ターゲット集中緩和）
  crystals.js       クリスタル管理・連結判定（BFS）・lookup 構築（crystalAtCell / crystalByBlock）
  render3d.js       レイキャスト（水平/垂直壁分割で半カット）・スプライト描画（バッファ再利用）
  minimap.js        ミニマップ・全体マップ・クリスタル/ユニット描画
  battle.js         バトルロジック・陣形編成・勝敗判定・結果画面
  shop.js           ショップ・クリスタル回復
  ui.js             Status / Factions / Message Log
  input.js          キーボード・マウスホイール入力
  main.js           ゲームループ・初期化・リスタート・静的UIハンドラ登録
assets/
  monsters/         6種族 × 4方向 = 24枚（PNG）
  crystals/         5陣営クリスタル = 5枚（PNG）
```

## 状態の参照規約

実行時に変わる値はすべて `Game.state.*` / `Game.flags.*` 経由で参照する。

- `Game.state` … エンティティ・World・モーダル状態（15項目）
- `Game.flags` … boolean フラグ（6項目）

純粋な定数（`CANVAS_W` / `FACTIONS` / `UNIT_DEFS` 等）は `config.js` に置く。

ブラウザコンソールで以下が可能:

```js
Game.state                                      // 全状態スナップショット
Game.state.crystals.map(c => [c.r, c.c, c.owner])
JSON.stringify(Game.state, null, 2)             // セーブデータ相当
```
