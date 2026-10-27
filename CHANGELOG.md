# 更新记录

> 每个版本一节，**一条一行**，说用户能感知的变化。
> 格式与规矩见 [UPDATING.md](./UPDATING.md)。

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
