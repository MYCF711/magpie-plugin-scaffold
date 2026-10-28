# 更新记录

> 每个版本一节，**一条一行**，说用户能感知的变化。
> 格式与规矩见 [UPDATING.md](./UPDATING.md)。

## 0.1.22 — 2026-10-28

**把维护检查接进三个入口 —— 否则它只是一个「你知道才会跑」的脚本**

0.1.21 加了 `check-maintenance.mjs`，但它没出现在任何必经路径上，等于没有：

- **[CHECKLIST](./CHECKLIST.md) B 表第 7 步** —— 加第 ⓪ 条，放在四条验证之前
- **[UPDATING](./UPDATING.md) 第 7 步** —— 从「四条验证」改成「五条」，⓪ 排第一，并写明它抓的四种静默失配
- **[AGENTS](./AGENTS.md) 命令区** —— `node scripts/check-maintenance.mjs`，一句话说清后果
- **README / AGENTS / UPDATING 里所有「四条验证」** —— 统一改成「五条」

> 起因：一个没人跑的检查等于没写。接进交付门才算数。

## 0.1.21 — 2026-10-28

**维护标准从「七步写在文档里」变成「一条命令查出来」—— 而它第一次跑就抓到了我们自己**

主人指出：插件不是做完就完，**默认情况下大家会直接覆盖仓库、不发新版本、没有更新日志，完全不方便维护**。
核对后发现：七步写在 UPDATING 里，但**没有任何机制**，所以 —— **我们自己在 0.1.17~0.1.20 四个版本上只 commit 没打 tag**，
正是他说的那种情况。（已补 tag：v0.1.17 / v0.1.18 / v0.1.19 / v0.1.20。）

- **新增 [`scripts/check-maintenance.mjs`](./scripts/check-maintenance.mjs)** —— 六项维护检查：
  ① 是 git 仓库 ② 至少打过一次 tag ③ **当前 `version` 有对应 tag**（否则 Release 是空的）
  ④ **自上次 tag 以来改了代码，但 `version` 没变** ← 就是「直接覆盖仓库不发新版本」的检测器
  ⑤ CHANGELOG 有当前版本一节 ⑥ 没有跳过版本（中间每个版本都打了 tag）。
  退出码非 0 = 用户拿不到新版。
- **`package.json` 的 `scripts` 加 `maintenance`** —— `npm run maintenance`。
- 为什么它比文档有用：这六条**都不报错**，本地一切看起来都对，只有用户那边永远停在旧版本。
  这个脚本第一次对着自己跑就 FAIL 了一条（改了代码没 bump）—— 那就是它的用例本身。

> 起因：主人补了第三个维度 —— 「还有插件的维护标准呢……默认没有维护的适合直接覆盖仓库，不发新版本，
> 没有更新日志。完全不方便维护」。这句话把一个隐含假设点破了：**脚手架不只是「怎么开始」，还得管「怎么活下去」。**
> 所以我们自己先做了反面教材，再把检测器写出来。

## 0.1.20 — 2026-10-28

**「写错不报错，但 GUI 和智能路由会坏」的坑 —— 从「文档里写了」变成「代码里拦住了」**

主人指出：脚手架的价值不只是省重复步骤，更是那些**不做就会出 GUI bug、甚至让智能路由不工作**的地方。
核对后的结论是：**知识层有（AGENTS 第二十四到二十四条、HOOKS 三条窗口规矩），代码层没有** ——
`index.mjs` 的 `usage` 骨架原来只是一段注释 + 一个 `TODO`，写错了照样静默。

- **新增 [`src/quota.mjs`](./src/quota.mjs)** —— 额度窗口的构造器。五类写法直接 `throw QuotaShapeError`：
  ① 缺 `used`（会被当成 0% = 满额，空号排到路由队首）② `aside: true` 又给 `amount`/`limit`
  （`allowanceOf()` 整条跳过 ⇒ `routedAllowance` 不 ok ⇒ **这个号在路由里等于不存在**）
  ③ 钱包型（`balance`）又给 `used`（被当占比读）④ `resetsAt` 塞厂商原样时间（整条窗口被丢）
  ⑤ `span` 不是正整数。另附 `toIso()`：ISO / 秒 / 毫秒 / `"2026-10-28 23:59:59"` 统一转 ISO。
- **[index.mjs](./index.mjs) 的 `usage` 改用构造器** —— 上游失败才 `return {error}`；
  **写法错会抛出**（不被 catch 吞掉），因为那是编码错误，吞掉就又变成「GUI 坏了但日志里什么都没有」。
- **[tests](./tests/semantics.test.mjs) 16 → 22 条** —— 新增 6 条锁住上面那五类写法。
- **[AGENTS 第五节](./AGENTS.md)** —— 加了 `src/quota.mjs` 那一行和「五类写法 → 不拦的后果」的表。
- **[GUIDE 第 6 步](./GUIDE.md)** —— 改成「别自己拼窗口对象，用构造器」，并说明它是卡片与路由的**同一个输入**。

