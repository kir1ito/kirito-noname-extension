# 无名杀常用API参考手册

> **作者：Doro / Codex**  
> 本文档允许在非商业目的下转载、修改与改编。  
> 禁止将本文档及其改编内容用于商业用途。

> 适用基线：本地无名杀 `1.11.5`。本手册是非官方学习与 API 参考资料；不同分支、旧版客户端或第三方扩展可能重写同名 API，最终应以目标版本源码为准。

本手册合并 Player 选择交互、Player 高频规则、get 查询与技能 AI 四篇文档。重点详解第一章的 `choose` 系列和第四章的技能 AI；第二、三章以高频查询参考为主。

## 总目录

- [第一章 Player 选择与交互 API](#part-player-choice)
- [第二章 Player 高频规则 API](#part-player-rules)
- [第三章 get 相关 API](#part-get-api)
- [第四章 技能 AI 模块教学与标签索引](#part-skill-ai)

电脑和手机均可使用 Markdown 阅读器的目录或全文搜索功能查询。若当前软件不支持目录，可直接搜索 API 名、字段名或源码文件名。

---

<a id="part-player-choice"></a>

## 第一章 Player 选择与交互 API

> 适用基线：本地无名杀 `1.11.5`。本文面向武将技能的标准本地流程，示例优先使用现代异步写法。不同分支、旧版客户端或扩展重写过的同名 API，仍应以对应源码为准。

### 1. 先理解一次 `choose` 调用

一次选择通常包含五部分：

1. **候选范围**：从哪些牌、角色、按钮或选项中选择。
2. **合法性**：`filterCard`、`filterTarget`、`filterButton`、`filterOk`。
3. **数量**：`selectCard`、`selectTarget`、`selectButton`。
4. **AI 决策**：`ai`、`ai1`、`ai2` 或 `processAI`。
5. **结算动作**：接口只返回选择，还是已经完成弃置、获得、使用等动作。

`player.choose...()` 返回 `GameEvent`，不是最终结果。现代异步技能通常等待 `.forResult()`：

```js
async content(event, trigger, player) {
  const result = await player
    .chooseTarget("请选择一名其他角色", (card, player, target) => {
      return target !== player && target.isIn();
    })
    .set("ai", target => -get.attitude(player, target))
    .forResult();

  if (!result.bool) return;
  const target = result.targets[0];
  await target.damage();
}
```

这里 `chooseTarget` 只选出角色，`target.damage()` 才是实际效果。

#### 1.1 三种传参方式

多数常用选择接口支持以下一种或多种方式。具体能解析什么，取决于该 API 的构造函数，不能把任意数据塞进圆括号里期待引擎自动识别。

##### 直接参数

构造函数按照参数类型依次解析：

```js
player.chooseCard("he", [1, 2], true, "请选择一至两张牌");
player.chooseTarget([1, 2], "请选择一至两名角色", filterTarget);
```

例如 `chooseCard` 能识别位置字符串、数量、布尔值、函数和提示文字；但这不代表所有 `choose` API 都采用相同顺序或相同类型规则。

##### 对象参数

适合字段较多、需要明确标注含义的调用：

```js
player.chooseCard({
  position: "he",
  selectCard: [1, 2],
  forced: true,
  prompt: "请选择一至两张牌",
  filterCard(card, player) {
    return get.color(card, player) === "red";
  },
  ai(card) {
    return 6 - get.value(card, player);
  },
});
```

对象不是所有 API 都支持的统一协议；本文只在当前源码确认支持时列出。

##### `.set()` 补充或覆盖事件字段

```js
player
  .chooseTarget("请选择一名角色")
  .set("prompt2", "其受到1点伤害")
  .set("filterTarget", (card, player, target) => target !== player)
  .set("ai", target => get.damageEffect(target, player, player));
```

`GameEvent.set(key, value)` 会把值写入选择事件并返回事件本身，因此可以链式调用。它适合补充不能由直接参数明确表达的字段，也可以覆盖构造函数已经设置的字段。

#### 1.2 `prompt` 与 `prompt2`

| 字段 | 显示作用 | 建议内容 |
| --- | --- | --- |
| `prompt` | 主提示/标题 | “请选择一名角色”“是否发动〖技能〗？” |
| `prompt2` | 主提示下方的补充说明 | 选择限制、支付代价、选中后产生的效果 |

当前 `get.evtprompt` 的字符串解析规则是：第一个普通提示字符串进入 `prompt`，后续提示字符串进入 `prompt2`。也可以用一个 `###主提示###副提示` 字符串同时指定两层：

```js
player.chooseTarget(
  "###请选择一名其他角色###其受到1点伤害",
  (card, player, target) => target !== player
);
```

若某个字符串被该 API 当成特殊标记，例如 `"allowChooseAll"`、`"chooseonly"`，它就不会再作为提示文字。复杂调用优先用对象或 `.set()`，可避免类型解析产生歧义。

#### 1.3 `forced` 的准确含义

`forced: true` 表示玩家不能主动取消，并不表示引擎会绕过过滤器、自动生成候选或强行选满上限。

对于普通的 `chooseCard`、`chooseTarget`、`chooseButton` AI：

- 没达到最小数量时，即使最高分为负，强制选择仍会继续挑选；
- 达到最小数量后，如果下一项最高分不大于 `0`，可以停止，不会为了填满上限继续选负收益项；
- 没有合法候选时，`forced` 也不能让非法对象变得可选。

#### 1.4 常见结果字段

不要用一套固定解构处理所有接口。先保留 `result`，再读取该接口实际提供的字段：

```js
const result = await player.chooseCard("he", true).forResult();
if (!result.bool || !result.cards?.length) return;
const card = result.cards[0];
```

| 选择类型 | 主要字段 | 含义 |
| --- | --- | --- |
| 是/否 | `bool` | 是否确认 |
| 牌 | `cards` | 实体牌数组 |
| 目标 | `targets` | `Player[]` |
| 按钮 | `buttons`、`links` | `links` 是按钮承载的业务数据 |
| 控制项 | `control`、`index` | 选项文本/值及下标；不要依赖 `bool` |
| 数字 | `numbers`、`bool` | 数字数组及是否确认 |
| 分组移动 | `moved`、`bool` | 每项对应一个分组的二维数组 |
| 技能 | `skill`、`bool` | 技能 ID 及是否成功 |

### 2. 普通选择 AI 怎样工作

#### 2.1 `chooseCard`、`chooseTarget`、`chooseButton` 是逐项贪心

这三类接口不是一次性找出“全局最优组合”，而是重复执行以下过程：

1. 取得当前仍合法、仍可选择的候选。
2. 分别调用评分函数。
3. 选中当前分数最高的一项。
4. 重新运行界面与合法性检查，再选择下一项。

因此多选回调的第二个参数可以表示当前轮候选集合，但评分仍应与“已选内容变化后会再次计算”这一过程兼容：

```js
.set("ai", (target, targets) => {
  return get.damageEffect(target, player, player);
})
```

分数的停止规则：

| 当前状态 | 最高分 `> 0` | 最高分 `<= 0` |
| --- | --- | --- |
| 非强制 | 继续选择 | 取消，或在已达到最小数量后停止 |
| 强制且未达到最小数量 | 继续选择 | 仍选择最高项以满足最小数量 |
| 强制且已达到最小数量 | 继续选择 | 停止，不必选满上限 |

所以 `forced: true` 不能理解为“选到上限”，负数也不能理解为“绝对禁止”。绝对合法性必须由 `filter...` 决定。

#### 2.2 `chooseControl` 不是逐项评分

`chooseControl` 的 `ai(parentEvent, player)` 直接返回最终选项：

- 返回数字：选取该下标的控制项；
- 返回字符串：选取同名控制项。

它不会把每个选项传入回调再比较分数。取消通常通过是否提供 `"cancel2"` 表达，而不是依靠普通选择的负分停止逻辑。

#### 2.3 `processAI` 直接给出完整方案

`chooseToMove_new`、`chooseNumbers` 等复杂界面无法简单逐项打分，通常让 `processAI` 返回与结果对应的完整结构：

```js
.set("processAI", list => {
  return [list[0][1].slice(0, 2), list[0][1].slice(2)];
})
```

返回结构必须以该接口的源码消费者为准，不能把普通 `ai` 的数字评分照搬过来。

### 3. 基础选择

#### 3.1 `chooseBool`

用途：显示“确定/取消”选择，只返回意愿，不自动执行后续效果。

```js
const result = await player
  .chooseBool("是否摸一张牌？")
  .set("prompt2", "选择确定后摸一张牌")
  .set("ai", () => true)
  .forResult();

if (result.bool) await player.draw();
```

| 项目 | 当前行为 |
| --- | --- |
| 直接参数 | 字符串进入 `prompt`/`prompt2`；布尔值进入 `choice`；函数进入 `ai`；也支持对象参数 |
| 默认值 | `choice: true`，即本地玩家界面默认停在“确定”倾向 |
| AI 回调 | `ai(parentEvent, player)`，返回真/假意愿 |
| 结果 | `{ bool }` |
| 是否执行动作 | 否 |

`choice` 是界面默认选择，`ai` 是托管时的决定，两者不要混为一谈。

#### 3.2 `chooseControl`

用途：从多个控制项中选择一个。

```js
const result = await player
  .chooseControl("摸一张牌", "回复1点体力", "cancel2")
  .set("prompt", "请选择一项")
  .set("prompt2", "回复选项仅在已受伤时有实际收益")
  .set("ai", (event, player) => {
    return player.isDamaged() ? "回复1点体力" : "摸一张牌";
  })
  .forResult();

if (result.control === "摸一张牌") {
  await player.draw();
} else if (result.control === "回复1点体力") {
  await player.recover();
}
```

| 项目 | 当前行为 |
| --- | --- |
| 直接参数 | 普通字符串加入 `controls`；数组批量加入；函数进入 `ai`；数字进入 `choice` |
| 默认值 | `choice: 0` |
| AI 回调 | `ai(parentEvent, player)`，直接返回下标或控制项字符串 |
| 结果 | `control`、`index` |
| 是否执行动作 | 否 |

`result.index` 是最终选项下标，`result.control` 是最终控制项。不要因为其他选择接口有 `result.bool`，就把它作为这里的主要判断。

#### 3.3 `chooseControlList`

用途：把较长的一组说明作为控制项展示。它内部仍走 `chooseControl`。

```js
const result = await player.chooseControlList({
  prompt: "请选择一项",
  list: ["摸两张牌", "回复1点体力"],
  forced: false,
  ai(event, player) {
    return player.isDamaged() ? 1 : 0;
  },
}).forResult();
```

| `forced` | 实际选项 |
| --- | --- |
| `false`（默认） | 列表项后附加 `cancel2` |
| `true` | 只包含列表项，不附加取消 |

结果仍读取 `control`、`index`。AI 返回的是下标或选项值，不是“每项得分”。

#### 3.4 `chooseNumbers`

用途：选择一组数字，适合分配点数、声明多个数值或限制总和。

```js
const result = await player.chooseNumbers({
  prompt: "分配3点数值",
  list: [
    { prompt: "第一项", min: 0, max: 3 },
    { prompt: "第二项", min: 0, max: 3 },
  ],
  optionSum: 3,
  forced: true,
  filterOk(event) {
    return event.numbers[0] + event.numbers[1] === 3;
  },
  processAI() {
    return [2, 1];
  },
}).forResult();

if (!result.bool) return;
const numbers = result.numbers;
```

| 字段 | 作用 |
| --- | --- |
| `list` | 每个数字选择器的候选范围/数据；常用对象形状为 `{ prompt, min, max }`，数组则表示离散候选值 |
| `optionSum` | 总和限制及相关显示依据 |
| `filterSelect` | 检查某一步数字选择 |
| `filterOk` | 检查整组数字是否允许确认 |
| `processAI` | 直接返回 AI 采用的数字数组 |
| `forced` | 默认 `false` |

涉及多个数字的联动约束时，应在 `filterOk` 对最终数组再校验一次。

### 4. 选择自己的牌与场上角色

#### 4.1 `chooseCard`

用途：选择自己的牌。它只选择，不自动弃置、交给他人或使用。

```js
const result = await player
  .chooseCard("he", [1, 2], "请选择一至两张红色牌")
  .set("prompt2", "选择后由技能代码弃置这些牌")
  .set("filterCard", (card, player) => get.color(card, player) === "red")
  .set("ai", card => 6 - get.value(card, player))
  .forResult();

if (!result.bool) return;
await player.discard(result.cards);
```

| 项目 | 当前行为 |
| --- | --- |
| 直接参数 | 位置字符串；数字/范围为 `selectCard`；布尔值为 `forced`；首个函数为 `filterCard`，第二个函数为 `ai`；普通对象可作为过滤条件；提示字符串经 `get.evtprompt` 解析 |
| 对象常用字段 | `position`、`selectCard`、`forced`、`filterCard`、`ai`、`prompt`、`prompt2`、`complexCard`、`allowChooseAll` |
| 默认值 | `filterCard: lib.filter.all`；`selectCard: [1,1]`；`ai: get.unuseful3`；未写位置时标准取牌路径为手牌区 `h` |
| AI | `ai(card, cards?)` 返回分数，逐项贪心选择 |
| 结果 | `bool`、`cards` |
| 是否执行动作 | 否 |

常见区域：`h` 手牌、`e` 装备区、`j` 判定区、`s` 特殊区、`x` 扩展区；可组合为 `he` 等。具体区域能否被某个动作处理，还要看该动作的规则过滤器。

#### 4.2 `chooseTarget`

用途：选择场上角色，只返回目标。

```js
const result = await player
  .chooseTarget([1, 2], "请选择一至两名其他角色", (card, player, target) => {
    return target !== player && target.isIn();
  })
  .set("ai", target => get.damageEffect(target, player, player))
  .forResult();

if (!result.bool) return;
for (const target of result.targets) {
  await target.damage();
}
```

| 项目 | 当前行为 |
| --- | --- |
| 直接参数 | 数字/范围为 `selectTarget`；布尔值为 `forced`；首个函数为 `filterTarget`，第二个函数为 `ai`；字符串进入提示 |
| 对象常用字段 | `selectTarget`、`forced`、`filterTarget`、`ai`、`prompt`、`prompt2`、`complexTarget` |
| 默认值 | `filterTarget: lib.filter.all`；`selectTarget: [1,1]`；`ai: get.attitude2` |
| 回调签名 | `filterTarget(card, player, target)`；`ai(target, targets?)` |
| 结果 | `bool`、`targets` |
| 是否执行动作 | 否 |

即使没有实体牌，`filterTarget` 的第一个参数仍保留为 `card` 位置。不要把它写成 `(player, target)` 后误读参数。

#### 4.3 `chooseCardTarget`

用途：在同一个确认流程中同时选择自己的牌和目标。

```js
const result = await player.chooseCardTarget({
  prompt: "弃置一张牌并选择一名其他角色",
  prompt2: "令该角色受到1点伤害",
  position: "he",
  filterCard: lib.filter.cardDiscardable,
  selectCard: 1,
  filterTarget(card, player, target) {
    return target !== player;
  },
  selectTarget: 1,
  ai1(card) {
    return 6 - get.value(card, player);
  },
  ai2(target) {
    return get.damageEffect(target, player, player);
  },
}).forResult();

if (!result.bool) return;
await player.discard(result.cards);
await result.targets[0].damage();
```

| 字段 | 默认值/作用 |
| --- | --- |
| `filterCard` | `lib.filter.all` |
| `selectCard` | `1` |
| `filterTarget` | `lib.filter.all` |
| `selectTarget` | `1` |
| `ai1(card)` | 默认 `get.unuseful2`，评估牌 |
| `ai2(target)` | 默认 `get.attitude2`，评估目标 |

结果包含 `bool`、`cards`、`targets`。接口本身仍不支付牌，也不对目标执行效果。

### 5. 按钮选择

#### 5.1 `chooseButton`

用途：从 Dialog 按钮中选择数据。业务代码通常读取 `result.links`，而不是操作按钮 DOM。

```js
const list = [
  ["draw", "摸两张牌"],
  ["recover", "回复1点体力"],
];

const result = await player
  .chooseButton(["请选择一项", [list, "textbutton"]], true)
  .set("ai", button => {
    if (button.link === "recover" && player.isDamaged()) return 2;
    return button.link === "draw" ? 1 : 0;
  })
  .forResult();

if (result.links[0] === "draw") {
  await player.draw(2);
} else {
  await player.recover();
}
```

在 `textbutton` 数据 `[link, 显示文字]` 中，`button.link` 是前一项。其他按钮来源可能把实体牌、虚拟牌数组、角色 ID、技能 ID 或自定义对象放进 `link`，必须从 Dialog 创建方式确认形状。

| 项目 | 当前行为 |
| --- | --- |
| 直接参数 | Dialog；数字/范围为 `selectButton`；布尔值先尝试写入 `forced`，只有 `forced` 已为真时后续布尔值才进入 `complexSelect`；首个函数为 `ai`、第二个函数为 `filterButton`；数组可作为 `createDialog`；另识别 `complexSelect`、`allowChooseAll`、`direct` 等标记 |
| 对象常用字段 | `createDialog`/`dialog`、`selectButton`、`forced`、`filterButton`、`ai`、`prompt`、`complexSelect`、`allowChooseAll` |
| 默认值 | `forced: false`；`filterButton: lib.filter.filterButton`；`selectButton: [1,1]`；`ai: () => 1` |
| AI | `ai(button, buttons?)` 返回分数，按普通按钮贪心算法选择 |
| 结果 | `bool`、`buttons`、`links` |
| 是否执行动作 | 否 |

若当前流程支持 `processAI`，它表示直接构造完整选择结果；不要与逐按钮评分的 `ai(button)` 混用。

直接布尔值的解析依赖前面是否已经把 `forced` 设为真，因此同时配置 `forced` 与 `complexSelect` 时优先使用对象字段，避免把 `(false, true)` 误解成“可取消且复杂选择”。

`complexSelect` 除非显式为 `false`，通常会被设为 `true`；但只写 `allowChooseAll: true` 且没有指定 `complexSelect` 时，当前构造函数会把它设为 `false`。该字段关系到多选过程中是否持续重检复杂组合，不能简单理解成视觉选项。

##### 技能定义里的 `chooseButton` 不是同一个形状

视为技常见的声明式字段：

```js
chooseButton: {
  dialog(event, player) {},
  filter(button, player) {},
  check(button) {},
  backup(links, player) {},
  prompt(links, player) {},
}
```

这是技能定义协议：先生成按钮，选中后用 `backup` 返回临时技能配置。它不是 `player.chooseButton(...).set("ai", ...)` 的参数对象；其中 `check(button)` 才承担该技能按钮的 AI 评分。

#### 5.2 `chooseCardButton`

用途：把一组实体牌转换成按钮供选择。

```js
const result = await player
  .chooseCardButton(cards, "请选择一张牌", true)
  .set("ai", button => get.value(button.link, player))
  .forResult();

if (!result.bool) return;
const card = result.links[0];
```

默认提示为“请选择卡牌”。`result.links` 中是实体牌；接口只选择，不会自动获得、弃置或使用。

#### 5.3 `chooseVCardButton`

用途：把虚拟牌描述列表转换成按钮。默认提示同样为“请选择卡牌”。

```js
const list = [
  ["基本", "", "sha"],
  ["基本", "", "shan"],
];
const result = await player.chooseVCardButton(list, true).forResult();
if (!result.bool) return;
const vcard = result.links[0];
```

返回的是虚拟牌数据，不代表已经使用该牌。后续应按目标流程进入 `chooseUseTarget`、`chooseToUse`、`useCard` 或标准 `viewAs`。

#### 5.4 `chooseButtonTarget`

用途：同一事件中选择按钮数据和目标。

```js
const result = await player.chooseButtonTarget({
  prompt: "选择一项并指定一名角色",
  forced: true,
  createDialog: [
    "选项",
    [
      [
        ["draw", "摸牌"],
        ["recover", "回复"],
      ],
      "textbutton",
    ],
  ],
  selectButton: 1,
  filterButton: () => true,
  selectTarget: 1,
  filterTarget(card, player, target) {
    return target.isIn();
  },
  ai1(button) {
    return button.link === "recover" ? 2 : 1;
  },
  ai2(target) {
    return get.attitude(player, target);
  },
}).forResult();

if (!result.bool) return;
const choice = result.links[0];
const target = result.targets[0];
```

默认值：`filterButton: lib.filter.filterButton`、`selectButton: 1`、`filterTarget: lib.filter.all`、`selectTarget: 1`、`ai1: () => 1`、`ai2: get.attitude2`、`canHidden: true`。结果读取 `links` 与 `targets`，不是 `cards`。

### 6. 使用、响应与真实移动牌

#### 6.1 `chooseToUse`

用途：建立完整的“选择可使用牌/技能—选择目标—使用”流程。

```js
const result = await player.chooseToUse({
  prompt: "请使用一张杀",
  filterCard(card, player) {
    return get.name(card, player) === "sha";
  },
  filterTarget: lib.filter.filterTarget,
}).forResult();
```

| 项目 | 当前默认/作用 |
| --- | --- |
| `filterCard` | `lib.filter.filterCard` |
| `selectCard` | `[1,1]` |
| `filterTarget` | `lib.filter.filterTarget` |
| `selectTarget` | `lib.filter.selectTarget` |
| `position` | `hs` |
| `ai1` | `get.cacheOrder`，评估使用哪张牌/哪个技能 |
| `ai2` | `get.cacheEffectUse`，评估目标 |
| `forced` | 默认可取消 |
| 结果/动作 | 返回使用结果；默认会真实使用牌或技能 |

直接参数能按类型识别选择数量、`forced`、过滤函数、提示文字和 `"chooseonly"` 等标记。`chooseonly` 会改变标准执行语义，仅在确认调用链确实需要“只完成选择”时使用。

武将视为技通常不必手写完整 `chooseToUse`：声明 `enable`、`filter`、`filterCard`、`viewAs`、`viewAsFilter`、`prompt`、`check`，让引擎把技能加入当前使用流程，兼容性通常更好。

#### 6.2 `chooseToRespond`

用途：为当前事件打出响应牌或响应技能，例如打出【闪】。

```js
const result = await player.chooseToRespond({
  card: { name: "shan" },
  prompt: "请打出一张闪",
}).forResult();

if (!result.bool) {
  // 未响应
}
```

| 项目 | 当前默认/作用 |
| --- | --- |
| `filterCard` | 未由 `card` 等参数生成时为 `lib.filter.all` |
| `selectCard` | `[1,1]` |
| `position` | 当前构造函数最终设置为 `hs` |
| `source` | 未指定且未使用 `nosource` 时，取当前事件玩家 |
| `ai` | `get.unuseful2`，评估作为响应材料的牌 |
| `ai2` | `() => 1` |
| 提示 | 未提供时，引擎会按响应对象生成默认提示 |
| 结果/动作 | 默认完成真实响应 |

“响应”和“使用”在事件语义、次数、目标及触发链上不同，不能只因牌名相同就交换 `chooseToRespond` 与 `chooseToUse`。

#### 6.3 `chooseToGive`

用途：选择自己的牌并真实交给指定目标。

```js
const result = await player
  .chooseToGive(target, "he", 1, true, "交给其一张牌")
  .set("ai", card => 6 - get.value(card, player))
  .forResult();
```

常用直接参数包括：目标、位置、数量、`forced`、`filterCard`、AI 与提示。当前默认 `filterCard: lib.filter.all`、`selectCard: [1,1]`、`position: "h"`、`ai: get.unuseful`。默认路径已完成交牌，不要再对 `result.cards` 手动 `give` 一次。

#### 6.4 `chooseToDiscard`

用途：选择自己的牌并真实弃置，常用于技能代价。

```js
const result = await player
  .chooseToDiscard("he", 1, "弃置一张牌，否则失去1点体力")
  .set("ai", card => 6 - get.value(card, player))
  .forResult();

if (!result.bool) await player.loseHp();
```

| 项目 | 当前默认/作用 |
| --- | --- |
| `filterCard` | `lib.filter.cardDiscardable` |
| `selectCard` | `[1,1]` |
| `ai` | `get.unuseful` |
| 位置 | 未提供时标准选牌路径使用手牌区；常显式写 `h` 或 `he` |
| `allowChooseAll` | 提供允许全选的交互标记 |
| `chooseonly` | 只选择、不执行弃置 |
| 结果/动作 | 默认返回 `bool`、`cards` 并真实弃置 |

只有使用 `chooseonly` 时，调用方才需要自己处理所选牌；标准路径下再次 `player.discard(result.cards)` 会造成重复结算风险。

#### 6.5 `chooseToCompare`

用途：发起拼点选择并按拼点流程结算，不是普通 `chooseCard` 的别名。

```js
const result = await player
  .chooseToCompare(target, card => get.number(card, player))
  .forResult();

if (result.bool) {
  // 发起者拼点胜利
}
```

第一个参数可为一个目标或目标数组；可选 `check(card)` 用于选择拼点牌。接口负责选牌、展示与比较点数，并返回拼点上下文。多人拼点还会带有各目标结果，读取字段前应对照实际调用点。

#### 6.6 `chooseUseTarget`

用途：给定一张或多张牌，让角色选择合法目标并真实使用。

```js
const card = { name: "sha", isCard: true };
const result = await player
  .chooseUseTarget(card, "是否视为使用一张杀？")
  .forResult();
```

当前默认候选目标为场上存活角色，并按牌的使用规则检查次数、距离、目标合法性与 `mod`。常见标记有 `nodistance`、`nopopup`、`noanimate`、`nothrow`、`noTargetDelay` 等；它们只改变各自明确的流程环节，不应作为绕开完整用牌规则的通用开关。

### 7. 选择其他角色的牌

#### 7.1 `choosePlayerCard`

用途：从指定角色的区域选择牌，但不自动弃置或获得。

```js
const result = await player
  .choosePlayerCard(target, "he", true)
  .set("prompt", `选择${get.translation(target)}的一张牌`)
  .set("ai", button => get.buttonValue(button))
  .forResult();

if (!result.bool) return;
const card = result.links[0];
```

| 项目 | 当前默认/作用 |
| --- | --- |
| `target` | 被选择牌的角色，必需 |
| `position` | `he` |
| `selectButton` | `[1,1]` |
| `filterButton` | `lib.filter.all` |
| `forced` | 默认 `false` |
| `ai(button)` | 默认结合 `get.buttonValue(button)` 与选择者对牌主人的态度 |
| 结果/动作 | 通常返回 `bool`、`buttons`、`links`/`cards`；只选择 |

他人手牌属于隐藏信息。自定义 AI 只能使用当前流程允许观察到的信息，不能先读取未公开手牌再精确评分。

#### 7.2 `discardPlayerCard`

用途：选择目标区域内的牌并真实弃置。调用方式与 `choosePlayerCard` 接近，默认位置 `he`、默认选择一张，并带有面向拆牌收益的按钮 AI。

```js
const result = await player
  .discardPlayerCard(target, "he", true)
  .set("prompt", `弃置${get.translation(target)}的一张牌`)
  .forResult();
```

默认动作已经弃牌。若调用点明确启用 `chooseonly`，才改为只返回选择。

#### 7.3 `gainPlayerCard`

用途：选择目标区域内的牌并真实获得。

```js
const result = await player
  .gainPlayerCard(target, "he", true)
  .set("prompt", `获得${get.translation(target)}的一张牌`)
  .forResult();
```

默认动作已经获得牌；可通过对应参数附加 `gaintag`。若后续还需特殊移动来源、公开方式或动画，应确认该接口能否表达，否则显式建立合适的获得牌事件。

### 8. 分组移动与观星

#### 8.1 `chooseToMove_new`

用途：在多个列表之间移动、排序按钮数据。它返回排列方案，不自动把实体牌移入牌堆或角色区域。

```js
const result = await player.chooseToMove_new({
  prompt: "调整这些牌的顺序",
  list: [
    ["牌堆顶", cards],
    ["牌堆底", []],
  ],
  forced: true,
  filterMove(from, to, moved) {
    return true;
  },
  filterOk(moved) {
    return moved[0].length === 2;
  },
  processAI(list) {
    const cards = list[0][1].slice().sort((a, b) => get.value(b) - get.value(a));
    return [cards.slice(0, 2), cards.slice(2)];
  },
}).forResult();

if (!result.bool) return;
const moved = result.moved;
```

| 字段 | 当前作用/默认 |
| --- | --- |
| `list` | `[分组标题, 初始数据]` 组成的列表 |
| `filterMove` | 判断按钮能否移动到指定位置；未提供时默认允许 |
| `filterOk` | 判断当前完整分组能否确认；未提供时默认允许 |
| `processAI` | 直接返回 `moved` 形状的二维数组 |
| `forced` | 默认 `false` |
| 结果/动作 | `bool`、`moved`；只返回方案 |

旧扩展常见 `chooseToMove`。当前代码更适合优先使用 `chooseToMove_new`；两者的内部界面与默认赋值并非完全相同，移植旧调用时不要只替换方法名。

#### 8.2 `chooseToGuanxing`

用途：完整执行观星式操作，包括取得牌堆顶牌、分配到牌堆顶/底及真实落位。

```js
const result = await player.chooseToGuanxing(5).forResult();
const top = result.moved[0];
const bottom = result.moved[1];
```

| 项目 | 当前行为 |
| --- | --- |
| 参数 | `num` 为观看牌数，缺省或假值时按 `1` 处理 |
| 结果 | `{ bool: true, moved: [top, bottom] }` |
| 是否执行动作 | 是，已完成牌堆顶/底放置 |

这正是它与通用 `chooseToMove_new` 的关键区别：后者只给方案，`chooseToGuanxing` 已处理牌堆。

### 9. 特殊选择

#### 9.1 `chooseDrawRecover`

用途：在摸牌和回复体力之间选择，并直接执行最终动作。

```js
const result = await player.chooseDrawRecover({
  num1: 2,
  num2: 1,
  target: player,
  forced: true,
  prompt: "摸两张牌或回复1点体力",
  ai(event, player) {
    return player.isDamaged() ? "recover_hp" : "draw_card";
  },
}).forResult();
```

| 字段 | 默认值/作用 |
| --- | --- |
| `num1` | `1`，摸牌数 |
| `num2` | `1`，回复数；实际回复会受已损失体力限制 |
| `target` | 调用者自身 |
| `forced` | 默认可取消 |
| `ai` | 按控制选择协议返回下标或控制项 |
| 结果 | `control`、`index`，常见值为 `draw_card`、`recover_hp`、`cancel2` |
| 是否执行动作 | 是，已完成摸牌或回复 |

调用后不要再根据 `control` 重复 `draw()` 或 `recover()`。

#### 9.2 `chooseSkill`

用途：从某角色或某武将名可获得的技能中选择一个。

```js
const result = await player.chooseSkill(target, {
  prompt: "请选择获得一项技能",
  func(skill) {
    return !skill.startsWith("boss_");
  },
}).forResult();

if (!result.bool) return;
player.addSkill(result.skill);
```

| 项目 | 当前行为 |
| --- | --- |
| `target` | `Player` 时读取其 `getGainableSkills(func)`；字符串时按武将名取得可获得技能 |
| `prompt` | 默认“选择获得一项技能” |
| `func` | 交给可获得技能查询，用于进一步筛选 |
| 托管选择 | 当前内容使用 `get.skillRank` 从候选中取最高项 |
| 结果 | 无候选为 `{ bool: false }`；成功为 `{ bool: true, skill }` |
| 是否执行动作 | 否，不会自动获得技能 |

成功后仍需调用 `addSkill`、`addTempSkill` 等，并为临时技能明确持续时间与清理方式。

#### 9.3 `chooseToEnable`

用途：选择并恢复已废除的装备栏，随后真实调用恢复栏位逻辑。

```js
const result = await player.chooseToEnable({
  source: player,
  selectButton: 1,
}).forResult();
```

当前默认 `source` 为调用者。可用数字/范围设置选择数量，也可传 `Player` 指定来源。根据可选栏位数量，内部可能采用按钮或控制项分支，因此结果可能体现在 `links` 或 `control`；接口已经恢复栏位，不要再重复 `enableEquip`。

- 传入 `selectButton`：进入按钮分支，可选择一个或多个栏位，结果为 `links`。
- 不传 `selectButton`：进入单个控制项分支，结果为 `control`。
- 按钮分支的 `ai(button)` 返回栏位按钮分数；控制项分支若自定义 AI，当前内容按 `ai(parentEvent, player, list)` 取得最终栏位字符串。
- 没有可恢复栏位时内容会直接结束，不要假设一定存在 `result.bool`。

#### 9.4 `chooseToDisable`

用途：选择并废除装备栏，随后真实调用废除栏位逻辑。

```js
const result = await player.chooseToDisable({
  source: player,
  selectButton: 1,
  horse: false,
}).forResult();
```

当前默认 `source` 为调用者、`horse: false`。`horse` 决定坐骑栏是否采用相关合并处理；具体栏位集合还受角色当前可废除状态影响。结果同样可能来自 `links` 或 `control`，动作已经执行。

- 传入 `selectButton`：按钮分支返回 `links`，支持选择多个栏位。
- 不传 `selectButton`：控制项分支返回 `control`，只选一个栏位。
- `horse: true` 时，坐骑栏可能用 `equip3_4` 作为合并选项；真正执行时再转换为对应坐骑栏。
- 没有可废除栏位时内容直接结束；不要固定按 `bool` 判断，也不要调用后再次 `disableEquip`。

### 10. `cost` 与 `content` 中传递选择结果

现代触发技可在 `cost` 里完成询问，把完整结果赋给 `event.result`：

```js
const skill = {
  trigger: { player: "phaseUseBegin" },
  async cost(event, trigger, player) {
    event.result = await player
      .chooseTarget("请选择一名其他角色", (card, player, target) => {
        return target !== player;
      })
      .set("ai", target => get.damageEffect(target, player, player))
      .forResult();
  },
  async content(event, trigger, player) {
    const target = event.targets[0];
    await target.damage();
  },
};
```

这里的传递关系是：

1. `cost` 把选择结果写入 `event.result`。
2. 选择成功进入 `content` 时，引擎把常用结果复制到正式技能事件。
3. `content` 读取 `event.cards`、`event.targets`、`event.cost_data` 等正式字段。

自定义数据可放入 `result.cost_data`。不要只修改局部变量期待 `content` 自动取得，也不要在 `content` 中依赖上一个选择事件的内部可变状态。

### 11. 选择接口速查

| API | 选择对象 | 默认是否执行真实动作 | 主要结果 |
| --- | --- | --- | --- |
| `chooseBool` | 确定/取消 | 否 | `bool` |
| `chooseControl` | 一个控制项 | 否 | `control`、`index` |
| `chooseControlList` | 一组文字选项 | 否 | `control`、`index` |
| `chooseNumbers` | 数字 | 否 | `bool`、`numbers` |
| `chooseCard` | 自己的牌 | 否 | `bool`、`cards` |
| `chooseTarget` | 角色 | 否 | `bool`、`targets` |
| `chooseCardTarget` | 自己的牌 + 角色 | 否 | `cards`、`targets` |
| `chooseButton` | 按钮数据 | 否 | `buttons`、`links` |
| `chooseButtonTarget` | 按钮数据 + 角色 | 否 | `links`、`targets` |
| `chooseCardButton` | 实体牌按钮 | 否 | `links` |
| `chooseVCardButton` | 虚拟牌按钮 | 否 | `links` |
| `choosePlayerCard` | 他人的牌 | 否 | `links`、`cards` |
| `chooseToGive` | 自己的牌 | 是，交牌 | `bool`、`cards` |
| `chooseToDiscard` | 自己的牌 | 是，弃牌 | `bool`、`cards` |
| `discardPlayerCard` | 他人的牌 | 是，弃牌 | 按钮/牌结果 |
| `gainPlayerCard` | 他人的牌 | 是，获得 | 按钮/牌结果 |
| `chooseUseTarget` | 指定牌的目标 | 是，使用牌 | 使用结果 |
| `chooseToUse` | 可用牌/技能及目标 | 是，使用牌 | 使用结果 |
| `chooseToRespond` | 响应牌/技能 | 是，响应 | 响应结果 |
| `chooseToCompare` | 拼点牌 | 是，拼点 | 拼点结果 |
| `chooseToMove_new` | 分组/排序 | 否 | `bool`、`moved` |
| `chooseToGuanxing` | 牌堆顶/底 | 是，移动牌堆 | `bool`、`moved` |
| `chooseDrawRecover` | 摸牌/回复 | 是 | `control`、`index` |
| `chooseSkill` | 技能 ID | 否 | `bool`、`skill` |
| `chooseToEnable` | 装备栏 | 是，恢复栏位 | `links` 或 `control` |
| `chooseToDisable` | 装备栏 | 是，废除栏位 | `links` 或 `control` |

### 12. 本文边界与源码入口

本文不展开联机/OL 选择、辩论、对策、猜拳、节奏谱、协作等模式或玩法专用接口，也不讲自定义 DOM/Dialog、皮肤、音效及动画。

遇到陌生选择接口时，按以下顺序查源码：

1. `player.js`：参数如何按类型解析、设置了哪些默认值。
2. `content.js`：界面、AI、结果字段以及是否执行真实动作。
3. `ai/basic.js`：普通候选选择算法。
4. 实际武将调用点：参数形状与结果怎样被业务代码使用。

主要源码入口：

- `noname/library/element/player.js`
- `noname/library/element/content.js`
- `noname/library/element/gameEvent.js`
- `noname/ai/basic.js`
- `noname/get/index.js`
- `src/noname/library/element/Player/type.d.ts`
- `src/typings/Result.d.ts`


---

<a id="part-player-rules"></a>

## 第二章 Player 高频规则 API

> 适用基线：本地无名杀 `1.11.5`。本篇是高频规则速查，不追求覆盖 `Player` 的全部方法；交互选择请看[选择与交互篇](#part-player-choice)。

### 1. 查询与动作要分开

Player API 大致分为两类：

- **查询**：立即返回布尔值、数字、数组或对象，如 `countCards`、`hasSkill`、`getHistory`。
- **动作**：创建 `GameEvent` 并进入事件链，如 `draw`、`damage`、`gain`、`useCard`。

异步技能中，动作事件通常应等待：

```js
async content(event, trigger, player) {
  if (player.isDamaged()) await player.recover();
  await player.draw(2);
}
```

如果后续逻辑依赖动作完成后的区域、体力或历史状态，就不要遗漏 `await`。

### 2. 角色与存活状态

| API | 返回/作用 | 常见用途 |
| --- | --- | --- |
| `isIn()` | 是否仍在游戏内且可作为通常角色处理 | 目标结算前复查 |
| `isAlive()` / `isDead()` | 存活/死亡状态 | 死亡相关逻辑 |
| `isDying()` | 是否处于濒死状态 | 救援或濒死限制 |
| `isDamaged()` | `hp < maxHp` | 是否可获得通常回复收益 |
| `isHealthy()` | 通常指未受伤 | 回复分支判断 |
| `getHp(raw)` | 默认把负体力按 0 返回；传 `true` 读取原始 `hp` | 濒死值计算时注意是否需要负数 |
| `getDamagedHp()` | 已损失体力值 | `maxHp - hp` 类需求 |
| `isTurnedOver()` | 是否翻面 | 翻面收益/代价判断 |
| `isLinked()` | 是否横置 | 属性伤害连环判断 |
| `isPhaseUsing()` | 是否处于自己的出牌阶段 | 阶段内限制 |

直接读 `player.hp`、`player.maxHp` 没有错，但当引擎提供专用判断时，优先用专用方法表达规则意图。

### 3. 阵营、友方与座次

| API | 说明 |
| --- | --- |
| `getFriends(func, includeDie)` | 获取当前模式规则下的友方；通常不含自己，`func === true` 时包含自己 |
| `getEnemies(func, includeDie)` | 获取当前模式规则下的敌方 |
| `getPrevious()` / `getNext()` | 上家/下家 |
| `getSeatNum()` | 座次编号 |
| `distanceTo(target, method)` | 从自己到目标的距离 |
| `inRange(target)` | 自己的攻击范围是否覆盖目标 |
| `inRangeOf(target)` | 自己是否在目标的攻击范围内 |

判断友方时推荐：

```js
if (player.getFriends().includes(target)) {
  // 当前模式规则认定的友方
}
```

不要把 `get.attitude(player, target) > 0` 当作硬规则阵营判断；态度是 AI 评价，会受身份推断、疯狂状态和修正函数影响。

### 4. 牌区查询

#### 4.1 高频读取

| API | 说明 |
| --- | --- |
| `getCards(position, filter)` | 返回指定区域中符合条件的实体牌数组 |
| `countCards(position, filter)` | 计数，不需要牌对象时优先使用 |
| `hasCard(filter, position)` | 是否存在符合条件的实体牌 |
| `getVCards(position, filter)` | 返回虚拟牌视角的数据，适合装备合并牌等场景 |
| `hasVCard(filter, position)` | 是否存在符合条件的虚拟牌 |
| `getEquip(nameOrSubtype)` | 获取装备区实体牌 |
| `getVEquip(nameOrSubtype)` | 获取装备区虚拟牌 |
| `getVEquips(subtype)` | 按装备副类型、槽位、牌名或装备对象获取虚拟装备列表 |
| `getExpansions(tag)` | 获取扩展区中带指定 gaintag 的牌 |

```js
const redCards = player.getCards("he", card => get.color(card, player) === "red");
if (player.countCards("h", "sha") > 0) {
  // 至少有一张当前规则视角下的【杀】
}
```

实体牌与虚拟牌不是同一概念。合并装备、转化牌或 `VCard` 场景应先确认下游接口需要哪一种。

#### 4.2 可弃置、可获得与手牌上限

| API | 说明 |
| --- | --- |
| `countDiscardableCards(player, position, filter)` | `target.countDiscardableCards(player, ...)`：计算 `player` 能从 `target` 区域弃置的牌数 |
| `countGainableCards(player, position, filter)` | `target.countGainableCards(player, ...)`：计算 `player` 能从 `target` 区域获得的牌数 |
| `getHandcardLimit()` | 当前手牌上限 |
| `needsToDiscard(add, filterCard)` | 当前是否需要弃牌及相关数量语义 |

“目标有牌”不等于“这张牌可被你弃置/获得”。技能受 `mod` 或保护效果影响时，应使用可弃/可得查询。

### 5. 用牌合法性与装备栏

| API | 说明 |
| --- | --- |
| `canUse(card, target, distance, includecard)` | 当前是否能对目标使用指定牌 |
| `hasUseTarget(card, distance, includecard)` | 是否至少存在一个合法使用目标 |
| `hasValueTarget(card, distance, includecard)` | 是否存在 AI 认为有正收益的目标；这是评价，不是纯规则判断 |
| `canCompare(target)` | 是否能与目标拼点 |
| `canEquip(card, replace)` | 是否能装备该牌 |
| `hasEnabledSlot(...)` | 是否有可用装备栏 |
| `hasDisabledSlot(...)` | 是否有已废除装备栏 |

```js
const virtualSha = { name: "sha", isCard: true };
if (player.hasUseTarget(virtualSha)) {
  await player.chooseUseTarget(virtualSha, true);
}
```

不要只用距离和牌名自行拼装合法性。`canUse` 会综合卡牌规则、目标、距离和 `mod`；是否计次数等细节仍取决于具体调用参数和事件上下文。

### 6. 牌与体力动作

#### 6.1 常用牌移动

| API | 动作 |
| --- | --- |
| `draw(num)` | 从牌堆摸牌 |
| `gain(cards, source, method)` | 获得牌 |
| `give(cards, target, visible)` | 将牌交给目标 |
| `discard(cards)` | 弃置牌 |
| `lose(cards, position, visible)` | 将牌移出原区域至指定位置 |
| `addToExpansion(cards, source, method)` | 将牌置于扩展区 |
| `equip(card)` | 装备牌 |

`gain`、`give`、`discard`、`lose` 的动画参数不等于规则来源。涉及“因获得/弃置/失去”等触发时，应使用能表达真实移动语义的标准事件。

扩展区常用写法：

```js
const next = player.addToExpansion(cards, player, "give");
next.gaintag.add("my_skill");
await next;
```

注意：

- `"give"` 主要控制可见的移动表现，不会自动替你定义技能标签。
- `gaintag` 要在事件结算前加到返回事件上。
- 读取用 `player.getExpansions("my_skill")`。
- 技能移除、角色死亡或状态结束时如何处理扩展牌，必须在技能生命周期中明确。

#### 6.2 体力与伤害

| API | 动作 | 关键区别 |
| --- | --- | --- |
| `damage(...)` | 造成伤害 | 有伤害来源、属性和完整伤害事件链 |
| `recover(num, source)` | 回复体力 | 受回复规则影响 |
| `loseHp(num)` | 失去体力 | 不是伤害，不触发伤害类时机 |
| `changeHp(num)` | 直接改变体力 | 使用前确认是否符合所需规则语义 |
| `gainMaxHp(num)` | 增加体力上限 | 与回复分离 |
| `loseMaxHp(num)` | 减少体力上限 | 可能连带影响当前体力状态 |

不要为“失去体力”调用 `damage`，也不要为了绕过伤害流程改用 `changeHp`。API 的事件语义决定其他技能能否响应。

### 7. 使用牌、技能与阶段

| API | 说明 |
| --- | --- |
| `useCard(card, cards, targets, skill)` | 建立真实使用牌事件 |
| `useSkill(skill, cards, targets)` | 建立使用技能事件 |
| `skip(eventName)` | 跳过某个阶段 |
| `insertPhase(skill, insert)` | 插入额外阶段 |
| `phaseUse()` | 创建出牌阶段事件；修改阶段流时应谨慎 |
| `turnOver()` | 翻面/复原 |
| `link()` | 横置/重置 |

直接 `useCard` 要保证实体牌、虚拟牌、目标、计数和来源技能的关系正确。能通过 `chooseToUse`、`chooseUseTarget` 或声明式 `viewAs` 完成时，通常更容易保留标准流程。

### 8. 技能查询

#### 8.1 `getSkills`、`hasSkill`、`hasSkillTag`

| API | 说明 |
| --- | --- |
| `getSkills(arg1, arg2, arg3, arg4)` | 按参数获取角色当前技能；是否包含隐藏、装备、禁用等需看调用参数 |
| `hasSkill(skill, arg2, arg3, arg4)` | 当前是否具有并可按参数计入该技能 |
| `hasSkillTag(tag, hidden, arg, globalskill)` | 是否有提供某个技能标签的技能，并执行标签过滤 |

`hasSkillTag` 是 AI 与部分规则消费者查询能力的入口；标签只应声明真实存在的能力，资源不足时用 `skillTagFilter` 返回 `false`。详见[技能 AI 模块教学](#part-skill-ai)。

#### 8.2 `getStockSkills()`：当前源码是复数

当前本地源码不存在单数 `getStockSkill`；正确 API 是：

```js
player.getStockSkills(unowned, unique, hidden);
```

它从角色当前武将牌的 `name`、`name1`、`name2` 对应武将数据中汇总固有技能。

| 参数 | 默认假值时 | 传 `true` 时 |
| --- | --- | --- |
| `unowned` | 只保留角色当前确实拥有的固有技能 | 也保留当前未拥有/已失去的固有技能 |
| `unique` | 排除 `unique`、`temp`、`sub`、`charlotte` 等特殊技能 | 不做这一轮排除 |
| `hidden` | 不读取未明置武将牌的技能 | 也读取隐藏武将牌技能 |

常见写法：

```js
// 读取武将牌登记的全部固有技能，常用于重置、选择或比较
const skills = player.getStockSkills(true, true);

// 连隐藏武将牌也计入
const allStockSkills = player.getStockSkills(true, true, true);
```

相关 API：`getHiddenSkills(unowned, unique)` 返回隐藏武将牌相对当前可见固有技能的差集。

“固有技能”不等于“当前全部技能”：临时技能、装备技能、全局技能和额外获得的技能不应混为一谈。

### 9. 增删、临时与附加技能

| API | 说明 | 生命周期责任 |
| --- | --- | --- |
| `addSkill(skill)` | 直接获得技能 | 调用方决定何时移除 |
| `removeSkill(skill)` | 移除技能 | 会走技能移除清理；仍需正确写 `onremove` |
| `addTempSkill(skill, expire)` | 临时获得技能 | 按指定事件过期；添加时点不会追溯已发生的过期事件 |
| `addAdditionalSkill(key, skills, keep)` | 以来源键登记附加技能，立即变更 | 用同一 `key` 管理替换/清理 |
| `addAdditionalSkills(key, skills, keep)` | 事件化的复数版本 | 异步流程中可等待其变更事件 |
| `removeAdditionalSkill(key, target)` | 移除指定来源的附加技能 | 避免误删由其他来源同时提供的技能 |
| `disableSkill(reason, skills)` | 以原因禁用技能 | 之后用同一原因恢复 |
| `enableSkill(reason)` | 移除对应禁用原因 | 不等于重新添加技能 |
| `awakenSkill(skill)` / `restoreSkill(skill)` | 标记觉醒/恢复觉醒状态 | 仅用于对应规则 |

同一个技能可能由多个来源提供。需要“跟随来源存在”的技能时，附加技能机制通常比裸 `addSkill/removeSkill` 更安全。

### 10. `addSkillBlocker`：注册技能阻断器

#### 10.1 它实际做什么

```js
player.addSkillBlocker(blockerSkillId);
```

该方法只把“阻断器技能 ID”登记到 `player.storage.skill_blocker`。之后引擎过滤角色技能时，会对候选技能调用阻断器技能的：

```js
skillBlocker(skill, player) {
  // 返回 true：该候选 skill 被阻断
  // 返回 false：不阻断
}
```

它不会删除候选技能，也不会自动替你写判断条件。

#### 10.2 标准闭环

```js
const skill = {
  charlotte: true,
  init(player, skill) {
    player.addSkillBlocker(skill);
  },
  onremove(player, skill) {
    player.removeSkillBlocker(skill);
  },
  skillBlocker(skill, player) {
    if (skill === "my_blocker") return false;
    const info = get.info(skill);
    return !!info && !info.charlotte;
  },
};
```

职责分工：

1. `init` 调用 `addSkillBlocker` 注册阻断器。
2. `skillBlocker` 对每个候选技能返回是否阻断。
3. `onremove` 调用 `removeSkillBlocker` 清理注册。

#### 10.3 与其他机制的区别

| 机制 | 效果 |
| --- | --- |
| `removeSkill` | 真正移除技能及其来源状态 |
| `disableSkill` | 按原因禁用指定技能，可恢复 |
| `addSkillBlocker` | 注册一个动态过滤器；候选技能仍存在，但在过滤结果中可能不可用 |

阻断条件应尽量窄，并明确这些边界：是否阻断自身、`charlotte` 技能、装备技能、规则技能、锁定技、隐藏技及新增技能。广泛阻断可能影响引擎规则和其他扩展。

### 11. storage、标记与自动数组

| API | 说明 |
| --- | --- |
| `getStorage(skill)` | 安全取得该键存储；常用于数组型 storage |
| `markSkill(skill)` / `unmarkSkill(skill)` | 显示/移除技能标记 UI |
| `addMark(mark, num, log)` | 增加数值标记 |
| `removeMark(mark, num, log)` | 移除数值标记 |
| `countMark(mark)` | 读取数值标记 |
| `markAuto(skill, info)` | 把元素并入数组型 storage 并更新标记 |
| `unmarkAuto(skill, info)` | 从数组型 storage 移除元素并更新标记 |

```js
player.markAuto("my_skill", [target]);
const targets = player.getStorage("my_skill");
player.unmarkAuto("my_skill", [target]);
```

标记 UI、`storage` 数据和技能本身是三层不同状态。删除其中一层不会必然清掉其他层。技能结束时应明确：

- 数据保存在哪里；
- 标记何时刷新/移除；
- 技能移除、角色死亡、阶段结束后是否保留；
- 存储的是 Player/Card 对象还是稳定 ID；
- 是否需要 `onremove` 清理。

### 12. gaintag

| API | 说明 |
| --- | --- |
| `addGaintag(cards, tag)` | 给角色区域内指定牌附加获得标签 |
| `removeGaintag(tag, cards)` | 移除指定标签 |
| `getExpansions(tag)` | 在扩展区按标签取牌 |

gaintag 跟随牌的移动规则由引擎事件决定，不应把它当作永久的卡牌属性。检查“本次移动前是否带标签”时，通常应读取对应 `lose`/移动事件保留的信息，而不是只检查牌当前状态。

### 13. 历史记录

#### 13.1 三个范围

| API | 典型范围 |
| --- | --- |
| `getHistory(type, filter, last)` | 当前行动历史块，通常围绕当前回合/行动段 |
| `getRoundHistory(type, filter, num, keep, last)` | 当前或此前若干轮的历史 |
| `getAllHistory(type, filter, last)` | 整局累计行动历史 |

常见 `type` 包括 `useCard`、`respond`、`gain`、`lose`、`damage`、`sourceDamage`、`useSkill`、`custom`。实际字段来自对应事件，使用前应在源码或真实事件中确认。

```js
const usedSha = player.getHistory("useCard", evt => evt.card?.name === "sha").length;
const dealtDamage = player.getHistory("sourceDamage", evt => evt.player?.isIn()).length;
```

#### 13.2 选择正确时间窗口

“本回合”“本轮”“整局”“上一次自己的回合”不是同一个范围。不要为了方便一律使用 `getAllHistory`，否则限制技、每回合计数或 AI 会把旧事件算进去。

`hasHistory(type, filter, last)` 适合只关心是否发生过；只需布尔值时比取数组再判断长度更清晰。

当前回合主动技次数还可读取 `getStat("skill")`，卡牌使用次数可读 `getStat("card")`；它们和完整历史事件承担的用途不同。

### 14. 装备栏与状态动作

| API | 作用 |
| --- | --- |
| `disableEquip(...)` | 废除装备栏 |
| `enableEquip(...)` | 恢复装备栏 |
| `equip(card)` | 装备一张牌 |
| `turnOver()` | 改变翻面状态 |
| `link(state)` | 改变横置状态 |

需要玩家交互选择栏位时，使用 `chooseToEnable`/`chooseToDisable`；它们会完成真实栏位改变，见[选择与交互篇](#part-player-choice)。

### 15. 高频检查表

- 查询方法与动作事件是否混淆？
- 后续逻辑依赖动作结果时是否 `await`？
- 是否用 `canUse`/可弃可得接口完整检查规则，而非只检查牌数？
- 是否区分实体牌、虚拟牌和扩展区牌？
- 伤害、失去体力、直接改体力是否选对事件语义？
- 临时技能、附加技能、禁用技能和阻断技能是否选对机制？
- `addSkillBlocker` 是否在 `onremove` 对称清理？
- `storage`、mark、gaintag 和实际技能是否都有生命周期？
- 历史查询是否使用了正确的回合/轮次/整局窗口？
- 所谓 `getStockSkill` 是否已更正为实际存在的 `getStockSkills()`？

源码入口：

- `noname/library/element/player.js`
- `noname/game/index.js`（技能过滤）
- `noname/get/is.js`（阻断判定）
- `src/noname/library/element/Player/type.d.ts`


---

<a id="part-get-api"></a>

## 第三章 get 相关 API

> 适用基线：本地无名杀 `1.11.5`。本文收录武将技能最常查询的 `get` API，重点是牌面、上下文、牌堆、翻译和 AI 评价；不做 `get` 全量百科。

### 1. `get` 是什么

`get` 主要提供“从当前规则与事件上下文中取得信息”的函数。它并非全是纯函数：

- `get.name`、`get.suit` 等可能读取角色和 `mod`；
- `get.attitude`、`get.effect` 会读取 AI 状态与技能；
- `get.cards` 会直接从牌堆取出牌；
- `get.event`、`get.player` 依赖当前事件。

因此使用 `get` 时要问三个问题：

1. 需要原始牌面，还是当前规则修正后的牌面？
2. 需要规则合法性，还是 AI 评价？
3. 该函数只是读取，还是会改变牌堆/缓存/上下文？

### 2. 牌面信息

#### 2.1 高频速查

| API | 返回 | 说明 |
| --- | --- | --- |
| `get.name(card, player)` | 牌名 | 手牌或显式传 Player 时可能应用 `cardname` 修正 |
| `get.suit(card, player)` | 花色 | 可能应用 `suit`/`cardsuit` 修正 |
| `get.color(card, player)` | 颜色 | 由花色或组成牌推导；混合颜色通常为 `none` |
| `get.number(card, player)` | 点数 | 可能应用 `cardnumber` 修正 |
| `get.nature(card, player)` | 属性字符串 | 多属性以 `lib.natureSeparator` 连接 |
| `get.natureList(card, player)` | 属性数组 | 处理多属性时更方便 |
| `get.type(card, method, player)` | 类型 | 如 `basic`、`trick`、`delay`、`equip` |
| `get.type2(card, player)` | 归并后的类型 | 将延时锦囊 `delay` 归入 `trick` |
| `get.subtype(card, player)` | 副类型 | 常见如 `equip1`、`equip2` |

```js
const red = get.color(card, player) === "red";
const isTrickFamily = get.type2(card, player) === "trick";
const isWeapon = get.subtype(card, player) === "equip1";
```

#### 2.2 第二个参数 `player` 与 `false`

这组 API 的第二个参数很重要：

- 传 Player：以该角色的规则视角计算牌面修正。
- 省略：对手牌等场景可能自动找到牌的持有者并应用修正。
- 传 `false`：明确要求读取未经过角色 `mod` 的原始牌面。

```js
const currentName = get.name(card, player);
const printedName = get.name(card, false);

const currentSuit = get.suit(card, player);
const originalSuit = get.suit(card, false);
```

什么时候传 `false` 取决于技能文本。若写“此牌当前视为……”通常要尊重修正；若规则明确检查牌的原始属性，则应读取 raw 值。不要为了方便一律传 `false`。

#### 2.3 组合牌的返回边界

- 多张组成牌花色不同时，`get.suit` 可能得到 `none`。
- 多张牌颜色不一致时，`get.color` 返回 `none`。
- 多张牌点数无法归一时，`get.number` 可能返回 `null`。
- 虚拟牌自身可携带 `name`、`nature`、`cards` 等信息。

不要假设所有牌面函数永远返回普通字符串/数字；筛选器应允许 `none`、`null`、`undefined` 或 `unsure`。

### 3. 牌、技能与对象信息

#### 3.1 `get.info(item, player)`

获取技能或卡牌定义：

```js
const skillInfo = get.info("my_skill");
const cardInfo = get.info(card, player);
```

- 字符串/符号按技能 ID 从 `lib.skill` 读取。
- 牌对象按当前牌名从 `lib.card` 读取。
- 不要在高频循环里反复取得并深改返回对象；这是注册表中的定义，不是该角色独享副本。

常见用途：

```js
const info = get.info(skill);
if (info && info.charlotte) {
  // 特殊内部技能
}
```

#### 3.2 `get.itemtype(obj)`

识别无名杀运行时对象的语义类型，比只用 `typeof` 更有用。常见返回包括：

- `player`、`players`
- `card`、`cards`、`vcard`
- `event`
- `button`、`dialog`
- `select`
- `position`

```js
if (get.itemtype(value) === "player") {
  // value 是 Player
}
```

它不是 TypeScript 类型守卫的完整替代，也不保证任意第三方对象都能被准确分类。

#### 3.3 `get.autoViewAs(card, cards, owner)`

把牌面描述与组成实体牌转换为 `VCard`：

```js
const vcard = get.autoViewAs(
  { name: "sha", nature: "fire" },
  [materialCard],
  player
);
```

参数：

- `card`：牌、VCard 或 `{ name, nature, ... }` 数据。
- `cards`：组成该虚拟牌的实体牌。
- `owner`：计算牌面时参考的角色；也可传 `false`。

当前代码优先使用 `get.autoViewAs`；旧的 `get._autoViewAs` 已标记为弃用。

### 4. 区域与持有者

#### 4.1 `get.position(card, ordering)`

常见返回值：

| 值 | 区域 |
| --- | --- |
| `h` | 手牌区 |
| `e` | 装备区 |
| `j` | 判定区 |
| `x` | 扩展区 |
| `c` | 牌堆 |
| `d` | 弃牌堆 |
| `s` | 特殊区/特殊手牌状态 |
| `o` | 处理区（仅 `ordering === true` 时保留） |
| `null`/`undefined` | 无法确定 |

一个容易忽略的点：处理区在默认调用中按 `d` 返回；只有 `get.position(card, true)` 才返回 `o`。

```js
if (get.position(card, true) === "o") {
  // 当前确实处于处理区
}
```

#### 4.2 `get.owner(card, method)`

查找实体牌当前归属的角色，范围包含存活与死亡角色的手牌、装备、判定和扩展区域。没有角色持有时返回 `undefined`。

```js
const owner = get.owner(card);
if (owner) {
  // card 当前在 owner 的角色区域内
}
```

这不是“牌的历史来源”。牌已进入牌堆、弃牌堆或处理区后，`get.owner` 不会替你找出它之前属于谁；历史来源应从移动事件读取。

### 5. 选择范围标准化

#### `get.select(select)`

把常见选择数量统一成 `[min, max]`：

```js
get.select(1);          // [1, 1]
get.select([1, 2]);     // [1, 2]
get.select(() => 2);    // [2, 2]
get.select(undefined);  // [1, 1]
```

适合读取技能/卡牌的 `selectCard`、`selectTarget` 等动态字段。它只做形状归一化，不检查当前候选数量，也不执行合法性判断。

### 6. 距离

#### `get.distance(from, to, method)`

计算角色间距离。默认结果会考虑座次、移出游戏状态、部分技能 `mod` 与装备距离修正。

```js
const globalDistance = get.distance(player, target);
const attackDistance = get.distance(player, target, "attack");
```

- 默认：通常的全局距离，最低返回 1（自己到自己为 0）。
- `attack`：在全局距离基础上继续应用攻击距离修正。
- `raw`、`pure`、`absolute`、`unchecked` 属于不同层次的低级距离视角；除非技能规则明确要求跳过哪些修正，否则不要随意使用。

若只关心一名角色能否攻击到目标，优先用 `player.inRange(target)`；若要判断某张牌是否可使用，优先用 `player.canUse(card, target)`。

### 7. 当前事件上下文

| API | 返回 |
| --- | --- |
| `get.event()` | 当前 `_status.event` |
| `get.player()` | 当前事件的 `player` |
| `get.mode()` | 当前模式 ID |
| `get.card(original)` | 当前选择上下文的牌/VCard |

它们适合声明式回调中读取当前上下文：

```js
filterTarget(card, player, target) {
  const event = get.event();
  return target !== player && event.name === "chooseTarget";
}
```

但显式参数通常更稳妥。异步跨越多个子事件后，“当前事件”可能已改变；不要把 `get.event()` 当作固定指向最初技能事件的全局变量。

### 8. 翻译与提示

| API | 作用 |
| --- | --- |
| `get.translation(value, arg)` | 翻译技能、角色、牌、数组等 |
| `get.skillInfoTranslation(skill, player, noHTML)` | 获取技能描述；可应用动态翻译 |
| `get.prompt(skill, target, player)` | 生成“是否发动【技能】？”提示 |
| `get.prompt2(skill, target, player)` | 主提示加技能描述，使用 `###` 分隔格式 |
| `get.cnNumber(num, ordinal)` | 转换中文数字/序数表达 |

```js
const prompt = get.prompt2(event.skill, target, player);
const name = get.translation(target);
```

`get.skillInfoTranslation` 默认去除 HTML。需要保留格式时传 `false`，但不要把未经控制的 HTML 直接拼进自定义界面。

### 9. 牌堆与弃牌堆

#### 9.1 `get.cards(num, putBack)`

从牌堆顶取出若干实体牌：

```js
const cards = get.cards(3);       // 从牌堆移出三张
const peek = get.cards(3, true);  // 取出后按原顺序放回牌堆顶
```

关键语义：

- 默认 `num = 1`。
- 牌堆为空时可能洗牌；仍无牌时可能结束游戏。
- `putBack !== true` 时，返回的牌已经被直接从牌堆 DOM 中取出。
- 它不是一个可等待的标准 Player 牌移动事件。

取出的牌最终必须进入明确区域。若技能只需摸牌，直接用 `player.draw`；若需要展示、分配或置顶/置底，应使用对应标准事件，避免留下无归属牌。

#### 9.2 `get.cardPile`、`get.cardPile2`、`get.discardPile`

```js
get.cardPile(pattern, position, start);
get.cardPile2(pattern, start);
get.discardPile(pattern, start);
```

`pattern` 可为：

- 牌名字符串；
- 属性对象；
- `(card) => boolean` 过滤函数；
- `true`，表示任意牌。

`start` 可为 `top`、`bottom`、`random`。

范围区别：

| API | 搜索范围 |
| --- | --- |
| `get.cardPile(...)` | 默认先牌堆后弃牌堆；可用 `position` 限定或扩展 |
| `get.cardPile2(...)` | 只搜索牌堆 |
| `get.discardPile(...)` | 只搜索弃牌堆 |

它们只返回找到的实时 Card 节点，不会自动把牌从原区域移走。后续应通过 `gain`、`lose` 等标准事件完成移动。

```js
const card = get.cardPile2(card => get.type2(card, false) === "trick");
if (card) await player.gain(card, "gain2");
```

`get.cardPile(pattern, true, start)` 还支持找不到时创建牌的回退语义，属于低级用法；常规武将技能不应在无明确规则时凭空创建牌。

### 10. 卡牌 AI 基础值

#### 10.1 `get.value(card, player, method)`

估计角色保留/拥有该牌的价值。常用于弃牌、交牌、失去牌时的 AI：

```js
ai(card) {
  return 8 - get.value(card, player);
}
```

值越高通常越不愿失去。它会读取卡牌 `ai.value` 或 `ai.basic.value`，并考虑同名牌序号和 `aiValue` 修正。牌数组会以特殊聚合方式计算，不是简单求和。

`method === "raw"` 可取数组型配置的首项；只在确实需要忽略同名牌边际变化时使用。

#### 10.2 `get.useful(card, player)`

估计当前手牌中这张牌的实用度，尤其会考虑第几张同名牌。常用于弃牌优先级；装备区牌会转用装备价值，判定区牌通常为负值。

`useful` 与 `value` 相关但不相同：

- `value`：持有/失去这张牌的总体价值。
- `useful`：当前手牌结构中这张牌作为第 N 张同名牌的边际实用度。

#### 10.3 `get.order(item, player)`

读取卡牌或技能的行动优先级，来源是 `ai.order` 或 `ai.basic.order`，并应用 `aiOrder` 修正。没有配置时返回 `-1`。

```js
const shaOrder = get.order({ name: "sha" }, player);
```

`order` 只回答“相对什么时候做”，不回答“做了是否有收益”；收益应由 `result`/`effect` 决定。

### 11. 态度、威胁与效果

#### 11.1 `get.attitude(from, to)`

返回 `from` 对 `to` 的 AI 态度：

- 正数：倾向帮助。
- 负数：倾向敌对。
- 接近 0：中立、不确定或不值得介入。

```js
ai(target) {
  return -get.attitude(player, target);
}
```

它不只是固定阵营值：当前源码还会处理真实操控者、疯狂状态以及 `modAttitudeFrom`/`modAttitudeTo`。因此：

- 用它给 AI 评分；
- 不要用它作为“只能选择友方/敌方”的硬规则过滤。

硬规则关系可用 `player.getFriends().includes(target)` 等模式 API。

#### 11.2 `get.threaten(target, player, hp)`

汇总目标各技能 `ai.threaten` 的乘积，得到威胁倍率。`hp === true` 时还会按低体力、少手牌调整。

它是 AI 权重，不是伤害值，也不等于态度。高威胁友方仍然是友方。

#### 11.3 `get.effect` 与 `get.effect_use`

```js
get.effect(target, card, player, viewer, linking);
get.effect_use(target, card, player, viewer, linking);
```

参数：

| 参数 | 含义 |
| --- | --- |
| `target` | 被作用的目标；无目标行为可省略 |
| `card` | 牌、VCard、技能 ID，或可由当前事件推断的对象 |
| `player` | 发动/使用者；默认当前事件玩家 |
| `viewer` | 从谁的立场评估；默认与 `player` 相同 |
| `linking` | 连环传导内部上下文；一般调用不传 |

返回数值越高，表示对 `viewer` 越有利。

```js
ai(target) {
  return get.effect(target, { name: "damage" }, player, player);
}
```

二者都会综合卡牌/技能的 `ai.result`、双方技能 `ai.effect`、态度、威胁、体力手牌状态及属性伤害连环影响。区别是 `effect_use` 在“使用牌/技能”的场景优先读取 `player_use`、`target_use`；为出牌阶段选择目标时通常更贴近实际使用评价。

不要把 effect 分数直接当作实际造成的伤害、摸牌数或成功概率。

#### 11.4 `get.damageEffect` 与 `get.recoverEffect`

```js
get.damageEffect(target, source, viewer, nature);
get.recoverEffect(target, source, viewer);
```

- `damageEffect` 用伪卡牌 `damage`/`firedamage`/`thunderdamage`/`icedamage` 调用效果系统，并考虑护甲等因素。
- `recoverEffect` 对满体力目标直接返回 0，否则用 `recover` 评价。

它们适合简单的目标评分：

```js
ai(target) {
  return get.damageEffect(target, player, player, "fire");
}
```

复杂技能若还会弃牌、翻面、获得技能等，应把各部分收益显式组合，而不是假装成一次普通伤害。

### 12. 标签：`get.tag`

```js
get.tag(item, tag, item2, bool);
```

读取卡牌/技能定义 `ai.tag[tag]` 的值或函数结果，例如 `damage`、`recover`、`draw`、`natureDamage`。

```js
if (get.tag(card, "damage")) {
  // 该牌的 AI 标签表明它通常具有伤害效果
}
```

边界：

- `get.tag` 读取的是“该 item 定义的卡牌式 AI 标签”。
- `player.hasSkillTag(tag, ...)` 查询的是角色技能提供的能力标签。
- 标签是供引擎消费者快速判断的声明，不替代真实规则字段与事件结算。

完整标签表见[技能 AI 模块教学](#part-skill-ai)。

### 13. 常用组合

#### 13.1 选一个适合受到伤害的目标

```js
const result = await player
  .chooseTarget("选择一名角色", (card, player, target) => target !== player)
  .set("ai", target => get.damageEffect(target, player, player))
  .forResult();
```

#### 13.2 选低价值牌作为代价

```js
const result = await player
  .chooseCard("he", 1, true)
  .set("ai", card => 7 - get.value(card, player))
  .forResult();
```

#### 13.3 按当前规则检查牌面

```js
filterCard(card, player) {
  return get.type2(card, player) === "trick" && get.color(card, player) === "black";
}
```

#### 13.4 区分规则与 AI

```js
filterTarget(card, player, target) {
  return player.canUse({ name: "sha" }, target); // 规则合法性
},
ai(target) {
  return get.effect_use(target, { name: "sha" }, player, player); // AI收益
}
```

### 14. 常见误区

- `get.name(card)` 未必是卡牌印刷名；需要 raw 时传 `false`。
- `get.type` 会保留 `delay`，`get.type2` 才把延时锦囊归入 `trick`。
- `get.position(card)` 默认把处理区视为 `d`；判断处理区要传 `true`。
- `get.cards` 默认会把牌从牌堆取出，不是无副作用的查看。
- `get.cardPile2` 找到牌但不会自动移动牌。
- `get.attitude` 是 AI 态度，不是硬阵营规则。
- `get.value`、`get.useful`、`get.order`、`get.effect` 回答的是不同问题。
- `get.effect` 是综合 AI 分数，不是实际结算数值。
- `get.event()` 在子事件切换后不保证仍是你心里那一个事件。
- `get.info` 返回注册表定义，不应随意原地修改。

源码入口：

- `noname/get/index.js`
- `noname/get/is.js`
- `noname/library/element/player.js`


---

<a id="part-skill-ai"></a>

## 第四章 技能 AI 模块教学与标签索引

> 适用基线：本地无名杀 `1.11.5`。本篇以武将技能的 `ai` 字段为中心，索引依据当前 `SkillAI` 类型声明及本地源码消费者；扩展可以自行创造标签，因此“完整”指当前基线内可确认的字段，不代表未来版本或第三方扩展永远不新增。

### 1. AI 不等于规则

一个可靠技能通常有三层：

1. **规则层**：`trigger`、`filter`、`content`、`mod`、`viewAs` 等真正实现效果。
2. **交互层**：`filterCard`/`filterTarget` 决定能选什么，`ai`/`ai1`/`ai2` 决定人机倾向选什么。
3. **评价层**：技能顶层 `ai` 模块告诉通用 AI 如何理解收益、威胁、响应能力和效果修正。

```js
const skill = {
  enable: "phaseUse",
  usable: 1,
  filterTarget(card, player, target) {
    return target !== player; // 规则合法性
  },
  async content(event, trigger, player) {
    await event.target.damage(); // 真实效果
  },
  ai: {
    order: 7,
    result: {
      target: -1, // 告诉通用AI：对目标通常是负面效果
    },
    tag: {
      damage: 1,
    },
  },
};
```

只写 `ai.result.target = -1` 不会造成伤害；只写 `filterTarget` 也不会让 AI 明白技能值得对谁使用。

### 2. 两种常见 `ai`

代码中“ai”一词常指不同层级：

#### 2.1 选择事件的 `ai`

这是一次具体交互的评分函数：

```js
const result = await player
  .chooseTarget("选择一名角色")
  .set("ai", target => get.damageEffect(target, player, player))
  .forResult();
```

它直接为候选对象打分，可以调用 `get.attitude`、`get.value`、`get.effect`。

#### 2.2 技能定义的 `ai: { ... }`

这是可被通用系统重复查询的元数据：

```js
ai: {
  order: 8,
  expose: 0.2,
  threaten: 1.5,
  result: { player: 1, target: -1 },
  effect: { target() {} },
  respondShan: true,
  skillTagFilter() {},
}
```

后文主要讲第二种。

#### 2.3 先按“消费者”区分回调

同样叫 `ai`，返回值协议可能完全不同。写回调前先确认是谁调用它：

| 所在位置 | 回调接收什么 | 应返回什么 | 引擎怎样使用 |
| --- | --- | --- | --- |
| `chooseCard().set("ai", ...)` | `card, cards?` | 数字分数 | 逐轮选择最高分的牌 |
| `chooseTarget().set("ai", ...)` | `target, targets?` | 数字分数 | 逐轮选择最高分的目标 |
| `chooseButton().set("ai", ...)` | `button, buttons?` | 数字分数 | 逐轮选择最高分的按钮 |
| `chooseControl().set("ai", ...)` | `parentEvent, player` | 选项下标或控制项字符串 | 直接决定最终控制项 |
| `chooseBool().set("ai", ...)` | `parentEvent, player` | 真/假意愿 | 直接决定确定或取消 |
| `chooseToMove_new.processAI` | 初始列表 | 完整二维分组 | 直接作为移动方案 |
| `chooseNumbers.processAI` | 选择事件 | 数字数组或 `false` | 直接作为数字方案 |
| 技能的 `ai.order/result/effect` | 由 `get.*` 消费者决定 | 价值、倍率或修正结构 | 进入通用行动评价 |

不能因为某个回调名为 `ai`，就默认它一定是“给每个候选打分”。

#### 2.4 普通牌、目标、按钮选择采用逐项贪心

当前 `ai.basic.chooseCard`、`chooseTarget`、`chooseButton` 的核心过程是：

1. 收集当前仍可选择的候选。
2. 对每个候选调用评分函数。
3. 选中这一轮分数最高的候选。
4. 重新执行 `game.check()`，再对更新后的候选进行下一轮评分。

它不是一次性枚举所有组合，因此多选结果是“每轮局部最高”的累计结果。若第二个候选的价值依赖第一个候选，评分函数必须读取当前事件或 `ui.selected` 所反映的已选状态，不能只按单张牌的固定价值排序。

分数与 `forced` 的关系如下：

| 状态 | 当前最高分大于 `0` | 当前最高分不大于 `0` |
| --- | --- | --- |
| 非强制 | 选择最高项 | 取消；若已达到最小数量则停止 |
| 强制且未达到最小数量 | 选择最高项 | 仍选择最高项，直到达到最小数量 |
| 强制且已达到最小数量 | 选择最高项 | 停止，不会为了上限继续拿负收益项 |

例如 `[1, 3]` 且 `forced: true` 时，AI 至少选一项；第一项以后若剩余最高分都不大于 `0`，可以只选一项。负分表达“不愿意”，不表达“规则禁止”；禁止选择必须写进 `filterCard`、`filterTarget` 或 `filterButton`。

#### 2.5 `chooseControl` 直接选，不比较分数

```js
const result = await player
  .chooseControl("摸牌", "回复", "cancel2")
  .set("ai", (event, player) => {
    return player.isDamaged() ? "回复" : "摸牌";
  })
  .forResult();
```

这里回调不会收到“摸牌”“回复”两个候选并各返回一个价值。它只调用一次，返回：

- `0`、`1` 等数字：作为选项下标；
- `"摸牌"`、`"回复"` 等字符串：作为最终控制项。

取消由选项集合决定。普通 `chooseControl` 可显式加入 `"cancel2"`；`chooseControlList({ forced: false })` 会加入取消项，`forced: true` 则不加入。最终主要读取 `result.control` 和 `result.index`。

#### 2.6 `chooseButton` 要先翻译 `button.link`

`chooseButton` 仍采用逐按钮评分，但 AI 接收的是 `Button`，业务数据在 `button.link`：

```js
.set("ai", button => {
  const link = button.link;
  if (link === "recover" && player.isDamaged()) return 2;
  return link === "draw" ? 1 : 0;
})
```

`link` 可能是实体牌、虚拟牌描述、角色 ID、技能 ID、数组或自定义对象。必须先从 `createDialog`、`dialog.add` 或实际调用点确认其形状，再计算价值。

技能定义中的声明式 `chooseButton: { dialog, filter, check, backup, prompt }` 是另一套协议：`check(button)` 负责按钮 AI，`backup(links, player)` 返回选中后的临时技能配置；它不是 `player.chooseButton()` 的参数对象。

#### 2.7 `get.*` 评价量只用于决策，不替代规则

| API | 回答的问题 | 常见用途 |
| --- | --- | --- |
| `get.attitude(from, to)` | `from` 当前怎样看待 `to` | 倾向帮助友方还是妨碍敌方 |
| `get.value(card, player)` | 这张牌由 `player` 持有时值多少 | 选代价牌、保留牌 |
| `get.effect(target, item, source, viewer)` | 从 `viewer` 立场看，`source` 对 `target` 施加 `item` 的综合收益 | 选择技能/牌的目标 |
| `get.effect_use(...)` | 在实际使用阶段，这次使用的综合收益 | 用牌目标 AI |
| `get.damageEffect(target, source, viewer, nature)` | 一次伤害对评估立场的综合收益 | 伤害目标 AI |
| `get.order(item, player)` | 该行动应多早被考虑 | 行动排序 |

这些函数会受身份态度、技能 AI、状态与上下文影响，不是规则事实。下面的过滤器写法不可靠：

```js
// 不要用态度决定规则上“能不能选”
filterTarget(card, player, target) {
  return get.attitude(player, target) < 0;
}
```

如果技能规则是“其他角色”，过滤器只写事实：

```js
filterTarget(card, player, target) {
  return target !== player && target.isIn();
},
ai: {
  // 主动技的通用收益在这里描述
  result: { target: -1 },
}
```

具体选择事件再用 `get.effect` 或 `get.attitude` 排序合法目标。这样真人操作、联机校验和 AI 托管共享同一套规则，不会因身份判断变化而改变合法范围。

### 3. `order`：什么时候发动

`ai.order` 是行动优先级：数值越高，AI 越倾向较早考虑。它也可以是函数：

```js
ai: {
  order(item, player) {
    if (player.hp <= 1) return 10;
    return 6;
  },
}
```

当前 `get.order(item, player)` 的读取顺序是：

1. 读取 `get.info(item).ai.order`。
2. 没有顶层 `order` 时，尝试 `ai.basic.order`。
3. 若值为函数，调用 `order(item, player)`。
4. 若 `item` 是对象，再经过 `aiOrder` 的 `mod` 修正。
5. 没有可用值时返回 `-1`。

这里的 `item` 可能是技能 ID、牌或虚拟牌对象，`player` 是准备行动的角色。动态函数应只依赖当前可见状态，并保持轻量：

```js
ai: {
  order(item, player) {
    const shaOrder = get.order({ name: "sha" }, player);
    return player.countCards("h") > player.hp ? shaOrder + 0.2 : shaOrder - 0.2;
  },
}
```

`order` 不代表收益。一个高优先级但 `result` 为负的技能仍可能不发动；一个收益很高但顺序错误的技能可能在资源已花掉后才被考虑。

常见设计思路：

- 先建立资源、摸牌、解除限制：较高。
- 常规输出：接近相应卡牌的 `get.order`。
- 收尾、弃置剩余资源：较低。
- 依赖血量、手牌、可用目标时用函数动态计算。

不要机械复制其他技能的数字；应比较同一行动序列里谁必须先做。

### 4. `result`：技能本身对双方的基础收益

#### 4.1 字段

```js
ai: {
  result: {
    player: 1,
    target: -1,
    player_use: 1,
    target_use: -1,
    keepAI: true,
  },
}
```

| 字段 | 含义 |
| --- | --- |
| `player` | 对发动者自身的基础收益 |
| `target` | 对目标的基础收益 |
| `player_use` | `get.effect_use` 场景优先采用的发动者收益 |
| `target_use` | `get.effect_use` 场景优先采用的目标收益 |
| `keepAI` | 特定卡牌默认 AI 合并逻辑的保留开关，普通技能很少需要 |

当前读取路径可以简化为：

```text
get.result(item, skill)
  ├─ get.effect(...)     读取 player / target
  └─ get.effect_use(...) 优先读取 player_use / target_use，再回退到 player / target
```

当前实现用 `player_use || player`、`target_use || target` 取值，因此直接写数值 `0` 会被视为没有 `_use` 覆盖；若 `_use` 分支需要根据上下文得到 `0`，可写返回 `0` 的函数，使字段本身保持为可调用值。

字段函数的实际调用形状为：

```js
player(player, target, card, linking) {}
target(player, target, card, linking) {}
player_use(player, target, card, linking) {}
target_use(player, target, card, linking) {}
```

- 第一个 `player`：本次牌或技能的发动者。
- `target`：本次被作用角色；无目标行动可能为空。
- `card`：被评价的牌、虚拟牌或技能表示。
- `linking`：连环伤害等递归评价携带的上下文，普通技能通常不必使用。

函数没有返回数字时，消费者按 `0` 处理。不要依赖 `undefined` 表达“禁止发动”；禁止发动属于技能的 `filter`、`filterTarget` 等规则字段。

数值惯例：

- 正数：对该角色有利。
- 负数：对该角色有害。
- 0：通常没有直接收益。

字段可以写函数：

```js
ai: {
  result: {
    player(player, target, card, linking) {
      return player.countCards("h") > 4 ? 1 : -0.5;
    },
    target(player, target, card, linking) {
      return target.isDamaged() ? 1 : 0;
    },
  },
}
```

可以把 `result` 理解为“效果对当事人本身的基础利弊”：

- 发动者摸牌：`player` 通常为正。
- 发动者弃牌或失去体力：`player` 通常为负。
- 目标摸牌/回复：`target` 通常为正。
- 目标受伤/弃牌：`target` 通常为负。

随后 `get.effect` 才从评估者立场乘入态度。忽略其他修正时，核心结构近似：

```text
总评价 = 发动者收益 × attitude(评估者, 发动者)
       + 目标收益   × attitude(评估者, 目标)
```

实际源码还会叠加双方技能的 `ai.effect`、威胁度、目标状态以及属性伤害连环传导，所以 `result` 的单位是相对 AI 价值，不是精确的“1点收益 = 1张牌”。

#### 4.2 不要在 `result.target` 里重复乘态度

`get.effect` 会在后续按评估者对双方的 `attitude` 合成收益。因此 `result.target` 通常写“效果对目标本人的利弊”，而不是“发动者喜不喜欢目标”。

```js
// 推荐：技能对目标是伤害型负收益
result: { target: -1 }

// 常见错误：把态度提前算入，后续 get.effect 又算一次
result: {
  target(player, target) {
    return -get.attitude(player, target);
  },
}
```

在具体 `chooseTarget` 的 `ai(target)` 里使用 `get.attitude` 或 `get.effect` 才是合适位置。

更稳妥的目标选择是直接复用完整评价：

```js
player
  .chooseTarget("选择技能目标", lib.filter.notMe)
  .set("ai", target => get.effect(target, "my_skill", player, player));
```

前提是 `my_skill.ai.result` 已正确描述技能效果。若这里只是简单“帮助一名角色”，也可以直接返回 `get.attitude(player, target)`。

#### 4.3 把代价算进去

技能“令目标摸两张牌”对目标是正收益，但若发动者还弃两张牌，`result.player` 不能无条件写正数。应把真实成本、次数限制、未来收益和失败风险纳入函数。

### 5. `effect`：修正别人对一张牌/技能的既有评价

`ai.effect` 不是主动技能自己的基础 `result`，而是“某角色拥有本技能时，其他行为的效果评价如何变化”。

```js
ai: {
  effect: {
    target(card, user, target, current) {
      if (get.tag(card, "fireDamage")) return 0;
    },
  },
}
```

上例只告诉 AI“火焰伤害对该目标无收益”；真正的火焰免疫必须由技能触发、`filter`、`mod` 或伤害事件实现。

#### 5.1 两个方向

| 字段 | 何时调用 |
| --- | --- |
| `effect.player(card, player, target, current)` | 技能持有者作为使用者/发动者时修正 |
| `effect.target(card, player, target, current)` | 技能持有者作为被作用目标时修正 |

当前运行时的 `get.effect_use` 还会优先寻找 `effect.player_use`、`effect.target_use`，没有时再回退到上表的 `player`、`target`。普通武将技能通常写通用的两项即可；只有“使用阶段评价”和一般效果评价确实不同、且已核对消费者时，才增加 `_use` 变体。

这里 `player` 是当前行为的使用者，`target` 是当前目标，不一定等于你写技能时心里固定的某个变量。

完整参数可按下面理解：

```js
effect: {
  player(card, player, target, current, linking) {},
  target(card, player, target, current, linking) {},
}
```

- `card`：正在评价的牌或技能表示。
- `player`：这次行为的发动者。
- `target`：这次行为的目标。
- `current`：进入本技能修正前，对技能持有者这一侧的基础收益。
- `linking`：连环传导等上下文。

`effect.target` 写在防御技上时，技能持有者通常就是传入的 `target`；但仍应使用参数判断，不要捕获某个固定外部变量。

#### 5.2 返回形式

对 `effect.target`，假设当前目标收益是 `n`，使用者收益是 `n2`：

| 返回 | 作用 |
| --- | --- |
| `a` | 目标收益变为 `a * n` |
| `[a, b]` | 目标收益变为 `a * n + b` |
| `[a, b, c, d]` | 目标为 `a * n + b`，使用者为 `c * n2 + d` |
| `zerotarget` | 将目标侧结果归零 |
| `zeroplayer` | 将使用者侧结果归零 |
| `zeroplayertarget` | 双方结果归零 |

对 `effect.player`，两侧顺序相反：数字或二项数组先修正使用者；四项数组的前两项修正使用者，后两项修正目标。

常见含义：

```js
return 0;          // 原效果对目标无效
return 0.5;        // 原效果约减半
return [0, 1];     // 原效果无效，目标另获约1单位收益
return [1, 0, 0, -1]; // 目标照常，使用者另受负收益
```

这些都是 AI 价值单位，不是精确的体力或卡牌数量换算。

有条件的防御应把真实成立条件同步写入 AI：

```js
ai: {
  effect: {
    target(card, user, target, current) {
      if (!get.tag(card, "damage")) return;
      if (!target.hasMark("my_guard")) return;
      return 0;
    },
  },
}
```

若真实规则只在有标记时防伤，而这里无条件 `return 0`，AI 就会一直把该角色当成免疫伤害。反过来，只写 `effect` 而没有真实防伤规则，也只是让 AI 误以为伤害无效。

#### 5.3 避免递归

在 `ai.effect.target` 内再次无条件调用同一行为的 `get.effect(target, card, player, viewer)`，容易进入递归。通常读取 `current`、牌标签与角色状态即可。

### 6. `expose`、`threaten`、`combo` 与负面标记

| 字段 | 用途 |
| --- | --- |
| `expose` | 身份暴露度，通常在 0 到 1 之间 |
| `threaten` | 威胁倍率，默认基准约为 1；可为函数 `(player, target)` |
| `combo` | 依赖的技能 ID 或数组；缺少组合技能时价值显著下降 |
| `notemp` | 当前暂时难以发挥预期价值，且不适合用 `combo` 精确描述 |
| `neg` | 整体偏强制负面技能的提示 |
| `halfneg` | 有明显代价但可能有正收益的提示 |

`threaten` 高表示更值得敌方重视，不表示技能一定发动，也不改变阵营。`expose` 用于身份推断，不是“发动概率”。

### 7. 技能标签与 `skillTagFilter`

#### 7.1 查询路径

```js
player.hasSkillTag(tag, hidden, arg, globalskill);
```

| 参数 | 含义 |
| --- | --- |
| `tag` | 要查询的技能能力标签 |
| `hidden` | 传给 `getSkills(hidden)`，决定是否计入隐藏/不可见技能范围 |
| `arg` | 消费者提供的上下文，可能是字符串、目标、牌或对象 |
| `globalskill` | 只有显式为 `false` 时才不加入全局技能 |

当前源码的核心逻辑是：

1. 收集角色技能，并按参数决定是否加入全局技能。
2. 若技能 `ai[tag]` 存在且定义了 `skillTagFilter`，先调用过滤器。
3. 过滤器明确返回 `false` 时，该技能的这个标签不生效。
4. `ai[tag] === true` 时命中；非布尔值则与查询 `arg` 按类型和值匹配。

`skillTagFilter` 签名：

```js
skillTagFilter(player, tag, arg) {
  return true;  // 允许标签
  // return false; // 本次查询禁用标签
}
```

只有明确 `false` 才会拒绝；但推荐显式返回布尔值，方便阅读。

还要注意 `ai[tag]` 的值：

- `ai[tag] === true`：过滤通过后直接命中。
- `ai[tag]` 为字符串、数字等非布尔值：其类型和值需要与查询 `arg` 对应。
- 传入对象 `arg` 却只写 `ai[tag]: true`、没有 `skillTagFilter` 时，当前源码会输出疑似遗漏过滤器的提示。

因此资源、目标或事件相关标签，通常都应配套 `skillTagFilter`。

#### 7.2 资源受限的响应标签

```js
ai: {
  respondShan: true,
  skillTagFilter(player, tag, arg) {
    if (tag !== "respondShan") return true;
    return player.countCards("he", card => get.color(card, player) === "red") > 0;
  },
}
```

这里标签只在仍有可转化资源时生效。真正把红牌当【闪】响应，还必须写对应的 `enable`、`filterCard`、`viewAs` 等规则字段。

#### 7.3 带上下文参数的标签

`arg` 由消费者决定，可能是目标、卡牌或对象：

```js
ai: {
  viewHandcard: true,
  skillTagFilter(player, tag, arg) {
    if (tag === "viewHandcard") {
      const target = arg;
      return target !== player && target.isIn();
    }
    return true;
  },
}
```

这段代码的参数含义是：

- `player`：拥有该技能标签的人；
- `tag`：本次正在查询的标签名；
- `arg`：`viewHandcard` 消费者传入的被查看目标。

所以它表示“可以查看其他仍在场角色的手牌，但不能用该标签查看自己的手牌，也不能查看已离场目标”。`viewHandcard: true` 先声明能力类别，`skillTagFilter` 再限定这次查询是否生效。当前基线的手牌可见性逻辑会直接消费该标签，因此它确实能改变符合条件目标的手牌是否可见，但不会产生查看手牌以外的效果。

复制标签前必须查消费者传入了什么 `arg`。标签名相同不保证每个扩展都采用同一上下文形状。

### 8. 当前 `SkillAI` 顶层字段完整索引

“层级”说明：

- **AI 提示**：主要改变评价或选择。
- **规则消费者**：当前引擎或 Player API 会直接查询，可能影响合法性、可见性或规则行为。
- **混合/专用**：既可能被 AI 使用，也依赖特定模式、卡牌或调用点。

#### 8.1 防具、响应与伤害

| 字段 | 层级 | 含义/消费者边界 |
| --- | --- | --- |
| `unequip` | 混合/专用 | 持有者无视他人防具的能力提示；实际效果仍需技能规则支持 |
| `unequip2` | 混合/专用 | 持有者自身防具视为失效的提示 |
| `unequip_ai` | AI 提示 | 额外的无视防具 AI 兼容标签，按消费者确认 |
| `respondShan` | AI 提示 | 即使当前看不到【闪】，仍可能通过技能响应【闪】 |
| `respondSha` | AI 提示 | 即使当前看不到【杀】，仍可能通过技能响应【杀】 |
| `respondTao` | 混合/专用 | 技能可在相关救援/响应流程提供【桃】式能力 |
| `save` | 规则消费者 | 技能可参与濒死救助/自救查询；需配合真实启用规则 |
| `jiuOther` | 混合/专用 | 在需要【酒】的相关流程中可能提供响应 |
| `nohujia` | AI 提示 | 评价伤害时视为护甲不提供通常保护 |
| `nofire` | AI 提示 | 火焰伤害无效/无收益的能力提示 |
| `nothunder` | AI 提示 | 雷电伤害无效/无收益的能力提示 |
| `nodamage` | AI 提示 | 通常伤害无效/无收益的能力提示 |
| `filterDamage` | 混合/专用 | 存在伤害减免/过滤能力的提示，具体消费者与条件需查源码 |
| `fireAttack` | AI 提示 | 不依赖普通火焰伤害牌也能制造火焰伤害的提示 |

#### 8.2 牌、手牌、装备与毒

| 字段 | 层级 | 含义/消费者边界 |
| --- | --- | --- |
| `noe` | AI 提示 | 失去装备可能有正收益，影响拆牌/按钮价值 |
| `noh` | AI 提示 | 空手牌或近似“无手牌”收益提示，避免错误拆牌 |
| `nogain` | AI 提示 | 令持有者获得牌通常没有收益 |
| `nolose` | AI 提示 | 令持有者失去牌通常没有收益 |
| `nodiscard` | AI 提示 | 令持有者弃牌通常没有收益 |
| `reverseEquip` | 混合/专用 | 反转/调整装备使用优先值，常用于替换装备有收益的角色 |
| `usedu` | AI 提示 | 使用【毒】可能有正收益 |
| `nodu` | AI 提示 | 【毒】对持有者通常无效/无负收益 |
| `notrick` | AI 提示 | 对锦囊伤害/锦囊效果免疫的兼容提示，语义依消费者 |
| `notricksource` | AI 提示 | 持有者作为来源使用锦囊时可能无效的提示 |

#### 8.3 拼点、响应、明置与无懈

| 字段 | 层级 | 含义/消费者边界 |
| --- | --- | --- |
| `noCompareSource` | 规则消费者 | `player.canCompare` 查询：不能作为拼点发起者 |
| `noCompareTarget` | 规则消费者 | `player.canCompare` 查询：不能成为拼点目标 |
| `norespond` | 规则消费者 | `lib.filter.cardRespondable` 等可能直接查询，影响能否响应 |
| `noautowuxie` | 混合/专用 | 不进入通常的自动【无懈可击】判断 |
| `playernowuxie` | 混合/专用 | 玩家不响应/不使用【无懈可击】的提示 |
| `nomingzhi` | 混合/专用 | 不进行通常明置选择的提示，主要见国战等流程 |
| `revertsave` | 混合/专用 | 国战等特殊濒死/复活求助兼容标签 |
| `rejudge` | AI 提示 | 角色具备改变判定的能力 |
| `guanxing` | AI 提示 | 观星类能力；会影响延时锦囊与无懈相关 AI |

#### 8.4 【杀】、【闪】使用倾向

| 字段 | 层级 | 含义/消费者边界 |
| --- | --- | --- |
| `useSha` | AI 提示 | 倾向使用/响应【杀】，即使可见数量不足；可用 `"use"`/`"respond"` 区分 |
| `noSha` | AI 提示 | 倾向不使用/响应【杀】；可按使用/响应场景区分 |
| `freeSha` | AI 提示 | 可无消耗提供【杀】，AI 不应因手牌不足直接放弃 |
| `useShan` | AI 提示 | 倾向使用/响应【闪】；可按场景区分 |
| `noShan` | AI 提示 | 倾向不使用/响应【闪】 |
| `freeShan` | AI 提示 | 可无消耗提供【闪】 |

这些标签不会自动生成【杀】或【闪】。实际响应能力必须由技能规则提供，并在资源不足时通过 `skillTagFilter` 关闭。

#### 8.5 卖血、负面与组合

| 字段 | 层级 | 含义/消费者边界 |
| --- | --- | --- |
| `maixie` | AI 提示 | 角色具有受伤/卖血收益；不会自动让 AI 主动受伤 |
| `maixie_hp` | AI 提示 | 体力对该角色较重要，`chooseDrawRecover` 等更倾向回复 |
| `maixie_defend` | AI 提示 | 卖血防御类兼容标签，按具体消费者理解 |
| `neg` | AI 提示 | 整体偏强制负面技能 |
| `halfneg` | AI 提示 | 有明显代价但可能带来正收益 |
| `combo` | AI 提示 | 依赖一个或多个组合技能 ID |
| `notemp` | AI 提示 | 当前暂时无法发挥预期价值 |
| `nofrequent` | 混合/专用 | 旧 `createTrigger` 兼容提示；当前注释标明用途很弱 |

#### 8.6 距离、状态与可见性

| 字段 | 层级 | 含义/消费者边界 |
| --- | --- | --- |
| `left_hand` | 规则消费者 | 距离按逆时针方向计算 |
| `right_hand` | 规则消费者 | 距离按顺时针方向计算 |
| `undist` | 规则消费者 | 距离计算中忽略该单位 |
| `noLink` | 混合/专用 | 不能/不应被横置的标签；具体规则仍看消费者 |
| `noTurnover` | 混合/专用 | 不能/不应被翻面的标签 |
| `viewHandcard` | 规则消费者 | 允许查看特定角色手牌；目标范围应用 `skillTagFilter` 限定 |
| `ignoreSkill` | AI 提示 | `get.effect` 处理目标时忽略部分技能效果修正 |

#### 8.7 基础评价与卡牌共享字段

| 字段 | 类型/作用 |
| --- | --- |
| `order` | 数字或函数；行动优先级 |
| `expose` | 数字；身份暴露度 |
| `threaten` | 数字或函数；威胁倍率 |
| `effect` | `{ player, target }`；修正其他行为的效果评价 |
| `result` | `{ player, target, player_use, target_use, keepAI }`；基础收益 |
| `skillTagFilter` | `(player, tag, arg) => boolean`；技能标签动态过滤 |
| `useful` | 卡牌式实用度简写；武将技能很少直接使用 |
| `value` | 卡牌式持有价值简写；武将技能很少直接使用 |
| `equipValue` | 装备价值简写 |
| `basic` | 卡牌基础 AI 容器：`equipValue`、`order`、`useful`、`value` |
| `tag` | 卡牌/技能效果标签容器，使用 `get.tag` 查询 |
| `canLink` | 是否把属性伤害连环传导计入 `get.effect`；可返回布尔值或上下文对象 |

以上各表合计覆盖当前 `SkillAI` 的 66 个已声明顶层字段。

### 9. `ai.basic` 与卡牌式价值字段

这部分主要为卡牌定义服务，视为技有时也会复用：

```js
ai: {
  basic: {
    order: 7,
    useful: [6, 2],
    value: [5, 1],
    equipValue: 7,
  },
}
```

| 字段 | 被谁读取 | 含义 |
| --- | --- | --- |
| `basic.order` | `get.order` | 使用先后顺序 |
| `basic.useful` | `get.useful` | 同名牌第 N 张的边际实用度 |
| `basic.value` | `get.value` | 持有/失去该牌的价值 |
| `basic.equipValue` | 装备评价 | 装备在目标身上的价值 |

顶层同名字段优先于 `basic` 内字段。普通武将主动技能优先写 `order` 与 `result`，不必为了“显得完整”填入卡牌专用值。

### 10. `ai.tag` 完整索引

`ai.tag` 描述牌或技能效果的类别，使用 `get.tag(item, tag)` 查询。值可以是数字、布尔意义的值或函数；数值有时也表示效果权重。

它与上一节的技能能力标签不是同一个命名空间：

| 写法 | 查询方式 | 描述对象 | 例子 |
| --- | --- | --- | --- |
| `ai: { respondShan: true }` | `player.hasSkillTag("respondShan", ...)` | 角色拥有的能力 | 角色可能通过技能响应【闪】 |
| `ai: { tag: { damage: 1 } }` | `get.tag(item, "damage")` | 某张牌/某个技能效果的类别 | 该效果通常造成伤害 |

同名词出现于两处也不能混用。前者让消费者查询角色能力，后者让消费者理解一个 `item` 会产生什么类型的效果。

| 标签 | 含义 |
| --- | --- |
| `respondSha` | 该牌/效果通常要求或涉及以【杀】响应 |
| `respondShan` | 该牌/效果通常要求或涉及以【闪】响应 |
| `damage` | 通常造成伤害；数值可被部分 AI 当作伤害权重 |
| `natureDamage` | 通常造成属性伤害 |
| `thunderDamage` | 通常造成雷属性伤害 |
| `iceDamage` | 通常造成冰属性伤害 |
| `fireDamage` | 通常造成火属性伤害 |
| `multitarget` | 通常作用于多个目标 |
| `recover` | 通常回复体力 |
| `loseHp` | 通常令角色失去体力 |
| `gain` | 通常令角色获得牌 |
| `save` | 可用于濒死救助/自救 |
| `discard` | 通常导致弃牌或以弃牌产生收益 |
| `loseCard` | 通常导致角色失去牌 |
| `multineg` | 多目标负面效果兼容标签，具体权重按消费者 |
| `rejudge` | 可改变/替换判定 |
| `draw` | 通常摸牌 |
| `norepeat` | 不适合被复制、重复结算或再次选择的提示，按具体技能消费者 |
| `valueswap` | 装备替换/价值交换相关提示 |

示例：

```js
ai: {
  order: 7,
  result: { target: -1 },
  tag: {
    damage: 1,
    fireDamage: 1,
    natureDamage: 1,
  },
}
```

`ai.tag.damage = 1` 不会把技能变成伤害技能；它必须与真实 `content` 一致。错误标签会让其他 AI 对这个技能作出错误判断。

### 11. 类型声明之外的本地技能标签

当前类型允许扩展任意键，本地源码也确实存在未列入 `SkillAI` 显式字段的标签。下表是当前基线中可确认的重要字面量；它们往往是特定消费者协议，移植前应搜索调用点。

| 标签 | 当前本地用途 | 稳定性建议 |
| --- | --- | --- |
| `abnormalDraw` | 个别 AI 在摸牌/手牌排序评价中识别异常摸牌能力 | 案例专用 |
| `damageBonus` | 伤害类 AI 估算额外伤害，常携带 `{ card, target }` 等 `arg` | 需核对参数 |
| `directHit_ai` | 部分出牌 AI 估算直击、不可响应收益 | 需核对参数 |
| `forceMajor` | 角色主势力/主身份判断辅助 | 有核心消费者，模式相关 |
| `forceWin` | 部分拼点 AI 判断指定牌是否保证胜利 | 案例专用，带 `arg.card` |
| `jueqing` | 大量伤害 AI 判断是否绕过通常卖血/伤害收益 | 广泛但未显式声明 |
| `luckyStar` | `get.isLuckyStar` 查询幸运星状态 | 有核心消费者 |
| `maihp` | 部分技能 AI 判断失去体力是否有收益 | 与 `maixie` 不同，案例协议 |
| `noSortCard` | `player.sortHandcard` 直接停止自动整理手牌 | 有 Player 消费者 |
| `noturn` | AI 倾向避免让角色翻面 | 与 `noTurnover`“不能翻面”语义不同 |
| `refuseGifts` | `player.refuseGifts` 判断目标是否拒收赠礼，可带上下文 | 有 Player 消费者 |
| `sortCardByNum` | `player.sortHandcard` 按点数采用特殊整理 | 有 Player 消费者 |
| `unequip_equip1` | 个别装备/武器技能判断专用的“无视武器槽相关限制”提示 | 高度案例专用 |

不要只因为源码里出现过某个标签就把它当成通用官方协议。先搜索：

```text
hasSkillTag("标签名"
get.tag(..., "标签名")
```

然后确认消费者传入的 `hidden`、`arg`、`globalskill` 以及返回值解释。

### 12. 常见 AI 模板

#### 12.1 单目标伤害主动技

```js
ai: {
  order: 7,
  result: {
    target: -1,
  },
  tag: {
    damage: 1,
  },
}
```

若伤害量、属性或额外收益随状态变化，把 `result.target` 改为函数；真实伤害仍写在 `content`。

#### 12.2 帮助友方的主动技

```js
ai: {
  order: 6,
  result: {
    target(player, target) {
      return target.isDamaged() ? 1.5 : 0.5;
    },
  },
  tag: {
    recover: 1,
  },
}
```

不要在这里手动判断友敌；`get.effect` 会根据评价者态度决定更愿意帮助谁。

#### 12.3 防御技告诉 AI 不要浪费伤害牌

```js
ai: {
  effect: {
    target(card, player, target, current) {
      if (get.tag(card, "damage")) return 0;
    },
  },
}
```

若防御只在有牌、每轮一次或某种属性下成立，必须把相同条件写入 `effect`；否则 AI 会永久误判。

#### 12.4 有代价的摸牌技能

```js
ai: {
  order: 8,
  result: {
    player(player) {
      const cards = player.getCards("he", card => {
        return lib.filter.cardDiscardable(card, player);
      });
      if (!cards.length) return 0;
      const lowestCost = Math.min(...cards.map(card => get.value(card, player)));
      return 2 - lowestCost / 4;
    },
  },
  tag: {
    draw: 2,
  },
}
```

这个示例假设真实规则是“弃一张牌后摸两张牌”，因此按可弃牌中的最低代价估算，而不是把全部牌价值相加。`2` 与除数只是相对 AI 刻度，仍需结合实际收益、牌区、弃牌收益技能和失败条件调整。

#### 12.5 视为响应技

```js
const skill = {
  enable: ["chooseToRespond"],
  filterCard(card, player) {
    return get.color(card, player) === "red";
  },
  position: "hes",
  viewAs: { name: "shan" },
  prompt: "将一张红色牌当闪打出",
  check(card) {
    return 7 - get.value(card, _status.event.player);
  },
  ai: {
    respondShan: true,
    skillTagFilter(player, tag) {
      if (tag === "respondShan") {
        return player.countCards("hes", card => get.color(card, player) === "red") > 0;
      }
      return true;
    },
  },
};
```

规则、材料选择和 AI 标签三层必须保持同一资源条件。

#### 12.6 从规则到 AI 的完整主动技

下面的技能“出牌阶段限一次，选择一名其他角色，对其造成1点伤害”需要同时写清规则与评价：

```js
const skill = {
  enable: "phaseUse",
  usable: 1,
  filterTarget(card, player, target) {
    return target !== player && target.isIn();
  },
  async content(event, trigger, player) {
    await event.target.damage();
  },
  ai: {
    order: 7,
    result: {
      target: -1,
    },
    tag: {
      damage: 1,
    },
  },
};
```

每一层分别回答不同问题：

| 代码 | 回答的问题 |
| --- | --- |
| `enable`、`usable` | 什么时候能主动使用、能用几次 |
| `filterTarget` | 规则上哪些角色可选 |
| `content` | 选中后真实发生什么 |
| `ai.order` | AI 应在行动序列中多早考虑它 |
| `ai.result.target = -1` | 该效果对目标本人通常有害 |
| `ai.tag.damage = 1` | 供其他 AI 查询：这是伤害类效果 |

这里不需要在 `filterTarget` 里判断敌友，也不需要在 `result.target` 里乘 `get.attitude`。通用 `get.effect` 会把目标的负收益与评估者对目标的态度结合：敌方受到负收益通常会成为正的总评价，友方受到负收益通常会成为负的总评价。

如果伤害只在目标没有护甲时成立，真实规则和 AI 都要同步改变；不能只改 `result`。如果技能还要求弃一张牌，应在规则层真实支付代价，并在 `result.player` 中估算该代价。

### 13. 调试 AI 的方法

#### 13.1 先验证规则路径

在调整 AI 前确认：

- 真人可否正常发动？
- 合法牌和目标是否准确？
- 成本是否真实支付？
- 事件时机与次数限制是否正确？
- 状态结束后是否清理？

规则路径错误时，AI 分数调得再漂亮也没有意义。

#### 13.2 分开记录基础量

调试时可临时比较：

```js
game.log("att", get.attitude(player, target));
game.log("damageEffect", get.damageEffect(target, player, player));
game.log("effect", get.effect(target, "my_skill", player, player));
game.log("order", get.order("my_skill", player));
```

不要把调试日志留在正式高频 AI 回调中。

#### 13.3 排查标签

```js
game.log(player.hasSkillTag("respondShan", true, { card: trigger.card }));
```

若结果不符合预期，逐项检查：

1. 提供标签的技能是否真的在 `getSkills(hidden)` 范围内。
2. `ai[tag]` 的类型是否与查询 `arg` 匹配。
3. `skillTagFilter` 是否因资源、目标或事件条件返回 `false`。
4. 是否意外把全局技能算入/排除。
5. 标签名称是否其实是某个案例私有协议。

### 14. 设计检查表

- `ai` 描述是否与真实规则一致？
- `filter...` 是否承担合法性，`ai...` 是否只承担偏好？
- `order` 与 `result` 是否分别回答“何时做”和“值不值得做”？
- `result.target` 是否避免重复计算 `attitude`？
- 技能有成本时，`result.player` 是否计入成本？
- 防御、免疫、改写效果是否同时实现真实规则与 `ai.effect`？
- 资源受限标签是否有 `skillTagFilter`？
- `skillTagFilter` 的 `arg` 形状是否从消费者确认？
- 是否误把 `get.tag` 的卡牌标签与 `hasSkillTag` 的技能能力标签混为一谈？
- 是否使用了类型声明之外的案例标签而没有核对消费者？
- 隐藏信息是否只在规则允许可见时参与 AI？
- 动态 AI 回调是否足够轻量，避免反复全场扫描或递归 `get.effect`？

### 15. 源码入口

- `src/typings/Skill.d.ts`：`SkillAI`、`effect`、`result`、`tag` 类型与注释
- `noname/get/index.js`：`get.attitude`、`get.effect`、`get.effect_use`、`get.tag`、`get.value`、`get.order`
- `noname/library/element/player.js`：`hasSkillTag`、`hasGlobalTag`
- `noname/library/element/content.js`：出牌、响应与 AI 选择流程
- `character/**/skill.js`：当前本地武将技能用例
