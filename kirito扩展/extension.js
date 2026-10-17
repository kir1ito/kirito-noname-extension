import { lib, game, ui, get, ai, _status } from "noname";
import { Character, Player } from "../../noname/library/element/index.js";
export const type = "extension";
// 扩展版本号：package与设置页展示共用，与info.json的version保持同步
const VERSION = "3.15";
export default function () {
	// 绝境的X：已损失体力值（不封顶）
	const juejingX = (player) => player.getDamagedHp();
	// 绝境⑥/神体③共用守护：持有任一守护技能者，其所有技能不可被禁用/封锁，且不会被翻面、体力上限不会减少
	// （"特殊技能不会被移除"由各技能自身的 fixed: true 承担）。两技能共用同一套拦截器，先加载者安装、后到者直接复用
	const installGrySkillGuard = () => {
		if (lib._grySkillGuardInstalled) {
			return;
		}
		lib._grySkillGuardInstalled = true;
		// 注意：此处必须直查 player.skills 底层数组而非 hasSkill——
		// hasSkill 的求值链(filterSkills→get.is.blocked)会回调本守护造成无限递归，
		// 当敌方挂上技能封锁器(如于吉〖缠怨〗体力≤1时)即触发死循环卡死游戏
		const hasGuard = (player) =>
			player &&
			Array.isArray(player.skills) &&
			(player.skills.includes("gryjuejing") || player.skills.includes("gryshenti"));
		// 日志里报守护技能名：优先报绝境
		const guardName = (player) => (player.skills.includes("gryjuejing") ? "〖绝境〗" : "〖神体〗");
		// 拦截禁用：铁骑/止息类效果经 disableSkill 写入 disabledSkills，
		// 对持有守护技能者，其当前拥有的所有技能一律拒绝写入禁用名单。
		// 例外：觉醒/限定技消耗走 awakenSkill → disableSkill("<技能>_awake")，
		// 属于正常结算流程必须放行，否则寂灭/神霈用过一次后不会失效
		const originDisableSkill = Player.prototype.disableSkill;
		Player.prototype.disableSkill = function (reason, skills) {
			if (hasGuard(this)) {
				if (typeof reason == "string" && reason.endsWith("_awake")) {
					return originDisableSkill.call(this, reason, skills);
				}
				if (typeof skills == "string") {
					if (this.skills.includes(skills)) {
						return this;
					}
				} else if (Array.isArray(skills)) {
					skills = skills.filter((skill) => !this.skills.includes(skill));
				}
			}
			return originDisableSkill.call(this, reason, skills);
		};
		// 拦截封锁：skillBlocker 体系经 get.is.blocked 判定技能被封锁，
		// 对持有守护技能者，其当前拥有的所有技能一律视为未被封锁
		const originBlocked = get.is.blocked;
		get.is.blocked = function (skill, player) {
			if (hasGuard(player) && player.skills.includes(skill)) {
				return false;
			}
			return originBlocked.call(this, skill, player);
		};
		// 拦截翻面：①附加效果——不会被翻面；仅拦截"翻成面朝下"，已翻面时允许翻回
		const originTurnOver = Player.prototype.turnOver;
		Player.prototype.turnOver = function (bool) {
			const faceDown = bool === true || (bool === void 0 && !this.isTurnedOver());
			if (faceDown && hasGuard(this)) {
				game.log(this, "的", guardName(this), "防止了翻面");
				const next = game.createEvent("turnOver");
				next.player = this;
				next.setContent("emptyEvent");
				return next;
			}
			return originTurnOver.call(this, bool);
		};
		// 拦截体力上限扣除：①附加效果——体力上限只能增不能减（gainMaxHp不受影响）
		const originLoseMaxHp = Player.prototype.loseMaxHp;
		Player.prototype.loseMaxHp = function () {
			if (hasGuard(this)) {
				game.log(this, "的", guardName(this), "防止了体力上限的扣除");
				const next = game.createEvent("loseMaxHp");
				next.player = this;
				next.num = 0;
				next.setContent("emptyEvent");
				return next;
			}
			return originLoseMaxHp.apply(this, arguments);
		};
	};
	// 降临默认候选池：本扩展全部可选技能（可在扩展设置的「降临技能池管理」中增删，存于配置 touyingPool）
	const DEFAULT_TOUYING_POOL = ["gryjuejing", "grylonghun", "gryshenti", "ktyuli", "kttingwei", "ktjimie", "ktxinghun", "ktshenpei"];
	// 在线更新中心：点按钮弹出独立遮罩窗口（形态复刻十周年UI配置中心，非系统窗口）
	// 流程：检测连通性（各源拉info.json测延迟）→ 通过后才可开始更新 → 进度条逐文件流式下载
	// → 全部成功后最后写info.json（版本号）。任何一步失败：版本号与更新时间配置不变更（相当于还原），
	// 已下载的文件保留，可直接重试（下次会重新下载全部文件）
		// 本体全局reset为 div{position:absolute;width:80%;left:10%}，会击穿未显式覆盖的属性，
		// 故先整域复位，再用同优先级的 div.ktupd-* 规则按源顺序逐项覆写。
		// 更新中心与投影技能池管理两个弹窗共用这套样式
		const KT_CSS = `
.ktupd-overlay div{position:static;width:auto;left:auto;margin:0;padding:0;box-sizing:border-box;text-shadow:none;font-family:inherit}
.ktupd-overlay{position:fixed;left:0;top:0;right:0;bottom:0;width:auto;z-index:998;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55)}
div.ktupd-dialog{position:relative;display:block;width:540px;max-width:92vw;max-height:88vh;overflow-y:auto;padding:18px 24px 20px;border-radius:10px;color:#dfe6f3;background:linear-gradient(160deg,#232a3a,#141822);border:1px solid #3d4a63;box-shadow:0 10px 44px rgba(0,0,0,.65);font-size:14px;font-family:"Microsoft YaHei","PingFang SC",sans-serif;text-align:left;line-height:1.5;user-select:none}
div.ktupd-title{font-size:18px;font-weight:bold;color:#ffd76a;letter-spacing:1px;margin-bottom:10px}
div.ktupd-close{position:absolute;right:14px;top:12px;width:26px;height:26px;line-height:24px;text-align:center;border-radius:50%;cursor:pointer;color:#9aa7bd;border:1px solid #3d4a63;font-size:14px}
div.ktupd-close:hover{color:#fff;border-color:#8fa3c8}
div.ktupd-row{display:flex;justify-content:space-between;margin:5px 0;color:#c3cde0}
div.ktupd-row b{color:#eaf1ff;font-weight:normal}
div.ktupd-section{margin:12px 0 6px;padding-left:8px;border-left:3px solid #ffd76a;color:#ffd76a;font-weight:bold}
div.ktupd-btn{display:inline-block;padding:6px 18px;border-radius:6px;background:linear-gradient(180deg,#3f8cff,#2563eb);color:#fff;cursor:pointer;font-size:14px;margin-right:10px}
div.ktupd-btn:hover{filter:brightness(1.12)}
div.ktupd-btn[disabled]{opacity:.38;cursor:not-allowed;filter:none}
div.ktupd-btn.green{background:linear-gradient(180deg,#2fd06b,#16a34a)}
div.ktupd-src{font-size:13px;margin:4px 0;color:#9aa7bd}
div.ktupd-src.ok{color:#7ee2a8}
div.ktupd-src.bad{color:#ff8f8f}
div.ktupd-bar{height:14px;margin:8px 0 4px;border-radius:7px;background:#0b0e14;border:1px solid #3d4a63;overflow:hidden}
div.ktupd-fill{height:100%;width:0;border-radius:7px;background:linear-gradient(90deg,#f59e0b,#fbbf24);transition:width .15s}
div.ktupd-cur{font-size:12px;color:#9aa7bd;word-break:break-all;min-height:16px}
div.ktupd-status{font-size:13px;margin-top:10px;color:#c3cde0;min-height:18px}
div.ktupd-status.ok{color:#7ee2a8}
div.ktupd-status.err{color:#ff8f8f}
div.ktupd-hint{font-size:12px;color:#9aa7bd;margin:6px 0}
div.ktupd-chips{margin:6px 0;max-height:130px;overflow-y:auto}
div.ktupd-chip{display:inline-block;padding:3px 8px;margin:2px 6px 2px 0;border-radius:4px;background:#2c3547;color:#eaf1ff;font-size:12px;cursor:pointer;border:1px solid #3d4a63}
div.ktupd-chip:hover{border-color:#ff8f8f;color:#ff8f8f}
input.ktupd-search{display:block;width:100%;padding:6px 10px;margin:6px 0;border-radius:6px;border:1px solid #3d4a63;background:#0b0e14;color:#eaf1ff;font-size:13px;outline:none;text-align:left;box-sizing:border-box}
input.ktupd-search:focus{border-color:#3f8cff}
div.ktupd-list{max-height:280px;overflow-y:auto;border-top:1px solid #3d4a63}
div.ktupd-item{display:flex;justify-content:space-between;align-items:center;padding:5px 4px;border-bottom:1px solid #232a3a;font-size:13px;color:#c3cde0}
div.ktupd-item:hover{background:#1c2331}
div.ktupd-item span.owner{color:#7f8ca3;font-size:12px;margin-left:6px}
div.ktupd-add{padding:2px 10px;margin-left:8px;border-radius:4px;background:linear-gradient(180deg,#3f8cff,#2563eb);color:#fff;cursor:pointer;font-size:12px;white-space:nowrap}
div.ktupd-add:hover{filter:brightness(1.15)}
div.ktupd-add.off{background:#2c3547;color:#7f8ca3;cursor:not-allowed;filter:none}
div.ktupd-empty{padding:14px 4px;color:#7f8ca3;font-size:13px;text-align:center}
`;
		// 弹窗样式只注入一次，更新中心与技能池管理共用
		const ktInjectCss = () => {
			if (document.getElementById("ktupd-css")) return;
			const style = document.createElement("style");
			style.id = "ktupd-css";
			style.textContent = KT_CSS;
			document.head.appendChild(style);
		};
		const ktUpdateCenter = (() => {
		const NAME = "kirito扩展";
		const REPO = "kir1ito/kirito-noname-extension";
		// 更新包：GitHub Actions 在 push 时自动把 kirito扩展/ 打成 zip 挂到 latest Release，
		// 更新器只下载这一个压缩包再本地解压覆盖，新增文件无需维护清单
		const ZIP_NAME = "kirito-extension.zip";
		const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/main/`;
		// 匿名多源：公共镜像（国内可达性随时波动，连通性测速后按吞吐自动排序），GitHub直连兜底
		// 所有源均支持 前缀+完整GitHubURL 的代理格式；raw源用于小文件（清单/版本号/增量文件），release源用于整包与测速
		const SOURCES = [
			{ label: "ghfast.top", prefix: "https://ghfast.top/" },
			{ label: "gh-proxy.com 镜像", prefix: "https://gh-proxy.com/" },
			{ label: "github.moeyy.xyz", prefix: "https://github.moeyy.xyz/" },
			{ label: "ghproxy.net 镜像", prefix: "https://ghproxy.net/" },
			{ label: "gh.llkk.cc", prefix: "https://gh.llkk.cc/" },
			{ label: "ghproxy.cc", prefix: "https://ghproxy.cc/" },
			{ label: "GitHub 直连", prefix: "" },
		];
		let overlay = null;
		let abortCtrl = null;
		let sourceOrder = null; // 连通性检测后的源顺序（可用优先，按延迟升序）
		let remoteVersion = null;
		const $ = {};
		const encodePath = (file) => encodeURIComponent(NAME) + "/" + file.split("/").map(encodeURIComponent).join("/");
		const rawUrlOf = (src, file) => src.prefix + RAW_BASE + encodePath(file);
		const relUrlOf = (src, asset) => `${src.prefix}https://github.com/${REPO}/releases/latest/download/${asset}`;
		const zipUrlOf = (src) => relUrlOf(src, ZIP_NAME);
		// 远程版本号权威来源：Release资产version.txt（工作流打包时与zip同批生成、在zip之后上传）
		// 避免"代码已推到main、压缩包还没打完"窗口期里显示新版本号却下到旧压缩包
		const VER_NAME = "version.txt";
		const el = (cls, parent, text) => {
			const node = document.createElement("div");
			node.className = cls;
			if (text != null) node.textContent = text;
			parent.appendChild(node);
			return node;
		};
		const setStatus = (text, cls) => {
			$.status.textContent = text;
			$.status.className = `ktupd-status${cls ? ` ${cls}` : ""}`;
		};
		// 按钮是div（无原生disabled）：用属性驱动样式，onclick内用hasAttribute拦截
		const setDisabled = (btn, val) => {
			if (val) btn.setAttribute("disabled", "");
			else btn.removeAttribute("disabled");
		};
		// 带超时的fetch
		const fetchTimeout = (url, ms) => {
			const ctrl = new AbortController();
			const timer = setTimeout(() => ctrl.abort(), ms);
			return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
		};
		// 拉Release的version.txt作为远程版本号（按测速排序的源依次尝试）
		const fetchReleaseVersion = async () => {
			for (const { src } of sourceOrder) {
				try {
					const resp = await fetch(relUrlOf(src, VER_NAME));
					if (!resp.ok) continue;
					const text = (await resp.text()).trim();
					if (text) return text;
				} catch {}
			}
			return null;
		};
		// 增量更新支持：工作流每次打包生成 manifest.json（路径→md5），Release资产
		const fmtSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(2)} MB` : `${(n / 1024).toFixed(1)} KB`);
		const localVersion = () => (lib.extensionPack[NAME] && lib.extensionPack[NAME].version) || "未知";
		const MANIFEST_NAME = "manifest.json";
		const LOCAL_MANIFEST = ".update_manifest.json";
		const fetchReleaseManifest = async () => {
			for (const { src } of sourceOrder) {
				try {
					const resp = await fetch(relUrlOf(src, MANIFEST_NAME), { signal: abortCtrl ? abortCtrl.signal : undefined });
					if (!resp.ok) continue;
					const json = await resp.json();
					if (json && typeof json == "object") return json;
				} catch {}
			}
			return null;
		};
		const readStoredManifest = async () => {
			try {
				const text = await game.promises.readFileAsText(`extension/${NAME}/${LOCAL_MANIFEST}`);
				const json = JSON.parse(text);
				return json && typeof json == "object" ? json : null;
			} catch {
				return null;
			}
		};
		// 增量：按源顺序下载单个原始文件（小文件，无需流式进度）
		const downloadRaw = async (file) => {
			let lastError = null;
			for (const { src } of sourceOrder) {
				try {
					const resp = await fetch(rawUrlOf(src, file), { signal: abortCtrl.signal });
					if (!resp.ok) throw new Error(`RAW ${resp.status}`);
					return new Uint8Array(await resp.arrayBuffer());
				} catch (e) {
					if (e.name == "AbortError") throw e;
					lastError = e;
				}
			}
			throw lastError || new Error("下载失败");
		};
		// 单源测速：试拉Release压缩包前1.5MB计算真实吞吐（延迟低≠带宽高，按吞吐排序才是真快）
		const PROBE_BYTES = 1572864;
		const measureSpeed = async (src) => {
			const t0 = Date.now();
			const ctrl = new AbortController();
			const timer = setTimeout(() => ctrl.abort(), 20000);
			try {
				const resp = await fetch(zipUrlOf(src), { signal: ctrl.signal });
				if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
				if (!resp.body || typeof resp.body.getReader != "function") {
					return { ok: true, speed: Number(resp.headers.get("content-length")) || 999999 };
				}
				const reader = resp.body.getReader();
				let received = 0;
				for (;;) {
					const { done, value } = await reader.read();
					if (done) break;
					received += value.length;
					if (received >= PROBE_BYTES) break;
				}
				try {
					await reader.cancel();
				} catch {}
				const seconds = (Date.now() - t0) / 1000;
				return { ok: true, speed: received / Math.max(seconds, 0.05) };
			} catch (e) {
				return { ok: false, speed: 0, error: e.name == "AbortError" ? "超时" : e.message };
			} finally {
				clearTimeout(timer);
			}
		};
		async function checkConnectivity() {
			remoteVersion = null;
			setDisabled($.start, true);
			setDisabled($.inc, true);
			setDisabled($.check, true);
			setStatus("正在测速各下载源（试拉整包前1.5MB，约需数秒）…");
			const results = await Promise.all(SOURCES.map(measureSpeed));
			// 可用源优先、按吞吐降序排列，更新时按此顺序降级
			sourceOrder = SOURCES.map((src, i) => ({ src, res: results[i], idx: i })).sort((a, b) => (b.res.ok - a.res.ok) || (b.res.speed - a.res.speed));
			sourceOrder.forEach(({ src, res, idx }) => {
				const line = $.srcs[idx];
				if (res.ok) {
					line.className = "ktupd-src ok";
					line.textContent = `✓ ${src.label} — ${fmtSize(res.speed)}/s`;
				} else {
					line.className = "ktupd-src bad";
					line.textContent = `✗ ${src.label} — 不可达（${res.error}）`;
				}
			});
			const anyOk = results.some((r) => r.ok);
			if (anyOk) {
				// 远程版本号以Release资产version.txt为准（与压缩包同批生成，不存在时间窗）
				setStatus("正在获取 Release 版本号…");
				remoteVersion = await fetchReleaseVersion();
				if (remoteVersion) {
					$.remote.textContent = `v${remoteVersion}`;
				} else {
					// 兜底：Release版本号获取失败时退回代码库info.json版本，并标注来源
					const raw = results.find((r) => r.ok && r.version);
					remoteVersion = raw ? raw.version : null;
					$.remote.textContent = remoteVersion ? `v${remoteVersion}（代码库）` : "检测失败";
				}
			} else {
				$.remote.textContent = "检测失败";
			}
			if (anyOk) {
				setDisabled($.start, false);
				// 增量按钮：需要本地已有基准清单（首次/手动安装后需先全量一次）
				const hasBaseline = !!(await readStoredManifest());
				setDisabled($.inc, !hasBaseline);
				const newest = remoteVersion && remoteVersion == localVersion();
				let msg = `测速完成，最快源：${sourceOrder.find((s) => s.res.ok).src.label}`;
				msg += newest ? `。当前已是最新版本（v${localVersion()}），可强制重装` : `。发现新版本：${localVersion()} → ${remoteVersion || "未知"}`;
				if (!hasBaseline) {
					msg += "。本地无增量基准，请先执行一次全量更新";
				}
				setStatus(msg);
			} else {
				setStatus("所有下载源均不可达，请检查网络（或系统代理）后重新测速", "err");
			}
			setDisabled($.check, false);
		}
		const writeFileTo = async (file, data) => {
			const local = `extension/${NAME}/${file}`;
			await game.promises.ensureDirectory(local, null, true);
			const slash = local.lastIndexOf("/");
			await new Promise((resolve, reject) =>
				game.writeFile(data, local.slice(0, slash), local.slice(slash + 1), (err) => (err ? reject(err) : resolve()))
			);
		};
		async function startUpdate() {
			setDisabled($.check, true);
			setDisabled($.start, true);
			$.restart.style.display = "none";
			abortCtrl = new AbortController();
			// ① 下载压缩包：按连通性检测出的源顺序降级，流式字节进度
			const setZipProgress = (received, size) => {
				$.fill.style.width = `${Math.min(size ? (received / size) * 100 : 0, 99).toFixed(1)}%`;
				$.progress.textContent = `下载中 · ${fmtSize(received)}${size ? ` / ${fmtSize(size)}` : ""}`;
			};
			try {
				// 下载前重新取一次Release版本号，缩小检测与下载之间的时间窗
				setStatus("正在获取最新 Release 信息…");
				const releaseVersion = await fetchReleaseVersion();
				if (releaseVersion) {
					remoteVersion = releaseVersion;
					$.remote.textContent = `v${remoteVersion}`;
				}
				setStatus("正在下载更新压缩包…");
				let data = null;
				let lastError = null;
				for (const { src } of sourceOrder) {
					try {
						const resp = await fetch(zipUrlOf(src), { signal: abortCtrl.signal });
						if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
						const size = Number(resp.headers.get("content-length")) || 0;
						if (!resp.body || typeof resp.body.getReader != "function") {
							data = new Uint8Array(await resp.arrayBuffer());
							break;
						}
						const reader = resp.body.getReader();
						const chunks = [];
						let received = 0;
						for (;;) {
							const { done, value } = await reader.read();
							if (done) break;
							chunks.push(value);
							received += value.length;
							setZipProgress(received, size);
						}
						data = new Uint8Array(received);
						let off = 0;
						for (const chunk of chunks) {
							data.set(chunk, off);
							off += chunk.length;
						}
						break;
					} catch (e) {
						if (e.name == "AbortError") throw e;
						lastError = e;
					}
				}
				if (!data) throw lastError || new Error("压缩包下载失败");
				// ② 解压并逐条写盘：info.json（版本号）暂存内存，其余立即覆盖，全部成功才最后写版本号
				setStatus(`下载完成（${fmtSize(data.length)}），正在解压覆盖…`);
				const zip = await new Promise((resolve) => get.zip(resolve));
				zip.load(data);
				const folder = `${NAME}/`;
				const entries = Object.keys(zip.files)
					.map((key) => zip.files[key])
					.filter((entry) => !entry.dir && !(entry.options && entry.options.dir) && !/[\\/]$/.test(entry.name));
				const stray = entries.find((entry) => !entry.name.startsWith(folder));
				if (stray) throw new Error(`压缩包内出现意外条目：${stray.name}`);
				if (!entries.length) throw new Error("压缩包内容为空");
				let infoJsonBytes = null;
				let infoJsonVersion = null;
				let done = 0;
				for (const entry of entries) {
					const rel = entry.name.slice(folder.length);
					$.fill.style.width = `${((done / entries.length) * 100).toFixed(1)}%`;
					$.progress.textContent = `解压覆盖中 · ${done + 1}/${entries.length}`;
					$.cur.textContent = rel;
					const bytes = entry.asUint8Array();
					done++;
					if (rel == "info.json") {
						infoJsonBytes = bytes;
						try {
							infoJsonVersion = JSON.parse(new TextDecoder().decode(bytes)).version;
						} catch {
							infoJsonVersion = null;
						}
						continue;
					}
					await writeFileTo(rel, /\.(js|json)$/.test(rel) ? new TextDecoder().decode(bytes) : bytes);
				}
				// 全部覆盖成功 → 最后一步才写版本号文件与本地配置
				if (!infoJsonBytes) throw new Error("压缩包中缺少 info.json");
				await writeFileTo("info.json", new TextDecoder().decode(infoJsonBytes));
				const finalVersion = infoJsonVersion || remoteVersion;
				if (finalVersion) game.saveConfig(`extension_${NAME}_version`, finalVersion);
				game.saveConfig(`extension_${NAME}_updateTime`, new Date().toLocaleString());
				// 写入增量基准清单，下次可选择增量更新（失败不影响本次结果）
				const remoteManifest = await fetchReleaseManifest();
				if (remoteManifest) {
					await writeFileTo(LOCAL_MANIFEST, JSON.stringify(remoteManifest));
				}
				$.fill.style.width = "100%";
				$.progress.textContent = `${entries.length} 个文件全部完成`;
				$.cur.textContent = "";
				// 实际安装的版本以压缩包内info.json为准；与Release标注不一致说明撞上了打包窗口，如实提示
				if (remoteVersion && infoJsonVersion && infoJsonVersion !== remoteVersion) {
					setStatus(`更新完成（实际安装 v${infoJsonVersion}，Release标注 v${remoteVersion} 不一致——刚才下到的是上一批打包，稍后可再更新一次）`, "ok");
				} else {
					setStatus(`更新完成（v${finalVersion || "?"}），重启游戏后生效`, "ok");
				}
				$.restart.style.display = "";
			} catch (e) {
				const reason = e.name == "AbortError" ? "已手动中止" : e.message;
				setStatus(`更新失败：${reason}。版本号未变更，可直接重新开始更新`, "err");
				setDisabled($.check, false);
				setDisabled($.start, false);
			} finally {
				abortCtrl = null;
			}
		}
		// 增量更新：对比Release清单与本地基准清单，仅下载有变化的文件（info.json最后写）
		async function startIncremental() {
			setDisabled($.check, true);
			setDisabled($.start, true);
			setDisabled($.inc, true);
			$.restart.style.display = "none";
			abortCtrl = new AbortController();
			try {
				setStatus("正在获取最新 Release 清单…");
				const releaseVersion = await fetchReleaseVersion();
				if (releaseVersion) {
					remoteVersion = releaseVersion;
					$.remote.textContent = `v${remoteVersion}`;
				}
				const remoteManifest = await fetchReleaseManifest();
				if (!remoteManifest) {
					throw new Error("清单获取失败，请改用全量更新");
				}
				const storedManifest = await readStoredManifest();
				if (!storedManifest) {
					throw new Error("本地无增量基准，请先执行一次全量更新");
				}
				const changeList = [];
				for (const path of Object.keys(remoteManifest)) {
					if (storedManifest[path] !== remoteManifest[path]) {
						changeList.push(path);
						continue;
					}
					// 哈希一致但本地文件缺失/为空（如被手动删除）时也补下
					try {
						const data = await game.promises.readFile(`extension/${NAME}/${path}`);
						if (!data || !data.byteLength) {
							changeList.push(path);
						}
					} catch {
						changeList.push(path);
					}
				}
				if (!changeList.length) {
					$.fill.style.width = "100%";
					$.progress.textContent = "增量检查完成：0 个文件需要更新";
					$.cur.textContent = "";
					setStatus(`本地文件与最新版（v${remoteVersion || "?"}）完全一致`, "ok");
					setDisabled($.check, false);
					setDisabled($.start, false);
					return;
				}
				// info.json（版本号）排到最后写
				const order = changeList.filter((f) => f != "info.json");
				if (changeList.includes("info.json")) {
					order.push("info.json");
				}
				let done = 0;
				for (const file of order) {
					$.fill.style.width = `${((done / order.length) * 100).toFixed(1)}%`;
					$.progress.textContent = `增量下载 · ${done + 1}/${order.length}`;
					$.cur.textContent = file;
					const bytes = await downloadRaw(file);
					done++;
					await writeFileTo(file, /\.(js|json)$/.test(file) ? new TextDecoder().decode(bytes) : bytes);
				}
				// 全部覆盖成功 → 写新清单作为下次增量基准，再写版本号配置
				await writeFileTo(LOCAL_MANIFEST, JSON.stringify(remoteManifest));
				const finalVersion = releaseVersion || remoteVersion;
				if (finalVersion) game.saveConfig(`extension_${NAME}_version`, finalVersion);
				game.saveConfig(`extension_${NAME}_updateTime`, new Date().toLocaleString());
				$.fill.style.width = "100%";
				$.progress.textContent = `${order.length} 个文件增量完成`;	
				$.cur.textContent = "";
				setStatus(`增量更新完成（v${finalVersion || "?"}），重启游戏后生效`, "ok");
				$.restart.style.display = "";
			} catch (e) {
				const reason = e.name == "AbortError" ? "已手动中止" : e.message;
				setStatus(`增量更新失败：${reason}。版本号未变更，可重试或改用全量更新`, "err");
				setDisabled($.check, false);
				setDisabled($.start, false);
				setDisabled($.inc, false);
			} finally {
				abortCtrl = null;
			}
		}
		function open() {
			// 仅 Electron/Node（含安卓端）具备写盘能力，浏览器端不支持
			if (typeof game.writeFile != "function") {
				alert("当前环境不支持在线更新，请在 PC 或安卓客户端中使用");
				return;
			}
			if (overlay) return;
			ktInjectCss();
			overlay = el("ktupd-overlay", document.body);
			const dialog = el("ktupd-dialog", overlay);
			el("ktupd-title", dialog, "kirito扩展 · 更新中心");
			const close = () => {
				if (abortCtrl && !confirm("更新进行中，关闭将中止本次更新（版本号不会变更）。确定关闭？")) return;
				if (abortCtrl) abortCtrl.abort();
				overlay.remove();
				overlay = null;
			};
			const closeBtn = el("ktupd-close", dialog, "✕");
			closeBtn.onclick = close;
			overlay.onclick = (e) => {
				if (e.target === overlay) close();
			};
			el("ktupd-row", dialog).innerHTML = `<span>当前版本</span><b>v${localVersion()}</b>`;
			const rowRemote = el("ktupd-row", dialog);
			rowRemote.innerHTML = "<span>远程版本</span>";
			$.remote = document.createElement("b");
			$.remote.textContent = "待检测";
			rowRemote.appendChild($.remote);
			el("ktupd-row", dialog).innerHTML = `<span>最后在线更新</span><b>${lib.config[`extension_${NAME}_updateTime`] || "从未（手动安装）"}</b>`;
			el("ktupd-section", dialog, "① 检测连通性");
			$.check = el("ktupd-btn", dialog, "检测连通性");
			$.check.onclick = function () {
				if (this.hasAttribute("disabled")) return;
				checkConnectivity().catch((e) => setStatus(`检测出错：${e.message}`, "err"));
			};
			$.srcs = SOURCES.map((src) => el("ktupd-src", dialog, `● ${src.label} — 未检测`));
			el("ktupd-section", dialog, "② 下载更新");
			el("ktupd-hint", dialog, "增量：仅下载有变化的文件（几秒完成，需已有增量基准）；全量：下载完整压缩包解压覆盖（约86MB）");
			$.inc = el("ktupd-btn", dialog, "增量更新（仅变化文件）");
			setDisabled($.inc, true);
			$.inc.onclick = function () {
				if (this.hasAttribute("disabled")) return;
				startIncremental();
			};
			$.start = el("ktupd-btn green", dialog, "全量更新（完整压缩包）");
			setDisabled($.start, true);
			$.start.onclick = function () {
				if (this.hasAttribute("disabled")) return;
				startUpdate();
			};
			$.restart = el("ktupd-btn green", dialog, "立即重启游戏");
			$.restart.style.display = "none";
			$.restart.onclick = () => game.reload();
			el("ktupd-bar", dialog).appendChild(($.fill = document.createElement("div"))).className = "ktupd-fill";
			$.progress = el("ktupd-cur", dialog, "");
			$.cur = el("ktupd-cur", dialog, "");
			$.status = el("ktupd-status", dialog, "请先测速（会自动选择最快的下载源），通过后可选择增量或全量更新");
		}
		return { open };
	})();
	// 降临技能池管理：扩展设置里点按钮弹出的遮罩窗口（与更新中心共用KT_CSS样式）
	// 池子存于配置 extension_kirito扩展_touyingPool（数组），投影发动时读取；
	// 未配置过时用默认池 DEFAULT_TOUYING_POOL；上限20个；改动即时保存
	const ktPoolManager = (() => {
		const KEY = "extension_kirito扩展_touyingPool";
		const MAX = 20;
		// 本扩展自有技能（多不在任何武将技能列表上，作为搜索候选的固定补充）
		const OWN_SKILLS = [...DEFAULT_TOUYING_POOL, "kthuitian"];
		let overlay = null;
		const $ = {};
		// 候选全集：本体+已开启扩展所有武将的技能 + 本扩展自有技能（跳过投影自身与无名条目）
		const buildCandidates = () => {
			const map = new Map();
			for (const cname in lib.character) {
				const info = lib.character[cname];
				if (!info || !Array.isArray(info.skills)) continue;
				for (const skill of info.skills) {
					if (typeof skill != "string" || skill == "grytouying" || map.has(skill) || skill.includes("#")) continue;
					if (!lib.skill[skill] || !lib.translate[skill] || !lib.translate[skill + "_info"]) continue;
					map.set(skill, get.translation(cname) || cname);
				}
			}
			for (const skill of OWN_SKILLS) {
				if (!map.has(skill) && lib.skill[skill] && lib.translate[skill] && lib.translate[skill + "_info"]) {
					map.set(skill, "kirito扩展");
				}
			}
			return map;
		};
		const getPool = () => {
			const saved = lib.config[KEY];
			return Array.isArray(saved) ? saved.filter((skill) => typeof skill == "string") : [];
		};
		const savePool = (pool) => game.saveConfig(KEY, pool);
		const el = (cls, parent, text) => {
			const node = document.createElement("div");
			node.className = cls;
			if (text != null) node.textContent = text;
			parent.appendChild(node);
			return node;
		};
		function render() {
			const pool = getPool();
			const candidates = buildCandidates();
			// 已选池：标签列表，点标签=移除
			$.chips.innerHTML = "";
			$.count.textContent = `${pool.length}/${MAX}`;
			if (!pool.length) {
				el("ktupd-empty", $.chips, "池子为空：游戏内降临将没有可选技能，点下方「恢复默认」可一键还原");
			}
			for (const skill of pool) {
				const chip = el("ktupd-chip", $.chips, `【${lib.translate[skill] || skill}】✕`);
				chip.title = "点击移除";
				chip.onclick = () => {
					savePool(getPool().filter((s) => s != skill));
					render();
				};
			}
			// 搜索结果：按技能名/ID/所属武将过滤
			$.list.innerHTML = "";
			const query = ($.search.value || "").trim().toLowerCase();
			let shown = 0;
			for (const [skill, owner] of candidates) {
				if (query && !skill.toLowerCase().includes(query) && !(lib.translate[skill] || "").toLowerCase().includes(query) && !owner.toLowerCase().includes(query)) {
					continue;
				}
				if (shown >= 40) {
					el("ktupd-empty", $.list, "结果过多，仅显示前40条，请换个更精确的关键词");
					break;
				}
				shown++;
				const item = el("ktupd-item", $.list);
				const left = el("div", item);
				left.innerHTML = `<b style="color:#eaf1ff">【${lib.translate[skill]}】</b><span class="owner">${owner}</span>`;
				left.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
				const inPool = pool.includes(skill);
				const full = pool.length >= MAX;
				const btn = el(`ktupd-add${inPool || full ? " off" : ""}`, item, inPool ? "已添加" : full ? "已满" : "+ 添加");
				if (!inPool && !full) {
					btn.onclick = () => {
						const next = getPool();
						if (next.length >= MAX || next.includes(skill)) return;
						next.push(skill);
						savePool(next);
						render();
					};
				}
			}
			if (!shown) {
				el("ktupd-empty", $.list, "没有匹配的技能");
			}
		}
		function open() {
			if (overlay) return;
			ktInjectCss();
			overlay = el("ktupd-overlay", document.body);
			const dialog = el("ktupd-dialog", overlay);
			el("ktupd-title", dialog, "降临技能池管理");
			const close = () => {
				overlay.remove();
				overlay = null;
			};
			const closeBtn = el("ktupd-close", dialog, "✕");
			closeBtn.onclick = close;
			overlay.onclick = (e) => {
				if (e.target === overlay) close();
			};
			const hintRow = el("ktupd-row", dialog);
			hintRow.innerHTML = "<span>已选技能</span>";
			$.count = document.createElement("b");
			$.count.textContent = "0/20";
			hintRow.appendChild($.count);
			el("ktupd-hint", dialog, "点下方标签移除技能；在搜索框中按技能名/ID/武将名筛选后点「+ 添加」加入（上限20个）。改动即时保存，对下一局生效");
			$.chips = el("ktupd-chips", dialog);
			$.search = document.createElement("input");
			$.search.className = "ktupd-search";
			$.search.placeholder = "搜索：技能名 / 技能ID / 武将名（本体与已开启扩展的全部武将）";
			$.search.oninput = () => render();
			dialog.appendChild($.search);
			$.list = el("ktupd-list", dialog);
			const footer = el("div", dialog);
			footer.style.cssText = "margin-top:12px";
			const resetBtn = el("ktupd-btn", footer, "恢复默认（本扩展全部技能）");
			resetBtn.onclick = () => {
				savePool(DEFAULT_TOUYING_POOL.slice());
				render();
			};
			render();
		}
		return { open };
	})();
	return {
		name: "kirito扩展",
		editable: true,
		connect: false,
		arenaReady: function () {},
		content: function (config, pack) {},
		prepare: function () {},
		precontent: function (config) {
			// 无上神专属"寂灭"进度条样式：复刻自无名美化手杀神马超模块，类名一致（见 grytouying_bar）
			lib.init.css(lib.assetURL + "extension/kirito扩展", "wushangshen_bar");
			// 资产镜像：走本体FS抽象（readFile/writeFile），PC/安卓通用。
			// 不用fetch的原因：①部分安卓webview下对资源URL的fetch不可靠；②旧版"存在即跳过"，
			// 历史中断留下的0字节文件会被永远跳过——结算头像空白即此因，现校验非空可自愈
			if (typeof game.writeFile == "function" && game.promises && typeof game.promises.readFile == "function") {
				const copyFile = async (from, to) => {
					try {
						const existing = await game.promises.readFile(to);
						if (existing && existing.byteLength > 0) {
							return;
						}
					} catch {}
					try {
						const data = await game.promises.readFile(from);
						if (!data || !data.byteLength) {
							return;
						}
						const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
						await game.promises.ensureDirectory(to, null, true);
						const slash = to.lastIndexOf("/");
						await new Promise((resolve, reject) =>
							game.writeFile(bytes, to.slice(0, slash), to.slice(slash + 1), (err) => (err ? reject(err) : resolve()))
						);
						console.log(`kirito扩展：已镜像 ${to}`);
					} catch (e) {
						console.warn(`kirito扩展：镜像 ${to} 失败`, e);
					}
				};
				// (1) 立绘：十周年UI头像/限定技大字特效/MVP结算页等消费方直接请求本体 image/character/<武将>.jpg，
				// 不读扩展目录（404导致结算大头像空白）
				copyFile("extension/kirito扩展/wushangshen.jpg", "image/character/wushangshen.jpg");
				copyFile("extension/kirito扩展/god.jpg", "image/character/god.jpg");
				// (2) 限定技大字背景：太虚幻境版 decadeUI.effect.skill 读 extension/十周年UI/assets/image/bg_xianding_<势力>.png，
				// 本地十周年UI裁剪包无 assets/image/ 目录——shen 404后兜底qun也404，onload永不触发，整段特效（大字+立绘+底盘）不渲染。
				// 十周年UI自带 image/ui/misc/ 下仅有 wei/shu/wu/qun 四张（shen无官方素材，用qun占位），全部镜像补齐
				for (const camp of ["wei", "shu", "wu", "qun"]) {
					copyFile(`extension/十周年UI/image/ui/misc/bg_xianding_${camp}.png`, `extension/十周年UI/assets/image/bg_xianding_${camp}.png`);
				}
				copyFile("extension/十周年UI/image/ui/misc/bg_xianding_qun.png", "extension/十周年UI/assets/image/bg_xianding_shen.png");
				copyFile("extension/十周年UI/image/ui/misc/bg_xianding_qun.png", "extension/十周年UI/image/ui/misc/bg_xianding_shen.png");
			}
			// 十周年UI动皮配置：素材与配置完全自持（assets/dynamic/神马超/风霆啸野 为十周年UI同名动皮的完整副本）。
			// 十周年UI播放器以 extension/十周年UI/assets/dynamic/ 为基址拼接皮肤name，
			// 故用 ../../../ 回溯到本扩展目录；十周年UI初始化会整体重建 dynamicSkin 表且与本扩展加载顺序不定，
			// 故轮询等待其表就绪后注入，注入成功即停止；未安装十周年UI时15秒后静默放弃（仅失去动皮，其余功能不受影响）
			const install = () => {
				if (!window.decadeUI || !decadeUI.dynamicSkin) {
					return false;
				}
				if (!decadeUI.dynamicSkin.wushangshen) {
					const skinDir = "../../../kirito扩展/assets/dynamic/神马超/风霆啸野";
					decadeUI.dynamicSkin.wushangshen = {
						风霆啸野: {
							name: `${skinDir}/XingXiang`,
							x: [0, 1.1],
							y: [0, 0.25],
							scale: 0.4,
							angle: 0,
							beijing: {
								name: `${skinDir}/BeiJing`,
								scale: 0.3,
								x: [0, 0.4],
								y: [0, 0.5],
							},
						},
					};
				}
				return true;
			};
			if (!install()) {
				const timer = setInterval(() => {
					if (install()) {
						clearInterval(timer);
					}
				}, 500);
				setTimeout(() => clearInterval(timer), 15000);
			}
		},
		help: {},
		config: {
			// 版本信息：展示当前版本与最后在线更新时间（在线更新成功时记录到本地配置）
			versionInfo: {
				name: `当前版本：v${VERSION}\n最后更新：${lib.config["extension_kirito扩展_updateTime"] || "从未在线更新（手动安装）"}`,
				clear: true,
				onclick() {
					alert(`当前版本：v${VERSION}\n最后在线更新：${lib.config["extension_kirito扩展_updateTime"] || "从未在线更新（手动安装）"}`);
				},
			},
			// 在线更新：独立更新中心窗口（连通性检测→进度条下载→全部成功才写版本号，失败版本号不变）
			checkUpdate: {
				name: "更新中心（独立窗口）",
				intro: "多源自动测速择优。增量更新：仅下载有变化的文件，几秒完成（首次需先全量一次建立基准）；全量更新：下载整包压缩包解压覆盖。两者均在全部写入成功后才写版本号，中途出错版本号不变。完成后需重启游戏生效",
				clear: true,
				onclick() {
					ktUpdateCenter.open();
				},
			},
			// 降临技能池：管理无上神〖降临〗局内可选的技能（默认本扩展全部技能，可增删，上限20）
			touyingPool: {
				name: "降临技能池管理（增加/排除）",
				intro: "管理〖降临〗游戏开始时可挑选的技能池：默认为本扩展全部技能；可搜索添加本体及已开启扩展武将的所有技能（上限20个），点标签排除不需要的技能。改动即时保存，下一局生效",
				clear: true,
				onclick() {
					ktPoolManager.open();
				},
			},
		},
		package: {
			character: {
				// 声明为国战角色包：加载时加入 lib.characterGuozhanFilter，开启"仅国战武将"时也能入选
				mode: "guozhan",
				character: {
					// 以本体神赵云(character/extra.js:shen_zhaoyun)为底，仅名字、血量不同，技能为强化版
					// 用 Character 实例而非普通对象：[1] 等旧式下标访问映射到 group，国战选将配对代码依赖它
					god: new Character({
						sex: "male",
						group: "shen",
						hp: 3,
						maxHp: 3,
						hujia: 0,
						skills: ["gryjuejing", "grylonghun"],
						groupInGuozhan: "shu",
						// AI 禁选：AI 不选用此武将，玩家仍可正常选择
						isAiForbidden: true,
						// 不写img：自动使用 extension/kirito扩展/god.jpg
						dieAudios: ["ext:kirito扩展/audio/die/god.mp3"],
					}),
					// 以手杀神马超(mb_shen_machao)为主本：立绘/阵亡语音/皮肤/动皮/特效均复用其素材
					// 立绘=extension/kirito扩展/wushangshen.jpg（本体 image/character/mb_shen_machao.jpg 的副本）
					// 动皮经 precontent 注入十周年UI别名表（wushangshen → mb_shen_machao 的"风霆啸野"）
					wushangshen: new Character({
						sex: "male",
						group: "shen",
						hp: 4,
						maxHp: 4,
						hujia: 0,
						skills: ["grytouying"],
						groupInGuozhan: "qun",
						// AI 禁选：AI 不选用此武将，玩家仍可正常选择
						isAiForbidden: true,
						// 阵亡语音为自带副本（手杀神马超阵亡语音，audio/die/wushangshen.mp3）
						dieAudios: ["ext:kirito扩展/audio/die/wushangshen.mp3"],
					}),
				},
				translate: {
					god: "龙神赵云",
					wushangshen: "无上神",
				},
				characterIntro: {
					wushangshen: "kirito的自制的无上神武将",
				},
			},
			card: {
				card: {},
				translate: {},
				list: [],
			},
			skill: {
				skill: {
					/* ===== 绝境（强化版，本体技能见 character/extra.js xinjuejing）=====
					 * 原效果：手牌上限+2；进入/脱离濒死摸一张牌
					 * 新增：①附不会翻面、体力上限不可被扣除；摸牌阶段+X；至其他角色距离-X；每回合用牌上限+X；绝境/龙魂/驭雳/霆威不可被移除或禁用
					 * X = getDamagedHp() 已损失体力值（不封顶） */
					gryjuejing: {
						audio: "xinjuejing",
						// 移除防护（官方机制）：removeSkill 对 fixed 技能直接拒绝，断肠 clearSkills 亦走此路径
						fixed: true,
						mod: {
							maxHandcard(player, num) {
								return 2 + num;
							},
							// 新增：与其他角色距离额外减X
							globalFrom(from, to, distance) {
								return distance - juejingX(from);
							},
							// 新增：本回合使用牌的次数上限+X（杀、酒等）
							cardUsable(card, player, num) {
								if (num > 0 && num < Infinity) {
									return num + juejingX(player);
								}
							},
							aiOrder(player, card, num) {
								if (num <= 0 || !player.isPhaseUsing() || !get.tag(card, "recover")) {
									return num;
								}
								if (player.needsToDiscard() > 1) {
									return num;
								}
								return 0;
							},
						},
						trigger: { player: ["dying", "dyingAfter"] },
						forced: true,
						async content(event, trigger, player) {
							await player.draw(2);
						},
						ai: {
							effect: {
								target(card, player, target) {
									if (target.getHp() > 1) {
										return;
									}
									if (get.tag(card, "damage") || get.tag(card, "loseHp")) {
										return [1, 1];
									}
								},
							},
						},
						group: ["gryjuejing_draw", "gryjuejing_guard"],
						subSkill: {
							// 新增：摸牌阶段多摸X张牌（写法同本体oldjuejing）
							draw: {
								trigger: { player: "phaseDrawBegin2" },
								forced: true,
								filter(event, player) {
									return !event.numFixed && player.getDamagedHp() > 0;
								},
							async content(event, trigger, player) {
								trigger.num += juejingX(player);
							},
							},
							// 新增⑥：技能守护——当前角色拥有的所有技能均不可被禁用或封锁
						 // 移除防护由 fixed: true 承担（绝境/龙魂/驭雳/霆威）；禁用（disableSkill，铁骑/止息类）与
							// 封锁（get.is.blocked，skillBlocker体系）在 init 中包一层拦截
							guard: {
								charlotte: true,
								silent: true,
								init() {
									// 守护拦截器为绝境⑥/神体③共用（见模块顶部的 installGrySkillGuard），只装一次
									installGrySkillGuard();
								},
							},
						},
					},
					/* ===== 神体（自定义技能，绝境①②⑥的独立复制版，绝境本身不受影响）=====
					 * ①手牌上限+2、不会翻面、体力上限不会减少；②进入/脱离濒死状态摸两张牌；③所有技能不被禁用/封锁
					 * 语音与绝境一致（xinjuejing）；守护拦截器与绝境共用（见 installGrySkillGuard） */
					gryshenti: {
						audio: "xinjuejing",
						// 移除防护（官方机制）：与绝境同理，removeSkill 对 fixed 技能直接拒绝
						fixed: true,
						mod: {
							maxHandcard(player, num) {
								return 2 + num;
							},
						},
						trigger: { player: ["dying", "dyingAfter"] },
						forced: true,
						async content(event, trigger, player) {
							await player.draw(2);
						},
						ai: {
							effect: {
								target(card, player, target) {
									if (target.getHp() > 1) {
										return;
									}
									if (get.tag(card, "damage") || get.tag(card, "loseHp")) {
										return [1, 1];
									}
								},
							},
						},
						group: ["gryshenti_guard"],
						subSkill: {
							guard: {
								charlotte: true,
								silent: true,
								init() {
							// 守护拦截器为绝境⑥/神体③共用（见 installGrySkillGuard），只装一次
								installGrySkillGuard();
							},
						},
					},
				},
				/* ===== 龙魂（强化版，本体技能见 character/extra.js relonghun）=====
				 * 原效果：花色转化+双张强化，全部保留
				 * 新增："魂"计数持续累计不清空（单张牌发动+1，两张牌发动+2），计数为1或2的倍数时摸一张牌
				 * 计数≥12：杀/决斗指定目标后二选一（伤害+1/拿一张牌）
				 * 计数≥24：龙魂杀/无懈不可被响应；单张转化闪/无懈后获得当前回合角色一张牌；
				 * 龙魂转化使用的牌不计入使用次数；龙魂转化的【桃】自带酒效果（不占酒次数） */
				grylonghun: {
						audio: "relonghun",
						// 移除防护（官方机制）：与绝境同理，防止被断肠等移除型效果剥离
						fixed: true,
						mod: {
							aiOrder(player, card, num) {
								if (num <= 0 || !player.isPhaseUsing() || player.needsToDiscard() < 2) {
									return num;
								}
								let suit = get.suit(card, player);
								if (suit === "heart") {
									return num - 3.6;
								}
							},
							aiValue(player, card, num) {
								if (num <= 0) {
									return num;
								}
								let suit = get.suit(card, player);
								if (suit === "heart") {
									return num + 3.6;
								}
								if (suit === "club") {
									return num + 1;
								}
								if (suit === "spade") {
									return num + 1.8;
								}
							},
							aiUseful(player, card, num) {
								if (num <= 0) {
									return num;
								}
								let suit = get.suit(card, player);
								if (suit === "heart") {
									return num + 3;
								}
								if (suit === "club") {
									return num + 1;
								}
								if (suit === "spade") {
									return num + 1;
								}
							},
						},
						locked: false,
						enable: ["chooseToUse", "chooseToRespond"],
						prompt: "将♦牌当做杀，♥牌当做桃，♣牌当做闪，♠牌当做无懈可击使用或打出",
						viewAs(cards2, player) {
							if (cards2.length) {
								var name = false,
									nature = null;
								switch (get.suit(cards2[0], player)) {
									case "club":
										name = "shan";
										break;
									case "diamond":
										name = "sha";
										nature = "fire";
										break;
									case "spade":
										name = "wuxie";
										break;
									case "heart":
										name = "tao";
										break;
								}
								if (name) {
									return { name, nature };
								}
							}
							return null;
						},
						check(card) {
							if (ui.selected.cards.length) {
								return 0;
							}
							var player = _status.event.player;
							if (_status.event.type == "phase") {
								var max = 0;
								var name2;
								var list = ["sha", "tao"];
								var map = { sha: "diamond", tao: "heart" };
								for (var i = 0; i < list.length; i++) {
									var name = list[i];
									if (
										player.countCards("hes", function (card2) {
											return (name != "sha" || get.value(card2) < 5) && get.suit(card2, player) == map[name];
										}) > 0 &&
										player.getUseValue({ name, nature: name == "sha" ? "fire" : null }) > 0
									) {
										var temp = get.order({ name, nature: name == "sha" ? "fire" : null });
										if (temp > max) {
											max = temp;
											name2 = map[name];
										}
									}
								}
								if (name2 == get.suit(card, player)) {
									return name2 == "diamond" ? 5 - get.value(card) : 20 - get.value(card);
								}
								return 0;
							}
							return 1;
						},
						selectCard: [1, 2],
						complexCard: true,
						position: "hes",
						filterCard(card, player, event) {
							if (ui.selected.cards.length) {
								return get.suit(card, player) == get.suit(ui.selected.cards[0], player);
							}
							event = event || _status.event;
							var filter = event._backup.filterCard;
							var name = get.suit(card, player);
							if (name == "club" && filter(get.autoViewAs({ name: "shan" }, "unsure"), player, event)) {
								return true;
							}
							if (name == "diamond" && filter(get.autoViewAs({ name: "sha", nature: "fire" }, "unsure"), player, event)) {
								return true;
							}
							if (name == "spade" && filter(get.autoViewAs({ name: "wuxie" }, "unsure"), player, event)) {
								return true;
							}
							if (name == "heart" && filter(get.autoViewAs({ name: "tao" }, "unsure"), player, event)) {
								return true;
							}
							return false;
						},
						filter(event, player) {
							var filter = event.filterCard;
							if (filter(get.autoViewAs({ name: "sha", nature: "fire" }, "unsure"), player, event) && player.countCards("hes", { suit: "diamond" })) {
								return true;
							}
							if (filter(get.autoViewAs({ name: "shan" }, "unsure"), player, event) && player.countCards("hes", { suit: "club" })) {
								return true;
							}
							if (filter(get.autoViewAs({ name: "tao" }, "unsure"), player, event) && player.countCards("hes", { suit: "heart" })) {
								return true;
							}
							if (filter(get.autoViewAs({ name: "wuxie" }, "unsure"), player, event) && player.countCards("hes", { suit: "spade" })) {
								return true;
							}
							return false;
						},
						ai: {
							respondSha: true,
							respondShan: true,
							skillTagFilter(player, tag) {
								var name;
								switch (tag) {
									case "respondSha":
										name = "diamond";
										break;
									case "respondShan":
										name = "club";
										break;
									case "save":
										name = "heart";
										break;
								}
								if (!player.countCards("hes", { suit: name })) {
									return false;
								}
							},
							order(item, player) {
								if (player && _status.event.type == "phase") {
									var max = 0;
									var list = ["sha", "tao"];
									var map = { sha: "diamond", tao: "heart" };
									for (var i = 0; i < list.length; i++) {
										var name = list[i];
										if (
											player.countCards("hes", function (card) {
												return (name != "sha" || get.value(card) < 5) && get.suit(card, player) == map[name];
											}) > 0 &&
											player.getUseValue({
												name,
												nature: name == "sha" ? "fire" : null,
											}) > 0
										) {
											var temp = get.order({
												name,
												nature: name == "sha" ? "fire" : null,
											});
											if (temp > max) {
												max = temp;
											}
										}
									}
									max /= 1.1;
									return max;
								}
								return 2;
							},
						},
						hiddenCard(player, name) {
							if (name == "wuxie" && _status.connectMode && player.countCards("hs") > 0) {
								return true;
							}
							if (name == "wuxie") {
								return player.countCards("hes", { suit: "spade" }) > 0;
							}
							if (name == "tao") {
								return player.countCards("hes", { suit: "heart" }) > 0;
							}
						},
						group: ["grylonghun_num", "grylonghun_discard", "grylonghun_turn", "grylonghun_choice", "grylonghun_direct", "grylonghun_single", "grylonghun_nocount", "grylonghun_taojiu"],
						subSkill: {
							// 原效果：龙魂转化两张杀/桃时伤害/回复+1
							num: {
								trigger: { player: "useCard" },
								forced: true,
								popup: false,
								filter(event) {
									var evt = event;
									return ["sha", "tao"].includes(evt.card.name) && evt.skill == "grylonghun" && evt.cards && evt.cards.length == 2;
								},
								async content(event, trigger, player) {
									trigger.baseDamage++;
								},
							},
							// 原效果：龙魂转化两张闪/无懈时弃置当前回合角色一张牌
							discard: {
								trigger: { player: ["useCardAfter", "respondAfter"] },
								forced: true,
								popup: false,
								logTarget() {
									return _status.currentPhase;
								},
								autodelay(event) {
									return event.name == "respond" ? 0.5 : false;
								},
								filter(evt, player) {
									return ["shan", "wuxie"].includes(evt.card.name) && evt.skill == "grylonghun" && evt.cards && evt.cards.length == 2 && _status.currentPhase && _status.currentPhase != player && _status.currentPhase.countDiscardableCards(player, "he");
								},
								async content(event, trigger, player) {
									player.line(_status.currentPhase, "green");
									await player.discardPlayerCard(_status.currentPhase, "he", true);
								},
							},
							// 新增：龙魂"魂"计数——单张牌发动+1，两张牌发动+2，持续累计不清空（跨回合保留）
							// 当本次计数结果为1或2的倍数时，摸一张牌（固定数量，不吃X加成）
							// 计数自增放在content执行（每次发动恰好触发一次）；filter保持纯只读
							turn: {
								trigger: { player: ["useCardAfter", "respondAfter"] },
								forced: true,
								filter(event, player) {
									return (get.sourceSkillFor(event) || event.skill) == "grylonghun";
								},
								async content(event, trigger, player) {
									if (!player.hasSkill("grylonghun_mark")) {
										player.addSkill("grylonghun_mark");
									}
									// 双牌转化+2，单张+1（双牌判断写法同num/discard子技能）
									player.addMark("grylonghun_mark", trigger.cards && trigger.cards.length == 2 ? 2 : 1, false);
								const count = player.countMark("grylonghun_mark");
								if (count == 1 || count % 2 == 0) {
									await player.draw(1);
								}
								},
							},
							// 新增：计数≥12——使用【杀】或【决斗】指定目标后二选一（逐目标询问，可放弃）：
							// 1.此伤害+1（经customArgs逐目标覆写baseDamage）2.获得该目标区域内一张牌（hej，无牌时该选项不出现）
							// 时机useCardToPlayered：早于效果结算与响应询问（写法参照本体铁骑）
							choice: {
								trigger: { player: "useCardToPlayered" },
								logTarget: "target",
								filter(event, player) {
									if (player.countMark("grylonghun_mark") < 12) return false;
									if (!event.card || !["sha", "juedou"].includes(event.card.name)) return false;
									return event.target && event.target != player && event.target.isIn();
								},
								async cost(event, trigger, player) {
									const target = trigger.target;
									const canGain = target.countGainableCards(player, "hej") > 0;
									const controls = [];
									if (canGain) {
										controls.push("获得其区域内一张牌");
									}
									controls.push("此伤害+1", "cancel2");
									const result = await player
										.chooseControl(...controls)
										.set("prompt", `〖龙魂〗：对${get.translation(target)}选择一项`)
										.set("prompt2", "1.此伤害+1；2.获得其区域内一张牌")
										.set("ai", () => {
											if (canGain && player.countCards("h") < 2) return "获得其区域内一张牌";
											return "此伤害+1";
										})
										.forResult();
									event.result = { bool: result.control != "cancel2", cost_data: result.control };
								},
								async content(event, trigger, player) {
									if (event.cost_data == "此伤害+1") {
										const parent = trigger.getParent();
										const args = parent.customArgs[trigger.target.playerid] ?? (parent.customArgs[trigger.target.playerid] = {});
										args.baseDamage = (typeof args.baseDamage == "number" ? args.baseDamage : parent.baseDamage) + 1;
									} else {
										await player.gainPlayerCard(trigger.target, "hej", true);
									}
								},
							},
							// 新增：计数≥24——龙魂转化的【杀】不可被响应；转化的【无懈可击】不可被【无懈可击】响应
							// 杀：directHit.addArray（写法参照本体玉衡）；无懈：置card.storage.nowuxie
							// （_wuxie全局技能过滤器的官方检查位）+ playernowuxie技能标签双保险
							direct: {
								trigger: { player: "useCard" },
								forced: true,
								popup: false,
								filter(event, player) {
									if (player.countMark("grylonghun_mark") < 24) return false;
									if ((get.sourceSkillFor(event) || event.skill) != "grylonghun") return false;
									return event.card && ["sha", "wuxie"].includes(event.card.name);
								},
								async content(event, trigger, player) {
									if (trigger.card.name == "sha") {
										trigger.directHit.addArray(trigger.targets || []);
									} else {
										trigger.card.storage = trigger.card.storage || {};
										trigger.card.storage.nowuxie = true;
									}
								},
								ai: {
									playernowuxie: true,
									skillTagFilter(player, tag, arg) {
										if (tag != "playernowuxie") return;
										return !!(arg && arg.name == "wuxie" && arg.storage && arg.storage.nowuxie && player.countMark("grylonghun_mark") >= 24);
									},
								},
							},
							// 新增：计数≥24——龙魂单张转化【闪】/【无懈可击】时，获得当前回合角色区域内一张牌
							// （与两张黑色牌的弃置效果并列：单张=获得归自己，两张黑色=弃置）
							single: {
								trigger: { player: ["useCardAfter", "respondAfter"] },
								forced: true,
								logTarget() {
									return _status.currentPhase;
								},
								autodelay(event) {
									return event.name == "respond" ? 0.5 : false;
								},
								filter(event, player) {
									if (player.countMark("grylonghun_mark") < 24) return false;
									if ((get.sourceSkillFor(event) || event.skill) != "grylonghun") return false;
									if (!["shan", "wuxie"].includes(event.card.name)) return false;
									if (!event.cards || event.cards.length != 1) return false;
									const current = _status.currentPhase;
									return current && current != player && current.countGainableCards(player, "hej") > 0;
								},
								async content(event, trigger, player) {
									await player.gainPlayerCard(_status.currentPhase, "hej", true);
								},
							},
							// 新增：计数≥24——龙魂转化使用的牌不计入使用次数（官方nocount模板写法：
							// useCard1时机置addCount=false并退还getStat统计，此后再出【杀】等不再被次数上限拦截）
							nocount: {
								trigger: { player: "useCard1" },
								forced: true,
								popup: false,
								firstDo: true,
								charlotte: true,
								filter(event, player) {
									if (player.countMark("grylonghun_mark") < 24) return false;
									if (event.addCount === false) return false;
									return (get.sourceSkillFor(event) || event.skill) == "grylonghun";
								},
								async content(event, trigger, player) {
									trigger.addCount = false;
									const stat = player.getStat().card;
									const name = trigger.card.name;
									if (typeof stat[name] == "number" && stat[name] > 0) {
										stat[name]--;
									}
									game.log(trigger.card, "不计入次数");
								},
							},
							// 新增：计数≥24——龙魂转化的【桃】自带酒效果：storage.jiu累加+挂本体jiu技能
							// （写法同本体【酒】伤害分支；下一张杀伤害+X由本体jiu在useCard1结算，用杀后/回合结束自动清除）
							// 非使用【酒】牌，不占用【酒】的使用次数；与已饮酒效果按本体规则叠加
							taojiu: {
								trigger: { player: "useCard1" },
								forced: true,
								popup: false,
								filter(event, player) {
									if (player.countMark("grylonghun_mark") < 24) return false;
									if (!event.card || event.card.name != "tao") return false;
									return (get.sourceSkillFor(event) || event.skill) == "grylonghun";
								},
								async content(event, trigger, player) {
									if (!player.storage.jiu) {
										player.storage.jiu = 0;
									}
									player.storage.jiu += 1;
									game.broadcastAll((target2) => {
										target2.addSkill("jiu");
										if (!target2.node.jiu && lib.config.jiu_effect) {
											target2.node.jiu = ui.create.div(".playerjiu", target2.node.avatar);
											target2.node.jiu2 = ui.create.div(".playerjiu", target2.node.avatar2);
										}
									});
									game.log(player, "的〖龙魂〗转化的【桃】附带酒效果");
								},
							},
						},
					},
						// 龙魂"魂"计数标记：持续累计，不清空；单张牌发动+1，两张牌发动+2；计数为1或2的倍数时摸一张牌
						grylonghun_mark: {
							locked: true,
							mark: true,
							marktext: "魂",
							intro: {
								name: "魂",
								content(storage) {
									return `当前"魂"计数：${storage || 0}（单张牌发动+1，两张牌发动+2，累计不清空）。当计数为1或2的倍数时，摸一张牌。`;
								},
							},
						},
						/* ===== 投影（无上神专属）=====
						 * 游戏开始时从技能池中挑选任意个技能加入本局游戏，然后失去此技能
						 * 候选池：绝境/龙魂（龙神赵云）+ 驭雳/霆威/寂灭（手杀神马超）+ 天涛/星魂/神霈（手杀神姜维）
						 * 时机写法（enterGame+phaseBefore）与挑选界面（chooseButton+textbutton列表）
						 * 参照本体潜龙 offline_longxuexuanhuang.js lxqianlong */
						grytouying: {
							trigger: { player: "enterGame", global: "phaseBefore" },
							forced: true,
							locked: true,
							group: ["grytouying_bar"],
							filter(event, player) {
								return event.name != "phase" || game.phaseNumber == 0;
							},
							async content(event, trigger, player) {
								// 常驻"寂灭"进度条：无论是否选择马超系技能都显示（见 grytouying_bar）
								if (lib._wssJimieBar) {
									lib._wssJimieBar.create(player);
								}
								// 候选池：可在扩展设置「降临技能池管理」中增删（存于配置 touyingPool），
								// 未配置时用默认池（DEFAULT_TOUYING_POOL，本扩展全部可选技能）。
								// 运行时再过滤：技能本体已注册且有描述文案才进列表，防止源包未加载或配置残留失效技能
								const saved = lib.config["extension_kirito扩展_touyingPool"];
								const pool = (Array.isArray(saved) && saved.length ? saved : DEFAULT_TOUYING_POOL).filter(
									(skill) => skill != "grytouying" && lib.skill[skill] && lib.translate[skill + "_info"]
								);
								if (pool.length) {
									const list = pool.map((skill) => [
										skill,
										`<div class="popup text" style="width:calc(100% - 10px);display:inline-block"><div class="skill">【${get.translation(skill)}】</div><div>${lib.translate[skill + "_info"]}</div></div>`,
									]);
									// 预构建对话框：自注入"全选/反选"按钮（选中逻辑复刻ui.create.buttonChooseAll，
									// 不受游戏选项"启用全选/反选按钮"开关影响，保证始终显示）
									const dialog = ui.create.dialog("降临：挑选任意个技能加入本局游戏", [list, "textbutton"], "hidden");
									const selectAll = ui.create.div(".select-all.popup.pointerdiv");
									selectAll.innerHTML = "全选";
									const caption = dialog.content.querySelector(".caption");
									if (caption) {
										dialog.content.insertBefore(selectAll, caption);
									} else {
										dialog.content.insertBefore(selectAll, dialog.content.firstChild);
									}
									selectAll.listen(function (e) {
										const event2 = get.event();
										const selecteds = [...ui.selected.buttons];
										ui.selected.buttons.length = 0;
										game.check();
										const selectables = get.selectableButtons();
										const buttons = selecteds.length ? [...new Set(selectables).difference(new Set(selecteds))] : selectables;
										ui.selected.buttons.push(...buttons);
										for (const button of ui.selected.buttons) {
											button.classList.add("selected");
										}
										for (const button of selecteds) {
											button.classList.remove("selected");
										}
										game.check();
										if (typeof event2.custom?.add?.button == "function") {
											event2.custom.add.button();
										}
										if (e) {
											e.stopPropagation();
										}
									});
									const chooseEvent = player.chooseButton({
										dialog: dialog,
										selectButton: [1, list.length],
										forced: true,
										ai(button) {
											const info = get.info(button.link);
											if (!info || info.ai?.neg || info.ai?.combo) {
												return 0;
											}
											return 1 + Math.random();
										},
									});
									// 挂到事件上后，引擎game.Check会在每次点选时自动刷新按钮文字（全选/反选）
									chooseEvent.buttonChooseAll = selectAll;
									// 覆写按钮点击：引擎默认在multitarget/complexSelect场景下点击已选按钮会
									// uncheck清空全部选中，这里改为逐项反选（只取消点中的那个）
									chooseEvent.custom = {
										replace: {
											button(button) {
												if (!button.classList.contains("selectable")) {
													return;
												}
												if (button.classList.contains("selected")) {
													ui.selected.buttons.remove(button);
													button.classList.remove("selected");
												} else {
													button.classList.add("selected");
													ui.selected.buttons.add(button);
												}
												game.check();
											},
										},
										add: {},
									};
									const result = await chooseEvent.forResult();
									if (result?.bool && result.links?.length) {
										game.log(player, "获得了技能", "#g" + result.links.map((skill) => `【${get.translation(skill)}】`).join(""));
										await player.addSkills(result.links);
									}
								}
								// 挑选完成后失去投影自身（投影不在绝境守护名单内，可正常移除）
								player.removeSkill("grytouying");
							},
							subSkill: {
								// 无上神专属"寂灭"进度条：复刻无名美化·手杀神马超模块的 createJimiePower/updateJimieNum
								// DOM结构与类名（jimiePower系）完全沿用，样式见 wushangshen_bar.css：
								// 无名美化模块开启时，其覆写的〖霆威〗〖寂灭〗内容会直接驱动本条（含满格特效与锁图标）；
								// 未开启时由下方的标记增减拦截负责刷新计数与进度，锁图标保持隐藏
								bar: {
									charlotte: true,
									silent: true,
									init() {
										if (lib._wssJimieBarInstalled) {
											return;
										}
										lib._wssJimieBarInstalled = true;
										const FULL_NUM = 8;
										// 刷新进度条：计数数字/clip-path填充/满8格循环特效（特效依赖无名美化的dcdAnim，缺席则只涨进度）
										const update = (player) => {
											const powerCon = player.querySelector(".jimiePower");
											if (!powerCon) {
												return;
											}
											const numEl = powerCon.querySelector(".jimieNum");
											const barArea = powerCon.querySelector(".jimiePowerBarArea");
											// 兼容两种标记名：克隆技能加 kttingwei，本体原版霆威加 tingwei
											const num = player.countMark("kttingwei") + player.countMark("tingwei");
											if (typeof window.dcdAnim != "undefined") {
												if (num >= FULL_NUM) {
													if (!player.storage._fullPowerAnim) {
														// 满力特效为自带副本（animation/shenmachao/），路径经 dcdAnim 基址回溯本扩展目录
														player.storage._fullPowerAnim = dcdAnim.playSpine(
															{ name: "../../../kirito扩展/animation/shenmachao/Ss_smc_vfx_grogress", loop: true },
															{ parent: barArea }
														);
													}
												} else if (player.storage._fullPowerAnim) {
													dcdAnim.stopSpine(player.storage._fullPowerAnim);
													player.storage._fullPowerAnim = null;
												}
											}
											if (numEl) {
												numEl.innerHTML = num;
											}
											if (barArea) {
												const percent = Math.min(100, (num / FULL_NUM) * 100);
												barArea.style.clipPath = `inset(${100 - percent}% 0 0 0)`;
											}
										};
										// 创建进度条：仅本地玩家使用无上神时显示；已存在则跳过
										const create = (player) => {
											if (game.me !== player || (player.name !== "wushangshen" && player.name2 !== "wushangshen")) {
												return;
											}
											if (player.querySelector(".jimiePower")) {
												return;
											}
											const powerCon = document.createElement("div");
											powerCon.classList.add("jimiePower");
											const num = document.createElement("span");
											num.classList.add("jimieNum");
											num.innerHTML = player.countMark("kttingwei") + player.countMark("tingwei") || 0;
											powerCon.appendChild(num);
											const barArea = document.createElement("div");
											barArea.classList.add("jimiePowerBarArea");
											const lock = document.createElement("img");
											lock.classList.add("jimieLock");
											lock.src = "extension/kirito扩展/image/wushangshen_bar/smc_jindutiao_suo.png";
											powerCon.appendChild(barArea);
											powerCon.appendChild(lock);
											player.appendChild(powerCon);
											update(player);
										};
										// 演出播放器（供克隆技能与下方接管逻辑共用）：寂灭大招 / 神霈·回天神光
										const playDazhao = () =>
											new Promise((resolve) => {
												if (typeof window.dcdAnim == "undefined") {
													resolve();
													return;
												}
												dcdAnim.loadSpine("../../../kirito扩展/animation/shenmachao/SS_smc_dazhao", "skel", () => {
													const anim = dcdAnim.playSpine(
														{ name: "../../../kirito扩展/animation/shenmachao/SS_smc_dazhao" },
														{ x: [0, 0.5], y: [0, 0.5] }
													);
													if (anim) {
														// 无条件挂完成回调（oncomplete 属性初始可能为空、播放中被调用，不能据此判断）
														anim.oncomplete = () => {
															anim.oncomplete = null;
															dcdAnim.stopSpine(anim);
															resolve();
														};
														// 兜底：播放器迟迟不回调时按时长放行，避免卡住结算
														setTimeout(resolve, 8000);
													} else {
														resolve();
													}
												});
											});
										const playSjwAn = (skillName) =>
											new Promise((resolve) => {
												if (typeof window.dcdAnim == "undefined") {
													resolve();
													return;
												}
												dcdAnim.loadSpine("../../../kirito扩展/animation/shenjiangwei/SS_Sjw_mask", "skel", () => {
													const mask = dcdAnim.playSpine({ name: "../../../kirito扩展/animation/shenjiangwei/SS_Sjw_mask", action: "play2", loop: true });
													dcdAnim.loadSpine(`../../../kirito扩展/animation/shenjiangwei/${skillName}`, "skel", () => {
														const main = dcdAnim.playSpine({ name: `../../../kirito扩展/animation/shenjiangwei/${skillName}` });
														if (main) {
															// 同 playDazhao：无条件挂完成回调 + 超时兜底
															main.oncomplete = () => {
																main.oncomplete = null;
																if (mask) {
																	dcdAnim.stopSpine(mask);
																}
																resolve();
															};
															setTimeout(() => {
																if (main.oncomplete) {
																	main.oncomplete = null;
																	if (mask) {
																		dcdAnim.stopSpine(mask);
																	}
																	resolve();
																}
															}, 8000);
														} else {
															if (mask) {
																dcdAnim.stopSpine(mask);
															}
															resolve();
														}
													});
												});
											});
										lib._wssJimieBar = { create, update, playDazhao };
										lib._wssSJWPlay = playSjwAn;
										// 拦截标记增减：霆标记变动即刷新（不依赖无名美化是否开启；
										// countMark 为纯存储读取，不会回调本拦截，无递归风险）
										const watchMark = (method) => {
											const origin = Player.prototype[method];
											Player.prototype[method] = function (name) {
												const result = origin.apply(this, arguments);
											if (name == "tingwei" || name == "kttingwei") {
												update(this);
											}
												return result;
											};
										};
										watchMark("addMark");
										watchMark("removeMark");
										// 接管寂灭释放演出：动画素材为自带副本（animation/shenmachao/SS_smc_dazhao）。
										// 仅当无名美化的手杀神马超模块未开启时接管（其开启时会自行覆写寂灭内容，
										// 我们再包一层会与它叠加导致动画播两次）；dcdAnim 即十周年UI动画系统(decadeUI.animation)，
										// 缺席时静默跳过演出，技能结算不受影响
										if (!lib.config.extension_无名美化_mbshenmachao && lib.skill.jimie && !lib.skill.jimie._wssDazhao) {
											lib.skill.jimie._wssDazhao = true;
											const originJimieContent = lib.skill.jimie.content;
											const playDazhao = lib._wssJimieBar.playDazhao;
											lib.skill.jimie.content = async function (event, trigger, player) {
												await playDazhao();
												await originJimieContent.apply(this, arguments);
												if (lib._wssJimieBar) {
													lib._wssJimieBar.update(player);
													const lock = player.querySelector && player.querySelector(".jimieLock");
													if (lock) {
														lock.style.display = "block";
													}
												}
											};
										}
										// 接管神霈/回天释放演出（面具+神光，素材自带副本 animation/shenjiangwei/）。
										// 仅当无名美化的手杀神姜维特效模块未开启时接管，防止与其覆写叠加导致动画播两次；
										// dcdAnim 缺席时静默跳过演出，技能结算不受影响
										if (!lib.config.extension_无名美化_shenjiangwei && lib.skill.mbshenpei && !lib.skill.mbshenpei._wssSJW) {
											lib.skill.mbshenpei._wssSJW = true;
											const playSjwAn = lib._wssSJWPlay;
											const wrapSJW = (skillName, animation) => {
												if (!lib.skill[skillName] || lib.skill[skillName]._wssSJW) {
													return;
												}
												lib.skill[skillName]._wssSJW = true;
												const originContent = lib.skill[skillName].content;
												lib.skill[skillName].content = async function (event, trigger, player) {
													await playSjwAn(animation);
													await originContent.apply(this, arguments);
												};
											};
											// 神霈=skill2神光，衍生技回天=skill1
											wrapSJW("mbshenpei", "SS_Sjw_skill2");
											wrapSJW("mbhuitian", "SS_Sjw_skill1");
										}
									},
								},
							},
						},
						/* ===== 以下为手杀神马超/神姜维技能的完整复刻（kt前缀隔离）=====
						 * 逻辑自本体 character/shiji/skill.js 原样移植：仅改名、音频指向扩展自带副本、内置释放演出
						 * （寂灭大招/神霈·回天神光，播放器见 grytouying_bar 的 playDazhao/playSjwAn）
						 * 不依赖本体手杀武将包与无名美化；投影候选池指向本组技能。
						 * "霆"标记沿用独立名 kttingwei，与本体标记互不干扰 */
						ktyuli: {
							audio: "ext:kirito扩展/audio/skill:6",
							// 移除防护：与绝境/龙魂同列，removeSkill 对 fixed 技能直接拒绝
							fixed: true,
							forced: true,
							trigger: {
								source: "damageBegin1",
								player: "damageBegin4",
							},
							filter(event, player, name) {
								// 已是雷电伤害也要触发（damageBegin1），进content的else分支执行伤害+1
								return name == "damageBegin1" || event.hasNature("thunder");
							},
							logAudio(event, player, name) {
								switch (name) {
									case "damageBegin1":
										return ["ext:kirito扩展/audio/skill/ktyuli1.mp3", "ext:kirito扩展/audio/skill/ktyuli2.mp3"];
									case "damageEnd":
										return ["ext:kirito扩展/audio/skill/ktyuli3.mp3", "ext:kirito扩展/audio/skill/ktyuli4.mp3"];
									case "damageBegin4":
										return ["ext:kirito扩展/audio/skill/ktyuli5.mp3", "ext:kirito扩展/audio/skill/ktyuli6.mp3"];
								}
							},
							async content(event, trigger, player) {
								switch (event.triggername) {
									case "damageBegin1":
										if (!trigger.hasNature("thunder")) {
											player.logSkill("ktyuli");
											game.setNature(trigger, "thunder");
										} else {
											player.logSkill("ktyuli", null, null, null, [get.rand(3, 4)]);
											trigger.num++;
										}
										updateState(player, "atk");
										break;
									case "damageBegin4":
										player.logSkill("ktyuli", null, null, null, [get.rand(5, 6)]);
										trigger.cancel();
										await player.draw(trigger.num);
										updateState(player, "def");
										break;
								}
								return;
								function updateState(player, type) {
									if (!player.awakenedSkills.includes("ktjimie")) {
										return;
									}
									switch (type) {
										case "atk":
											player.markAuto("ktyuli", ["atk"]);
											game.log(player, "触发了", "#g【驭雳】", "的第一项");
											break;
										case "def":
											player.markAuto("ktyuli", ["def"]);
											game.log(player, "触发了", "#g【驭雳】", "的第二项");
											break;
									}
									if (["atk", "def"].every(item => player.getStorage("ktyuli").includes(item)) && player.hasSkill("ktjimie", null, false, false)) {
										player.logSkill("ktjimie", null, null, null, [get.rand(3, 4)]);
										player.refreshSkill("ktjimie");
										player.setStorage("ktyuli", [], true);
									}
								}
							},
							onremove: true,
							intro: {
								content(storage = []) {
									if (!storage?.length) {
										return "尚未触发【驭雳】的任一项";
									}
									let str = "已触发【驭雳】的";
									if (storage.includes("atk")) {
										str += "第一项";
										if (storage.includes("def")) {
											str += "和";
										}
									}
									if (storage.includes("def")) {
										str += "第二项";
									}
									return str;
								},
							},
							ai: {
								nothunder: true,
								effect: {
									target(card, player, target) {
										if (get.tag(card, "thunderDamage")) {
											return "zeroplayertarget";
										}
									},
								},
							},
						},
						kttingwei: {
							audio: "ext:kirito扩展/audio/skill:4",
							// 移除防护：与绝境/龙魂/驭雳同列，removeSkill 对 fixed 技能直接拒绝
							fixed: true,
							logAudio: event =>
								typeof event == "number"
									? `ext:kirito扩展/audio/skill/kttingwei${event}.mp3`
									: [
											"ext:kirito扩展/audio/skill/kttingwei1.mp3",
											"ext:kirito扩展/audio/skill/kttingwei2.mp3",
											"ext:kirito扩展/audio/skill/kttingwei3.mp3",
											"ext:kirito扩展/audio/skill/kttingwei4.mp3",
										],
							trigger: { player: "useCardToPlayered" },
							filter(event) {
								return event.isFirstTarget && event.card?.name === "sha";
							},
							direct: true,
							logTarget: "targets",
							async cost(event, trigger, player) {
								// 默认发动：不再弹目标确认，按AI评分自动选择收益最高的目标
								const targets = trigger.targets;
								if (!targets.length) {
									event.result = { bool: false };
									return;
								}
								const scoreOf = (target) => {
									let score = 0;
									const nature = get.nature(trigger.card);
									const damage = get.damageEffect(target, player, player, nature);
									if (damage > 0) {
										score += damage * 1.8;
										if (target.hp <= 2) {
											score += 2;
										}
									}
									const skills = target.getSkills(null, false, false).filter(skill => {
										const info = get.info(skill);
										return info && !info.locked && !info.charlotte;
									});
									score += skills.length * 1.2;
									const equips1 = target.getGainableCards(player, "e");
									const equips2 = target.getGainableCards(player, "h", card => card.isKnownBy(player) && get.type(card) === "equip");
									const equips = equips1.concat(equips2);
									if (equips.length) {
										const values = equips.reduce((sum, card) => sum + get.value(card, target), 0) / equips.length;
										score += Math.min(3, values);
									}
									const cards = target.countDiscardableCards(target, "he");
									if (cards) {
										score += Math.min(3, 1 + 4 / cards);
									}
									if (!target.isLinked()) {
										score += 0.8;
										if (game.hasPlayer(current => current !== player && current.isLinked())) {
											score += 0.8;
										}
										if (nature) {
											score += 0.6;
										}
									}
									score *= Math.max(1, -get.attitude(player, target) / 3);
									return score;
								};
								let best = null;
								let bestScore = -Infinity;
								for (const target of targets) {
									const score = scoreOf(target);
									if (score > bestScore) {
										bestScore = score;
										best = target;
									}
								}
								event.result = { bool: true, targets: [best] };
							},
							async content(event, trigger, player) {
								player.addMark("kttingwei", 4);
								const target = event.targets[0];
								const result = await target
									.chooseButton({
										createDialog: [
											"霆威：请选择任意项，若点击“取消”，则你横置",
											[
												[
													["fengyin", "非锁定技失效至下个回合结束"],
													["equip", `交给${get.translation(player)}一张装备牌`],
													["damage", `${get.translation(trigger.card)}对你造成伤害+1`],
													["discard", "随机弃两张牌"],
												],
												"textbutton",
											],
										],
										filterButton(button, player) {
											const source = get.event().source;
											const link = button.link;
											const selected = ui.selected.buttons.map(button => button.link);
											switch (link) {
												case "fengyin":
													return !player.hasSkill("kttingwei_fengyin");
												case "equip": {
													const hasEquip = player.hasGainableCards(source, "he", { type: "equip" });
													if (!hasEquip) {
														return false;
													}
													if (!selected.includes("discard")) {
														return true;
													}
													return player.hasGainableCards(source, "he", card => get.type(card) === "equip" && player.hasDiscardableCards(player, "he", cardx => cardx !== card));
												}
												case "discard": {
													const hasCard = player.hasDiscardableCards(player, "he");
													if (!hasCard) {
														return false;
													}
													if (!selected.includes("equip")) {
														return true;
													}
													return player.hasGainableCards(source, "he", card => get.type(card) === "equip" && player.hasDiscardableCards(player, "he", cardx => cardx !== card));
												}
												default:
													return true;
											}
										},
										selectButton: [1, 4],
										processAI() {
											const event = get.event();
											const target = event.player;
											const player = event.source;
											const parent = event.getParent();
											if (parent == null) {
												return { bool: false };
											}
											const trigger = parent.getTrigger();
											const resultLinks = [];
											const removeMarkValue = getTingValue(player, target);
											const costs = Array(4).fill(0);
											if (target.hasSkill("kttingwei_fengyin")) {
												costs[0] = Infinity;
											} else {
												const skills = target.getSkills(null, false, false).filter(skill => {
													const info = get.info(skill);
													return info && !info.locked && !info.charlotte;
												});
												costs[0] = skills.length * 1.2;
												if (skills.length >= 2) {
													costs[0] += 1;
												}
											}
											const equips = target.getGainableCards(player, "he", { type: "equip" });
											if (equips.length) {
												costs[1] = Math.min(4, equips.reduce((sum, card) => sum + get.value(card, target), 0) / equips.length);
											} else {
												costs[1] = Infinity;
											}
											const card = trigger.card;
											const damageEff = get.damageEffect(target, player, target, get.nature(card));
											if (damageEff < 0) {
												costs[2] = -damageEff * 1.8;
												if (target.hp <= 2) {
													costs[2] += 3;
												}
												if (target.hp <= 1) {
													costs[2] += 5;
												}
											} else {
												costs[2] = -damageEff;
											}
											const cards = target.getDiscardableCards(target, "he");
											if (cards.length) {
												const values = cards.reduce((sum, card) => sum + get.value(card, target), 0) / cards.length;
												costs[3] = Math.min(4, 1 + 4 / values);
												if (cards.length <= 3) {
													costs[3] += 2;
												}
											} else {
												costs[3] = Infinity;
											}
											const links = ["fengyin", "equip", "damage", "discard"];
											for (const [i, cost] of costs.entries()) {
												if (removeMarkValue > cost) {
													resultLinks.push(links[i]);
												}
											}
											if (resultLinks.includes("equip") && resultLinks.includes("discard")) {
												if (!equips.some(card => cards.some(cardx => cardx !== card))) {
													const att = get.attitude(target, player);
													if (att > 0) {
														resultLinks.remove("discard");
													} else {
														resultLinks.remove("equip");
													}
												}
											}
											if (!resultLinks.length && !target.isLinked()) {
												let linkCost = 1;
												if (game.hasPlayer(current => current !== target && get.attitude(target, current) > 0 && current.isLinked())) {
													linkCost += 1;
												}
												if (get.nature(trigger.card)) {
													linkCost += 1;
												}
												if (get.damageEffect(target, player, target, "fire") < 0) {
													linkCost += 0.8;
												}
												if (get.damageEffect(target, player, target, "thunder") < 0) {
													linkCost += 0.8;
												}
												const minCost = Math.min(...costs);
												const index = costs.indexOf(minCost);
												if (linkCost > minCost) {
													resultLinks.push(links[index]);
												}
											}
											if (resultLinks.length) {
												return { bool: true, links: resultLinks };
											}
											return { bool: false };
											function getTingValue(player, target) {
												if (!player.hasSkill("ktjimie")) {
													return 0;
												}
												if (player.awakenedSkills.includes("ktjimie") && !player.hasSkill("ktyuli")) {
													return 0;
												}
												if (get.attitude(target, player) > 0) {
													return -1;
												}
												const mark = player.countMark("kttingwei");
												let value = 1;
												if (mark >= 7) {
													value += 7;
												} else if (mark === 6) {
													value += 4;
												} else if (mark === 5) {
													value += 2.5;
												} else if (mark === 4) {
													value += 1.5;
												}
												if (_status.currentPhase === player) {
													value += 2;
												}
												value += Math.min(5, getTingThreat(player, target));
												return value;
											}
											function getTingThreat(player, target) {
												let threat = 0;
												for (const current of game.filterPlayer(current => current === target || get.attitude(target, current) > 0)) {
													const damage = get.damageEffect(current, player, target);
													if (damage < 0) {
														threat = Math.max(threat, -damage * Math.max(1, current.maxHp / 2));
													}
												}
												return threat;
											}
										},
									})
									.set("source", player)
									.forResult();
								if (!result?.bool || !result.links?.length) {
									player.logSkill("kttingwei", [target], null, null, [get.rand(3, 4)]);
									await target.link(true);
									return;
								}
								const links = ["fengyin", "equip", "damage", "discard"];
								player.removeMark("kttingwei", result.links.length);
								for (const link of links) {
									if (!result.links.includes(link)) {
										continue;
									}
									switch (link) {
										case "fengyin":
											target.addTempSkill("kttingwei_fengyin", { player: "phaseEnd" });
											break;
										case "equip": {
											await target
												.chooseToGive({
													prompt: `请选择要交给${get.translation(player)}的装备牌`,
													target: player,
													filterCard(card) {
														const event = get.event();
														const target = get.player();
														if (get.type(card) !== "equip") {
															return false;
														}
														if (!event.discarding) {
															return true;
														}
														return target.hasDiscardableCards(target, "he", cardx => cardx !== card);
													},
													position: "he",
													forced: true,
												})
												.set("discarding", result.links.includes("discard"));
											break;
										}
										case "damage": {
											const id = target.playerid;
											if (id == null) {
												break;
											}
											const map = trigger.getParent()?.customArgs;
											if (map == null) {
												break;
											}
											if (!map[id]) {
												map[id] = {};
											}
											if (typeof map[id].extraDamage !== "number") {
												map[id].extraDamage = 0;
											}
											map[id].extraDamage++;
											break;
										}
										case "discard": {
											await target.randomDiscard({ position: "he", num: 2 });
											break;
										}
									}
								}
								return;
							},
							marktext: "霆",
							intro: {
								name: "霆",
								content: "mark",
							},
							subSkill: {
								// 完整定义（引擎fengyin的克隆）：此前用 inherit:"fengyin" 的写法未将
								// kttingwei_fengyin 注册进 lib.skill，惩罚目标携带幻影ID后
								// skillBlocker 解引用 undefined 直接报错
								fengyin: {
									init(player, skill) {
										player.addSkillBlocker(skill);
										player.addTip(skill, "非锁定技失效");
									},
									onremove(player, skill) {
										player.removeSkillBlocker(skill);
										player.removeTip(skill);
									},
									charlotte: true,
									skillBlocker(skill, player) {
										return !!lib.skill[skill] && !lib.skill[skill].persevereSkill && !lib.skill[skill].charlotte && !get.is.locked(skill, player);
									},
									mark: true,
									intro: {
										content(storage, player, skill) {
											const list = player.getSkills(null, false, false).filter((i) => !!lib.skill[i] && lib.skill.kttingwei_fengyin.skillBlocker(i, player));
											if (list.length) {
												return "失效技能：" + get.translation(list);
											}
											return "无失效技能";
										},
									},
								},
							},
						},
						ktjimie: {
							audio: "ext:kirito扩展/audio/skill:4",
							logAudio(event) {
								if (typeof event === "number") {
									return `ext:kirito扩展/audio/skill/ktjimie${event}.mp3`;
								}
								return [
									"ext:kirito扩展/audio/skill/ktjimie1.mp3",
									"ext:kirito扩展/audio/skill/ktjimie2.mp3",
									"ext:kirito扩展/audio/skill/ktjimie3.mp3",
									"ext:kirito扩展/audio/skill/ktjimie4.mp3",
								];
							},
							trigger: { player: "phaseUseEnd" },
							limited: true,
							skillAnimation: true,
							filter(_event, player) {
								return player.countMark("kttingwei") >= 8;
							},
							async cost(event, trigger, player) {
								event.result = await player
									.chooseTarget({
										prompt: get.prompt(event.skill),
										prompt2: "弃置8枚“霆”标记，对一名角色造成等于其体力上限的伤害",
										ai(target) {
											const player = get.player();
											return get.damageEffect(target, player, player);
										},
									})
									.forResult();
							},
							async content(event, trigger, player) {
								// 释放演出：自带寂灭大招动画，播完再结算
								if (lib._wssJimieBar?.playDazhao) {
									await lib._wssJimieBar.playDazhao();
								}
								player.awakenSkill("ktjimie");
								player.removeMark("kttingwei", 8);
								const target = event.targets[0];
								await target.damage({ num: target.maxHp });
								player.setStorage("ktyuli", [], true);
								if (lib._wssJimieBar) {
									lib._wssJimieBar.update(player);
									const lock = player.querySelector && player.querySelector(".jimieLock");
									if (lock) {
										lock.style.display = "block";
									}
								}
							},
							ai: { combo: "kttingwei" },
						},
						ktxinghun: {
							audio: "ext:kirito扩展/audio/skill:2",
							enable: "phaseUse",
							usable: 1,
							manualConfirm: true,
							async content(event, trigger, player) {
								const num = 5;
								const cards = get.cards(num, true);
								let result = await player
									.chooseToMove_new("星魂：选择任意张手牌进行交换", true)
									.set("list", [
										["牌堆顶的牌", cards],
										["你的手牌", player.getCards("h")],
									])
									.set("filterMove", (from, to, moved) => typeof to !== "number")
									.set("processAI", list => {
										const player = get.player();
										let cards = list
											.map(i => i[1])
											.flat()
											.sort((a, b) => get.value(b, player) - get.value(a, player));
										let sha = cards.filter(card => get.name(card, player) === "sha");
										cards.removeArray(sha);
										const hs = [];
										let num = Math.ceil(sha.length / 2);
										if (num <= player.countCards("h")) {
											hs.addArray(sha.slice(0, num));
											sha.removeArray(hs);
										}
										if (hs.length < player.countCards("h")) {
											hs.addArray(cards.slice(0, player.countCards("h") - hs.length));
											cards.removeArray(hs);
										}
										const top = sha.concat(cards);
										return [top, hs];
									})
									.forResult();
								if (result?.bool) {
									await game
										.loseAsync({
											player,
											cards: result.moved.flat(),
											moved: result.moved,
										})
										.setContent(async (event, trigger, player) => {
											const { cards, moved } = event;
											const hs = player.getCards("h");
											const gain = moved[1].filter(card => !hs.includes(card));
											const puts = moved[0].filter(card => hs.includes(card));
											const originPile = cards.slice().removeArray(hs);
											if (puts.length) {
												player.$throw(puts.length, 1000);
												await player.lose(puts, ui.ordering).set("getlx", false);
											}
											await game.cardsGotoOrdering(originPile);
											if (gain.length) {
												await player.gain(gain, "draw").set("getlx", false);
											}
											await game.cardsGotoPile(moved[0].slice().reverse(), ["insert_card", true]);
											game.addCardKnower(moved[0], player);
										});
								}
								if (!game.hasPlayer(current => current !== player)) {
									return;
								}
								result = await player
									.chooseTarget(`星魂：选择一名其他角色，令其展示牌堆顶和你的手牌共计${get.cnNumber(num)}张牌`, true)
									.set("filterTarget", (_, player, target) => target !== player)
									.set("ai", target => {
										const { player } = get.event();
										return get.effect(target, { name: "sha" }, player, player);
									})
									.forResult();
								if (result?.bool && result.targets?.length) {
									const [target] = result.targets;
									player.line(target, "thunder");
									let showCards = [];
									const top = get.cards(5, true);
									if (player.countCards("h")) {
										const dialog = [];
										dialog.push("星魂：请选择五张牌");
										dialog.add(`<div class="text center">${get.translation(player)}的手牌</div>`);
										if (target.hasSkillTag("viewHandcard", null, player, true)) {
											dialog.push(player.getCards("h"));
										} else {
											dialog.push([player.getCards("h"), "blank"]);
										}
										dialog.addArray([`<div class="text center">牌堆顶</div>`, [top, "blank"]]);
										const result = await target
											.chooseButton(5, true)
											.set("createDialog", dialog)
											.set("top", top)
											.set("target", player)
											.set("ai", () => Math.random())
											.forResult();
										showCards = result?.links || [];
									} else {
										showCards = top;
									}
									await target
										.showCards(showCards, `${get.translation(target)}因【${get.translation(event.name)}】展示`)
										.set("customButton", (button, event) => {
											if (event.top?.includes(button.link)) {
												game.createButtonCardsetion("牌堆顶", button);
											}
										})
										.set("top", top)
										.set("delay_time", 5);
									if (showCards.some(card => get.name(card) === "sha")) {
										let sha = showCards.filter(card => get.name(card) === "sha");
										while (sha.length) {
											let card = sha.shift();
											if (player.canUse(card, target, false, false)) {
												if (top.includes(card)) {
													top.remove(card);
												}
												await player.useCard(card, target, false);
											}
										}
									}
								}
							},
							ai: {
								order(item, player) {
									if (player.countCards("hs", card => get.tag(card, "draw"))) {
										return 1;
									}
									return 20;
								},
								result: {
									player(player) {
										if (!game.hasPlayer(current => current !== player && get.effect(current, { name: "sha" }, player, player) > 0)) {
											return 0;
										}
										return 1;
									},
								},
							},
						},
						ktshenpei: {
							audio: "ext:kirito扩展/audio/skill:2",
							limited: true,
							skillAnimation: true,
							animationColor: "metal",
							derivation: ["kthuitian"],
							trigger: {
								player: "dying",
							},
							check(event, player) {
								return !player.canSave(player) || player.countCards("hs", card => get.tag(card, "save")) <= -player.hp;
							},
							async content(event, trigger, player) {
								// 释放演出：自带面具+神光动画，播完再结算
								if (lib._wssSJWPlay) {
									await lib._wssSJWPlay("SS_Sjw_skill2");
								}
								player.awakenSkill(event.name);
								const num = game.getAllGlobalHistory("everything", evt => {
									if (evt.name !== "dying" || evt.player !== player) {
										return false;
									}
									return true;
								}).length;
								if (num > 0) {
									await player.recover(num);
									if (!game.hasPlayer(current => current != player)) return;
									const result = await player
										.chooseTarget(`神霈：选择一名其他角色对其造成${num}点雷电伤害`, true, lib.filter.notMe)
										.set("ai", target => {
											const { player } = get.event();
											return get.damageEffect(target, player, player, "thunder");
										})
										.forResult();
									if (result?.bool && result.targets?.length) {
										player.line(result.targets, "thunder");
										await result.targets[0].damage(num, "thunder");
									}
								}
								await player.addSkills("kthuitian");
							},
						},
						kthuitian: {
							audio: "ext:kirito扩展/audio/skill:4",
							logAudio: (a, b, c, d, costResult) =>
								costResult.die
									? ["ext:kirito扩展/audio/skill/kthuitian3.mp3", "ext:kirito扩展/audio/skill/kthuitian4.mp3"]
									: [
											"ext:kirito扩展/audio/skill/kthuitian1.mp3",
											"ext:kirito扩展/audio/skill/kthuitian2.mp3",
											"ext:kirito扩展/audio/skill/kthuitian3.mp3",
											"ext:kirito扩展/audio/skill/kthuitian4.mp3",
										],
							trigger: {
								global: ["roundStart", "phaseEnd"],
							},
							filter(event, player, name) {
								if (name === "roundStart") {
									return player.hasAllHistory("useSkill", evt => evt.skill === "kthuitian");
								}
								return event.player.getHp() > player.getHp();
							},
							async cost(event, trigger, player) {
								if (event.triggername === "roundStart") {
									event.result = {
										bool: true,
										die: true,
									};
								} else {
									event.result = await player
										.chooseBool(get.prompt2(event.skill))
										.set("choice", (() => {
											if (player.hasAllHistory("useSkill", evt => evt.skill === "kthuitian")) {
												return true;
											}
											let targets = game.filterPlayer(current => current !== player, undefined, true);
											if (!targets.length) {
												return false;
											}
											if (!trigger.player.getHistory().isRound) {
												return false;
											}
											return targets.every(current => {
												let att = get.attitude(player, current);
												return att < -1 || att > 1;
											});
										})())
										.forResult();
								}
							},
							async content(event, trigger, player) {
								if (event.triggername === "roundStart") {
									// 死亡演出：自带姜维之死动画
									if (lib._wssSJWPlay) {
										await lib._wssSJWPlay("SS_Sjw_dead");
									}
									await player.die();
								} else {
									await player.draw();
									player.insertPhase(event.name);
								}
							},
						},
				},
				translate: {
					gryjuejing: "绝境",
					gryjuejing_info: "锁定技。①你的手牌上限+2，你不会被翻面，且你的体力上限不会减少。②当你进入或脱离濒死状态时，你摸两张牌。③摸牌阶段，你额外摸X张牌。④你至其他角色的距离-X。⑤你每回合使用牌的次数上限+X（X为你已损失的体力值）。⑥你的所有技能均不会被禁用或封锁，特殊技能不会被移除。",
					gryshenti: "神体",
					gryshenti_info: "锁定技。①你的手牌上限+2，你不会被翻面，且你的体力上限不会减少。②当你进入或脱离濒死状态时，你摸两张牌。③你的所有技能均不会被禁用或封锁，特殊技能不会被移除。",
					grylonghun: "龙魂",
					grylonghun_info: "你可以将同花色的一至两张牌按下列规则使用或打出：红桃当【桃】，方块当火【杀】，梅花当【闪】，黑桃当【无懈可击】。若你以此法转化了两张：红色牌，则此牌回复值或伤害值+1；黑色牌，则你弃置当前回合角色一张牌。每当你以此法使用或打出牌，“魂”计数+X（单张牌+1，两张牌+2，计数持续累计，不会清空）。若计数为1或2的倍数，你摸一张牌。“魂”计数达到12后：你使用【杀】或【决斗】指定目标后，你可以选择一项：1.此伤害+1；2.获得该目标区域内一张牌（其区域内没有牌则不能选择此项）。“魂”计数达到24后：1.你转化发动的【杀】不可被响应，转化的【无懈可击】不可被【无懈可击】响应；2.你以单张牌转化【闪】或【无懈可击】后，获得当前回合角色区域内一张牌；3.你转化发动使用的牌不计入使用次数；4.你转化发动的【桃】自带酒效果（与饮酒效果叠加，且不占用【酒】的使用次数）。",
					grytouying: "降临",
					grytouying_info: "锁定技。游戏开始时，你从技能池中挑选任意个技能加入本局游戏（可多选），挑选完成后失去此技能。技能池默认为本扩展全部技能，可在扩展设置的「降临技能池管理」中增加或排除。",
					ktyuli: "驭雳",
					ktyuli_info: "锁定技。①你造成的伤害改为雷电伤害，已是雷电伤害则伤害+1；②你受到雷电伤害时，防止之并摸等量牌。",
					kttingwei: "霆威",
					kttingwei_info: "你使用【杀】指定目标后，可获得4枚“霆”标记并选择一名目标角色，其选择任意项并令你弃等量的“霆”标记：1.非锁定技失效至其下个回合结束；2.交给你一张装备牌；3.此牌对其造成伤害+1；4.随机弃两张牌。若其均未选择，其横置。",
					ktjimie: "寂灭",
					ktjimie_info: `限定技，出牌阶段结束时，你可以弃8枚“霆”标记，对一名角色造成等于其体力上限的伤害。然后当你${get.poptip("ktyuli")}的两项均执行后，此技能视为未发动过。`,
					ktxinghun: "星魂",
					ktxinghun_info: "出牌阶段限一次，你可以观看牌堆顶五张牌，用任意张手牌与其中的等量张牌进行交换并任意排序，然后你令一名其他角色展示你的手牌与牌堆顶的共计五张牌，你对其依次使用其中的【杀】。",
					ktshenpei: "神霈",
					ktshenpei_info: `限定技，当你进入濒死状态时，你可以回复X点体力(X为你本局游戏进入过濒死状态的次数)，然后对一名其他角色造成等量点雷电伤害并获得${get.poptip("kthuitian")}。`,
					kthuitian: "回天",
					kthuitian_info: "一名角色的回合结束时，若其体力值大于你，你可以摸一张牌并执行一个额外的回合。每轮开始时，若你发动过此技能，你死亡。",
				},
			},
			intro: "",
			author: "kirito",
			diskURL: "",
			forumURL: "",
			version: VERSION,
		},
		files: { character: ["god.jpg", "wushangshen.jpg"], card: [], skill: [], audio: [] },
	};
}
