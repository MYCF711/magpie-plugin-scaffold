# 更新记录

> 每个版本一节，**一条一行**，说用户能感知的变化。
> 格式与规矩见 [UPDATING.md](./UPDATING.md)。

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
