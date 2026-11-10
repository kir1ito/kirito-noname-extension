# OWN_FIXES.md — kirito扩展 自有修复清单（给维护AI看的工作文档）

> **用途**：本扩展对「其他扩展 / 本体 bug」做了若干修复性补丁。每当上游（斗转星移 / 十周年UI / 千幻聆音 / noname本体）更新后，按每条的「上游已修判定」检查；判定已修 → 按「移除方式」摘除 → 跑 `node sync-config.mjs` → 双版本号 bump → 让用户测。
> **标记约定**：每个补丁带唯一运行时标记（`__kt*` / `kt-*`），移除 = 删对应代码块（搜「代码锚」一栏的字符串）。
> **与特性的区别**：本文档只记"修别人 bug"的补丁 + 上游敏感的挂钩。纯功能（灌顶/充能条/禁选/更新中心等）不在此列。

---

## FIX-1 AI地主技补发（斗转星移）
- 引入 v3.95｜状态: 生效中
- 上游bug: 斗转星移 `class/ChooseChar.js` 的 `refreshZhuAfterChoose`（选将后刷主公动皮）对 AI 地主（`zhu !== game.me`）执行 `zhu.uninit()` + `zhu.init()`——千幻的 uninit 清空全部技能，init 只带回武将自带技；模式发的飞扬/跋扈丢失（体力/身份它都备份了，唯独漏模式技）。竞态导致概率性。
- 实现: `patchDZXProto` 内包装 `refreshZhuAfterChoose`，刷新后 10×500ms 轮询，`game.zhu` 无 `bahu` 则按模式逻辑补发（飞扬按 feiyang_version 配置选版 + bahu + enhance_dizhu，含 noZhuSkill/online/binglin 守卫）
- 上游已修判定: `grep "refreshZhuAfterChoose" 斗转星移/class/ChooseChar.js` —— 函数体内出现技能备份恢复（getSkills/addSkill）或不再调 uninit → 已修
- 移除方式: 删 `__ktZhuRestore` 整段 if 块
- 代码锚: extension.js 搜 `__ktZhuRestore`

## FIX-2 chooseAnyOL 跳过崩溃（本体 noname）
- 引入 v4.05｜状态: 生效中
- 上游bug: 本体 `game.chooseAnyOL` 返回事件的 `forResult()`（gameEvent.js: `await this; return this.result`）在事件被跳过时 result 为 undefined——饵敌、谋朱然镇围等把返回值当 Map 用直接 TypeError；个别路径 await 永挂
- 实现: 包装 `game.chooseAnyOL`，给每个返回事件重写 `forResult`：await 后 result 为 null/undefined 或抛异常 → 兜底返回 `new Map()`
- 上游已修判定: `grep "forResult" noname/library/element/gameEvent.js` —— 出现 `?? ` 兜底/`new Map`/跳过保护，或 `noname/library/element/content.js` 的 chooseAnyOL 对跳过事件有保护 → 已修
- 移除方式: 删 `__ktSafeFor` 整段（game.chooseAnyOL 包装块）
- 代码锚: extension.js 搜 `__ktSafeFor`

## FIX-3 千幻复选框互调死循环（千幻聆音 ≤5.2.00，官方5.2.02已修）
- 引入 v4.05｜状态: 生效中（本地装的是5.2.00）
- 上游bug: 千幻 `Qhly_NewView/qhly_newViewMainUI.js` 的 `qhly_setChecked` 状态未变也触发 `qhly_onchecked`——「所有模式禁用」全选框与单模式复选框互相回调 → 栈溢出
- 实现: 轮询包装 `ui.qhly_initCheckBox`（60s 窗口），给每个创建的复选框重写 `qhly_setChecked`：仅 `changed` 时触发回调（顺带修正同状态刷新时图标显示错向），语义=官方5.2.02
- 上游已修判定: `grep "changed" 千幻聆音/extension/Qhly_NewView/qhly_newViewMainUI.js` —— qhly_setChecked 内有 changed 守卫（或本地版本 ≥5.2.02）→ 已修
- 移除方式: 删 `__ktSafeCb` 两段（initCheckBox 包装 + ktFixQhlyCb 轮询）
- 代码锚: extension.js 搜 `__ktSafeCb`

