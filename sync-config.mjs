// 配置快照拾取：PC端游戏每次启动会自动导出 lib.config 快照到游戏根目录 config-sync.json
// （见 kirito扩展 content 钩子）。本脚本把它复制进扩展包，随扩展更新发布给手机端「同步配置」使用。
// 用法：node sync-config.mjs   （AGENTS.md 规则6：每次提交扩展更新前先运行本脚本）
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
const SRC = "D:/game/noname/无名杀子琪懒人包-win32-x64/resources/app/config-sync.json";
const DST = "D:/game/noname/learn/kirito扩展/config-sync.json";
if (!existsSync(SRC)) {
	console.log("跳过：PC端还没有配置快照（启动一次新版游戏后自动生成）");
	process.exit(0);
}
const cfg = JSON.parse(readFileSync(SRC, "utf8"));
if (!cfg || typeof cfg != "object" || !cfg.__syncMeta) {
	console.log("跳过：快照内容无效（缺少 __syncMeta）");
	process.exit(1);
}
writeFileSync(DST, JSON.stringify(cfg, null, "\t"), "utf8");
console.log(`已拾取配置快照：${cfg.__syncMeta.from} ${cfg.__syncMeta.time}（${Object.keys(cfg).length} 键）→ kirito扩展/config-sync.json`);
