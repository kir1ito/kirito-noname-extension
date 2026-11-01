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
- 引入 v4.05｜包装 `ui.create.dialog`：标题以「你的选将框」开头时把 `lib.config["extension_斗转星移_FavoriteChars"]` 注入候选数组（尊重玩家禁用名单）
- 上游敏感点: 斗转星移若改收藏存储键（`dzxy.dz` 前缀）或对话框创建方式 → 失效。判定: 选将框看收藏武将是否出现
- 代码锚: `__ktFav`

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
- 引入 v4.10｜状态: 生效中
- 上游bug: 千幻加载器 extension.js:153 的 qhlyUI.assets 注册表里 **pinzhi 项被注释掉**（main.js:9 有完整版但 main.js 是死代码，无人导入）；content.js:233 在「十周年UI已启用」分支读 `assets.pinzhi.name` → undefined → 炸boot。1.11.6.1内核前此异常同样发生但被旧内核静默吞掉（不影响游戏），新内核启动链改为向上传播 → 弹窗死。千幻/皮肤切换/懒人包等更新前后文件一致（更新包实测），非更新直接引入
- 实现: kirito模块导入期（最早时机）预置 huanpifu/pinzhi/huanfu 三键并用 defineProperty 合并千幻 main.js 的后续赋值——注册项恒在，时序免疫；顺带救回被注释掉的"品质"动皮资源加载
- 上游已修判定: 千幻聆音更新后 `grep "pinzhi" 千幻聆音/extension.js` 在加载器注册表出现未注释条目（或 content.js:233 不再读 pinzhi）→ 已修
- 移除方式: 删 `ktQhlyDefaults` 整段（extension.js 模块级，代码锚 `ktQhlyDefaults`）
- 代码锚: extension.js 搜 `ktQhlyDefaults`

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

## 检查流程（上游更新后执行）
1. 对 FIX-1~5 逐条跑「上游已修判定」的 grep
2. 已修 → 按「移除方式」删代码 → `node --check`（拷到 /tmp/*.mjs 用 ESM 模式查）→ 双版本号 bump → `node sync-config.mjs` → 部署 md5 校验 → commit push → 用户测试
3. 未修 → 不动
4. 新增自有修复时：同步在本文件登记（含代码锚与判定方法）
5. 注意: 上一个会话对主文件的三修复**不在本机**（已验证主文件为原版），勿重复移除