## FIX-4 十周年UI版本检查苛政 + 弹窗崩溃（十周年UI）
- 引入 v4.06｜状态: 生效中
- 上游bug: 十周年UI `src/utils/version.js` 的 `checkVersionCompatibility` 用 `compareVersions` **仅完全相等才放行**——内核比要求新（1.11.6.1 > minNonameVersion 1.11.4.1）也判"不匹配"，并把 `showVersionMismatchDialog` 回调塞进 `lib.arenaReady`；该弹窗路径在新内核上读 `.name`（undefined）**炸掉启动**。用户装子琪更新包1.11.6.1后每次启动必崩即此
- 实现: content 里把 arenaReady 队列中含 `showVersionMismatchDialog` 的回调剔除（弹窗本为可继续游戏的纯警告；代价=不再显示"请更新十周年UI"提示）
- 上游已修判定: `grep "compareVersions\|comparison === " 十周年UI/src/utils/version.js` —— 仅 `comparison === -1`（本体过低）才弹、内核更新放行；或 showVersionMismatchDialog 路径不再崩溃 → 已修
- 移除方式: 删 `showVersionMismatchDialog` 过滤段（content 内 try 块）
- 代码锚: extension.js 搜 `showVersionMismatchDialog`

## FIX-5 欢乐选将倍率UI样式丢失补偿（斗转星移 10-22 版 chooseChar.css）
- 引入 v4.00｜移除于 v4.07｜状态: 已摘除（新斗转星移包上游已修；伴随的DIAG-1心电图同批移除）
- 上游bug: 斗转星移 10-22 更新重写 `css/chooseChar.css` 丢失 8 组规则（.ddz-multiple/.dz-sel-multiple-cont 倍率按钮尺寸、.jj-char-base-back/.dz_game_chr_bk/.happy1v2_empselbg 选将卡光效、.dz-danmu/.dz-danmu-area 弹幕、.card_tips_bg）→ 倍数容器 0×0 → 欢乐竞标死等点击
- 实现: 启动时注入 `<style id="kt-ddz-css-fix">`（规则提取自其自带 chooseChar原版.css，图片路径改绝对），幂等
- 上游已修判定: `grep "ddz-multiple" 斗转星移/css/chooseChar.css` ≥1 → 已修
- 移除方式: 删 `kt-ddz-css-fix` 注入段
- 代码锚: extension.js 搜 `kt-ddz-css-fix`

---

## HOOK-1 收藏加权（斗转星移收藏系统）——特性挂钩，上游敏感
- 引入 v4.05｜重做于 v4.19｜**再重做于 v4.21**｜包装 `ui.create.dialog`：标题以「你的选将框」开头时
- v4.19教训: 全量注入合并库（内核∪斗转）——用户11个收藏把候选框每个格子刷满（"安装之前65%出一个,现在每个格子都在出"）。收藏多于三五个时全量注入=淹没候选框
- v4.21 最终形态（两件事）:
  - **a) 收藏页桥接**: 内核 `favouriteCharacter`（详情页勾选写这里）→ 斗转键 `extension_斗转星移_FavoriteChars`（选将框「收藏」页读这里），选将框构建前单向并入（只增不删，斗转收藏页手动加的不丢），`game.saveConfig` 落库——收藏页两头都能看到
  - **b) 候选注入限流**: 候选里已自然抽中收藏则不补；否则从合并库（剔kirito banPlayer+当前模式禁用键）随机注入**至多1个**——恢复"偶尔出一个"的原有手感
- 上游敏感点: 斗转星移若改收藏存储键、对话框创建方式或选将框架不再走 ui.create.dialog → 失效。判定: 欢乐选将框收藏页是否显示详情页勾的收藏+候选是否至多多一个收藏
- 代码锚: `__ktFav`

## HOOK-3 禁用工作副本每局刷新（内核 banned 拷贝时机）
- 引入 v4.19｜内核只在模式加载时拷贝一次 `lib.config.banned = lib.config[mode+"_banned"]`（game/index.js loadModeAsync，两版本行为一致非1.11.6.1回归）——同一会话里在详情页勾的禁用对后续对局不生效（选将池过滤读工作副本）。gameStart 订阅里从当前模式配置键重拷（slice防引用耦合），仅键存在且非联机时刷新
- 上游已修判定: 内核改为每次开局重拷 banned（grep game/index.js banned 拷贝点出现在每局流程）→ 可摘
- 代码锚: extension.js 搜 `Noname.Game.Event.GameStart` 内 banned 重拷段（②b注释块）

