# 更新记录

> 每个版本一节，**一条一行**，说用户能感知的变化。
> 格式与规矩见 [UPDATING.md](./UPDATING.md)。

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
