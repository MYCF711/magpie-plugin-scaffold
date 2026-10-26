# 更新记录

> 每个版本一节，**一条一行**，说用户能感知的变化。
> 格式与规矩见 [UPDATING.md](./UPDATING.md)。

## 0.1.3 — 2026-10-26

- **新增 [UPDATING.md](./UPDATING.md)** —— 更新途径：magpie 的两条检测路径（npm 源比 `version`、git 源比默认分支 HEAD 的 commit）、发版六步、CHANGELOG 规矩、发版前清单
- **新增本文件** —— 更新记录从这一版起逐条记
- [README](./README.md) —— 目录与「怎么发布」指向 UPDATING.md
- [README-TEMPLATE](./README-TEMPLATE.md) —— 文件清单加 `CHANGELOG.md`，骨架末尾加一行更新记录路标
- [HOOKS](./HOOKS.md) —— 新增「九之二、插件名」：卡片标题来自 `plugins/package.json` 的依赖键名（附 `plugin.Name()` 源码、改名三步、以及 `add` / `update` 会覆盖手改键名这条陷阱）
- **新增 [.github/workflows/release.yml](./.github/workflows/release.yml)** —— 推 `v*` tag 就用仓库自己的 token 把本文件里该版本的条目建成 GitHub Release（正文与 CHANGELOG 同源）
- **UPDATING.md 补「装完把卡片标题改成供应商名」** —— 依赖键就是显示名，三处同步（`package.json` / `bun.lock` / `node_modules`），`add` / `update` 会把它改回包名
- `package.json` —— `files` 带上 `UPDATING.md` 与 `CHANGELOG.md`

## 0.1.2 及更早

早于本文件的引入，记录见 `git log --oneline`。
