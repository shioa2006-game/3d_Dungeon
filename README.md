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
index.html          3Dダンジョン本体
js/
  config.js         定数・ユニット定義・相性補正
  sprites.js        ドット絵スプライト（ミニマップ・バトルUI共用）
  maze.js           迷路生成・BFS経路探索
  player.js         プレイヤー状態・移動
  monsters.js       ユニットAI（領土争奪・アグロ）
  crystals.js       クリスタル管理・連結判定
  render3d.js       レイキャスト・スプライト描画
  minimap.js        ミニマップ・全体マップ
  battle.js         バトルロジック・勝敗判定
  shop.js           ショップ・回復
  ui.js             Status / Factions / Message Log
  input.js          キー・ホイール入力
  main.js           ゲームループ・init
assets/
  monsters/         6種族 × 4方向 = 24枚（PNG）
  crystals/         5陣営クリスタル = 5枚（PNG）
```
