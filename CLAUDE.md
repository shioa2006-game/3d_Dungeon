# CLAUDE.md

このファイルはClaudeCodeが常に参照するプロジェクト全体の制約・構造定義です。
コーディング開始前に必ず読み、全ての指示に従ってください。

---

## 技術スタック

- 言語: JavaScript
- 描画: Canvas API
- 実行環境: ブラウザ

---

## Git / PR 管理ルール

- コミット・プッシュ前に必ず `git fetch origin main` を実行し、
  `git log --oneline origin/main..HEAD` で現在のブランチが未マージかを確認すること
- 出力が空 = ブランチはマージ済み。その場合は新しいブランチを作成してから作業・PRを立てること
- 「PR #XX にコミットを追加した」と報告する前に、
  `mcp__github__pull_request_read` でそのPRがまだ open であることを確認すること

---