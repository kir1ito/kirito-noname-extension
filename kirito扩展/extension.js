import { lib, game, ui, get, ai, _status } from "noname";
import { Character, Player } from "../../noname/library/element/index.js";
export const type = "extension";
// 扩展版本号：package与设置页展示共用，与info.json的version保持同步
const VERSION = "1.7";
export default function () {
	// 绝境的X：已损失体力值（不封顶）
	const juejingX = (player) => player.getDamagedHp();
	return {
		name: "kirito扩展",
		editable: true,
		connect: false,
		arenaReady: function () {},
		content: function (config, pack) {},
		prepare: function () {},
		precontent: function (config) {
			// 十周年UI动皮别名：把无上神映射到手杀神马超的动皮（风霆啸野骨骼动画+动态背景）。
			// 十周年UI初始化时会整体重建 dynamicSkin 表，且与本扩展的加载顺序不定，
			// 故轮询等待其表就绪后注入别名，注入成功即停止；未安装十周年UI时15秒后静默放弃
			const install = () => {
				if (!window.decadeUI || !decadeUI.dynamicSkin || !decadeUI.dynamicSkin.mb_shen_machao) {
					return false;
				}
				if (!decadeUI.dynamicSkin.wushangshen) {
					decadeUI.dynamicSkin.wushangshen = decadeUI.dynamicSkin.mb_shen_machao;
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
			// 在线更新：匿名多源降级（公共镜像优先，GitHub直连兜底）
			checkUpdate: {
				name: "检查并更新扩展",
				intro: "从 GitHub 仓库 kir1ito/kirito-noname-extension 下载最新文件覆盖本地，完成后需重启生效",
				clear: true,
				async onclick() {
					// 仅 Electron/Node（含安卓端）具备写盘能力，浏览器端不支持
					if (typeof game.writeFile != "function") {
						alert("当前环境不支持在线更新，请在 PC 或安卓客户端中使用");
						return;
					}
					const name = "kirito扩展";
					const repo = "kir1ito/kirito-noname-extension";
					// 更新文件清单：代码/配置/角色素材（仓库新增文件时需同步此处）
					const fileList = ["extension.js", "info.json", "god.jpg", "wushangshen.jpg", "audio/die/god.mp3"];
					const localVersion = lib.extensionPack[name] && lib.extensionPack[name].version;
					// API路径只编码每段，保留斜杠
					const encodePath = (file) => encodeURIComponent(name) + "/" + file.split("/").map(encodeURIComponent).join("/");
					// 匿名raw多源降级：公共镜像优先（国内直连可达），GitHub直连兜底（系统代理环境下可达）
					const rawSources = [
						`https://gh-proxy.com/https://raw.githubusercontent.com/${repo}/main/`,
						`https://ghproxy.net/https://raw.githubusercontent.com/${repo}/main/`,
						`https://raw.githubusercontent.com/${repo}/main/`,
					];
					const fetchRaw = async (file) => {
						let lastError = null;
						for (const source of rawSources) {
							try {
								const resp = await fetch(source + encodePath(file));
								if (!resp.ok) throw new Error(`RAW ${resp.status}`);
								return resp;
							} catch (e) {
								lastError = e;
							}
						}
						throw lastError || new Error("RAW 网络错误");
					};
					// 拉远端info.json的版本号
					const fetchVersion = async () => {
						const resp = await fetchRaw("info.json");
						return (await resp.json()).version;
					};
					// 下载单个文件并覆盖写盘：文本写string，图片/音频等二进制写Uint8Array（game.writeFile均支持）
					const downloadFile = async (file) => {
						const resp = await fetchRaw(file);
						const isText = /\.(js|json)$/.test(file);
						const data = isText ? await resp.text() : new Uint8Array(await resp.arrayBuffer());
						const local = `extension/${name}/${file}`;
						// 先建父目录（file=true跳过最后一段文件名），再按(数据,目录,文件名)写入
						await game.promises.ensureDirectory(local, null, true);
						const slash = local.lastIndexOf("/");
						await new Promise((resolve, reject) =>
							game.writeFile(data, local.slice(0, slash), local.slice(slash + 1), (err) => (err ? reject(err) : resolve()))
						);
					};
					// 版本检查
					let remoteVersion = null;
					let fetchError = null;
					try {
						remoteVersion = await fetchVersion();
					} catch (e) {
						fetchError = e;
					}
					if (remoteVersion && remoteVersion == localVersion) {
						alert(`当前已是最新版本（${localVersion}）`);
						return;
					}
					const tip = remoteVersion
						? `发现新版本：${localVersion || "未知"} → ${remoteVersion}，是否更新？`
						: `无法获取远程版本信息（${fetchError ? fetchError.message : "网络错误"}），是否强制更新为最新版？`;
					if (!confirm(tip)) {
						return;
					}
					// 逐文件下载覆盖
					try {
						for (const file of fileList) {
							await downloadFile(file);
						}
						if (remoteVersion) {
							game.saveConfig(`extension_${name}_version`, remoteVersion);
						}
						game.saveConfig(`extension_${name}_updateTime`, new Date().toLocaleString());
						alert("更新完成，重启游戏后生效");
						if (confirm("是否立即重启游戏？")) {
							game.reload();
						}
					} catch (e) {
						alert(`更新失败：${e.message}，请检查网络后重试`);
					}
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
						// 复用本体手杀神马超的阵亡语音（audio/die/mb_shen_machao.mp3）
						dieAudios: ["mb_shen_machao"],
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
					 * 新增：①附不会翻面、体力上限不可被扣除；摸牌阶段+X；至其他角色距离-X；每回合用牌上限+X；绝境/龙魂不可被移除或禁用
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
							// 新增⑥：技能守护——绝境/龙魂（含子技能）不可被禁用或封锁
							// 移除防护由 fixed: true 承担；禁用（disableSkill，铁骑/止息类）与
							// 封锁（get.is.blocked，skillBlocker体系）在 init 中包一层拦截
							guard: {
								charlotte: true,
								silent: true,
								init() {
									if (lib._grySkillGuardInstalled) {
										return;
									}
									lib._grySkillGuardInstalled = true;
									const isProtectedSkill = (skill) =>
										skill === "gryjuejing" ||
										skill === "grylonghun" ||
										skill.startsWith("gryjuejing_") ||
										skill.startsWith("grylonghun_");
									// 注意：此处必须直查 player.skills 底层数组而非 hasSkill——
								// hasSkill 的求值链(filterSkills→get.is.blocked)会回调本守护造成无限递归，
								// 当敌方挂上技能封锁器(如于吉〖缠怨〗体力≤1时)即触发死循环卡死游戏
								const hasJuejing = (player) => player && Array.isArray(player.skills) && player.skills.includes("gryjuejing");
									// 拦截禁用：铁骑/止息类效果经 disableSkill 写入 disabledSkills，此处对持有绝境者拒绝写入受保护技能
									const originDisableSkill = Player.prototype.disableSkill;
									Player.prototype.disableSkill = function (reason, skills) {
										if (hasJuejing(this)) {
											if (typeof skills == "string" && isProtectedSkill(skills)) {
												return this;
											}
											if (Array.isArray(skills)) {
												skills = skills.filter((skill) => !isProtectedSkill(skill));
											}
										}
										return originDisableSkill.call(this, reason, skills);
									};
								// 拦截封锁：skillBlocker 体系经 get.is.blocked 判定技能被封锁，此处对持有绝境者的受保护技能直接放行
								const originBlocked = get.is.blocked;
								get.is.blocked = function (skill, player) {
									if (isProtectedSkill(skill) && hasJuejing(player)) {
										return false;
									}
									return originBlocked.call(this, skill, player);
								};
								// 拦截翻面：绝境①附加效果——不会被翻面；仅拦截"翻成面朝下"，已翻面时允许翻回
								const originTurnOver = Player.prototype.turnOver;
								Player.prototype.turnOver = function (bool) {
									const faceDown = bool === true || (bool === void 0 && !this.isTurnedOver());
									if (faceDown && hasJuejing(this)) {
										game.log(this, "的〖绝境〗防止了翻面");
										const next = game.createEvent("turnOver");
										next.player = this;
										next.setContent("emptyEvent");
										return next;
									}
									return originTurnOver.call(this, bool);
								};
								// 拦截体力上限扣除：绝境①附加效果——体力上限只能增不能减（gainMaxHp不受影响）
								const originLoseMaxHp = Player.prototype.loseMaxHp;
								Player.prototype.loseMaxHp = function () {
									if (hasJuejing(this)) {
										game.log(this, "的〖绝境〗防止了体力上限的扣除");
										const next = game.createEvent("loseMaxHp");
										next.player = this;
										next.num = 0;
										next.setContent("emptyEvent");
										return next;
									}
									return originLoseMaxHp.apply(this, arguments);
								};
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
							filter(event, player) {
								return event.name != "phase" || game.phaseNumber == 0;
							},
							async content(event, trigger, player) {
								// 运行时过滤候选池：技能本体已注册且有描述文案才进列表，防止源包未加载时选到空技能
								const pool = ["gryjuejing", "grylonghun", "yuli", "tingwei", "jimie", "mbtiantao", "mbxinghun", "mbshenpei"].filter(
									(skill) => lib.skill[skill] && lib.translate[skill + "_info"]
								);
								if (!pool.length) {
									return;
								}
								const list = pool.map((skill) => [
									skill,
									`<div class="popup text" style="width:calc(100% - 10px);display:inline-block"><div class="skill">【${get.translation(skill)}】</div><div>${lib.translate[skill + "_info"]}</div></div>`,
								]);
								const result = await player
									.chooseButton({
										createDialog: ["投影：挑选任意个技能加入本局游戏", [list, "textbutton"]],
										selectButton: [1, list.length],
										forced: true,
										ai(button) {
											const info = get.info(button.link);
											if (!info || info.ai?.neg || info.ai?.combo) {
												return 0;
											}
											return 1 + Math.random();
										},
									})
									.forResult();
								if (result?.bool && result.links?.length) {
									game.log(player, "获得了技能", "#g" + result.links.map((skill) => `【${get.translation(skill)}】`).join(""));
									await player.addSkills(result.links);
								}
								// 挑选完成后失去投影自身（投影不在绝境守护名单内，可正常移除）
								player.removeSkill("grytouying");
							},
						},
				},
				translate: {
					gryjuejing: "绝境",
					gryjuejing_info: "锁定技。①你的手牌上限+2，你不会被翻面，且你的体力上限不会减少。②当你进入或脱离濒死状态时，你摸两张牌。③摸牌阶段，你额外摸X张牌。④你至其他角色的距离-X。⑤你每回合使用牌的次数上限+X（X为你已损失的体力值）。⑥你的〖绝境〗和〖龙魂〗不能被移除或禁用。",
					grylonghun: "龙魂",
					grylonghun_info: "你可以将同花色的一至两张牌按下列规则使用或打出：红桃当【桃】，方块当火【杀】，梅花当【闪】，黑桃当【无懈可击】。若你以此法转化了两张：红色牌，则此牌回复值或伤害值+1；黑色牌，则你弃置当前回合角色一张牌。每当你以此法使用或打出牌，“魂”计数+X（单张牌+1，两张牌+2，计数持续累计，不会清空）。若计数为1或2的倍数，你摸一张牌。“魂”计数达到12后：你使用【杀】或【决斗】指定目标后，你可以选择一项：1.此伤害+1；2.获得该目标区域内一张牌（其区域内没有牌则不能选择此项）。“魂”计数达到24后：1.你转化发动的【杀】不可被响应，转化的【无懈可击】不可被【无懈可击】响应；2.你以单张牌转化【闪】或【无懈可击】后，获得当前回合角色区域内一张牌；3.你转化发动使用的牌不计入使用次数；4.你转化发动的【桃】自带酒效果（与饮酒效果叠加，且不占用【酒】的使用次数）。",
					grytouying: "投影",
					grytouying_info: "锁定技。游戏开始时，你从下列技能中挑选任意个技能加入本局游戏（可多选），然后失去此技能：〖绝境〗〖龙魂〗（龙神赵云）；〖驭雳〗〖霆威〗〖寂灭〗（手杀神马超）；〖天涛〗〖星魂〗〖神霈〗（手杀神姜维）。",
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
