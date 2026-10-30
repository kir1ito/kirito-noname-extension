import { lib, game, ui, get, ai, _status } from "noname";
import { Character, Player } from "../../noname/library/element/index.js";
export const type = "extension";
// 扩展版本号：package与设置页展示共用，与info.json的version保持同步
const VERSION = "3.93";
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
const DEFAULT_TOUYING_POOL = ["gryjuejing", "grylonghun", "gryshenti", "ktleishen", "ktxinghun", "ktshenpei"];
// 二进制写入统一转ArrayBuffer：安卓cordova桥对Uint8Array按JSON逐字节序列化成{"0":72,"1":101,...}，
// 几MB的图片/语音就是百万级HashMap键值，直接OOM爆Java堆。注意：ArrayBuffer在本体APK上同样被
// 逐字节JSON序列化（见ktWriteBinary），只是峰值内存小不再OOM——所以二进制落盘必须走校验链
const ktBinData = (data) => (data instanceof Uint8Array
	? (data.byteOffset == 0 && data.byteLength == data.buffer.byteLength ? data.buffer : data.slice().buffer)
	: data);
// 安卓二进制写入自愈链（v3.36初版，v3.40补FileTransfer通道）：经MTP取证，本体APK（子琪懒人包）的
// cordova桥把任何二进制参数（ArrayBuffer/TypedArray/File）逐字节JSON序列化成文本写盘——41782字节的
// jpg落盘成472241字节的{"0":255,...}文本，图片/动皮atlas/语音全坏且读图失败=空白；纯字符串通道字节
// 精确但落盘的是字符串本身。真机v3.39实测：直调File插件的本地路径也匹配失败（ENCODING_ERR=5）。
// 故完整策略链一律"写入→读回→全字节比对"，不一致自动降级下一策略，首个通过验证的策略本会话优先
// 复用（ktBinWritePlan记策略名）：
// ① FileTransfer直落盘（调用方提供源URL且插件可用时）：native端HTTP下载直接写目标文件，载荷完全
//    不经过JS桥——与本体game.download（云端资源下载）同通道，真机长期验证字节精确；
// ② 标准game.writeFile(ArrayBuffer)：健康内核字节精确（PC恒走此路，不进校验链）；
// ③ 直调File插件write [localURL, Base64串, offset, isBinary=true]：部分内核可用，Java端对String做Base64解码落盘
const PLAN_LABELS = { transfer: "FileTransfer直落盘", standard: "标准写入", direct: "直调File" };
const ktGameWrite = (data, dir, name) => new Promise((resolve, reject) =>
	game.writeFile(data, dir, name, (err) => {
		// 安卓端cordova写成功时回调的是ProgressEvent（truthy），只有真失败才是FileError；node端成功回调null
		if (!err || (typeof ProgressEvent != "undefined" && err instanceof ProgressEvent)) resolve();
		else reject(err);
	}));