## HOOK-2 欢乐斗地主胜利奖励倍数（默认10倍）——特性挂钩，上游敏感
- 引入 v4.02-4.03｜`lib.onover` unshift/push 一对回调：胜利时临时 `dzxy.ddzBeilv *= 配置倍数` 让斗转星移计奖回调算出翻倍金票，算完还原；失败路径还原原值
- 上游敏感点: 斗转星移若改 `ddzBeilv` 字段名或计奖时机 → 失效。判定: 赢一局看金票/结算数字是否按倍数放大
- 代码锚: `__ktDdzDouble`

## DEF-1 动皮仅自己展示的防御层（对抗千幻描述符覆盖）——特性附属
- 引入 v3.70-3.75｜playDynamic 访问器锁槽（setter 捕获后续覆写）+ gameStart 后 30s 持续校正（非me停皮/me缺皮重挂）+ CUR_DYNAMIC 配额对冲 + 持续校正
- 上游敏感点: 千幻/十周年UI 改 playDynamic 挂载方式或动皮配额机制 → 需复核 armPlay/sweep
- 代码锚: `__ktSelfOnly`

---


## FIX-6 arenaReady启动护甲（本体 boot 容错，1.11.6.1内核场景）
- 引入 v4.08｜重做于 v4.09（defineProperty属性拦截版，对赋值时机/来源免疫）｜状态: 生效中
- 上游bug: 装子琪更新包1.11.6.1后，arenaReady回调链在启动期读`.name`炸掉boot。v4.09护甲拦截日志实测真凶：**千幻聆音 extension/content.js:233**（此前弹窗截断路径曾误导向十周年UI src/...:66，系陈旧编译缓存的干扰帧）。任何扩展的arenaReady回调异常都会阻断boot
- 实现: content里把 lib.arenaReady 队列内每个函数槽包装 try/catch（异常降级为warn日志，启动继续）；与FIX-4的弹窗过滤叠加（先剔除已知坏回调，其余护甲兜底）
- 上游已修判定: **无上游修复可等**——实测官方 v1.3.1、v1.5.0 tag源码与 main分支(v1.5.1, 2026-11-01拉取) 的 gameIntegration.js 三方零差异，所有版本同样带此bug，护甲是唯一修复形态，**长期保留**（升级十周年UI任何版本均不解除对护甲的依赖）
- 影响: 动画资源播放不受异常影响（playSpine懒加载自带ensureLoaded兜底）；根治需拿到护甲拦截日志的完整堆栈定位undefined来源后加判空（属改十周年UI文件，暂不做）
- 移除方式: 删 `__ktArenaGuard` 整段
- 代码锚: extension.js 搜 `__ktArenaGuard`
- 备注: 十周年UI v1.5.0（GitHub zziyoo/decadeUI，minNonameVersion 1.11.6）与本内核配套，用户选择不升级扩展改用护甲方案（2026-11-01曾装v1.5.0后按用户要求还原）
- 升级约束（三方对比实测 2026-11-01）: 本地十周年UI = 官方1.5.0开发态快照+子琪微调（含bootstrap.js/features/新架构，info.json却标1.3.1）。与官方1.5.0有57个文件双改冲突（子琪微调×上游收尾叠加，其中56个各仅1处冲突块多为导入区）。无损升级不存在；可行路径=以1.5.0为底、git merge-file三方合并（基=官方1.3.1）保留子琪微调，合并产物已生成于 D:/downloads/cmp/merged（56自动+shousha.js手工13处）。触发条件：暂无（官方1.5.0未修此崩点，升级无此收益；仅当未来官方源码实修该文件时再评估）

