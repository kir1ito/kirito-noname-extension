# AGENTS.md — gry 个人无名杀扩展研究仓库

本仓库是**个人的无名杀（noname）扩展研究与学习目录**，同时托管自定义扩展 `gry扩展` 的源码。

## 目录结构

- `gry扩展/` — 自定义扩展源码，从游戏目录同步而来
  - 部署目标（游戏运行时读取的位置）：
    `D:\game\noname\无名杀子琪懒人包-win32-x64\resources\app\extension\gry扩展\`
  - 修改源码后需复制回部署目标才会生效；反之亦然。两边改动注意保持同步。
- `docs/` — 研究笔记、学习文档（引擎机制分析、技能实现思路等）

## 无名杀扩展要点（速查）

- 扩展由 `info.json`（name / author / version 等元信息）+ `extension.js`（逻辑）组成。
- 新版扩展为 ES 模块格式：`import { lib, game, ui, get, ai, _status } from "noname"`，
  `export const type = "extension"`，默认导出扩展描述对象。
- 扩展描述对象的 `package` 下按 `character` / `card` / `skill` 等分包定义武将、卡牌、技能，
  并通过对应的 `translate` 提供中文名与技能描述。
- 资源引用格式：`ext:<扩展名>/<文件相对路径>`，如 `ext:gry扩展/audio/die/god.mp3`。
- 武将不写 `img` 时，自动使用 `extension/<扩展名>/<武将名>.jpg` 作为画像。
- 本体源码参考：`D:\game\noname\无名杀子琪懒人包-win32-x64\resources\app\` 下的
  `character/`、`card/`、`game/` 等目录（如神赵云定义在 `character/extra.js` 的 `shen_zhaoyun`）。

## 约定

- 学习笔记统一放 `docs/`，用 Markdown，中文书写。
- 提交信息使用中文，简述本次修改或研究内容。
- 游戏目录本体文件不属于本仓库，只在 `gry扩展/` 内改动。
