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
| `GAME_DESIGN.md` | 世界観・コンセプト・最終ゴール |
| `PROTOTYPE.md` | `prototype.html` の仕様・定数・バランス記録 |
| `PLAYTEST.md` | `playtest.html` の仕様・操作設計・確認項目 |
| `CLAUDE.md` | Claude向け制約・技術スタック |