## FIX-7 千幻聆音 qhlyUI.assets 注册表缺 pinzhi（千幻+1.11.6.1内核组合）
- 引入 v4.10｜**移除于 v4.13**｜状态: 已摘除
- 上游bug: 千幻加载器 extension.js:153 的 qhlyUI.assets 注册表里 **pinzhi 项被注释掉**（main.js:9 有完整版但 main.js 是死代码，无人导入）；content.js:233 在「十周年UI已启用」分支读 `assets.pinzhi.name` → undefined → 炸boot。1.11.6.1内核前此异常同样发生但被旧内核静默吞掉（不影响游戏），新内核启动链改为向上传播 → 弹窗死。千幻/皮肤切换/懒人包等更新前后文件一致（更新包实测），非更新直接引入
- 实现: kirito模块导入期（最早时机）预置 huanpifu/pinzhi/huanfu 三键并用 defineProperty 合并千幻 main.js 的后续赋值——注册项恒在，时序免疫；顺带救回被注释掉的"品质"动皮资源加载
- 上游已修判定: 千幻聆音更新后 `grep "pinzhi" 千幻聆音/extension.js` 在加载器注册表出现未注释条目（或 content.js:233 不再读 pinzhi）→ 已修
- 移除方式: 删 `ktQhlyDefaults` 整段（extension.js 模块级，代码锚 `ktQhlyDefaults`）
- 代码锚: ~~extension.js 搜 `ktQhlyDefaults`~~（已删）
- **摘除依据（2026-11-01实测）**: 本地千幻已换为 4.16.1.11（柴油鹿鹿修改版），其加载器 extension.js:123-137 注册表完整含 huanpifu/pinzhi/huanfu 三键（未注释），content.js 读点全部有据 → 预置冗余，摘除

## 环境备注：十周年UI自带spine运行时与社区动皮库存在代差（非bug，勿修）
- 实测（2026-11-01，用扩展自带spine.js在Node全量解析）: assets/dynamic 共6585份.skels，仅71份能被解析，其余6514份为新版Spine导出（解析报boneData/name cannot be null等）
- 为什么日常无感: 用户动皮动画实际由千幻聆音引擎渲染（支持新版导出）；十周年UI自带DynamicPlayer只在特定场景（如谋张郃gameDraw播放）被走到 → 弹非致命错误框（确定后继续，动皮回退静态）
- 十周年UI任何版本（1.3.1/1.5.0/1.5.1）的spine.js逐字节相同 → 升级十周年UI不解决；官方运行时从未跟进新版Spine
- 可选缓解: **已做（v4.11 FIX-8）**——包装AnimationPlayer.prepSpine，解析失败静默降级静态立绘+日志，不再弹窗
- 机制备注: 十周年UI的解析器从未能解析这些新格式动皮；更新前播放走千幻引擎故无感。1.11.6.1内核改变入场动画调用路径后，谋张郃等新武将的gameDraw播放漏进十周年UI自带播放器才暴露



## FIX-8 十周年UI动皮解析失败静默化（运行时代差的症状缓解）
- 引入 v4.11｜状态: 生效中
- 背景: 十周年UI自带spine运行时(3.8代)与社区动皮库(新版Spine导出)存在代差（见环境备注），其播放路径被走到时弹非致命错误框
- 实现: 包装AnimationPlayer.prototype.prepSpine（经decadeUI.animation原型访问），解析异常降级为warn日志，该动皮回退静态立绘；正常皮肤不受影响
- 上游已修判定: 十周年UI官方spine.js更换为支持新版导出的运行时（实测1.3.1/1.5.0/1.5.1逐字节相同，暂无迹象）→ 可摘
- 移除方式: 删 `__ktGuard`（prepSpine包装段）
- 代码锚: extension.js 搜 `prepSpine.__ktGuard`

## FIX-9 千幻主题配置自愈（配置指向已删除的主题"xin"）
- 引入 v4.12｜状态: 生效中
- 上游bug: 用户配置 qhly_currentViewSkin="xin"（子琪自定义主题，其注册文件在当前千幻5.2.00中不存在——主题表只有decade/shousha/sanguo等12个）。千幻 game.open 钩子 setSize 读 currentViewSkin.whr 崩 → 所有对话框（含斗转星移选将的倍数界面）无法打开。**此即此前"倍数界面卡死"的根因**：旧内核静默吞掉该UI事件异常（千幻美化跳过、对话框照开），1.11.6.1内核向上传播 → 打开流程断裂
- 实现: content期检测主题键不在 lib.qhly_viewskin → 双配置键回退 "decade" 并持久化
- 上游已修判定: 千幻更新后主题表包含"xin"（即其注册文件回归）→ 可改回；或用户手动在千幻设置里重选主题
- 移除方式: 删 `curTheme` 自愈段（extension.js 搜 `curTheme`）
- 代码锚: extension.js 搜 `curTheme`