> 起因：主人补了一句「脚手架给出了很多不做就会出 GUI bug，甚至涉及智能路由无法工作的坑」。
> 这句话逼出一个更准的判据：**脚手架的价值 = 省掉的重复 + 拦掉的静默错误**。
> 第一项已经在 README/CHECKLIST 里兑现；第二项原来只有文档，这一版才补上代码。

## 0.1.19 — 2026-10-28

**盲测做了，抓出 6 个真缺陷 —— 其中 2 个会让合法插件永远过不了身份门**

方法：把脚手架交给一个**只读 `GUIDE.md` / `SCORING.md` / `AGENTS.md` 三份**的执行者，
让它做虚构供应商 Nimbus 的插件（API key 登录 / 两个模型 / 5 小时额度 / 每日签到）。
它做到了：`check.mjs` **29 通过 · 0 警告 · 0 失败**、`score.mjs` **身份门通过 · 65/65**、
`node --test` **18 通过 · 0 失败**。**但它第一轮被卡住过一次，卡住的点全是我们的错。**

### 它指出的问题 → 这一版修了什么

- **身份门 `BASE` 判据会误杀 `.example` 域名** —— 原判据是 `!/(^|\.)example\./i`，而虚构/示例厂商
  本来就该用 `api.<vendor>.example`，于是**合法插件永远过不了门**（它只能把字面量拆成两段绕过去）。
  改成「和模板默认值 `https://api.xxx.example/v1` 不同」+ 不含 `xxx`。
- **身份门只认入口文件里的 `const PROVIDER`** —— 而 [AGENTS](./AGENTS.md) 第五节又建议 `index.mjs` 只做装配、
  常量进 `src/`。它照 AGENTS 做了，身份门直接判失败。改成**入口 + `src/**` 一起找**。
- **[GUIDE](./GUIDE.md) 第 1 步没说要带走 `scripts/`** —— `score.mjs` 的 A 层读的是**你自己仓库里**的
  `scripts/check.mjs`，删了它 A 层直接 0 分。已在第 1 步写明「`scripts/` 和 `src/` 一起带走」。
- **[GUIDE](./GUIDE.md) 没讲 `type: "api"` 挡不住 key 格式** —— 官方没有 method 级 `validate`，
  `placeholder` 只是提示。已补：要拦就在 `loader` 里自己判断。
- **[GUIDE](./GUIDE.md) 没讲 usage/checkin 的上游端点由谁定** —— 官方只规定返回形状，端点/方法/请求体是厂商自己的。
  已补：模板里 `fetchUsage` / `doCheckin` 空着是**故意**留给你的。
- **[GUIDE](./GUIDE.md) 说「照抄 tests 再改」是误导** —— `tests/semantics.test.mjs` import 的是
  `../src/*.mjs`，只抄测试会 import 失败。已补：`src/` 必须跟 `tests/` 一起带走。
- **[HOOKS](./HOOKS.md) 把 `capabilities` 下的字段写成 `tool_call`** —— 官方 `#provider` 是 `toolcall`（无下划线），
  而 `#quick` 的静态模型才用 `tool_call`。**两个位置两种拼写**，已在那张表上方写明，别混。

> 另外两条它提的、核对后**不是缺陷**：① 模板 `checkin` 返回 `streak: r.streakDays` —— `streakDays` 是厂商字段，
> 返回给 magpie 的 key 仍是 `streak`，正确；② 「SCORING 的 D2 与 score.mjs 不一致」—— 它读到的是我改之前那一版，
> 现在两边都是「≥240 字符」。

### 保留意见（必须写明）

那个执行者与我是**同一个模型**（deepseek-v4.1），**不能代表「任何模型」**。
换弱模型要重测；重测方法见本节开头（只给它三份文档，不给提示）。

## 0.1.18 — 2026-10-28

**从「模板」变成「说明书」：官方 22 个锚点逐条可追，80 分能打分、能验**

这个仓库过去的问题不是内容少（3,700 行），是**没有一条结论标了官方出处**，
也没有一个「按什么顺序读」的主线，以及「80 分」只是一句话。三份新文件补上：

- **新增 [GUIDE.md](./GUIDE.md) —— 说明书主线。** 30 分钟、9 步：拿模板 → 改身份 → 写 `config` →
  写 `auth` → 写 `models` → 写 `usage`/`checkin` → 自检 → 打分 → 发布。**每一步都带官方锚点**
  （`#provider` / `#signin` / `#usage` / `#checkin` / `#test` / `#publish`），并指向本仓库里讲细节的那一节。
  第一次做插件从这份开始，不用再猜「先读哪个」。
