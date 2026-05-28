# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**LUNA FRONTIER** (internal/repo name: `aura-quest`) — a Japanese-language, mobile-first 2D action RPG built on Phaser 3.60. Deployed as a static site to GitHub Pages at `https://lunaseiya.github.io/aura-quest/`. Source comments, UI text, and in-game strings are all in Japanese.

## Build / Run / Deploy

There is **no build step, no package.json, no test suite, and no linter**. `game.js` is loaded directly as a `<script>` in `index.html`.

- **Run locally**: serve the repo root over HTTP (e.g. `python -m http.server`) and open `index.html`. Do *not* use `file://` — sprite/BGM loads will fail.
- **Important caveat**: `game.js` hard-codes `const BASE='https://lunaseiya.github.io/aura-quest/'` (line ~7) and all asset URLs are built from it. Local edits to images/audio won't be seen until pushed; only `game.js` (loaded relatively via `game.js?v=Date.now()` cache-bust in `index.html`) is hot-editable locally. To test local assets, temporarily change `BASE` to `''`.
- **Deploy**: `.github/workflows/static.yml` deploys the entire repo root to GitHub Pages on push to `main`. No staging environment.
- **Debug from browser console** (exposed on `window.debug`): `debug.warp(stage)`, `debug.bossNow()`, `debug.spawnBoss()`, `debug.godMode()`, `debug.info()`, `debug.unstick()`.

## Architecture

### Single-file monolith
The entire game lives in `game.js` (~16k lines). Treat it as a single module organized by `// ===` banner comments. Top-level structure, in order:

1. **Globals & audio** (lines ~1–430): `GAME_VERSION`, `BASE`, `TILE=32`, save system (`getSaveData`/`setSaveData`/`sanitizePlayerData`, `localStorage` key `aq_save_<slot>`, 3 slots), BGM system (`BGM_FILES`, `startBGM`, `_bgmAudio`), `SE(type)` for sound effects.
2. **Combat math** (~430–545): `makePlayerData(cls)`, `ELEMENT_INFO`/`ELEMENT_OPPOSITE` (8 elements with opposite-pair 2× weakness / same-element 0.5× resist), `calcHit`, `calcCrit`, `rollAttack`.
3. **Scenes** (Phaser 3 `class extends Phaser.Scene`): `BootScene` (~546, loads all spritesheets/maps), `TitleScene` (~4008), `SaveSelectScene` (~4207), `ClassSelectScene` (~4378), `LevelUpScene` (~4551), `GameClearScene` (~4591), `GameScene` (~5774–16053, the main gameplay scene, ~10k lines).
4. **Data tables** (between/around scenes): `EQUIP_DEFS` (~3740), `CRAFT_RECIPES` (~3827), `ITEM_DEFS` (~3892), `DROP_TABLE` (~3915), `KILL_SE` (~3980), `STAGE_CONFIG` (~4636), `CLASS_SKILLS` (~5539), `AWAKENINGS` (~5573), `ENEMY_NAMES` (~5672), `ENEMY_DEFS` (~5692).
5. **Game boot** (~16061): `new Phaser.Game({...scene:[Boot,Title,SaveSelect,ClassSelect,LevelUp,Game,GameClear]})` plus orientation/resize handlers that restart UI scenes.