## FIX-10 手机端字体全部回退黑体（十周年UI字体加载链问题）
- 引入 v4.15｜**移除于 v4.16**｜状态: 已摘除
- 现象: 用户安卓端（覆盖1.11.6.1完整包后）对局内技能栏/武将名条全部回退黑体加粗
- kirito曾做: 注入 `div{font-family:'xinwei'}` 基线 + document.fonts自检 + 游戏文件API读font/*.woff2经FontFace直装兜底——**方向判断错误，已全部摘除**
- **真实答案（用户实测确认）: 十周年UI `src/core/decadeModule.js`**——其运行时按模式/样式门控加载 `ui/styles/fonts.css`（ATLL/BKJT/FZLBJW/FZLSFT/HYZLSJ/WDZLFT/dui-shousha）及 base/character/lbtn/skill 系列css（decadeModule.js:142-162，`EXCLUDED_MODES` = chess/tafang/hs_hearthstone），字体渲染由这条加载链决定，非内核字体系统问题。修复应落在十周年UI侧（升级/修其decadeModule.js），kirito不越界
- 保留的排查事实（供日后参考）: 内核对字体覆盖是齐全的（`#arena>.skillbar`=huangcao、`.skillbartext`=xinwei、cssstyles动态规则人名=xingkai/身份=huangcao，`font/*.woff2`由init无条件注册@font-face）；完整包1.11.6.1无app/目录（旧app/index.css的div基线已随重构消失，PC靠增量更新残留掩盖）；十周年UI自有6字体文件在 `ui/assets/fonts/`，其css引用的 shousha/yuanli/xingkai 由内核font/目录注册
- 教训: 现象（全局回退黑体）与两层字体系统（内核+十周年UI）交织，未拿到设备实测数据前勿下结论；用户指认的文件优先级高于推断

## FIX-11 无名AI权重更新频繁超时（无名AI下载通道过于激进）
- 引入 v4.17｜状态: 生效中
- 上游bug: 无名AI的权重下载走全局fetch，主模型通道超时**仅12秒（含正文读取）**、自动检查**0重试**（`modelUpdate.js:474 retries: manual ? 1 : 0`），策略通道12/20秒（`policyModelUpdate.js timedFetch`）；下载源 data.feiqiaoai.uno（Cloudflare，CORS实测`*`）在直连环境下偏慢 → "经常失败和超时"。文件本身很小（主包~69KB/策略包~46KB），纯属网络耐心问题
- 实现: ① kirito模块期接管该域名的 `window.fetch`（`__ktWuMingFetch`守卫）：**无视其AbortController信号**（那正是12秒定时器），自管45秒超时×3次尝试（1秒起退避；网络异常与5xx/429重试），缓冲正文后重构Response返回（剥离content-length/content-encoding防错位）——无名AI的校验/事务/备份管线原样运行；两模块的fetch均为调用时全局解析（`fetchImpl: typeof fetch==='function' ? fetch : null` / 裸`fetch(url)`），与扩展加载顺序无关。② kirito配置「更新无名AI权重」按钮：v4.17调其check()弹窗链→v4.18自取清单+直调downloadAndApply→v4.22强制版（文件通道下载+门禁三状态源压制+fetch劫持零网络安装+失败重试）→**v4.23直写兜底**（用户实测"最终校验未通过"=其事务尾部最终状态复核失败，对局中点击或下载途中开局即触发）：预检`_status.gameStarted&&!over`直接拒绝（对局核心信号不伪造）；其管线任何失败/延迟形态自动转**kirito直写**——自校验包↔清单（sha256/size/releaseSeq）→写前备份到`kt_wum_backup_v1`→直写`djsc_weights_v3`存档（v/dv/10参数base64/trained/accuracy/ready，格式=weights.js saveWeights）+`djsc_official_weights_v1`官方记录（version:2全字段，格式=buildOfficialRecord）→逐键读回核对→清pending/tx/staging残留；存档直写后重启游戏生效。另查实：其本地训练入口`trainLocalAsync`已被官方永久阻断（E_LEGACY_SPLIT_UNVERIFIED），训练锁实际不可能触发，真正的门禁来源=对局信号
- 影响范围: 仅 `data.feiqiaoai.uno` 域名；其上传通道（wuming-ingest.workers.dev）与其他扩展的fetch不受影响
- 上游已修判定: 无名AI官方调大超时/增加重试（grep `fetchTextWithLimits` 的 timeoutMs 默认值 >12s 且 retries 不为0，或 timedFetch ms 上调）→ 可摘
- 移除方式: 删 `__ktWuMingFetch` 整段（extension.js 模块级）+ 删配置项 `wuMingModelUpdate`
- 代码锚: extension.js 搜 `__ktWuMingFetch` / `wuMingModelUpdate`
- 备注: 2026-11-01实测域名可达（curl 200，GET带ACAO:*；HEAD返回501系服务端未实现，无关紧要）；主模型包服务器上是格式化JSON（69KB）而包内声明size=51534，扩展校验的是声明字段（一致），不影响安装

## 检查流程（上游更新后执行）
1. 对 FIX-1~5 逐条跑「上游已修判定」的 grep
2. 已修 → 按「移除方式」删代码 → `node --check`（拷到 /tmp/*.mjs 用 ESM 模式查）→ 双版本号 bump → `node sync-config.mjs` → 部署 md5 校验 → commit push → 用户测试
3. 未修 → 不动
4. 新增自有修复时：同步在本文件登记（含代码锚与判定方法）
5. 注意: 上一个会话对主文件的三修复**不在本机**（已验证主文件为原版），勿重复移除

## 判定记录（最近一次全量检查 2026-11-01，v4.13）
环境基线：千幻聆音已换 **4.16.1.11（柴油鹿鹿修改版）**，斗转星移/十周年UI(1.3.1)/皮肤切换(1.22) 未变，内核 1.11.6.1。
- FIX-1 未修：斗转 ChooseChar.js:551 refreshZhuAfterChoose 仍 uninit+init 无技能备份 → **保留**
- FIX-2 未修：gameEvent.js forResult 仍 `await this; return this.result` 裸返回 → **保留**
- FIX-3 未修（细看）：4.16.1.11 的 qhly_setChecked 加了 `trigger` 参数+图标 changed 守卫，**但回调触发仍 `if (trigger && qhly_onchecked)` 状态未变照样触发**，且全部级联调用点（content.js:14699/14706/14740/266）硬编码传 `true` → 全选框↔单模式框互调递归链原样存在 → **保留**
- FIX-4 未修：十周年UI version.js 仍 `comparison === 0` 才放行 → **保留**
- FIX-5 已摘（v4.07，此前）
- FIX-6 无上游可等 → **保留**（长期）
- FIX-7 已修（千幻4.16.1.11注册表完整）→ **已摘除**（见上）
- FIX-8 未修：十周年UI仍1.3.1，spine.js md5 352f549c…（运行时未换代）→ **保留**
- FIX-9 未满足摘除条件：4.16.1.11 主题表（precontent.js 注册12个）仍无 xin；时机验证正确（precontent 同步注册早于 kirito content 期检查，不会误重置）。当前配置已被自愈持久化为有效值、代码休眠 → **保留作保险**（防未来再出现配置指向失效主题）
- HOOK-1/HOOK-2/DEF-1 特性挂钩不涉上游修复 → 保留

## FIX-12 中文扩展目录下安卓二进制写入必败（本体cordova桥路径编码错乱）
- 引入 v4.22｜状态: 生效中
- 上游bug: 子琪懒人包的 cordova 桥接层对「百分号编码的非ASCII路径」解码错乱：① FileTransfer 直落盘的目标 `encodeURI(...%E6%89%A9%E5%B1%95...)` 在 Java 侧被按 Latin-1 解码成乱码目录名 → code=1 (FILE_NOT_FOUND)（assets/dynamic/ 下的 GBK 乱码目录即历史残骸）；② 直调 File 的 `entry.localURL` 百分号编码同样解码错乱 → ENCODING_ERR(5)，且其「先删旧文件再写」策略在写入失败后把原文件删没了（2026-11-03 增量更新即实际删掉了 extension.js）；③ 标准 game.writeFile(ArrayBuffer) 被毒桥逐字节 JSON 序列化损坏（v3.36 取证）。三条二进制链在中文目录（`extension/kirito扩展/`）下全军覆没，而字符串通道（resolveLocalFileSystemURL 原始未编码路径）实测字节精确可用
- 实现: 三处改动（v4.22 补丁）：① ktWriteBinary 新增 `tempmove` 策略（中文目录时最优先）：先落盘到游戏根下纯 ASCII 的 `__kttmp/`（走已验证的 transfer/direct 通道），再用 File 插件原生 moveTo 移入中文目录（Java 层重命名无编码损失），move 撞已存在文件则删旧重试一次，失败自动降级原有策略链，读回校验不变；② 增量更新的 extension.js/info.json 一律走字符串通道（两文件均为 UTF-8 文本，TextDecoder/TextEncoder 往返字节精确），绕开二进制链；③ PLAN_LABELS 增补 tempmove 标签。全量更新的 png/mp3/skel 等真二进制靠 ① 的 moveTo 中转
- 影响范围: 仅安卓 cordova 端 + 目录名含非 ASCII 字符的场景；PC/Electron 不受影响（PC 直接走标准写入不进校验链）
- 上游已修判定: 无名杀本体/懒人包更新后，cordova 桥对百分号编码路径解码正确（FileTransfer 直落盘到中文目录成功）→ 可摘 tempmove 与字符串通道改道
- 移除方式: 删 ktWriteBinary 内 `tempmove` 分支（代码锚 `__kttmp`）+ startIncremental 写入行还原为 `/\.json\$/.test(file)` 三元式
- 代码锚: extension.js 搜 `__kttmp` / `tempmove`
- 备注: 此前 2026-11-03 的修复方案成品（MD5 c6761fade…）已手动装到手机（Download/DSH-Go/kirito-fix/），本仓库落地版内容同源+版本号 bump 至 4.22。用户手动装 4.22 后，后续在线增量/全量更新即可自愈闭环

## FIX-13 writeFile 传 path="." 在安卓 cordova 端随机弹窗 entry.getFile is not a function（本体 cordova.js writeFile 对非目录 path 不设防）
- 引入 v4.28｜状态: 生效中
- 上游bug: 本体 `noname/init/cordova.js` 的 `game.writeFile(data, path, name)`（约 283 行）把 path 当目录拼进 `resolveLocalFileSystemURL(nonameInitialized + path)`，成功回调里直接 `entry.getFile(...)`。kirito 的 exportSnapshot 传 `path="."`，拼接出 `.../noname/.`，部分安卓内核（子琪懒人包 1.11.6.1 实测）解析后回调的 entry 不是 DirectoryEntry（无 getFile 方法）→ TypeError 冒到 window.onerror 弹窗，时机随机（启动导出快照写一次即触发）
- 实现: exportSnapshot 的 writeFile 调用把 path 从 `"."` 改为空串——legacy/node/browser 三端实现均对空 path 按游戏根目录兼容
- 影响范围: 仅安卓 cordova 端的 config-sync.json 快照导出；PC 端行为不变（node 端对 "." 与 "" 等价）
- 上游已修判定: 本体 cordova.js 的 writeFile 改为先解析游戏根目录再 getFile 带相对路径（或对 "." 路径段做清理）→ 已修（但空串写法本就是更正确的姿势，无需回改）
- 移除方式: 无需移除（本体修复后空串依然兼容）
- 代码锚: extension.js 搜 `config-sync.json` 写入段（exportSnapshot 内）
- 备注: 本体侧加固方案（writeFile 改「根目录解析+JS层清理 ./.. 段+getFile 相对路径」，与 readFile 同款）属改本体文件，按惯例不越界。天庭等扩展若也传 "." 走同一入口，其报错与 kirito 无关、需各自修

## FIX-14 自用美化 pindian.js 拼点弹框爆栈（__ssPdOrigDialog 备份被包装链污染）
- 引入 v4.31｜状态: 生效中
- 上游bug: 自用美化的 pindian / deckMoveUI / wugu 互相包装 `ui.create.dialog`，pindian 包装函数从全局备份变量 `__ssPdOrigDialog` 取原版——该备份被包装链覆盖污染后形成自调用闭环，斗地主拼点弹框即抛 Maximum call stack size exceeded（pindian.js:3704）
- 实现: content 函数体开头注入「dialog备份保护」IIFE（幂等）：用存取器锁死 `__ssPdOrigDialog`——带包装标记（`__ssPdGuestResultHook`）的值一律不存，读到的永远是干净原版（优先保留现有干净备份→锁定当前干净 dialog→本体直连构造器兜底）。**不动 ui.create.dialog 包装链**，所有已装美化保留
- 影响范围: 仅 `__ssPdOrigDialog` 这一个全局备份变量；其他扩展不受影响
- 上游已修判定: 自用美化更新后拼点不再爆栈（打一局斗地主进拼点弹框验证：不再弹 Maximum call stack size exceeded 且美化样式不变）→ 可摘
- 移除方式: 删 content 函数体开头的 `__ktDialogBackupGuard` 整段 IIFE
- 代码锚: extension.js 搜 `__ktDialogBackupGuard`