- **新增 [OFFICIAL-SOURCES.md](./OFFICIAL-SOURCES.md) —— 官方引用索引。**
  官方中文文档 22 个锚点逐条映射到本仓库对应章节，标出「官方讲了的」与「官方没写、我们补的」。
  另列**增量清单 8 条**，每条都附「官方没写」的检查证据（`grep -c "rate === 0" provider-plugins.md` = 0 这种）。
  顶部写明引用基线（2026-10-28 / magpie 稳定版 0.1.1327 / `provider-plugins.md` 最后修改 `d4f1d648`）
  和 MIT 归属（Copyright (c) 2026 yetone）。
- **新增 [SCORING.md](./SCORING.md) + [scripts/score.mjs](./scripts/score.mjs) —— 80 分评分卡。**
  100 分 = A 合规 40 + B 测试 10 + C 语义 25 + D 说明书 15 + E 发布 10。
  另设**身份门**：`name` / `repository` / `registry-entry` / `const PROVIDER` / `const BASE` /
  「五个 TODO 还 throw 着」任一条不改，总分封顶 60 —— **克隆完一字不改本来就是 57 分，那是模板的分，不是你的插件的分**。
  `node scripts/score.mjs` 一条命令算自动分（A/B/D），C/E 标「待人工」并列出判据，**不许自报分数**。
- **[README](./README.md)** —— 「必读四份」改成「必读五份」，0 号是 GUIDE；目录加三份新文件
- **新增 [CONTRIBUTING.md](./CONTRIBUTING.md) —— 共创说明。** 定位（官方讲规则 / 我们讲后果）、三条纪律
  （每条结论带官方锚点、每处补充带判据、官方更新先改索引）、可贡献的五类、四道门，
  以及「和官方的关系」——**不请求收编，正确形态是 issue + 证据**（附 #392 先例）
- **[AGENTS](./AGENTS.md)** —— 「还没开工」那行改成先读 GUIDE；文档地图加三行
- **[package.json](./package.json)** —— `files` 加三份新文档，`scripts` 加 `score`

> 起因：主人定下方向 —— **不归并，改「邀请共创」**：官方只有指导性文件，我们做「基于官方指导文件的
> 脚手架说明书」。价值主张是「任何模型拿到脚手架就能做一个 80 分以上的 magpie 插件」。
> 这句话要成立，必须补三样东西：可追的官方出处、可走的主线、可验的分数。这一版就是这三样。
>
> **盲测已经做了**：把脚手架交给一个只读 `GUIDE.md` / `SCORING.md` / `AGENTS.md` 三份的执行者，
> 让它做虚构供应商 Nimbus 的插件。产出复跑结果（我自己跑的，不是它自报）：
> `check.mjs` **29 通过 · 0 警告 · 0 失败**、`score.mjs` **身份门通过 · 自动分 65/65**、
> `node --test` **18 通过 · 0 失败**。
> ⚠ 保留意见：那个执行者与我是同一个模型，**不能代表「任何模型」**；换模型（尤其弱模型）要重测。

## 0.1.17 — 2026-10-28

**「官方文档漏了 auth.checkin」已经过时了 —— 那条缺口在 2026-10-26 就被补上了，留着会打脸**

