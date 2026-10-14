# 无名杀「AI 禁选」机制

> 结论速查：想让 AI 不选某武将、但玩家仍可正常选择，在本扩展中给武将定义加一行
> `isAiForbidden: true` 即可（见文末）。本文记录其背后的完整机制，便于日后排查和扩展。

## 一、三套名单的分工

| 名单 | 作用 | 玩家选将框 |
| --- | --- | --- |
| `lib.config.banned` | 完全禁用（手动"禁将"） | **不显示**，玩家也不能选 |
| `lib.config.forbidai` | 仅 AI 禁选（运行时合并池） | 照常显示，玩家随便选 |
| `lib.config.forbidai_user` | 仅 AI 禁选（**用户持久化**名单） | 同上 |

关键区分：玩家的选将界面（`ui.create.characterDialog`）**根本不检查** `forbidai`，
它只检查 `banned` 和 `lib.characterFilter`。所以"AI 禁选"的武将对玩家完全无感。

## 二、生效链路（本体代码）

1. **合并入池**：游戏启动加载武将时，把 `forbidai_user` 里的 ID 合并进
   `lib.config.forbidai`（`noname/game/index.js` 的 `processCharacter`，
   以及扩展加载路径 `noname/init/loading.js`）。
   武将定义带 `forbidai` 标签、或 Boss 类（`isBoss` / `isHiddenBoss`）的也会自动进池。
2. **过滤 AI 候选**：AI 随机选将走 `lib.filter.characterDisabled()`：
   ```js
   if (lib.config.forbidai.includes(name2) || character.isAiForbidden) {
       return true; // 从候选池剔除
   }
   ```
   （`noname/library/index.js` 的 filter 定义处）

## 三、懒人包的实现方式（外部名单型）

懒人包不拦截任何选将，只是个"名单维护器"（`extension/懒人包/extension.js`）：

```js
// 顶部硬编码问题武将名单（AI 用不好的将）
const forbidaiList = ['eu_kaisa', 'pe_que', 'hm_shen_huangfusong', /* ... */];

// 配置开关联动（默认开）：
const bool = lib.config.extension_懒人包_zq_aiforbidai_characters;
lib.config.forbidai_user[bool ? "addArray" : "removeArray"](forbidaiList);
game.saveConfig("forbidai_user", lib.config.forbidai_user); // 持久化
```

设置面板里「部分武将AI禁选」开关 + 「点击查看AI禁选列表」弹窗就是它的 UI。
这种方式的缺点：名单在扩展外部，只对装了懒人包的环境生效。

## 四、自己扩展的推荐写法（内置标志型）

在武将定义里直接声明，标志跟着扩展走，装到谁的机器上都生效。

**新式 Character 对象（本扩展当前用法）**：

```js
god: new Character({
    sex: "male",
    group: "shen",
    hp: 3,
    maxHp: 3,
    skills: ["gryjuejing", "grylonghun"],
    groupInGuozhan: "shu",
    isAiForbidden: true, // AI 禁选：AI 不选用，玩家可正常选择
    dieAudios: ["ext:gry扩展/audio/die/god.mp3"],
}),
```

**旧式数组格式**：在第 5 位 trash 数组里加 `"forbidai"` 字符串标签，
`Character.setPropertiesFromTrash` 会解析为 `isAiForbidden = true`。

## 五、应用记录

- 2026-10-14：龙神赵云（god）已加 `isAiForbidden: true`。
  原因：绝境/龙魂技能组合 AI 难以正确发挥；留给玩家手动选用。

## 六、相关但不同的东西（避免混淆）

- 银竹离火配置里的「仅自由可选」是它自建的另一套白名单过滤，与本机制无关
  （实测会导致未列入的扩展武将不出现在其选将池中）。
- `lib.characterFilter[name]` 是按模式过滤武将的钩子（国战包 `mode: "guozhan"`
  走的是 `lib.characterGuozhanFilter`，另一个体系）。