### Key cross-cutting systems
- **Player data** (`playerData`, built by `makePlayerData(cls)`): one object passed between scenes via `scene.start('Game', {playerData, stage})`. Holds class, level, stats, equipment, items, skill levels, and awakening state.
- **Save serialization** (`sanitizePlayerData`): strips functions, `undefined`, and Phaser objects (detected by presence of `.scene`/`.displayList`/`.destroy`). Any field starting with `_` is dropped *unless* listed in the `KEEP_UNDERSCORE` set — add to that set when persisting new runtime buff flags.
- **Stages** (`STAGE_CONFIG[stageId]`): every stage is a single object with `mapImage`, `mapW/mapH`, enemy spawn list `[id,x,y]`, optional `boss`, `bossThreshold` (kills needed), portal positions (`portalNextX/Y`, `portalBackX/Y`, `spawnFromNextX/Y`), `walkZones` (force-walkable rectangles), `npcs`, etc. To add a stage, add a new key here and load its map image in `BootScene.preload`.
- **Classes & awakenings**: 5 base classes (`novice`, `warrior`, `mage`, `archer`, `bomber`) defined in `CLASS_SKILLS`. Each non-novice class has a hidden "awakening" form (`samurai`, `heavy`, `spirit`, `youma`) gated by a specific weapon (`AWAKENINGS[key].requiresEquip`) — equipping e.g. `muramasa` unlocks samurai awakening for warrior.
- **Enemies**: spawn IDs in `STAGE_CONFIG` reference keys in `ENEMY_DEFS` (stats) + `ENEMY_NAMES` (label) + `DROP_TABLE` (loot) + `KILL_SE` (death sound). Sprites are loaded as `enemy_<id>` and `enemy_<id>_atk` from `enemies/` or `boss/` (see `BootScene.preload` arrays). Adding an enemy requires updates in all five places.
- **Audio**: `BGM_FILES` maps stage `bgmKey` → MP3 in `bgm/`. `GameScene.create` calls `startBGM(cfg.bgmKey)` with three delayed retries (60ms / 1s / 3s) to work around mobile autoplay restrictions — don't simplify this without testing on iOS Safari.

### Asset layout
Sprites and audio live in flat per-type folders at the repo root, loaded via `BASE + '<folder>/<file>.png'`: `players/`, `enemies/`, `boss/`, `maps/`, `bgm/`, `npcs/`, `drops/`, `portals/`, `tiles/`, `objects/`, `projectiles/`, `effects/`. Most player/enemy sprites are 128×128 spritesheets in a 5×3 grid (idle/walk1/walk2/atk1/atk2 × front/back/side); bomber is 64×64. Many tiles/projectiles/effects are now drawn procedurally in code rather than loaded — see `BootScene.preload` for what's actually loaded vs. generated.

### Other HTML files
`index.html` is the production entry. `debug.html` is a standalone sprite-sheet inspector. `phaser-index.html`, `test_sprite.html`, `index1.html`, and `aura-quest-v16.html` are older/diagnostic snapshots — not part of the live game.

## Conventions

- Code comments and identifiers freely mix Japanese and English (e.g. `// 覚醒ゲージ`, `awakGauge`). Preserve existing Japanese comments when editing.
- Commit messages in `git log` are timestamps like `update 2026/05/24  5:10:23.38` — there is no conventional-commits style to follow.
- `GAME_VERSION` at the top of `game.js` is a manual date string; bump it when shipping user-visible changes so the console banner reflects the build.

## ワークフロー / 運用ルール

- **デプロイ手順**: `git add . && git commit -m "..." && git push origin main`。push が成功すると GitHub Actions が自動でデプロイする。
- **勝手に push しない**: ファイルを編集しても、ユーザーが明示的に「push して」「デプロイして」と指示するまで `git add`/`commit`/`push` を実行しないこと。差分の確認とレビューはユーザーが行う。
- **Dropbox による .git ロック**: 作業ディレクトリは Dropbox 配下にあり、Dropbox の同期が `.git/index.lock` 等を掴んで push が失敗することがある。`git push` が `unable to create file` / `Permission denied` / `index.lock` 系のエラーで失敗した場合は、自分で削除しようとせず、ユーザーに「Dropbox の同期を一時停止してから再 push してください」と案内すること。
- **モバイルファースト UI**: 想定主環境はスマホのタッチ操作。新規 UI は片手・タップ前提で設計する。原則は **選択 → 確認ボタン** の 2 ステップフロー(誤タップ防止)。リスト要素を直接実行させるのではなく、選択 → 強調表示 → 「決定」ボタンで確定、の流れに合わせること。既存メニュー(装備・スキル・店等)もこのパターンを踏襲しているので破らない。
- **Node 環境が無い**: このリポジトリには Node も npm も無く、`node game.js` 等での構文チェックはできない。`game.js` は ~16k 行・800KB あるため、`node --check` のような外部ツールに食わせる場合は事前にユーザーに確認すること。**特に game.js 全体を `Read` で読み込む / 一括 grep でフル出力を取る / 自前で構文解析を回す等は、シェルやエージェントごとクラッシュする恐れがあるので避ける**。読むときは必ず `offset`/`limit` で部分読み、検索は `Grep` で必要箇所だけに絞ること。構文確認は当該編集箇所周辺の目視 + ブラウザでの実動確認に頼る。