`auth.checkin` 确实曾不在官方文档里，2026-10-25 以 [magpie-community/plugins#392](https://github.com/magpie-community/plugins/issues/392) 报给社区，
yetone 当天回复（[magpie v0.1.1582 / commit `c28d3e8b0`](https://github.com/yetone/magpie/commit/c28d3e8b0)），en / zh / ja 三语补齐，issue 已关闭。
四处「官方漏了 `auth.checkin`」的说法因此全部失效：

- **[README](./README.md) 必读四份** —— 改成「官方讲行为、这份讲字段，两者并用」，并挂上那个缺口的故事
- **[README](./README.md)「一个曾经的缺口，已经补上」** —— 保留证据链（issue 号、commit、三语），并写明它为什么值得留：**拿证据指官方漏了什么，比说「我做了个东西」有用**
- **[HOOKS](./HOOKS.md) 开头** —— 不再声称「比官方全」，只声称「比官方细」（字段级 vs 行为级）
- **[AGENTS](./AGENTS.md) 文档地图** —— 同一句改正

顺带三处硬缺陷（都是对外的，不改会被人当场指出来）：

- **`package.json` 的 `repository` / `bugs` / `homepage` 还指着旧仓库名 `magpie-plugin-template`** —— 已改成 `magpie-plugin-scaffold`（旧名靠 GitHub 的 301 重定向活着，但链接显示的是错的名字）
- **[AGENTS](./AGENTS.md) 命令区的 `npm run publish:npm`** —— 这是**派生仓库自己加的**脚本，本模板 `package.json` 里没有，裸跑报 `Missing script`。已加限定语，并写明 `release.mjs` 会自动检测（有就用、没有退回 `npm publish`）

> 起因：讨论「要不要找 magpie 官方/社区合作或归并」。先去核了官方现状 —— yetone/magpie 24,439 star、
> `docs/subsystems/provider-plugins.md` 64,931 字节且**当天还在改**；`usemagpie.ai/docs/zh/plugins`
> 已有「五分钟写一个插件」的完整 quick start。结论是**归并没有路**（官方 PR 只对 collaborator 开放；
> registry 只收插件；社区 `skills/` 是维护者自留地），而**合作有路且已走通过 —— 形态是 issue**。
> 但这条路的第一步是：自己文档里不能有错的陈述。

## 0.1.16 — 2026-10-28

**判断「要不要跟着 magpie 升级」只看稳定渠道 —— 每版本渠道一晚四个，追它全是白跑**

magpie 设置里有「更新渠道：每个版本 / 稳定版」。把两个渠道的契约都提取出来对比：

| 渠道 | feed | 2026-10-28 的版本 | 契约段数 | 字符数 |
|---|---|---|---|---|
| 每版本 | `usemagpie.ai/api/latest` | **0.1.1763** | 23 | 264,822 |
| **稳定版** | `usemagpie.ai/api/latest?channel=stable` | **0.1.1327** | 21 | 201,045 |

差 400 多个版本，但**插件相关的字段一条不差**（`searches` / `decides` / `rateWas` /
`serviceTiers` / `modalities` / `capabilities` 两边都有）。多出的 2 段是 `summaries` /
`last seen`，属 GUI 历史，不是插件契约。

- **新增 [`scripts/check-magpie-stable.mjs`](./scripts/check-magpie-stable.mjs)** —— 一条命令判断该不该动：
  从 HOOKS.md 抓基线版本 → 查稳定渠道 → 比对。`0` = 不用动；`2` = 稳定版变了，并打印三步
  （下稳定版 → `extract-contract.py` → `contract-diff.mjs`）
- **[HOOKS](./HOOKS.md) 顶部基线改成 `0.1.1327`（stable）** —— 并附两渠道对比表，写明「看稳定渠道，不看每版本渠道」
- **[UPDATING](./UPDATING.md) 新增第七节** —— magpie 自己升级了什么时候该动文档、三步、以及「内嵌契约抓不到的部分」（供图判据、ID 白名单）
- **[AGENTS](./AGENTS.md) 坑表补第 21 条 + 命令** —— 「花一晚上追每版本，用户那边一点变化都没有」
- **四个插件仓库的 AGENTS 同步了这一节**（`magicrew-auth` / `officeace` / `loomy-auth` / `today`）

> 起因：主人指出 magpie 出了「稳定版」渠道。查证后确认：之前追 1763→1767 是追的每版本，
> 而稳定版是 0.1.1327 —— 追了 400 多个版本号，插件契约却没变过。

## 0.1.15 — 2026-10-28

**把「契约会不会落后」做成一条命令 —— 因为 0.1.14 那次是手工比对出来的**

0.1.14 补的 6 个字段是靠人眼对出来的，这不可靠：magpie 一晚上就发了 1764→1767 四个版本。
而且脚本第一次跑就抓到一条**我漏得更彻底的**：`capabilities` 这个词在 HOOKS.md 里
出现 **0 次** —— 模型条目的能力（reasoning / attachment / tool_call / modalities）全挂
在它下面，而原文没写这层结构。

- **新增 [`scripts/contract-diff.mjs`](./scripts/contract-diff.mjs)** —— 契约定时比对的自动化：
  `python extract-contract.py && node scripts/contract-diff.mjs`，自动列出「契约里有、
  HOOKS.md 一个字都没提」的字段，退出码 2 表示有差集。它只扫插件相关的段落
  （`one provider's hooks` 到 `the loop`），不切掉的话假阳性从 20 涨到 99
- **[HOOKS](./HOOKS.md)「十一之三」按 `capabilities` 重排** —— 拆成「顶层」与
  「`capabilities` 下面」两张表，并补 `apiId` / `released` / `family` / `temperature` /
  `interleaved` / `maxTokens` / `imageSaid` 七个字段
- **[AGENTS](./AGENTS.md) 命令区** —— 加「magpie 升级后必做：重新提取 + 跑 contract-diff」
- 顺带：`extract-contract.py` 的产物已进 `.gitignore`（264 KB，不进仓库）

> 起因：0.1.14 补完字段后意识到「下次 magpie 升级还是会漏」。脚本第一次跑出的差集是
> 30 个（限段落前）/ 99 个（全文件），补完这一轮降到 20 个，且剩下 20 个全是 GUI / tools /
> 内部变量，不是插件该写的 —— 这就是「差集收敛到噪声」的判据。

## 0.1.14 — 2026-10-28

**按 magpie 0.1.1763 重新提取契约：补 6 个漏掉的字段 + 插件供图；另补 store 骨架、拆分示例、双站点改造流程**

- **[HOOKS](./HOOKS.md) 新增「十一之三：模型条目上的全部字段」** —— 用 `extract-contract.py` 从 magpie **0.1.1763** 重新提取（23 段 / 258,708 字符），比对后发现原来漏了 6 个字段。它们全是「**不写就等于关掉某个能力**」，不会报错：`searches`（模型级=这条自己会搜，provider 级=上游整体会搜）、`decides`（decision 模型）、`rateWas`（折扣前倍率）、`fast`、`serviceTiers`、`modalities`（图片/音频能力全靠它）
- **[HOOKS](./HOOKS.md) 补「插件供图（`draw`）」** —— magpie **0.1.1707 起**支持插件提供图像模型（0.1.1747 接入 SenseNova `sensenova-u1.5-lite`）：id 命中 `catalog.DrawsID` 且 `catalog.ImagesAPI`、npm 是 `@ai-sdk/openai-compatible` → 进 Settings 的「图像生成」选择器，请求走 `/v1/images/generations`。⚠ 但它**同时留在 chat 模型列表里**，列不列是取舍
- **[`src/models.mjs`](./src/models.mjs) 新增 `LIST_IMAGE_MODELS` 开关（默认 `false`）** —— 原来 `NOT_CHAT` 一刀切把 `image` / `flux` / `sd` 全砍掉，等于默默放弃这个能力；现在把选择摆到明面上：想供图就打开，并且把 `capabilities.output` 写成 `{ text: false, image: true }`
- **新增 [`src/store.mjs`](./src/store.mjs)** —— 缓存三规矩（只写 `~/.cache/magpie`、文件名带账号、可整目录删）+ 原子写 + 快照/登录态/一次性标记三件套。这是四个插件里每个都重写过一遍的那部分
- **新增 [`examples/split/`](./examples/split/)** —— 「`index.mjs` 只装配」的实样：三个钩子各占一个文件（纯声明 / 异步取数 / 纯计算三种形态），index 缩到 40 行。钩子只有这三种形态，其余五个照同一规则搬
- **[MULTI-PROVIDER](./MULTI-PROVIDER.md) 新增「三之二、已经写成单例了，怎么改成两个」** —— 五步改造流程，每步带验证判据（`grep` 什么、`node -e` 验什么、装两站怎么测），外加三条「不要做的事」
- **[AGENTS](./AGENTS.md) 坑表补两条**（19 契约字段漏写 = 关能力、20 生图模型的列与不列），「长大之后」四块骨架齐了
- `extract-contract.py` 的产物 `magpie-plugin-contract-full.txt`（264 KB）加进 `.gitignore`

> 起因：主人问「magpie 更新了哪些、脚手架要不要同步」。查证：本机与上游都是 0.1.1763/1764；
> 最近 60 个版本里插件相关的实质变更只有供图（0.1.1707/1747）与 Serves chip（0.1.1744，已在 0.1.8 同步）。
> 真正的问题不在「新版加了什么」，而在**旧版就有、HOOKS 漏抄的 6 个字段** —— 重新提取才看见。

## 0.1.13 — 2026-10-28

**`release.mjs` 不再和 `release.yml` 抢着建 Release**

发现过程：0.1.11 那版脚本建 Release 报 `fetch failed`（0.1.12 修成 curl），
但 GitHub 上 `v0.1.11` 的 Release 还是出现了 —— 是仓库自带的 `release.yml` 被推 tag 触发、
自己建的。也就是说**有 workflow 的仓库里，脚本那一步是重复劳动**，谁先谁后还成了竞态
（后到的一方会 422）。

- [`scripts/release.mjs`](./scripts/release.mjs) — 有 `.github/workflows/release.yml` → 只推 tag，
  然后查一次确认（查到就报 `release.yml 已建`，没查到就提示「约 1 分钟后按第 ④ 条确认」）；
  没有 workflow → 先 `GET /releases/tags/<tag>` 查一次，已存在就跳过，避免重复建
- 顺带把「有 workflow 的仓库脚本别抢活」写进 [UPDATING](./UPDATING.md) 第 6 步那张三条路的表

## 0.1.12 — 2026-10-28

**修 0.1.11 的 `release.mjs`：建 Release 那一步改走系统 `curl`，不用 node 的 fetch**

0.1.11 自己发布时暴露的：`push` 和 `tag` 都成功，到建 Release 报 `fetch failed` ——
node 的 https 栈在本机打 `api.github.com` 走不通（证书链），而系统 `curl` 走 schannel 正常。
后果是「tag 有了、Release 没有」的半截状态，正是这个脚本想防的东西。

- [`scripts/release.mjs`](./scripts/release.mjs) —— 建 Release 改成 `execFileSync("curl", …)`，
  token 从环境变量进、正文走 stdin（`--data-binary @-`）；失败时把 curl 的 stderr 打出来，
  不再吞成一句 `fetch failed`
- 顺带留了注释说明为什么这一步**故意不用 fetch** —— 上次就是「文档里记着、代码里忘了」

## 0.1.11 — 2026-10-28

**读完四个真实插件之后补的四块东西 —— 都是「它们每个都重写了一遍」的部分**

比对了 `magicrew-auth` / `officeace` / `loomy-auth` / `today` 与模板的代码分布：
模板的 `src/` 只有 78 行，真实插件是 1,397~3,683 行；模板 `index.mjs` 535 行，
最成熟的那个（magicrew）只有 80 行。差的不是钩子，是**钩子下面那一层**。

- **新增 [`scripts/release.mjs`](./scripts/release.mjs)** —— 一键发布：体检六项（版本 / CHANGELOG 有该版本 / 工作区干净 / 在默认分支 / 不落后远端 / tag 未被占）→ push → tag → 建 Release，最后把第 7 步的四条验证命令打印出来。默认只预演，`--yes` 才动手；`--npm` 连 npm 一起发。**它故意不替你做第 0~3 步**（写 CHANGELOG / bump / pack 预演 / 提交）—— 那四步要人判断，而且体检会把它们当输入检查
- **新增 [`src/api.mjs`](./src/api.mjs)** —— `headersFor` / `read` / `get` / `asModelError` / `asSignInExpired`。四个插件 4/4 都有这个文件，因为**错误语义只该在一处定义**：401 是登录失效（整个账号停）、404 是模型不可用（只影响这次），混用一次就打死一个账号
- **新增 [`src/models.mjs`](./src/models.mjs)** —— `isUsable` / `priceOf` / `buildModels` / `defaultEntry`。把「部分成功三态」写成代码：整个接口失败 → 退回快照；接口成功但单条缺价格 → 不列；登录失效 → 抛 `signIn: "expired"`。`free` 按厂商声明三分支，不从 `rate` 反推
- **新增 [`src/chat.mjs`](./src/chat.mjs)** —— `passThrough` / `withUsage` / `singleShotToSSE` / `normalizeUsage`。流式三坑：不要读干流、流式必须带 `stream_options.include_usage`、magpie 不接受 `stream:false`
- **新增 [`tests/semantics.test.mjs`](./tests/semantics.test.mjs)** —— 16 条语义锁（`node --test tests/`）。`check.mjs` 查形状，这一份查语义：上面三块的错法全都「不报错」，只能靠它拦
- [AGENTS](./AGENTS.md) —— 坑表补 3 条（按账号落盘、三态降级、index 只装配），新增「五、长大之后：从单文件到 `src/`」：给出四个真实插件的 index/src/tests 实测行数，和「什么时候该搬」的判据
- [UPDATING](./UPDATING.md) —— 第 6 步改成三条路（`release.mjs` / workflow / 手工）并给「什么时候该有 `release.yml`」的判据；「四、更新内容怎么写」补一条：每个版本末尾用 `> 起因：` 记为什么（它不进 Release 正文）

> 起因：读完四个真实插件后的对比。通用件不是钩子，是 `api` / `models` / `chat` 这三个文件
> 加一份语义测试 —— 四个仓库里每一个都独立重写了一遍，而且每一份都踩过同样的坑。

## 0.1.10 — 2026-10-28

- **新增 [AGENTS.md](./AGENTS.md)** —— 给 AI 执行者的入口：按「你在哪一步」给阅读顺序（开工 / 写钩子 / 交付 / 发版 / 用户说没更新），外加 15 条会静默出错的坑（症状 → 判据 → 出处）。派生仓库直接带走
- **新增 [CHECKLIST.md](./CHECKLIST.md)** —— 两张勾选表：A 表代码交付前 13 项（`check.mjs` 查不到的：钩子语义、`usage.used`、`free` 不从 rate 反推、上下文窗口实测、404 vs 401…），B 表发版前七步带命令与判据
- [README](./README.md) —— 「动手前先读这三份」改成**「必读四份」**，第四份是 `UPDATING.md`：它原来只出现在下面「目录」里，读完前三份就去写代码的人会漏掉发布
- [README](./README.md) —— 开头补一句：`git push` 只是发布七步里的第 4 步；「之后每一次更新」里的「六步」改正成**七步**（原来漏了 `npm pack --dry-run` 与 tag/Release 的完整对应）
- [UPDATING](./UPDATING.md) —— 开头加「不读这份的后果（真发生过）」：push 完所有命令都不报错，但 npm 上是旧版本、GitHub 写着「暂无发布版本」
- [README-TEMPLATE](./README-TEMPLATE.md) —— 「仓库里还该有什么」补 `AGENTS.md` / `CHECKLIST.md` 两行，并写明为什么这两份对 AI 执行者尤其重要
- [scripts/check.mjs](./scripts/check.mjs) —— 末尾输出加两行：把「脚本查不到的」指到 `CHECKLIST.md` 的 A / B 表。脚本绿了 ≠ 能发布

> 起因：`magpie-magicrew-auth` 0.3.14 发布时**只 push 没发 npm、没打 tag、没建 Release**，
> 而当时确实读过 README。根因不是「不知道有 `UPDATING.md`」，是它没进阅读路径 ——
> README 顶部的必读清单只有三份。整理目标是：**任何 AI 从这个仓库的任何入口进来，
> 都能在几分钟内知道「发布是七步，push 只是第 4 步」。**

## 0.1.9 — 2026-10-27

- **删掉 `src/self-register.mjs`** —— 插件不再往 `~/.cache/magpie/plugin-market.json` 写条目：那是 magpie 的文件，按包名 merge 会把 registry 条目盖掉（上游 review `magpie-community/plugins#399` 明确要求删）
- **新增 `registry-entry.json`** —— 要提交给 `registry.json` 的条目形状摆在这里，改四个字段即可
- [README](./README.md) —— 「卡片上的许可证和『源码』按钮」整节重写：载体是 registry 条目，不是本地缓存；「方式三」那段的「用自注册绕开审核」删掉
- [scripts/check.mjs](./scripts/check.mjs) —— ⑩ 从「读 index.mjs 里的 `REGISTRY_ENTRY`」改成「读 `registry-entry.json`」，另加一条静态检查：入口与 `src/` 里不准出现 `plugin-market.json` / `startSelfRegister`
- [README](./README.md)、[README-TEMPLATE](./README-TEMPLATE.md)、[UPDATING](./UPDATING.md)、[HOOKS](./HOOKS.md) —— 四处提到 `REGISTRY_ENTRY` 的地方跟着改

> 起因：OfficeAce 那份 PR 的 review。结论是插件对 magpie 的目录**只有读的份** —— 想改卡片上看到的东西，只能改 registry 条目。

## 0.1.8 — 2026-10-27

- [MULTI-PROVIDER](./MULTI-PROVIDER.md) —— 铁律 6 重写：卡片上那个「承载 X、Y」**不是 package.json 字段**，magpie ≥ 0.1.1744（`766356c`，issue #3902）从插件**注册的 provider 名**派生；草案里的 `magpie.carries` 从未随任何 magpie 发布。附「什么时候出现」与「名字带不带站点」的判据
- [HOOKS](./HOOKS.md) —— 九之三原来断言「第三方插件挣不到这个徽章」，改成派生规则：`servesBeside` 的四条行为、`moved` 与 `serves` 怎么拼成一个 chip、tooltip 只留给 `moved`
- [README](./README.md) —— 「数据字段」表那一行改成「没有字段」；会过期的「24 项规定」换成脚本自己报的总数
- [scripts/check.mjs](./scripts/check.mjs) —— 撤掉 `magpie.carries` 的 4 条形状检查，换成 1 条：写了这个已作废的字段就警告，提示删掉

> 起因：issue #3902。上游没走「包里自己声明」（option 1），选了「从注册的 provider 派生」（option 2）。
> 本仓库按 option 1 写的草稿（PR #1）随之作废；这一版记录的是上游**实际发布**的行为。
> 实测环境：magpie v0.1.1744 + windows/amd64 + magpie-magicrew-auth 0.3.8 的文件夹安装。

## 0.1.7 — 2026-10-27

- [README-TEMPLATE](./README-TEMPLATE.md) —— **模型段改版**：开头写发行商（`DeepSeek / GLM / GPT`），不写「支持 N 个模型」；表格只留各家最新 / 热门一两行，全量交给 `magpie plugin list`
- [README-TEMPLATE](./README-TEMPLATE.md) —— 硬规则加第 8 条（发行商而非数量）；反例对照补「模型数量」与「整表贴满」两行；「完整实例」注明 loomy 的模型段是旧写法，以本模板为准
- [README](./README.md) —— 「写 README」摘要同步这条规则；「README.md 写清四件事」把「有哪些模型」改成「支持哪几家发行商」
- [HOOKS](./HOOKS.md) 第十节 —— 「README 写清四件事」第 4 条改成「支持哪几家发行商，各家只列最新 / 热门」，并写明别写「支持 N 个模型」的理由

## 0.1.6 — 2026-10-27

- **分清三个名字**（这是个真混淆过的地方）：`package.json` 的 `name` → 插件卡片标题；
  `config.provider[id].name` → 供应商列表那一行；`REGISTRY_ENTRY.name` → 市场条目显示名，**不是**卡片标题；
  仓库名只进链接
- [HOOKS](./HOOKS.md) 九之二 —— 加「先把三个名字分清」对照表 + `magpie-magicrew-auth` 的实例
- [MULTI-PROVIDER](./MULTI-PROVIDER.md) / [README](./README.md) —— 改正两处把供应商名写成「卡片标题」的注释

## 0.1.5 — 2026-10-27

- **图标规则落实成代码**，不再只躺在文档里：模板 `package.json` 的 `magpie.icon` 直接带一份可用的 data URI，`index.mjs` 的 `auth.icon` 用同一份，并在注释里写明「两处各管一个位置，缺一份就有灰方块」
- [HOOKS](./HOOKS.md) —— 新增「插件自己的图标：`magpie.icon`」：`iconOf` 管供应商卡片，`InstalledIcon` 只管**插件卡片**，`auth.icon` 到不了后者；附源码与「只写一处会灰在哪」的对照表
- [HOOKS](./HOOKS.md) —— 新增「九之三、卡片上的徽章从哪来」：`供应商 / Request hook / 中间件 / 页面` 是插件挣得到的，**`承载 {names}` 挣不到** —— `provider.MovedOnto` 只遍历 magpie 自己的内置订阅（当前 19 个），不在清单里的产品永远返回空。附源码，避免下一个人再去试
- 遵守[最小交付面](./README.md#最小交付面)：只对齐声明，不加脚本、不加钩子、不碰运行时

## 0.1.4 — 2026-10-27

- **新增 [MULTI-PROVIDER.md](./MULTI-PROVIDER.md)** —— 单插件多供应商：magpie 认「具名导出」的机制、`makePlugin(SITE)` 骨架、五条铁律（provider id 不改 / `auth` 里不存站点 / 图标名字要分开 / 站点差异集中声明 / 未登录别给假模型）、模型目录改用快照 + 实时拉、反例对照、验证清单、registry 登记
- [README](./README.md) —— 「动手前先读这两份」改成三份，目录加「单插件多供应商」一行
- [HOOKS](./HOOKS.md) —— 开头补一条指向 MULTI-PROVIDER.md：多供应商时 `auth` 里不能再存站点字段
- 参考实现：[MYCF711/magpie-magicrew-auth](https://github.com/MYCF711/magpie-magicrew-auth)（两站）、`opencode-workbuddy-auth`（两站）、`opencode-qoder-auth`（四站）

## 0.1.3 — 2026-10-26

- **新增 [UPDATING.md](./UPDATING.md)** —— 更新途径：magpie 的两条检测路径（npm 源比 `version`、git 源比默认分支 HEAD 的 commit）、发版六步、CHANGELOG 规矩、发版前清单
- **新增本文件** —— 更新记录从这一版起逐条记
- [README](./README.md) —— 目录与「怎么发布」指向 UPDATING.md
- [README-TEMPLATE](./README-TEMPLATE.md) —— 文件清单加 `CHANGELOG.md`，骨架末尾加一行更新记录路标
- [HOOKS](./HOOKS.md) —— 新增「九之二、插件名」：卡片标题来自 `plugins/package.json` 的依赖键名（附 `plugin.Name()` 源码、改名三步、以及 `add` / `update` 会覆盖手改键名这条陷阱）
- [HOOKS](./HOOKS.md) —— 「卡片上的其他文字来自哪」补上「版本后面那串 = 已装 commit 短 sha（只有 git 源有）」，并说明它同时解释了 git 源为什么按 commit 判断更新
- **新增 [.github/workflows/release.yml](./.github/workflows/release.yml)** —— 推 `v*` tag 就用仓库自己的 token 把本文件里该版本的条目建成 GitHub Release（正文与 CHANGELOG 同源）
- **UPDATING.md 补「卡片标题」一节** —— **在仓库里改 `name` 才是正路**，`add` / `update` 都不会重置；手改依赖键只是已发布插件的兜底（三处同步：`package.json` / `bun.lock` / `node_modules`）
- [UPDATING.md](./UPDATING.md) —— 再补一节「git 源想要大写标题、npm 又要能发」：发布时用脚本临时换 `name`（实测：打包出来是小写包名，跑完自动还原），两个来源各得其所、npm 那边包名不变
- [UPDATING.md](./UPDATING.md) —— 补上这条路的**端到端实测**：改 `name` 后 `plugin rm` + `add`，全程不碰文件，装出来的依赖键就是 `OfficeAce`，`bun.lock` 的值首段也变成包名（officeace / loomy 各验一次）
- [README](./README.md) —— 「怎么发布 → npm」原来只写裸跑 `npm publish`，补上「显示名与包名不同的插件走 `npm run publish:npm`」；[README-TEMPLATE](./README-TEMPLATE.md) 的安装骨架与 [HOOKS](./HOOKS.md) 的改名说明同步改掉过时说法
- `package.json` —— `files` 带上 `UPDATING.md` 与 `CHANGELOG.md`

## 0.1.2 及更早

早于本文件的引入，记录见 `git log --oneline`。