const ktBase64Of = (bytes) => {
	const chunk = 0x8000;
	let bin = "";
	for (let i = 0; i < bytes.length; i += chunk) {
		bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
	}
	return btoa(bin);
};
const ktBytesEqual = (a, b) => {
	if (!a || !b || a.byteLength != b.byteLength) return false;
	const ua = a instanceof Uint8Array ? a : new Uint8Array(a);
	const ub = b instanceof Uint8Array ? b : new Uint8Array(b);
	for (let i = 0; i < ua.length; i++) {
		if (ua[i] != ub[i]) return false;
	}
	return true;
};
let ktBinWritePlan = null;
// FileTransfer下载直写：ensureDirectory建好目录后交native按URL下载落盘（root为noname存储根）
const ktTransferWrite = (srcUrl, dir, name) => new Promise((resolve, reject) => {
	const root = localStorage.getItem("noname_inited");
	if (!root) {
		reject(new Error("noname_inited缺失"));
		return;
	}
	game.ensureDirectory(`${dir}/${name}`, () => {
		try {
			new FileTransfer().download(
				encodeURI(srcUrl),
				encodeURI(`${root}${dir}/${name}`),
				() => resolve(),
				(e) => reject(new Error(`FileTransfer code=${e && e.code}`))
			);
		} catch (e) {
			reject(e);
		}
	}, true);
});
const ktWriteBinary = async (data, dir, name, srcUrl) => {
	const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
	// PC/Electron或无法读回校验的环境：直接写（node端game.writeFile(ArrayBuffer)字节精确）
	if (typeof window == "undefined" || !window.cordova || typeof game.readFile != "function") {
		return ktGameWrite(ktBinData(bytes), dir, name);
	}
	const local = `${dir.replace(/\/+$/, "")}/${name}`;
	const verify = async () => {
		const got = await new Promise((resolve, reject) => game.readFile(local, resolve, reject));
		return ktBytesEqual(got, bytes);
	};
	const planList = [];
	if (srcUrl && typeof FileTransfer != "undefined") {
		planList.push(["transfer", () => ktTransferWrite(srcUrl, dir, name)]);
	}
	planList.push(
				// 安卓毒桥对二进制参数必损坏（v3.36取证），标准写入在cordova端只产出垃圾并触发FileError噪音，跳过
				...(typeof window != "undefined" && window.cordova ? [] : [["standard", async () => ktGameWrite(ktBinData(bytes), dir, name)]]),
		["direct",
			async () => {
				const root = localStorage.getItem("noname_inited");
				const entry = await new Promise((resolve, reject) =>
					window.resolveLocalFileSystemURL(
						root + dir,
						(d) => d.getFile(name, { create: true }, resolve, reject),
						reject
					));
				// 先删残留：损坏落盘比正确内容膨胀约11倍，若覆写不截断会留尾部垃圾导致校验不过
				await new Promise((resolve) => game.removeFile(local, resolve));
				await new Promise((resolve, reject) =>
					cordova.exec(resolve, (e) => reject(new Error(typeof e == "object" ? JSON.stringify(e) : String(e))), "File", "write", [entry.localURL, ktBase64Of(bytes), 0, true]));
			}],
	);
	const order = planList.map(([key]) => key);
	const preferred = order.indexOf(ktBinWritePlan);
	if (preferred > 0) {
		order.unshift(order.splice(preferred, 1)[0]);
	}
	const errs = [];
	for (const key of order) {
		const plan = planList.find(([k]) => k == key)[1];
		try {
			await plan();
			if (!(await verify())) {
				throw new Error("写入后读回比对不一致（二进制被序列化损坏）");
			}
			ktBinWritePlan = key;
			return;
		} catch (e) {
			errs.push(`${PLAN_LABELS[key]}：${(e && e.message) || e}`);
		}
	}
	throw new Error(`二进制写入${local}失败（${errs.join("；")}）`);
};
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
div.ktupd-status{font-size:13px;margin-top:10px;color:#c3cde0;min-height:18px;white-space:pre-wrap}
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
		// CNB（cnb.cool，腾讯云原生构建）镜像：dist分支携带发版资产+增量raw文件（extension.js/info.json，
		// 与version.txt同批落库保证版本一致）；raw直链国内直连快且无第三方代理的缓存滞后问题。测速不可达时自动垫底跳过
		const CNB_REPO = "kirito.gry/kirito-noname-extension";
		const CNB_BASE = `https://cnb.cool/${CNB_REPO}`;
		// 下载源：GitHub直连 + gh-proxy.com + gh.llkk.cc + CNB 四个（连通性测速后按吞吐自动排序）
		// 前缀源均支持 前缀+完整GitHubURL 的代理格式；CNB源用自家raw路径（main=增量文件，dist=发版资产）
		const SOURCES = [
			{ label: "GitHub 直连", prefix: "" },
			{ label: "gh-proxy.com 镜像", prefix: "https://gh-proxy.com/" },
			{ label: "gh.llkk.cc", prefix: "https://gh.llkk.cc/" },
			{ label: "CNB 镜像", cnb: true },
		];
		let overlay = null;
		let abortCtrl = null;
		let sourceOrder = null; // 连通性检测后的源顺序（可用优先，按延迟升序）
		let remoteVersion = null;
		const $ = {};
		const encodePath = (file) => encodeURIComponent(NAME) + "/" + file.split("/").map(encodeURIComponent).join("/");
		const rawUrlOf = (src, file) => (src.cnb ? `${CNB_BASE}/-/git/raw/dist/${encodePath(file)}` : src.prefix + RAW_BASE + encodePath(file));
		const relUrlOf = (src, asset) => (src.cnb
			? `${CNB_BASE}/-/git/raw/dist/${asset}`
			: `${src.prefix}https://github.com/${REPO}/releases/latest/download/${asset}`);
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
		// 错误全量展开：安卓端cordova的FileError只有code没有message，写成功时回调的还是ProgressEvent，
		// 直接取e.message会显示"undefined"——把类型/name/message/code/stack全拼出来（状态栏pre-wrap显示堆栈）
		const FILE_ERR_NAMES = { 1: "文件/目录不存在", 2: "安全限制", 3: "已中止", 4: "不可读", 5: "编码错误", 6: "不允许修改", 7: "状态无效", 8: "语法错误", 9: "非法修改", 10: "超出配额", 11: "类型不匹配", 12: "路径冲突" };
		const fmtErr = (e) => {
			if (e && e.name == "AbortError") return "已手动中止";
			if (e == null) return String(e);
			const parts = [];
			if (typeof e == "object") parts.push((e.constructor && e.constructor.name) || "object");
			if (e.message != null && e.message !== "") parts.push(`message=${e.message}`);
			if (e.name != null) parts.push(`name=${e.name}`);
			if (e.code != null && e.code !== "") parts.push(`code=${e.code}${FILE_ERR_NAMES[e.code] ? `（${FILE_ERR_NAMES[e.code]}）` : ""}`);
			if (e.stack) parts.push(`stack=${String(e.stack).slice(0, 700)}`);
			if (!parts.length) parts.push(String(e));
			return parts.join("，");
		};
		// 带超时的fetch
		const fetchTimeout = (url, ms) => {
			const ctrl = new AbortController();
			const timer = setTimeout(() => ctrl.abort(), ms);
			return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
		};
		// CNB跨域限制（v3.73）：cnb.cool的raw服务ACAO只允许docs.cnb.cool，安卓WebView强制执行CORS必拦
		// （PC懒人包主窗口webSecurity:false不受影响）。安卓端CNB源统一降级FileTransfer原生通道：
		// native HTTP不经WebView，下载到临时文件读回后即删
		const ktNativeReady = () =>
			typeof window != "undefined" && !!window.cordova &&
			typeof FileTransfer != "undefined" && typeof game.readFile == "function" &&
			!!localStorage.getItem("noname_inited");
		const ktNativeFetch = (srcUrl, tmpName, onprogress) => new Promise((resolve, reject) => {
			const root = localStorage.getItem("noname_inited");
			const local = `extension/${NAME}/${tmpName}`;
			game.ensureDirectory(`extension/${NAME}`, () => {
				try {
					const ft = new FileTransfer();
					if (onprogress) {
						ft.onprogress = (ev) => {
							if (ev.lengthComputable) onprogress(ev.loaded, ev.total);
						};
					}
					ft.download(
						encodeURI(srcUrl),
						encodeURI(`${root}${local}`),
						() => {
							game.readFile(local, (data) => {
					try { game.removeFile(local, () => {}); } catch {}
					// 嗅探：FileTransfer对404/错误页也报成功，HTML内容一律按下载失败降级下一源
					const u8 = data instanceof Uint8Array ? data : new Uint8Array(data || []);
					const head = new TextDecoder().decode(u8.subarray(0, 256)).trim().toLowerCase();
					if (head.startsWith("<!doctype") || head.startsWith("<html") || head.includes("<!doctype html")) {
						reject(new Error("源返回了HTML错误页"));
						return;
					}
					resolve(u8);
								reject(e);
							});
						},
						(e) => reject(new Error(`FileTransfer code=${e && e.code}`))
					);
				} catch (e) {
					reject(e);
				}
			}, true);
		});
		const ktWithTimeout = (promise, ms) => new Promise((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error("超时")), ms);
			promise.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
		});
		// 单源取文本：安卓CNB走原生通道，其余走页面fetch（统一20秒上限）
		const ktSrcText = async (src, asset, tmpName) => {
			if (src.cnb && ktNativeReady()) {
				const data = await ktWithTimeout(ktNativeFetch(bustCache(relUrlOf(src, asset)), tmpName), 20000);
				return new TextDecoder().decode(data instanceof ArrayBuffer ? data : new Uint8Array(data));
			}
			const resp = await fetchTimeout(bustCache(relUrlOf(src, asset)), 20000);
			if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
			return resp.text();
		};
		// 拉Release的version.txt作为远程版本号（按测速排序的源依次尝试）
		const fetchReleaseVersion = async () => {
			for (const { src } of sourceOrder) {
				try {
					const text = (await ktSrcText(src, VER_NAME, ".ktver_cnb")).trim();
					if (text) return text;
				} catch {}
			}
			return null;
		};
		// 增量更新支持：工作流每次打包生成 manifest.json（路径→md5），Release资产
		const fmtSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(2)} MB` : `${(n / 1024).toFixed(1)} KB`);
		const localVersion = () => (lib.extensionPack[NAME] && lib.extensionPack[NAME].version) || "未知";
		// 镜像站会缓存Release资产（缓存期内一直吐旧包，3.20曾致安卓下到3.18旧包崩溃）：
		// 请求统一加时间戳参数穿透缓存（镜像忽略该参数也无害）
		const bustCache = (url) => `${url}${url.includes("?") ? "&" : "?"}_=${Date.now()}`;
		// 版本号逐段数值比较：a<b返回-1，用于识别缓存滞后的旧包
		const cmpVersion = (a, b) => {
			const pa = String(a).split(".").map(Number);
			const pb = String(b).split(".").map(Number);
			for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
				const d = (pa[i] || 0) - (pb[i] || 0);
				if (d) return d;
			}
			return 0;
		};
		const MANIFEST_NAME = "manifest.json";
		// 增量：按源顺序下载单个原始文件（小文件，无需流式进度），返回{bytes, src}供FileTransfer直落盘复用同源地址
		const downloadRaw = async (file, expectVersion) => {
			let lastError = null;
			for (const { src } of sourceOrder) {
				try {
					if (src.cnb && ktNativeReady()) {
						const data = await ktWithTimeout(ktNativeFetch(bustCache(rawUrlOf(src, file)), ".ktraw_cnb"), 60000);
				// 版本校验：源返回的文件必须与Release报出的版本一致（防陈旧镜像/错误页写坏本地）
				if (expectVersion) {
					const text = new TextDecoder().decode(data instanceof Uint8Array ? data : new Uint8Array(data));
					if (!text.includes(`VERSION = "${expectVersion}"`)) {
						throw new Error(`内容与版本v${expectVersion}不符（源缓存陈旧或返回错误页）`);
					}
				}
						return { bytes: data instanceof Uint8Array ? data : new Uint8Array(data), src };
					}
					const resp = await fetch(bustCache(rawUrlOf(src, file)), { signal: abortCtrl.signal });
					if (!resp.ok) throw new Error(`RAW ${resp.status}`);
					if (expectVersion) {
						const text = new TextDecoder().decode(new Uint8Array(await resp.arrayBuffer()));
						if (!text.includes(`VERSION = "${expectVersion}"`)) {
							throw new Error(`内容与版本v${expectVersion}不符（源缓存陈旧或返回错误页）`);
					}
						return { bytes: new TextEncoder().encode(text), src };
					}
					return { bytes: new Uint8Array(await resp.arrayBuffer()), src };
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
			// 安卓端CNB被CORS拦截：FileTransfer原生下载manifest（12KB）估算吞吐，省流量且足以验证可用性
			if (src.cnb && ktNativeReady()) {
				const t0 = Date.now();
				try {
					const data = await ktWithTimeout(ktNativeFetch(bustCache(relUrlOf(src, MANIFEST_NAME)), ".ktprobe_cnb"), 20000);
					const size = (data && (data.byteLength || data.length)) || 0;
					if (!size) throw new Error("空响应");
					return { ok: true, speed: size / Math.max((Date.now() - t0) / 1000, 0.05) };
				} catch (e) {
					return { ok: false, speed: 0, error: e.name == "AbortError" ? "超时" : fmtErr(e) };
				}
			}
			const t0 = Date.now();
			const ctrl = new AbortController();
			const timer = setTimeout(() => ctrl.abort(), 20000);
			try {
				const resp = await fetch(bustCache(zipUrlOf(src)), { signal: ctrl.signal });
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
				return { ok: false, speed: 0, error: e.name == "AbortError" ? "超时" : fmtErr(e) };
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
				// 增量按钮：v3.74起固定只拉主文件+版本号，不再依赖本地基准清单
				setDisabled($.inc, false);
				const newest = remoteVersion && remoteVersion == localVersion();
				const behind = remoteVersion && cmpVersion(remoteVersion, localVersion()) < 0;
				let msg = `测速完成，最快源：${sourceOrder.find((s) => s.res.ok).src.label}`;
				msg += behind
					? `。该源报出的版本（v${remoteVersion}）落后于本地v${localVersion()}——缓存滞后，请稍后重新检测`
					: newest
						? `。当前已是最新版本（v${localVersion()}），可强制重装`
						: `。发现新版本：${localVersion()} → ${remoteVersion || "未知"}`;
				setStatus(msg);
			} else {
				setStatus("所有下载源均不可达，请检查网络（或系统代理）后重新测速", "err");
			}
			setDisabled($.check, false);
		}
		const writeFileTo = async (file, data, srcUrl) => {
			const local = `extension/${NAME}/${file}`;
			const slash = local.lastIndexOf("/");
			const dir = slash > 0 ? local.slice(0, slash) : local;
			// 目录创建不能用ensureDirectory：cordova版不等目录建完就回调（安卓首次写新目录必竞态失败），
			// node版对根下嵌套新目录也会抛错——两端实现真正的createDir都会等目录建好才回调
			await new Promise((resolve, reject) => game.createDir(dir, resolve, reject));
			if (typeof data == "string") {
				// 文本走字符串通道：两端实测字节精确（安卓桥只对二进制参数做JSON序列化损坏）
				await ktGameWrite(data, dir, local.slice(slash + 1));
			} else {
				// 二进制走校验链：安卓损坏内核自动降级FileTransfer直落盘/直调File插件Base64通道，PC直通
				await ktWriteBinary(data, dir, local.slice(slash + 1), srcUrl);
			}
		};
		async function startUpdate() {
			setDisabled($.check, true);
			setDisabled($.start, true);
			$.restart.style.display = "none";
			abortCtrl = new AbortController();
			let curFile = ""; // 出错时定位：空=下载阶段，非空=解压覆盖该文件时
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
				// 源报出的版本号落后于本地＝该源缓存滞后，继续只会装旧文件
				if (releaseVersion && cmpVersion(releaseVersion, localVersion()) < 0) {
					throw new Error(`下载源缓存的版本（v${releaseVersion}）落后于本地（v${localVersion()}），缓存尚未更新，请稍后重试或换网络环境`);
				}
				// 断点续传下载：息屏/断网中断后按 Range 从断点继续（GitHub Release 支持），
				// 源间也会带着断点降级；服务器不支持Range(返回200)时丢弃已收数据从头收。最多重试8轮
				setStatus("正在下载更新压缩包…");
				let data = null;
				let lastError = null;
				let zipSrc = null; // 实际供包的源：解压后二进制文件写盘失败时按同源raw地址FileTransfer直落盘修复
				const chunks = [];
				let received = 0;
				let zipTotal = 0;
				const setProgress = () => setZipProgress(received, zipTotal);
				const assemble = () => {
					data = new Uint8Array(received);
					let off = 0;
					for (const chunk of chunks) {
						data.set(chunk, off);
						off += chunk.length;
					}
				};
				for (let attempt = 1; attempt <= 8 && data === null; attempt++) {
					if (attempt > 1) {
						// 中断后稍候重试（等网络恢复），断点字节保留
						setStatus(`下载中断（已收 ${fmtSize(received)}），3秒后从断点继续（第${attempt - 1}次重试）…`);
						await new Promise((resolve) => setTimeout(resolve, 3000));
					}
					for (const { src } of sourceOrder) {
						try {
							// 安卓端CNB：CORS拦截+不支持Range断点，整包改走FileTransfer原生通道（native自带进度，
							// 一次性读回；失败恢复received断点基线后照常降级下一源）
							if (src.cnb && ktNativeReady()) {
								setStatus(`正在通过原生通道下载（${src.label}）…`);
								const buf = await ktWithTimeout(
									ktNativeFetch(bustCache(zipUrlOf(src)), ".ktzip_cnb", (loaded, total) => setZipProgress(loaded, total || 0)),
									600000
								);
								const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
								chunks.length = 0;
								chunks.push(u8);
								received = u8.length;
								zipTotal = u8.length;
								assemble();
								zipSrc = src;
								break;
							}
							const headers = { signal: abortCtrl.signal };
							if (received > 0) {
								headers.headers = { Range: `bytes=${received}-` };
							}
							const resp = await fetch(bustCache(zipUrlOf(src)), headers);
							if (!resp.ok && !(resp.status == 206 && received > 0)) {
								throw new Error(`HTTP ${resp.status}`);
							}
							zipSrc = src;
							if (received > 0 && resp.status == 206) {
								// 续传成功：从content-range解析总大小，已收数据继续有效
								const cr = resp.headers.get("content-range");
								const m = cr && cr.match(/\/(\d+)\s*$/);
								if (m) {
									zipTotal = Number(m[1]);
								}
							} else {
								// 全新下载（首连或服务器不支持Range返回200全量）：丢弃断点从头收
								if (received > 0) {
									chunks.length = 0;
									received = 0;
								}
								zipTotal = Number(resp.headers.get("content-length")) || 0;
							}
							setProgress();
							if (!resp.body || typeof resp.body.getReader != "function") {
								const buf = new Uint8Array(await resp.arrayBuffer());
								chunks.push(buf);
								received += buf.length;
								assemble();
								break;
							}
							const reader = resp.body.getReader();
							for (;;) {
								const { done, value } = await reader.read();
								if (done) break;
								chunks.push(value);
								received += value.length;
								setProgress();
							}
							assemble();
							break;
						} catch (e) {
							if (e.name == "AbortError") throw e;
							lastError = e;
							// 断点保留，换下一个源继续
						}
					}
				}
				if (!data) throw lastError || new Error(`压缩包下载失败（已收 ${fmtSize(received)}，稍后重试会从断点继续）`);
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
				// 下载源缓存可能滞后于Release：解压前先核对包内info.json版本，旧包直接中止（此时尚未覆盖任何文件）
				const infoEntry = entries.find((entry) => entry.name.slice(folder.length) == "info.json");
				if (infoEntry) {
					let zipVersion = null;
					try {
						zipVersion = JSON.parse(new TextDecoder().decode(infoEntry.asUint8Array())).version;
					} catch {}
					if (zipVersion && cmpVersion(zipVersion, localVersion()) < 0) {
						throw new Error(`下载到的是旧版本包（包内v${zipVersion}，本地已是v${localVersion()}，下载源缓存滞后）——未覆盖任何文件，请稍后重试或换网络环境`);
					}
				}
				let infoJsonBytes = null;
				let infoJsonVersion = null;
				let done = 0;
				for (const entry of entries) {
					const rel = entry.name.slice(folder.length);
					curFile = rel;
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
					// 附带供包源的同名raw地址：安卓损坏内核二进制写入走FileTransfer直落盘修复
					await writeFileTo(rel, /\.(js|json)$/.test(rel) ? new TextDecoder().decode(bytes) : bytes, zipSrc ? rawUrlOf(zipSrc, rel) : undefined);
				}
				// 全部覆盖成功 → 最后一步才写版本号文件与本地配置
				if (!infoJsonBytes) throw new Error("压缩包中缺少 info.json");
				await writeFileTo("info.json", new TextDecoder().decode(infoJsonBytes));
				const finalVersion = infoJsonVersion || remoteVersion;
				if (finalVersion) game.saveConfig(`extension_${NAME}_version`, finalVersion);
				game.saveConfig(`extension_${NAME}_updateTime`, new Date().toLocaleString());
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
				const where = curFile ? `（出错于 ${curFile}）` : "（下载阶段）";
				setStatus(`更新失败${where}：${fmtErr(e)}\n版本号未变更，可直接重新开始更新`, "err");
				setDisabled($.check, false);
				setDisabled($.start, false);
			} finally {
				abortCtrl = null;
			}
		}
		// 增量更新（v3.74简化）：固定只下载主文件extension.js+版本号info.json两个文件直接覆盖，
		// 不再做清单对比——音效/动画/图片等资源极少变动，资源有变动时走全量更新
		async function startIncremental() {
			setDisabled($.check, true);
			setDisabled($.start, true);
			setDisabled($.inc, true);
			$.restart.style.display = "none";
			abortCtrl = new AbortController();
			let curFile = "";
			try {
				setStatus("正在获取最新版本号…");
				const releaseVersion = await fetchReleaseVersion();
				if (releaseVersion) {
					remoteVersion = releaseVersion;
					$.remote.textContent = `v${remoteVersion}`;
				}
				// 源报出的版本号落后于本地＝该源缓存滞后，继续只会装旧文件
				if (releaseVersion && cmpVersion(releaseVersion, localVersion()) < 0) {
					throw new Error(`下载源缓存的版本（v${releaseVersion}）落后于本地（v${localVersion()}），缓存尚未更新，请稍后重试或换网络环境`);
				}
				// info.json（版本号）排到最后写：全部写入成功才算更新完成
				const order = ["extension.js", "info.json"];
				let done = 0;
				for (const file of order) {
					$.fill.style.width = `${((done / order.length) * 100).toFixed(1)}%`;
					$.progress.textContent = `增量下载 · ${done + 1}/${order.length}`;
					$.cur.textContent = file;
					curFile = file;
					const { bytes, src } = await downloadRaw(file, file == "extension.js" ? releaseVersion : null);
					done++;
					// 附带该文件的实际下载源地址：安卓损坏内核二进制写入走FileTransfer直落盘
					await writeFileTo(file, /\.json$/.test(file) ? new TextDecoder().decode(bytes) : bytes, rawUrlOf(src, file));
				}
				const finalVersion = releaseVersion || remoteVersion;
				if (finalVersion) game.saveConfig(`extension_${NAME}_version`, finalVersion);
				game.saveConfig(`extension_${NAME}_updateTime`, new Date().toLocaleString());
				$.fill.style.width = "100%";
				$.progress.textContent = `${order.length} 个文件增量完成`;
				$.cur.textContent = "";
				setStatus(`增量更新完成（v${finalVersion || "?"}），重启游戏后生效。音效/动画等资源变动需用全量更新`, "ok");
				$.restart.style.display = "";
			} catch (e) {
				const where = curFile ? `（出错于 ${curFile}）` : "（版本号获取阶段）";
				setStatus(`增量更新失败${where}：${fmtErr(e)}\n版本号未变更，可重试或改用全量更新`, "err");
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
				checkConnectivity().catch((e) => setStatus(`检测出错：${fmtErr(e)}`, "err"));
			};
			$.srcs = SOURCES.map((src) => el("ktupd-src", dialog, `● ${src.label} — 未检测`));
			el("ktupd-section", dialog, "② 下载更新");
			el("ktupd-hint", dialog, "增量：只更新主文件和版本号（几秒完成）；全量：下载完整压缩包解压覆盖（约86MB，资源变动时用）");
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
	// 技能池管理器工厂：扩展设置里点按钮弹出的遮罩窗口（与更新中心共用KT_CSS样式）
	// ①降临池 extension_kirito扩展_touyingPool（默认本扩展全部技能，上限20）：〖降临〗发动时读取；
	// ②灌顶池 extension_kirito扩展_guandingPool（默认空，无上限）：开启「自动添加技能」后每局开局自动加给玩家
	const ktCreatePoolManager = ({ key, title, hint, max, defaultPool, ownSkills, emptyHint, resetLabel }) => {
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
			for (const skill of ownSkills) {
				if (!map.has(skill) && lib.skill[skill] && lib.translate[skill] && lib.translate[skill + "_info"]) {
					map.set(skill, "kirito扩展");
				}
			}
			return map;
		};
		const getPool = () => {
			const saved = lib.config[key];
			return Array.isArray(saved) ? saved.filter((skill) => typeof skill == "string") : [];
		};
		const savePool = (pool) => game.saveConfig(key, pool);
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
			$.count.textContent = max === Infinity ? `${pool.length} 个` : `${pool.length}/${max}`;
			if (!pool.length) {
				el("ktupd-empty", $.chips, emptyHint);
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
				const full = pool.length >= max;
				const btn = el(`ktupd-add${inPool || full ? " off" : ""}`, item, inPool ? "已添加" : full ? "已满" : "+ 添加");
				if (!inPool && !full) {
					btn.onclick = () => {
						const next = getPool();
						if (next.length >= max || next.includes(skill)) return;
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
			el("ktupd-title", dialog, title);
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
			$.count.textContent = "0";
			hintRow.appendChild($.count);
			el("ktupd-hint", dialog, hint);
			$.chips = el("ktupd-chips", dialog);
			$.search = document.createElement("input");
			$.search.className = "ktupd-search";
			$.search.placeholder = "搜索：技能名 / 技能ID / 武将名（本体与已开启扩展的全部武将）";
			$.search.oninput = () => render();
			dialog.appendChild($.search);
			$.list = el("ktupd-list", dialog);
			const footer = el("div", dialog);
			footer.style.cssText = "margin-top:12px";
			const resetBtn = el("ktupd-btn", footer, resetLabel);
			resetBtn.onclick = () => {
				savePool(defaultPool.slice());
				render();
			};
			render();
		}
		return { open };
	};
	// 降临技能池：〖降临〗局内可挑选的技能（默认本扩展全部技能，上限20）
	const ktPoolManager = ktCreatePoolManager({
		key: "extension_kirito扩展_touyingPool",
		title: "降临技能池管理",
		hint: "点下方标签移除技能；在搜索框中按技能名/ID/武将名筛选后点「+ 添加」加入（上限20个）。改动即时保存，对下一局生效",
		max: 20,
		defaultPool: DEFAULT_TOUYING_POOL,
		ownSkills: [...DEFAULT_TOUYING_POOL, "kthuitian"],
		emptyHint: "池子为空：游戏内降临将没有可选技能，点下方「恢复默认」可一键还原",
		resetLabel: "恢复默认（本扩展全部技能）",
	});
	// 灌顶技能池：开启「自动添加技能」后每局开局自动加给玩家操控的角色（默认空，无上限）
	const ktGuandingManager = ktCreatePoolManager({
		key: "extension_kirito扩展_guandingPool",
		title: "灌顶技能池管理",
		hint: "点下方标签移除技能；在搜索框中按技能名/ID/武将名筛选后点「+ 添加」加入（无上限）。改动即时保存，对下一局生效",
		max: Infinity,
		defaultPool: [],
		ownSkills: [...DEFAULT_TOUYING_POOL, "kthuitian"],
		emptyHint: "池子为空：开局不会自动添加任何技能，在下方搜索添加后配合「自动添加技能」开关使用",
		resetLabel: "清空池子",
	});
	// 武将禁选中心：在千幻聆音武将详情「禁用设置」里插入「AI 禁用」「玩家禁用」两个勾选（存于
	// extension_kirito扩展_banAI / banPlayer 名单），消费挂在核心两级闸门上，不碰原生 forbidai/_banned：
	// ① AI 禁用 → lib.filter.characterDisabled（选将池级，与本体forbidai同层）：AI/随机发放的池子里
	//    直接没有该武将；自由选将/上阵类界面走 Disabled2 不受影响，玩家仍可主动选择；
	// ② 玩家禁用 → lib.filter.characterDisabled2（UI级）：图鉴/自由选将/获得类列表全部隐藏；
	//    各模式开局池只查 Disabled（如身份/国战遍历lib.character时），故 AI 仍可随机获得该武将；
	//    人挑选将对话框经 chooseButton 包装把该武将置灰不可选（候选全被禁时放行，避免无解卡死）
	const ktBanCenter = (() => {
		const KEY_AI = "extension_kirito扩展_banAI";
		const KEY_PLAYER = "extension_kirito扩展_banPlayer";
		let installed = false;
		let qhlyPollTimer = null;
		let dzxyPollTimer = null;
		const getList = (key) => (Array.isArray(lib.config[key]) ? lib.config[key].filter((n) => typeof n == "string") : []);
		const saveList = (key, name, checked) => {
			const list = getList(key);
			if (checked) {
				if (!list.includes(name)) list.push(name);
			} else {
				list.remove(name);
			}
			game.saveConfig(key, list);
		};
		const patchFilters = () => {
			const origDisabled = lib.filter.characterDisabled;
			lib.filter.characterDisabled = function (name2, _characters, ...options) {
				if (!options.includes("ignoreForibidden") && getList(KEY_AI).includes(name2)) {
					return true;
				}
				return origDisabled.apply(this, arguments);
			};
			const origDisabled2 = lib.filter.characterDisabled2;
			lib.filter.characterDisabled2 = function (name2, ...options) {
				if (getList(KEY_PLAYER).includes(name2)) {
					return true;
				}
				return origDisabled2.apply(this, arguments);
			};
		};
		// 人挑选将候选池剔除（v3.44）：核心诉求是"从池子里去掉"而非置灰拦截——被禁武将占一个候选位
		// 等于浪费，候选位应让给可用武将。包装chooseButton内容首步与Player.prototype.chooseButton：
		// ① event.createDialog 含 [武将名列表,"character"] 规格（欢乐斗地主等对象形态）：列表是活引用，
		//   在对话框创建前就地改写——被禁武将从剩余选将池_status.characterlist抽其他武将补位，补不出才剔除；
		// ② event.dialog.buttons 已有被禁按钮（对话框节点直传形态，如身份/国战）：直接删除该按钮。
		// 不看parent——本引擎createEvent不设parent（走eventManager.next），也不依赖_status.event时机
		const ktPurgeBanFromPick = (event) => {
			if (!event || event.__ktBanPurged) {
				return;
			}
			const banPlayer = getList(KEY_PLAYER);
			// 选将候选数量（配置pickCandidateCount，"0"=跟随原版）：候选数组是活引用、渲染长度随数组，
			// 故从剩余选将池补足到设定值即可控制选将框数量（欢乐斗地主原版在模式代码里写死4个）
			const wantCount = Number(game.getExtensionConfig ? game.getExtensionConfig("kirito扩展", "pickCandidateCount") : 0) || 0;
			if (!banPlayer.length && !wantCount) {
				return;
			}
			const need = Math.max(Array.isArray(event.selectButton) ? event.selectButton[0] : 1, 1);
			if (Array.isArray(event.createDialog)) {
				for (const item of event.createDialog) {
					if (!Array.isArray(item) || item.length < 2 || item[1] != "character" || !Array.isArray(item[0])) {
						continue;
					}
					const list = item[0];
					const pool = Array.isArray(_status.characterlist) ? _status.characterlist : [];
					for (let i = list.length - 1; i >= 0; i--) {
						const name = list[i];
						if (typeof name != "string" || !banPlayer.includes(name)) {
							continue;
						}
						let sub = null;
						for (let tries = 0; tries < 50 && pool.length; tries++) {
							const cand = pool[Math.floor(Math.random() * pool.length)];
							if (typeof cand == "string" && lib.character[cand] && !banPlayer.includes(cand) && !list.includes(cand)) {
								sub = cand;
								break;
							}
						}
						// 池里补不出时才直接剔除，且候选数不能被删到低于最低选择数
						if (sub) {
							list[i] = sub;
						} else if (list.length - 1 >= need) {
							list.splice(i, 1);
						}
					}
					// 候选数补足：非空且未达标时从剩余选将池随机补位（候选为空不补，避免无中生有）
					if (wantCount && list.length && list.length < wantCount) {
						let guard = 300;
						while (list.length < wantCount && pool.length && guard--) {
							const cand = pool[Math.floor(Math.random() * pool.length)];
							if (typeof cand == "string" && lib.character[cand] && !banPlayer.includes(cand) && !list.includes(cand)) {
								list.push(cand);
							}
						}
					}
				}
			}
			const buttons = event.dialog && event.dialog.buttons;
			if (Array.isArray(buttons) && buttons.length) {
				const nameOf = (button) => (typeof button.link == "string" ? button.link : button.link && button.link.name);
				const banned = buttons.filter((b) => banPlayer.includes(nameOf(b)));
				if (banned.length && buttons.length - banned.length >= need) {
					const dialog = event.dialog;
					// 样式基准与挂载容器先取（被禁按钮删除前）
					const sample = buttons.find((b) => !banned.includes(b)) || buttons[0];
					const parent = sample && sample.parentNode;
					const type = sample && sample.classList && sample.classList.contains("characterx") ? "characterx" : "character";
					banned.forEach((b) => typeof b.remove == "function" && b.remove());
					dialog.buttons = buttons.filter((b) => !banned.includes(b));
					// v3.80补位：对话框直传形态（身份/国战等）此前只删不补致候选框直接变少——按官方换将弹窗
					// 同款ui.create.buttons从剩余选将池抽等量非禁武将补回，候选数量保持不变
					if (parent) {
						const pool = Array.isArray(_status.characterlist) ? _status.characterlist : [];
						const existing = new Set(dialog.buttons.map((b) => nameOf(b)));
						const adds = [];
						let guard = 200;
						while (adds.length < banned.length && pool.length && guard--) {
							const cand = pool[Math.floor(Math.random() * pool.length)];
							if (typeof cand == "string" && lib.character[cand] && !banPlayer.includes(cand) && !existing.has(cand)) {
								existing.add(cand);
								adds.push(cand);
							}
						}
						if (adds.length) {
							const created = ui.create.buttons(adds, type, parent);
							if (Array.isArray(created)) {
								dialog.buttons.push(...created);
							} else if (created) {
								dialog.buttons.push(created);
							}
							if (typeof ui.update == "function") {
								ui.update();
							}
						}
					}
				}
			}
			event.__ktBanPurged = true;
		};
		const patchContent = () => {
			const steps = lib.element.content && lib.element.content.chooseButton;
			if (Array.isArray(steps) && steps.length && typeof steps[0] == "function" && !steps.__ktBanPatched) {
				steps.__ktBanPatched = true;
				const origFirst = steps[0];
				steps[0] = async function (event) {
					try {
						ktPurgeBanFromPick(event);
					} catch (e) {
						console.warn("kirito扩展：玩家禁用过滤失败", e);
					}
					return origFirst.apply(this, arguments);
				};
			}
		};
		const patchChooseButton = () => {
			if (typeof Player != "function" || !Player.prototype || typeof Player.prototype.chooseButton != "function") {
				return;
			}
			const origChooseButton = Player.prototype.chooseButton;
			Player.prototype.chooseButton = function (...args) {
				const next = origChooseButton.apply(this, args);
				try {
					ktPurgeBanFromPick(next);
				} catch (e) {
					console.warn("kirito扩展：玩家禁用过滤失败", e);
				}
				return next;
			};
		};
		// 斗转星移选将界面（欢乐斗地主等模式用其自定义UI渲染选将，不经过chooseButton的filterButton判定，
		// 「可选武将」框即此）：①openPage渲染前把被禁武将按钮从dialog.buttons剔除（剩余不足requireNum时
		// 保留，避免凑不齐确认）；②selectChar兜底拦截（自由选将等任何渲染路径点到被禁武将时拒绝）；
		// ③getRepChar换将候选池剔除被禁武将（滤完为空则放行原池，避免换将无解）
		const patchDZXProto = (proto) => {
			if (!proto || proto === Object.prototype || proto.__ktBanPatched) {
				return;
			}
			proto.__ktBanPatched = true;
			if (typeof proto.openPage == "function") {
				const origOpenPage = proto.openPage;
				proto.openPage = function (dialog, requireNum) {
					try {
						const banPlayer = getList(KEY_PLAYER);
						if (dialog && Array.isArray(dialog.buttons) && banPlayer.length) {
							const nameOf = (b) => (typeof b.link == "string" ? b.link : b.link && b.link.name);
							const banned = dialog.buttons.filter((b) => banPlayer.includes(nameOf(b)));
							const need = Math.max(typeof requireNum == "number" ? requireNum : 1, 1);
							if (banned.length && dialog.buttons.length - banned.length >= need) {
								banned.forEach((b) => typeof b.remove == "function" && b.remove());
								dialog.buttons = dialog.buttons.filter((b) => !banned.includes(b));
							}
						}
					} catch (e) {
						console.warn("kirito扩展：斗转星移禁选过滤失败", e);
					}
					return origOpenPage.apply(this, arguments);
				};
			}
			if (typeof proto.selectChar == "function") {
				const origSelectChar = proto.selectChar;
				proto.selectChar = function (char, event) {
					if (char && char.ID && getList(KEY_PLAYER).includes(char.ID)) {
						alert(`「${get.translation(char.ID) || char.ID}」已被玩家禁用，无法选择`);
						return;
					}
					return origSelectChar.apply(this, arguments);
				};
			}
			if (typeof proto.getRepChar == "function") {
				const origGetRepChar = proto.getRepChar;
				proto.getRepChar = function () {
					const list = origGetRepChar.apply(this, arguments);
					try {
						const banPlayer = getList(KEY_PLAYER);
						if (!banPlayer.length || !Array.isArray(list)) {
							return list;
						}
						const filtered = list.filter((c) => !banPlayer.includes(c));
						return filtered.length ? filtered : list;
					} catch (e) {
						return list;
					}
				};
			}
		};
		const installDZX = () => {
			const dzxy = window.dzxy;
			if (dzxy) {
				for (const key of Object.keys(dzxy)) {
					const inst = dzxy[key];
					if (inst && typeof inst == "object" && typeof inst.openPage == "function") {
						let proto = Object.getPrototypeOf(inst);
						while (proto && proto !== Object.prototype) {
							patchDZXProto(proto);
							proto = Object.getPrototypeOf(proto);
						}
					}
				}
				return;
			}
			// 斗转星移可能晚于本扩展加载：轮询等待（最长60秒），缺席则静默放弃
			if (dzxyPollTimer == null) {
				const start = Date.now();
				dzxyPollTimer = setInterval(() => {
					if (window.dzxy || Date.now() - start > 60000) {
						clearInterval(dzxyPollTimer);
						dzxyPollTimer = null;
						if (window.dzxy) {
							installDZX();
						}
					}
				}, 500);
			}
		};
		// 千幻聆音武将详情面板：其构建「禁用设置」时会调用 game.qhly_isForbidAI(name)（此时DOM已就绪），
		// 包装它拿到时机与武将名，在「仅自由选将可选」行后插入两行，复用其复选框组件与交互
		const injectQhlyRows = (name) => {
			try {
				if (document.getElementById("kt_ban_ai_box")) {
					return;
				}
				const anchor = document.getElementById("qhconfig_checkbox_text_ai");
				if (!anchor || !anchor.parentNode || !anchor.parentNode.parentNode) {
					return;
				}
				const row = anchor.parentNode.parentNode;
				const makeRow = (boxId, textId, label) => {
					const p = document.createElement("p");
					const span = document.createElement("span");
					span.style.cssText = "display:inline-block;height:30px;";
					const img = document.createElement("img");
					img.id = boxId;
					const text = document.createElement("span");
					text.id = textId;
					text.style.cssText = "display:inline-block;position:relative;bottom:25%;";
					text.textContent = label;
					span.appendChild(img);
					span.appendChild(text);
					p.appendChild(span);
					return { p, img, text };
				};
				const aiRow = makeRow("kt_ban_ai_box", "kt_ban_ai_text", "AI 禁用（AI不会随机获得或选用，你可自选）");
				const playerRow = makeRow("kt_ban_player_box", "kt_ban_player_text", "玩家禁用（你无法获得，AI不受影响）");
				row.parentNode.insertBefore(playerRow.p, row.nextSibling);
				row.parentNode.insertBefore(aiRow.p, playerRow.p);
				const bind = (img, text, key) => {
					ui.qhly_initCheckBox(img, getList(key).includes(name));
					img.qhly_onchecked = (check) => saveList(key, name, check);
					ui.qhly_addListenFunc(text);
					text.listen(() => img.qhly_setChecked(!img.qhly_checked, true));
				};
				bind(aiRow.img, aiRow.text, KEY_AI);
				bind(playerRow.img, playerRow.text, KEY_PLAYER);
			} catch (e) {
				console.warn("kirito扩展：禁选勾选注入失败", e);
			}
		};
		const installQhlyBoxes = () => {
			if (typeof game.qhly_isForbidAI == "function") {
				const origIsForbidAI = game.qhly_isForbidAI;
				game.qhly_isForbidAI = function (name) {
					injectQhlyRows(name);
					return origIsForbidAI.apply(this, arguments);
				};
				return;
			}
			// 千幻聆音可能晚于本扩展加载：轮询等待（最长60秒），缺席则静默放弃（仅没有这两个勾选，其余不受影响）
			if (qhlyPollTimer == null) {
				const start = Date.now();
				qhlyPollTimer = setInterval(() => {
					if (typeof game.qhly_isForbidAI == "function" || Date.now() - start > 60000) {
						clearInterval(qhlyPollTimer);
						qhlyPollTimer = null;
						if (typeof game.qhly_isForbidAI == "function") {
							installQhlyBoxes();
						}
					}
				}, 500);
			}
		};
		const install = () => {
			if (installed) {
				return;
			}
			installed = true;
			patchFilters();
			patchContent();
			patchChooseButton();
			installQhlyBoxes();
			installDZX();
		};
		return { install };
	})();
	// 斗转星移身份选将防崩（v3.46）：其重写的game.chooseCharacter在身份场特殊身份（贼首/大将/军师）
	// 分支直接读 game.me.node.identity.firstChild 不判空（ChooseChar_mod.js:707）——主题/美化扩展重绘
	// 玩家节点后身份节点可能缺失，选将事件当场TypeError中断（现象：选将界面卡死+报错窗口，event.step:1）。
	// 检测到其chooseCharacter后包装：调用前为所有玩家补建缺失的identity节点（背面"cai"，与原版步骤0
	// 行为一致；只补缺不重建，避免重复节点）
	const ktIdentityGuard = (() => {
		let timer = null;
		const isDZXChooseCharacter = () => {
			if (typeof game.chooseCharacter != "function") {
				return false;
			}
			const src = String(game.chooseCharacter);
			return src.includes("dzxy") || (window.dzxy != null && src.includes("chooseChar"));
		};
		const install = () => {
			if (!isDZXChooseCharacter()) {
				return false;
			}
			const origChooseCharacter = game.chooseCharacter;
			game.chooseCharacter = function (...args) {
				try {
					const players = Array.isArray(game.players) ? game.players.slice() : [];
					if (game.me && !players.includes(game.me)) {
						players.push(game.me);
					}
					for (const p of players) {
						if (p && p.node && !p.node.identity) {
							p.node.identity = ui.create.div(".identity", p);
						}
					}
				} catch (e) {
					console.warn("kirito扩展：身份节点补建失败", e);
				}
				return origChooseCharacter.apply(this, args);
			};
			return true;
		};
		return () => {
			if (install()) {
				return;
			}
			if (timer == null) {
				const start = Date.now();
				timer = setInterval(() => {
					if (install() || Date.now() - start > 60000) {
						clearInterval(timer);
						timer = null;
					}
				}, 500);
			}
		};
	})();
	// 动皮仅自己展示（v3.47）：动皮按武将名绑定，AI用同款武将也会渲染Spine动皮吃性能。
	// 包装十周年UI的_decadeUIApplyDynamicSkin与千幻聆音的qhly_changeDynamicSkin两个应用点：
	// 非玩家操控（game.me）的角色跳过动皮应用并清理已有动皮，回退静态皮肤。配置dynamicSkinSelfOnly可关
	const ktDynamicSelfOnly = (() => {
		let timer = null;
		let doneUI = false;
		let doneQhly = false;
		let donePlay = false;
		const enabled = () => game.getExtensionConfig("kirito扩展", "dynamicSkinSelfOnly") !== false;
		const skip = (player) => {
			// 跳过条件收窄为"场上AI玩家"（player在game.players里且不是game.me）：选皮预览/菜单展示/
			// 临时玩家元素一律放行，否则会误伤自己的动皮（v3.47误伤教训）
			if (!enabled() || !player || !Array.isArray(game.players) || !game.players.includes(player)) {
				return false;
			}
			// game.me尚未指派的早期窗口不拦截任何人（无法区分人与AI，误拦会锁死玩家自己的动皮）；
			// 该窗口内已渲染的AI动皮由gameStart后的持续校正兜底
			if (!game.me || player == game.me) {
				return false;
			}
			try {
				const had = !!(player.dynamic || (player.$dynamicWrap && player.$dynamicWrap.style.backgroundImage));
				if (player.dynamic && typeof player.stopDynamic == "function") {
					player.stopDynamic();
				}
				if (player.$dynamicWrap) {
					player.$dynamicWrap.style.backgroundImage = "";
				}
				if (had) {
					console.log(`[kirito扩展]已跳过AI动皮：${player.name || player.name1 || "?"}`);
				}
			} catch (e) {}
			return true;
		};
		// playDynamic是所有动皮播放的总闸：十周年UI玩家$init直连播放（不经过_decadeUIApplyDynamicSkin
		// 与qhly_changeDynamicSkin，此前AI动皮漏网根因）、千幻聆音引擎（初始化时会把该槽位整槽换成
		// qhly_playdynamic）最终都落到这里。用访问器属性锁槽：之后任何扩展覆写该槽位都会被setter
		// 捕获并即时重新包装，杜绝装载时序竞态
		let innerPlay = null;
		const playSkip = function (...args) {
			if (skip(this)) {
				// 十周年UI的$init/_decadeUIApplyDynamicSkin在playDynamic返回后自行CUR_DYNAMIC++，
				// 先-1对冲，防止AI被拦截后配额计数虚增挤占玩家自己的动皮
				try {
					if (window.decadeUI && window.decadeUI.CUR_DYNAMIC > 0) {
						window.decadeUI.CUR_DYNAMIC--;
					}
				} catch (e) {}
				return;
			}
			if (typeof innerPlay != "function") {
				return;
			}
			return innerPlay.apply(this, args);
		};
		playSkip.__ktSelfOnly = true;
			const armPlay = () => {
				const proto = (lib.element && lib.element.player) || (typeof Player == "function" ? Player.prototype : null);
				if (!proto) {
					return false;
				}
				try {
					const desc = Object.getOwnPropertyDescriptor(proto, "playDynamic");
					if (desc && desc.get && desc.get.__ktSelfOnly) {
						return true;
					}
					if (desc && !desc.configurable) {
						// 不可配置槽位：退化为一次性包装（赋值可能被原setter吞掉，尽力而为）
						if (typeof proto.playDynamic == "function" && !proto.playDynamic.__ktSelfOnly) {
							innerPlay = proto.playDynamic;
							proto.playDynamic = playSkip;
							return true;
						}
						return false;
					}
					// 可配置槽位（含千幻聆音的访问器——其setter为空操作，普通赋值会被静默吞掉，
					// 这也是此前"AI仍渲染"的一环）：defineProperty整体接管，捕获当前占用者为底层函数
					innerPlay = typeof proto.playDynamic == "function" ? proto.playDynamic : null;
					const getter = function () {
						return playSkip;
					};
					getter.__ktSelfOnly = true;
					Object.defineProperty(proto, "playDynamic", {
						configurable: true,
						enumerable: desc ? desc.enumerable : false,
						get: getter,
						set: function (v) {
							innerPlay = v;
						},
					});
					return true;
				} catch (e) {
					return false;
				}
			};
		const tryInstall = () => {
			if (!doneUI && typeof Player == "function" && Player.prototype && typeof Player.prototype._decadeUIApplyDynamicSkin == "function") {
				const origApply = Player.prototype._decadeUIApplyDynamicSkin;
				Player.prototype._decadeUIApplyDynamicSkin = function (...args) {
					if (skip(this)) {
						return;
					}
					return origApply.apply(this, args);
				};
				doneUI = true;
			}
			if (!doneQhly && typeof game.qhly_changeDynamicSkin == "function") {
				const origQhly = game.qhly_changeDynamicSkin;
				// 千幻聆音首参是字符串或节点（str），字符串时内部经qhly_getCurrentPlayer解析成玩家——
				// 不能直接当玩家对象判定，先解析出全部目标玩家再判定（v3.48漏网根因）
				game.qhly_changeDynamicSkin = function (str) {
					let targets = [];
					if (str && typeof str == "object") {
						targets = [str];
					} else if (typeof str == "string" && typeof game.qhly_getCurrentPlayer == "function") {
						try {
							targets = (game.qhly_getCurrentPlayer(str) || []).map((pair) => pair && pair[0]).filter(Boolean);
						} catch (e) {}
					}
					if (targets.length && targets.every((p) => skip(p))) {
						return;
					}
					return origQhly.apply(this, arguments);
				};
				doneQhly = true;
			}
			if (!donePlay) {
				donePlay = armPlay();
			}
			return doneUI && doneQhly && donePlay;
		};
		// 持续校正（v3.75根因修复）：欢乐斗地主等模式选将后会swapPlayer把game.me换到新节点——
		// gameStart那一刻的"me"可能变成AI、而被清场的节点反而成为玩家，只清一次场必然两头出错。
		// 改为gameStart起30秒内每秒校正：非me停皮；me若无活动动皮则重挂自己的（皮肤配置为空时自动无操作）
		const sweep = () => {
			if (!enabled() || !Array.isArray(game.players)) {
				return;
			}
			game.players.forEach((p) => {
				if (!p) {
					return;
				}
				if (p != game.me) {
					skip(p);
				} else if (!p.dynamic && typeof p._decadeUIApplyDynamicSkin == "function") {
					try {
						p._decadeUIApplyDynamicSkin();
						if (p.dynamic) {
							console.log("[kirito扩展]已恢复玩家自己的动皮");
						}
					} catch (e) {}
				}
			});
		};
		lib.announce.subscribe("Noname.Game.Event.GameStart", () => {
			try {
				armPlay();
				sweep();
				let ticks = 0;
				const timer = setInterval(() => {
					sweep();
					if (++ticks >= 30) {
						clearInterval(timer);
					}
				}, 1000);
			} catch (e) {}
		});
		return () => {
			if (tryInstall()) {
				return;
			}
			if (timer == null) {
				const start = Date.now();
				timer = setInterval(() => {
					if (tryInstall() || Date.now() - start > 60000) {
						clearInterval(timer);
						timer = null;
					}
				}, 500);
			}
		};
	})();
	// 配置云同步（精简版）：PC端为唯一配置源。PC游戏每次启动自动把 lib.config（本体配置+全部扩展菜单配置）
	// 导出为游戏根目录 config-sync.json；更新扩展时由构建流程把该快照复制进扩展包（AGENTS.md规则6），
	// 手机端随扩展更新拿到快照，点「同步配置」读取本地快照原样覆盖：
	// 已安装的扩展整组覆盖；未安装的扩展整组跳过；版本不一致导致的未知选项照样写入但记录异常；
	// 全部异常等写完一次性弹出。令牌等敏感键永不同步。
	const ktConfigSync = (() => {
		const NAME = "kirito扩展";
		const SNAP_PATH = `extension/${NAME}/config-sync.json`;
		// 敏感/设备私有的键不导出也不同步
		const DENY = new Set([`extension_${NAME}_githubToken`]);
		const platformName = () => (/android/i.test(navigator.userAgent || "") ? "安卓" : "PC");
		const gatherConfig = () => {
			const cfg = JSON.parse(JSON.stringify(lib.config));
			for (const k of DENY) delete cfg[k];
			cfg.__syncMeta = {
				time: new Date().toLocaleString(),
				from: platformName(),
				ext: VERSION,
			};
			return cfg;
		};
		// 游戏每次启动自动导出快照到游戏根目录（构建流程拾取后打进扩展包），静默执行
		const exportSnapshot = () => {
			try {
				if (typeof game.writeFile != "function") {
					return;
				}
				const json = JSON.stringify(gatherConfig());
				game.writeFile(json, ".", "config-sync.json", (err) => {
					if (err) {
						console.warn("kirito扩展：配置快照导出失败", err);
					}
				});
			} catch (e) {
				console.warn("kirito扩展：配置快照导出失败", e);
			}
		};
		// 本机已安装扩展集合：已启用 ∪ extensionInfo ∪ 本扩展 ∪ extension目录
		const localInstalled = async () => {
			const set = new Set(Array.isArray(lib.config.extensions) ? lib.config.extensions : []);
			if (lib.config.extensionInfo && typeof lib.config.extensionInfo == "object") {
				for (const n of Object.keys(lib.config.extensionInfo)) set.add(n);
			}
			set.add(NAME);
			if (typeof game.getFileList == "function") {
				try {
					const folders = await new Promise((resolve, reject) => game.getFileList("extension", (dirs) => resolve(dirs), reject));
					for (const d of folders || []) {
						if (d && d[0] != "." && d[0] != "_") set.add(d);
					}
				} catch {}
			}
			return set;
		};
		const readSnapshot = async () => {
			const text = await game.promises.readFileAsText(SNAP_PATH);
			const json = JSON.parse(text);
			if (!json || typeof json != "object") {
				throw new Error("快照内容无效");
			}
			return json;
		};
		const applyCloud = async (cloud) => {
			const warnings = [];
			let applied = 0;
			const installed = await localInstalled();
			// 键归属判定：本机已知扩展名最长前缀优先；都不匹配再试快照extensionInfo（用于未安装提醒）
			const localNames = [...installed].sort((a, b) => b.length - a.length);
			const cloudNames = cloud.extensionInfo && typeof cloud.extensionInfo == "object" ? Object.keys(cloud.extensionInfo).sort((a, b) => b.length - a.length) : [];
			const ownerOf = (key) => {
				for (const n of localNames) {
					if (key == `extension_${n}` || key.startsWith(`extension_${n}_`)) {
						return { name: n, installed: true };
					}
				}
				for (const n of cloudNames) {
					if (key == `extension_${n}` || key.startsWith(`extension_${n}_`)) {
						return { name: n, installed: false };
					}
				}
				return null;
			};
			// ① 启用列表：按本机安装过滤后覆盖
			if (Array.isArray(cloud.extensions)) {
				const keep = [];
				const miss = [];
				for (const n of cloud.extensions) {
					(installed.has(n) ? keep : miss).push(n);
				}
				if (miss.length) {
					warnings.push(`云端启用但本机未安装（已跳过）：${miss.join("、")}`);
				}
				await game.saveConfig("extensions", keep);
				applied++;
			}
			// ② extensionInfo：本机已安装的用快照覆盖，未安装的保留本地
			if (cloud.extensionInfo && typeof cloud.extensionInfo == "object") {
				const info = Object.assign({}, lib.config.extensionInfo || {});
				for (const n of Object.keys(cloud.extensionInfo)) {
					if (installed.has(n)) {
						info[n] = cloud.extensionInfo[n];
					}
				}
				await game.saveConfig("extensionInfo", info);
				applied++;
			}
			// ③ 其余全部键：本体键直接覆盖；扩展键按归属处理
			const keys = Object.keys(cloud).filter((k) => k != "__syncMeta" && k != "extensions" && k != "extensionInfo");
			for (const key of keys) {
				if (DENY.has(key)) {
					continue;
				}
				if (key.startsWith("extension_")) {
					const owner = ownerOf(key);
					if (!owner || !owner.installed) {
						warnings.push(`扩展未安装，已跳过：${owner ? owner.name : key}`);
						continue;
					}
					// 选项级异常：本机当前配置和扩展菜单里都没有该选项＝两端扩展版本不一致（仍原样写入，仅提醒）
					const item = key.slice(`extension_${owner.name}_`.length);
					if (item && item != "enable") {
						const menu = lib.extensionMenu && (lib.extensionMenu[`extension_${owner.name}`] || lib.extensionMenu[owner.name]);
						const known =
							Object.prototype.hasOwnProperty.call(lib.config, key) ||
							(menu && Object.prototype.hasOwnProperty.call(menu, item));
						if (!known) {
							warnings.push(`「${owner.name}」扩展的「${item}」选项异常：当前版本不存在（版本不一致），已原样写入`);
						}
					}
				}
				await game.saveConfig(key, cloud[key]);
				applied++;
			}
			return { applied, warnings };
		};
		async function run() {
			let cloud;
			try {
				cloud = await readSnapshot();
			} catch (e) {
				alert("未找到PC端配置快照（随扩展更新发布）。\n请先在PC端启动一次游戏（自动导出快照）并完成一次扩展更新，再来同步。\n\n" + (e && e.message ? e.message : e));
				return;
			}
			if (!confirm("将用PC端的配置快照覆盖本机配置。\n已安装的扩展整组覆盖；未安装的扩展跳过；版本不一致的选项照写并汇总提醒。继续？")) {
				return;
			}
			try {
				const meta = cloud.__syncMeta;
				const { applied, warnings } = await applyCloud(cloud);
				let summary = `同步完成：已写入 ${applied} 个配置键${meta ? `（快照来自${meta.from || "?"} ${meta.time || ""}）` : ""}。重启游戏后生效。`;
				if (warnings.length) {
					const show = warnings.slice(0, 30);
					summary += `\n\n异常汇总（${warnings.length} 条）：\n· ` + show.join("\n· ") + (warnings.length > show.length ? `\n· …等共 ${warnings.length} 条` : "");
				}
				if (confirm(summary + "\n\n是否立即重启游戏？")) {
					game.reload();
				}
			} catch (e) {
				alert(`同步失败：${e && e.message ? e.message : e}`);
			}
		}
		return { run, exportSnapshot };
	})();

	return {
		name: "kirito扩展",
		editable: true,
		connect: false,
		arenaReady: function () {},
		content: function (config, pack) {
		console.warn(`[kirito扩展] v${VERSION} content已加载`);
		window.addEventListener("error", (e) => {
			try { console.warn(`[kirito扩展]全局错误：${e.message} @ ${(e.filename || "?").split("/").slice(-2).join("/")}:${e.lineno}`); } catch (err) {}
		});
		window.addEventListener("unhandledrejection", (e) => {
			try { console.warn(`[kirito扩展]未处理的Promise拒绝：${e.reason && (e.reason.stack || e.reason.message || e.reason)}`.slice(0, 400)); } catch (err) {}
		});
			// 每次启动自动导出配置快照到游戏根目录（PC端为配置源；构建流程在更新扩展时拾取打进扩展包）
			ktConfigSync.exportSnapshot();
			// 武将禁选中心：核心闸门包装 + 千幻聆音「禁用设置」弹窗插入 AI 禁用/玩家禁用勾选
			ktBanCenter.install();
			// 斗转星移身份选将防崩：补建缺失的identity节点（其特殊身份分支不判空直接读firstChild）
			ktIdentityGuard();
			// 动皮仅自己展示：AI用同款武将回退静态皮，省性能
			ktDynamicSelfOnly();
			// 充能进度条系统提前装载（原在grytouying_bar子技能init时装载，依赖玩家构建时机）。
			// content执行时扩展技能包尚未注册完毕，轮询等待注册出现后再装载（最长60秒）
			const tryInstallBarSystem = () => {
				if (lib.skill.grytouying_bar && typeof lib.skill.grytouying_bar.init == "function") {
					try {
						lib.skill.grytouying_bar.init();
						console.log("[kirito扩展]充能条系统已安装");
					} catch (e) {
						console.warn("kirito扩展：充能条系统提前安装失败", e);
					}
					return true;
				}
				return false;
			};
			if (!tryInstallBarSystem()) {
				let barTimer = null;
				const barStart = Date.now();
				barTimer = setInterval(() => {
					if (tryInstallBarSystem() || Date.now() - barStart > 60000) {
						clearInterval(barTimer);
						barTimer = null;
					}
				}, 500);
			}
			// 灌顶：订阅本体每局 gameStart 广播（订阅方式参照奇妙工具）。开关「自动添加技能」开启且
			// 灌顶池非空时，创建事件把池内全部技能自动加给玩家操控的角色（addSkills自带获得特效）。
			// 录像回放不广播gameStart天然跳过；hasSkill去重保证读档/重复广播不会重复添加
			lib.announce.subscribe("Noname.Game.Event.GameStart", () => {
				try {
					if (!game.getExtensionConfig("kirito扩展", "autoAddSkills") || !game.me) {
						return;
					}
					const next = game.createEvent("ktGuanding", false);
					next.player = game.me;
					next.setContent(async (event, trigger, player) => {
						// 无上神自带〖降临〗可自行挑选技能，默认排除不重复灌顶（可关掉排除开关）
						if (
							game.getExtensionConfig("kirito扩展", "guandingExcludeWss") !== false &&
							(player.name == "wushangshen" || player.name1 == "wushangshen" || player.name2 == "wushangshen")
						) {
							return;
						}
						const saved = game.getExtensionConfig("kirito扩展", "guandingPool");
						const pool = (Array.isArray(saved) ? saved : []).filter(
							(skill) => typeof skill == "string" && lib.skill[skill] && !player.hasSkill(skill, null, null, false)
						);
						if (!pool.length) {
							return;
						}
						await player.addSkills(pool);
						game.log(player, "灌顶获得了技能", "#g" + pool.map((skill) => `【${get.translation(skill)}】`).join(""));
					});
				} catch (e) {
					console.warn("kirito扩展：灌顶添加技能失败", e);
				}
			});
			// 诊断：斗地主AI地主偶尔缺飞扬/跋扈——每局记录地主武将、技能状态与实际子模式，
			// 供复现时F12对照（正常应为 跋扈=true｜飞扬=true｜子模式=huanle）。zhu缺失也照记
			lib.announce.subscribe("Noname.Game.Event.GameStart", () => {
				try {
					if (lib.config.mode == "doudizhu") {
						const zhu = game.zhu;
						console.warn(`[kirito扩展]gameStart：子模式=${_status.mode}｜地主=${zhu ? (zhu.name || zhu.name1) : "缺失"}｜跋扈=${zhu ? zhu.hasSkill("bahu") : "-"}｜飞扬=${zhu ? (zhu.hasSkill("feiyang") || zhu.hasSkill("dcfeiyang") || zhu.hasSkill("mbfeiyang")) : "-"}｜禁用状态=${zhu && zhu.disabledSkills && (zhu.disabledSkills.bahu || zhu.disabledSkills.feiyang) ? "已禁用" : "未禁用"}`);
					}
				} catch (e) { console.warn("[kirito扩展]地主诊断异常", e); }
			});
		console.warn("[kirito扩展]地主诊断已订阅（欢乐/休闲斗地主每局gameStart输出）");
		},
		prepare: function () {},
		precontent: function (config) {
			// 无上神专属"寂灭"进度条样式：复刻自无名美化手杀神马超模块，类名一致（见 grytouying_bar）
			lib.init.css(lib.assetURL + "extension/kirito扩展", "wushangshen_bar");
			// 资产镜像：走本体FS抽象（readFile/writeFile），PC/安卓通用。
			// 不用fetch的原因：①部分安卓webview下对资源URL的fetch不可靠；②旧版"存在即跳过"，
			// 历史损坏留下的非空坏文件会被永远跳过（安卓端逐字节JSON假图片=结算头像空白元凶），
			// 现全字节比对，不一致自动经ktWriteBinary校验链重写自愈
			if (typeof game.writeFile == "function" && game.promises && typeof game.promises.readFile == "function") {
			const copyFile = async (from, to) => {
				try {
					const data = await game.promises.readFile(from);
					if (!data || !data.byteLength) {
						return;
					}
					const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
					// 旧版"存在即跳过"会把历史损坏留下的非空坏文件永久保留（安卓端即逐字节JSON损坏的
					// 假图片，结算头像/限定技背景空白的元凶）——现读回全字节比对，一致才跳过，不一致自动重写自愈
					let same = false;
					try {
						const existing = await game.promises.readFile(to);
						same = ktBytesEqual(existing, bytes);
					} catch {}
					if (same) {
						return;
					}
					// createDir等目录真正建完再回调（ensureDirectory在cordova端不等待，有竞态）
					const slash = to.lastIndexOf("/");
					await new Promise((resolve, reject) => game.createDir(to.slice(0, slash), resolve, reject));
					// 附带源URL：安卓损坏内核走FileTransfer从本机资源服务直落盘（native下载不经JS桥）
					await ktWriteBinary(bytes, to.slice(0, slash), to.slice(slash + 1), lib.assetURL + from);
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
			// 自愈守望：十周年UI初始化会执行 decadeUI.dynamicSkin = {...dynamicSkinConfig} 整表重建，
			// 若重建发生在我们注入之后（其更新后重建时机变晚，加载顺序竞态），注入项会被抹掉导致动皮无法选择。
			// 启动后2分钟内每3秒检查一次，发现被抹即自动补注；2分钟后视为初始化完毕，停止守望
			const watchdogDeadline = Date.now() + 120000;
			const watchdog = setInterval(() => {
				if (Date.now() > watchdogDeadline) {
					clearInterval(watchdog);
					return;
				}
				if (window.decadeUI && decadeUI.dynamicSkin && !decadeUI.dynamicSkin.wushangshen) {
					install();
					console.log("kirito扩展：检测到动皮配置被重建抹除，已自动补注");
				}
			}, 3000);
			// 皮肤切换(第三方扩展)安卓守护：其postMsgApi的playAvatar/changeAvatarAction/action裸访问
			// player.dynamic.renderer.postMessage——安卓webview下播放器worker常初始化失败或结算时已销毁置空，
			// 直接TypeError崩溃，且空白动皮层会遮住静态立绘（结算图片空白）。此处运行时包装三个入口：
			// renderer不可用时跳过指令，并隐藏空白动皮层、还原静态立绘（优雅回退）；PC端renderer恒可用不受影响。
			// skinSwitch本体是window全局普通对象（extension.js中Object.assign合入postMsgApi），可安全包装
			const guardSkinSwitch = () => {
				const root = window.skinSwitch;
				const api = root && root.postMsgApi;
				if (!api || api.__ktGuard) {
					return false;
				}
				const usable = (player) =>
					!!(player && player.dynamic && player.dynamic.renderer && typeof player.dynamic.renderer.postMessage == "function");
				const fallbackStatic = (player) => {
					const wrap = player.querySelector(".qhdynamic-big-wrap") || player.querySelector(".dynamic-wrap");
					if (wrap) {
						wrap.style.display = "none";
					}
					// 十周年UI用d-skin类把静态头像设为opacity:0，光恢复display不够，类也要摘掉
					if (player.classList) {
						player.classList.remove("d-skin", "d-skin2");
					}
					if (player.node && player.node.avatar) {
						player.node.avatar.style.display = "";
					}
				};
				for (const name of ["playAvatar", "changeAvatarAction", "action"]) {
					const origin = api[name];
					if (typeof origin != "function") {
						continue;
					}
					api[name] = function (player) {
						if (!usable(player)) {
							fallbackStatic(player);
							return;
						}
						return origin.apply(this, arguments);
					};
				}
				// 版本脱节修复：chukuang-worker-api.js三处调用skinSwitch.playAudioEffect（出框动画音效），
				// 但该函数在当前版本不存在（已更名qhly_playAudioEffect）——动皮出框动画一触发就TypeError。
				// 运行时补安全别名：按post-msg-api同款规则取皮肤名转调qhly_playAudioEffect，
				// 取不到就静默跳过（最坏只是没音效，不再崩溃）
				if (typeof root.playAudioEffect != "function") {
					root.playAudioEffect = function (data, avatar) {
						try {
							let name = avatar && avatar.gongji && avatar.gongji.name ? avatar.gongji.name : avatar && avatar.name;
							if (typeof name != "string" && data && data.dynamic) {
								name = data.dynamic.gongji && data.dynamic.gongji.name ? data.dynamic.gongji.name : data.dynamic.name;
							}
							if (typeof name != "string") {
								return;
							}
							const localePath = avatar && avatar.localePath;
							if (typeof localePath == "string" && name.startsWith(localePath)) {
								name = name.slice(localePath.length + 1);
							}
							if (typeof root.qhly_playAudioEffect == "function") {
								root.qhly_playAudioEffect(name);
							}
						} catch (e) {}
					};
				}
				api.__ktGuard = true;
				console.log("kirito扩展：已为皮肤切换动皮播放器安装空渲染器守护");
				return true;
			};
			if (!guardSkinSwitch()) {
				let tries = 0;
				const guardTimer = setInterval(() => {
					if (guardSkinSwitch() || ++tries > 30) {
						clearInterval(guardTimer);
					}
				}, 1000);
			}
			// MVP/结算兜底：斗转星移等结算页直接读 node.avatar 的背景图URL渲染大图；选中动皮后该URL
			// 指向动皮资源（非静态图片，加载失败）或被置空——结算页取不到图即整页空白（MVP页卡在pre-show）。
			// 结算前把动皮态的背景重置为本体静态立绘（image/character/<名>.jpg，已由上方镜像保证存在）；
			// 千幻聆音等真实存在的皮肤图URL不含assets/dynamic，不受影响
			const fixSettlementAvatars = () => {
				for (const p of [...(game.players || []), ...(game.dead || [])]) {
					for (const key of ["avatar", "avatar2"]) {
						const av = p.node && p.node[key];
						if (!av) continue;
						const bg = av.style.backgroundImage;
						if (!bg || bg.indexOf("assets/dynamic") >= 0) {
							const name = key == "avatar" ? (p.name1 || p.name) : (p.name2 || p.name1);
							if (name) av.setBackground(name, "character");
						}
					}
				}
			};
			if (typeof game.over == "function" && !game.__ktSettlementFix) {
				game.__ktSettlementFix = true;
				const originOver = game.over;
				game.over = function (...args) {
					try {
						fixSettlementAvatars();
					} catch (e) {
						console.warn("kirito扩展：结算头像兜底失败", e);
					}
					return originOver.apply(this, args);
				};
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
				intro: "多源自动测速择优。增量更新：只下载主文件extension.js和版本号info.json，几秒完成（音效/动画等资源变动时需全量更新）；全量更新：下载整包压缩包解压覆盖。两者均在全部写入成功后才写版本号，中途出错版本号不变。完成后需重启游戏生效",
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
			// 灌顶：开关+技能池（默认空）。开启后每局开局自动把池内全部技能加给玩家操控的角色
			autoAddSkills: {
				name: "自动添加技能（灌顶）",
				intro: "开启后，每局游戏开始时自动把「灌顶技能池」内的全部技能灌顶给你操控的角色（无需手动挑选）。需先在下方「灌顶技能池管理」中添加技能，池子为空则无效果。无上神默认不参与灌顶",
				init: false,
			},
			guandingExcludeWss: {
				name: "灌顶排除无上神",
				intro: "开启后，你操控无上神（含国战副将形态）时开局不自动灌顶——无上神自带〖降临〗可自行挑选技能，避免重复。关闭此项则无上神也照常灌顶",
				init: true,
			},
			guandingPool: {
				name: "灌顶技能池管理（增加/排除）",
				intro: "管理开局自动灌顶的技能池：默认为空；可搜索添加本体及已开启扩展武将的所有技能（无上限），点标签移除。配合「自动添加技能」开关使用，改动即时保存，下一局生效",
				clear: true,
				onclick() {
					ktGuandingManager.open();
				},
			},
			// 选将候选数量：候选数组是活引用，从剩余选将池补足到设定值即可控制选将框数量
			pickCandidateCount: {
				name: "选将候选数量",
				intro: "把选将框的候选武将数量补足到设定值：不足时从本局剩余选将池随机补位，已达标则不变，「跟随原版」不调整。影响欢乐斗地主（原版固定4个）等走选将对话框的界面，下一局生效",
				init: "0",
				item: {
					"0": "跟随原版",
					"5": "5个",
					"6": "6个",
					"7": "7个",
					"8": "8个",
					"10": "10个",
				},
			},
			// 动皮仅自己展示：AI用同款武将回退静态皮，省性能
			dynamicSkinSelfOnly: {
				name: "动皮仅自己展示",
				intro: "开启后动态皮肤只渲染在你操控的角色上：AI 使用同款武将时回退为静态皮肤，节省性能。关闭则恢复原版（所有同款武将都渲染动皮）。改动对下一局生效，进行中的对局不受影响",
				init: true,
			},
			// 配置云同步：以PC端为准——PC启动自动导出配置快照，扩展更新时随包发布，本机一键原样覆盖
			cloudSync: {
				name: "同步配置（以PC端为准）",
				intro: "PC端游戏每次启动自动导出配置快照，更新扩展时快照随包发布。点此用快照覆盖本机配置：已安装的扩展整组覆盖、未安装的跳过、版本不一致的选项照写并汇总提醒（异常在完成后一次性弹出），完事后重启生效。无需令牌、无需网络配置",
				clear: true,
				onclick() {
					ktConfigSync.run();
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
						 * 候选池：绝境/龙魂（龙神赵云）+ 雷神（驭雳/霆威/寂灭三合一，手杀神马超）+ 天涛/星魂/神霈（手杀神姜维）
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
										// 销毁进度条：移除DOM并停掉满格充电特效（进度条跟随〖雷神〗技能，失去技能即销毁）
										const destroyBar = (player) => {
											if (player.storage._fullPowerAnim && typeof window.dcdAnim != "undefined") {
												dcdAnim.stopSpine(player.storage._fullPowerAnim);
												player.storage._fullPowerAnim = null;
											}
											player.querySelector(".jimiePower")?.remove();
										};
										// 刷新进度条：计数数字/clip-path填充/满8格循环特效（特效依赖无名美化的dcdAnim，缺席则只涨进度）
										const update = (player) => {
											if (game.me !== player || !player.hasSkill("ktleishen")) {
												const stale = player.querySelector && player.querySelector(".jimiePower");
												if (stale) {
													destroyBar(player);
												}
												return;
											}
											if (!player.querySelector(".jimiePower")) {
												create(player);
											}
											const powerCon = player.querySelector(".jimiePower");
											if (!powerCon) {
												return;
											}
											const numEl = powerCon.querySelector(".jimieNum");
											const barArea = powerCon.querySelector(".jimiePowerBarArea");
											// 兼容两种标记名：克隆技能加 kttingwei，本体原版霆威加 tingwei
											const num = player.countMark("kttingwei") + player.countMark("tingwei") + player.countMark("ktleishen_ting");
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
										// 创建进度条：跟随〖雷神〗技能——本地玩家拥有该技能即显示（不限定武将名：国战暗置阶段player.name并非wushangshen，v3.61前会被误拦）；已存在则跳过
										const create = (player) => {
											if (game.me !== player || !player.hasSkill("ktleishen")) {
												return;
											}
											if (player.querySelector(".jimiePower")) {
												return;
											}
											const powerCon = document.createElement("div");
											powerCon.classList.add("jimiePower");
											const num = document.createElement("span");
											num.classList.add("jimieNum");
											num.innerHTML = player.countMark("kttingwei") + player.countMark("tingwei") + player.countMark("ktleishen_ting") || 0;
											powerCon.appendChild(num);
											const barArea = document.createElement("div");
											barArea.classList.add("jimiePowerBarArea");
											const lock = document.createElement("img");
											lock.classList.add("jimieLock");
											lock.src = "extension/kirito扩展/image/wushangshen_bar/smc_jindutiao_suo.png";
											powerCon.appendChild(barArea);
											powerCon.appendChild(lock);
											player.appendChild(powerCon);
											console.log("[kirito扩展]充能进度条已创建");
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
										console.log("[kirito扩展]充能条系统已安装");
										// 拦截标记增减：霆标记变动即刷新（不依赖无名美化是否开启；
										// countMark 为纯存储读取，不会回调本拦截，无递归风险）
										const watchMark = (method) => {
											const origin = Player.prototype[method];
											Player.prototype[method] = function (name) {
												const result = origin.apply(this, arguments);
											if (name == "tingwei" || name == "kttingwei" || name == "ktleishen_ting") {
												update(this);
											}
												return result;
											};
										};
										watchMark("addMark");
										watchMark("removeMark");
										// 拦截技能增减：进度条跟随〖雷神〗——降临选中时创建，技能被移除时连特效一起销毁
										const watchSkill = (method) => {
											const origin = Player.prototype[method];
											Player.prototype[method] = function (name) {
												const result = origin.apply(this, arguments);
												if (name == "ktleishen" && this == game.me) {
													if (this.hasSkill("ktleishen")) {
														create(this);
													} else {
														destroyBar(this);
													}
												}
												return result;
											};
										};
										watchSkill("addSkill");
										watchSkill("removeSkill");
										// 降临经addSkills/changeSkills的$handle旁路添加技能时可能绕过addSkill拦截——
										// 在addSkills入口再挂一层，雷神到手即创建进度条
										const watchAddSkills = () => {
											const originAddSkills = Player.prototype.addSkills;
											Player.prototype.addSkills = function (skill) {
												const result = originAddSkills.apply(this, arguments);
												try {
													const list = Array.isArray(skill) ? skill : [skill];
													if (this == game.me && list.includes("ktleishen") && this.hasSkill("ktleishen")) {
														create(this);
													}
												} catch (e) {}
												return result;
											};
										};
										watchAddSkills();
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
						/* ===== 雷神（v3.51：驭雳/霆威/寂灭三合一）=====
						 * ①免疫雷电伤害：防止之并摸等量牌回复等量体力（语音沿用驭雳）；
						 * ②每回合第一次【杀】指定目标：弃置其一张牌（所有区域），无牌可弃则改为你摸一张牌
						 *   （无任何类型附加效果；此杀击杀则次数+1，语音沿用霆威）；
						 * ③造成伤害后：受击者获得等量"麻"（用牌弃手牌后-1）、自己获得等量"霆"（寂灭大招只施加麻）；
						 * ④弃牌阶段结束霆≥12可触发寂灭：对一名角色造成其体力上限的雷伤+可抹一个技能（不消耗霆、每局一次）；
 *   霆数常驻被动：≥4拼点+13与受击反麻、≥8每回合一次手牌换判定拿原牌、≥16武翊（
 *   基本牌无次数限制、无距离限制）
						 * "霆"标记沿用独立名 ktleishen_ting，与本体/手杀标记互不干扰 */
						ktleishen: {
							fixed: true,
							group: ["ktleishen_immune", "ktleishen_sha", "ktleishen_madamage", "ktleishen_punish", "ktleishen_reset", "ktleishen_kill", "ktleishen_fanma", "ktleishen_wuyi", "ktleishen_huanpan", "ktleishen_pd13", "ktleishen_release"],
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
							subSkill: {
								immune: {
									audio: ["ext:kirito扩展/audio/skill/ktyuli5.mp3", "ext:kirito扩展/audio/skill/ktyuli6.mp3"],
									fixed: true,
									forced: true,
									trigger: { player: "damageBegin4" },
									filter(event) {
										return event.hasNature("thunder");
									},
									async content(event, trigger, player) {
										player.logSkill("ktleishen_immune");
										trigger.cancel();
										game.log(player, "免疫了雷电伤害");
									// 驭雳额外内容：防止伤害后摸等量牌并回复等量体力（按防止前的伤害值计算）
									await player.draw(trigger.num);
									if (player.isDamaged()) {
										await player.recover(trigger.num);
									}
										// 免伤同时增长等量霆标记
										player.addSkill("ktleishen_ting");
										player.addMark("ktleishen_ting", trigger.num);
										game.log(player, "获得了", "#g" + trigger.num + "枚“霆”标记");
								},
								},
								sha: {
									audio: [
										"ext:kirito扩展/audio/skill/kttingwei1.mp3",
										"ext:kirito扩展/audio/skill/kttingwei2.mp3",
										"ext:kirito扩展/audio/skill/kttingwei3.mp3",
										"ext:kirito扩展/audio/skill/kttingwei4.mp3",
									],
									fixed: true,
									direct: true,
									trigger: { player: "useCardToPlayered" },
									filter(event, player) {
										if (!event.isFirstTarget || !event.card || get.name(event.card) != "sha") {
											return false;
										}
										// 本回合第一次【杀】触发；此杀击杀过角色则次数+1
										const used = player.storage.ktleishen_shaUsed || 0;
										if (used >= 1 + (player.storage.ktleishen_killBonus || 0)) {
											return false;
										}
										return true;
									},
									async content(event, trigger, player) {
										player.setStorage("ktleishen_shaUsed", (player.storage.ktleishen_shaUsed || 0) + 1, true);
										player.logSkill("ktleishen_sha", trigger.targets, null, null, [get.rand(1, 4)]);
										const target = trigger.target;
										if (target.countDiscardableCards(player, "he") > 0) {
											await player
												.discardPlayerCard(target, "he", true, `雷神：弃置${get.translation(target)}一张牌（手牌/装备）`)
												.set("ai", (button) => 3 - get.value(button.link));
										} else {
											// 目标手牌/装备区皆空：改为我摸一张牌
											await player.draw(1);
											game.log(player, "改为摸了一张牌");
										}
									},
								},
								reset: {
									fixed: true,
									direct: true,
									trigger: { global: "phaseBegin" },
									async content(event, trigger, player) {
										player.setStorage("ktleishen_shaUsed", 0, true);
										player.setStorage("ktleishen_killBonus", 0, true);
									},
								},
								kill: {
									fixed: true,
									direct: true,
									trigger: { source: "dieAfter" },
									filter(event, player) {
										return event.reason?.card?.name == "sha" && (player.storage.ktleishen_shaUsed || 0) > 0;
									},
									async content(event, trigger, player) {
										player.setStorage("ktleishen_killBonus", (player.storage.ktleishen_killBonus || 0) + 1, true);
										game.log(player, "使用【杀】击杀了角色，雷神触发次数+1");
									},
								},
								madamage: {
									fixed: true,
									direct: true,
									trigger: { source: "damageSource" },
									// 麻霆不限伤害类型（ktNoTing=寂灭大招：只施加麻，不产生霆）
									filter(event, player) {
										return event.num > 0;
									},
									async content(event, trigger, player) {
										const target = trigger.player;
										// 麻不施加给玩家自己
										if (target != game.me) {
											target.addSkill("ktleishen_ma");
											// 麻上限1：已有麻则不再叠加（v3.78）
											if (target.countMark("ktleishen_ma") < 1) {
												target.addMark("ktleishen_ma", 1);
											}
												game.log(target, "获得了", "#g“麻”标记（至多1枚）");
										}
										// 寂灭大招的伤害不产生霆（仍施加麻）
										if (!trigger.ktNoTing) {
											player.addSkill("ktleishen_ting");
											player.addMark("ktleishen_ting", trigger.num);
											game.log(player, "获得了", "#g" + trigger.num + "枚“霆”标记");
										}
									},
								},
								ma: {
									charlotte: true,
									mark: true,
									marktext: "麻",
									intro: {
										name: "麻",
										name2: "麻",
										content(storage, player) {
											return "至多1枚：使用牌时须弃置一张装备牌并移去“麻”标记，装备区无牌时不消耗";
										},
									},
								},
								ting: {
									charlotte: true,
									mark: true,
									marktext: "霆",
									intro: {
										name: "霆",
										name2: "霆",
										content: "mark",
									},
								},
								punish: {
									fixed: true,
									direct: true,
									trigger: { global: "useCardAfter" },
									filter(event, player) {
										const user = event.player;
											// v3.77：麻改为弃装备牌——目标装备区无牌时本技不触发（不消耗麻）
											return user.countMark("ktleishen_ma") > 0 && user.countDiscardableCards(user, "e") > 0;
									},
									async content(event, trigger, player) {
										const user = trigger.player;
										await user.chooseToDiscard("e", 1, true, "麻：弃置一张装备牌");
										user.removeMark("ktleishen_ma", 1);
										game.log(user, "移去了1枚", "#g“麻”标记");
										if (!user.countMark("ktleishen_ma")) {
											user.removeSkill("ktleishen_ma");
										}
									},
								},
									fanma: {
										fixed: true,
										forced: true,
										// 4霆：受击后给伤害来源加麻（与造成伤害的麻同标记同上限），与拼点+13同为4档效果
										trigger: { player: "damageAfter" },
										filter(event, player) {
											if (player.countMark("ktleishen_ting") < 4) {
												return false;
											}
											const source = event.source;
											return !!(source && source != player && source.isIn() && source.countMark("ktleishen_ma") < 1);
										},
										logTarget: "source",
										async content(event, trigger, player) {
											const source = trigger.source;
											source.addSkill("ktleishen_ma");
											source.addMark("ktleishen_ma", 1);
											game.log(player, "的雷神使", source, "获得了", "#g“麻”标记（至多1枚）");
										},
									},
									huanpan: {
										fixed: true,
										// 8霆：每回合限一次，手牌替换判定牌并获得原判定牌（官方鬼道式respond+judging互换）
										trigger: { global: "judge" },
										filter(event, player) {
											if (player.countMark("ktleishen_ting") < 8 || player.hasSkill("ktleishen_huanpanUsed")) {
												return false;
											}
											return player.countCards("h") > 0 && !!(event.player.judging && event.player.judging.length);
										},
										async cost(event, trigger, player) {
											event.result = await player
												.chooseCard(
													`${get.translation(trigger.player)}的${trigger.judgestr || ""}判定为${get.translation(trigger.player.judging[0])}，是否用手牌替换判定牌并获得原判定牌？（每回合限一次）`,
													"h"
												)
												.set("ai", () => 0)
												.forResult();
											if (event.result.bool) {
												player.addTempSkill("ktleishen_huanpanUsed", "phaseAfter");
											}
										},
										async content(event, trigger, player) {
											const next = player.respond(event.cards, event.name, "highlight", "noOrdering");
											await next;
											const { cards: cards2 } = next;
											if (cards2 && cards2.length) {
												player.$gain2(trigger.player.judging[0]);
												await player.gain(trigger.player.judging[0]);
												trigger.player.judging[0] = cards2[0];
												trigger.orderingCards.addArray(cards2);
												game.log(trigger.player, "的判定牌改为", cards2, "，", player, "获得了原判定牌");
												await game.delay(2);
											}
										},
										ai: { rejudge: true, tag: { rejudge: 1 } },
									},
									huanpanUsed: {
										charlotte: true,
										onremove: true,
										mark: true,
										intro: { content: "本回合已用过神降换判" },
									},
									pd13: {
										fixed: true,
										forced: true,
										// 4霆：拼点点数+13（官方传书式compare加值，上限13即稳K）
										trigger: { player: "compare", target: "compare" },
										filter(event, player) {
											if (player.countMark("ktleishen_ting") < 4) {
												return false;
											}
											return (player == event.player ? event.num1 : event.num2) < 13;
										},
										async content(event, trigger, player) {
											game.log(player, "的拼点点数+13");
											if (player == trigger.player) {
												trigger.num1 = Math.min(13, trigger.num1 + 13);
											} else {
												trigger.num2 = Math.min(13, trigger.num2 + 13);
											}
										},
									},
									wuyi: {
										fixed: true,
										// 16霆·武翊（简化版，势赵云同源）：基本牌无次数限制与无距离限制
										// （原牌名分档记录与第4档不可响应已按需求移除）
										mod: {
											cardUsable(card, player) {
												if (player.countMark("ktleishen_ting") >= 16 && get.type(card) == "basic") {
													return Infinity;
												}
											},
											targetInRange(card, player) {
												if (player.countMark("ktleishen_ting") >= 16 && get.type(card) == "basic") {
													return true;
												}
											},
										},
									},
									release: {
										audio: [
											"ext:kirito扩展/audio/skill/ktjimie1.mp3",
											"ext:kirito扩展/audio/skill/ktjimie2.mp3",
											"ext:kirito扩展/audio/skill/ktjimie3.mp3",
											"ext:kirito扩展/audio/skill/ktjimie4.mp3",
										],
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
										fixed: true,
										// 12霆触发寂灭选择：上限雷伤+抹技能；不消耗霆、每局游戏限一次（released标记）
										trigger: { player: "phaseDiscardAfter" },
										filter(_event, player) {
											return player.countMark("ktleishen_ting") >= 12 && !player.storage.ktleishen_released;
										},
										skillAnimation: true,
										animationColor: "thunder",
										async cost(event, trigger, player) {
											event.result = await player
												.chooseTarget({
													prompt: get.prompt(event.skill) + "：寂灭（每局游戏限一次）",
													prompt2: "对一名角色造成等于其体力上限的雷电伤害，并可彻底移除其一个技能（不消耗“霆”标记，每局游戏限一次）",
													ai(target) {
														const player = get.player();
														return get.damageEffect(target, player, player);
													},
												})
												.forResult();
										},
										async content(event, trigger, player) {
											// 释放演出：自带寂灭大招动画，播完再结算
											if (lib._wssJimieBar && lib._wssJimieBar.playDazhao) {
												await lib._wssJimieBar.playDazhao();
											}
											player.setStorage("ktleishen_released", true);
											const target = event.targets[0];
											const damageEvent = target.damage({ num: target.maxHp, nature: "thunder" });
											// 标记本次伤害不产生霆（madamage结算时识别，防止大招自我回充）
											damageEvent.ktNoTing = true;
											await damageEvent;
											// 命中后可彻底移除目标的一个技能（fixed技能引擎层面拒绝移除，已从候选排除），也可放弃；自己命中的不询问
											if (target.isIn() && target != player) {
												const skills = target.getSkills().filter((skill) => {
													const info = lib.skill[skill];
													return info && !info.sub && !info.nopop && !info.fixed && lib.translate[skill] && !skill.startsWith("#");
												});
												if (skills.length) {
													const result = await player
														.chooseButton([
															`雷神：是否彻底移除${get.translation(target)}的一个技能`,
															[skills.map((skill) => [skill, get.translation(skill)]), "textbutton"],
														])
														.set("rmTarget", target)
														.set("ai", (button) => (get.attitude(get.player(), get.event().rmTarget) < 0 ? 4 + Math.random() : 0))
														.forResult();
													if (result.bool && result.links[0]) {
														const skill = result.links[0];
														target.removeSkill(skill);
														game.log(target, "的技能", "#g【" + get.translation(skill) + "】", "被雷神彻底移除");
													}
												}
											}
											if (lib._wssJimieBar) {
												lib._wssJimieBar.update(player);
											}
										},
									},
								},
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
					ktleishen: "雷神",
					ktleishen_info: "①当你受到雷电伤害时，你防止之，然后你摸等量数量的牌并回复等量体力。②每回合你使用的第一张【杀】指定目标后（此【杀】每击杀一名角色，次数+1），你弃置其一张牌（手牌/装备），若其没有可弃置的牌，你改为摸一张牌。③你造成伤害后，其他角色获得1枚“麻”标记（至多1枚；其使用牌时须弃置一张装备牌并移去“麻”标记，装备区无牌时不消耗；不会施加给你自己），你获得等同于伤害值的“霆”标记（寂灭大招的伤害只施加“麻”）。“霆”标记达到阈值时获得对应效果：≥4，你的拼点点数+13，且你受到伤害后伤害来源获得1枚“麻”标记（至多1枚）；≥8，每回合限一次，你可以用一张手牌替换判定牌并获得原判定牌；≥12，弃牌阶段结束时，你可以对一名角色造成等于其体力上限的雷电伤害，然后你可以彻底移除其一个技能（不消耗“霆”标记，每局游戏限一次）；≥16，你使用基本牌无次数限制且无距离限制。",
					ktleishen_immune: "雷神",
					ktleishen_sha: "雷神",
					ktleishen_state: "雷神",
					ktleishen_madamage: "雷神",
					ktleishen_reset: "雷神",
					ktleishen_kill: "雷神",
					ktleishen_ma: "雷神",
					ktleishen_punish: "雷神",
					ktleishen_release: "雷神",
					ktleishen_fanma: "雷神",
					ktleishen_wuyi: "武翊",
					ktleishen_huanpan: "雷神",
					ktleishen_huanpanUsed: "神降",
					ktleishen_pd13: "雷神",
					ktleishen_ting: "霆",
					ktleishen_ma_mark: "麻",
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
