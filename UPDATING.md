# 更新途径

> 插件发出去之后：**怎么发下一个版本，用户怎么拿到它。**
> 首次发布（`npm publish` + 进市场）见 [README](./README.md) 的「怎么发布」——
> 这一份只管**之后每一次**。

发出去就不管，用户永远停在第一个版本。所以这份和「怎么发布」一样是必读的。

---

## 一、先搞清楚 magpie 怎么发现「有新版本」

**两条路，机制不一样。** 搞错了就是「我明明发了，用户那边没动静」。

| | npm 源 | git 源 |
|---|---|---|
| 装法 | `magpie plugin add <包名>` | `magpie plugin add github:owner/repo` |
| magpie 比什么 | npm registry 上的 **`version`** | 默认分支 HEAD 的 **commit** |
| 怎么拿 | npm registry | `https://api.github.com` + `git/ref/heads/<默认分支>` |
| 之后会怎样 | **自动更新** | 只**提示**，要用户手动更新 |
| 证据落在哪 | `~/.config/magpie/plugin-updates.json` 的 `updated[]` | 界面文案「N plugins have updates」|

实测（2026-10-26）：`plugin-updates.json` 里 9 条记录**全是 npm 包**，
两个 git 源插件一条都没有 —— git 源没有版本号可比，magpie 比的是 commit。

⇒ 两条硬推论：

1. **git 源必须推到默认分支（`main`）。** 推别的分支 HEAD 不变，magpie 永远认为没更新。
2. **npm 源必须 bump `version` 再 `npm publish`。** 不 bump 就检测不到。

> **只走 git 源也可以。** 不发 npm 的插件（比如这个模板仓库自己），就只有「push 默认分支」
> 这半条路 —— npm 那张表不适用。少一个发布口，少一处出错。

---

## 二、发一个版本：照这个顺序

### 第 0 步 · 先写更新内容

见下面的「四、更新内容怎么写」。**不是发完再补** —— 写的时候才发现某条改动
说不清楚，往往说明那个改动本来就有问题。

### 第 1 步 · bump `version`

```bash
# package.json 的 version
npm version patch --no-git-tag-version     # 0.1.7 → 0.1.8；minor/major 同理
```

⚠ 改了包名的话，三处必须同步（缺一个静默错位）：
`package.json` 的 `name`、`index.mjs` 里 `REGISTRY_ENTRY.package`（**一字不差**）、
`README` 里的安装命令。

### 第 2 步 · 本地验证打包内容

```bash
npm pack --dry-run          # 看清单：README、CHANGELOG、docs 都在里面吗
```

### 第 3 步 · 提交

一条 commit 一件事，message 用 `<范围>: <小写句子>`：

```
models: the context was 1M, not 128K
readme: rewrite the front page on the template shape
```

### 第 4 步 · 推到默认分支

```bash
git push origin main
```

⚠ **必须是默认分支。** git 源的更新检测看的就是它的 HEAD。

### 第 5 步 · 发 npm

```bash
npm publish
```

⚠ 同版本号重复 publish 会被拒；改了代码必须 bump（见第 1 步）。
⚠ **包内 `name` 与 npm 包名不同的话**（就是「git 源想要大写标题、npm 又要能发」那种），
裸跑会被 registry 拒 —— 那种插件走 `npm run publish:npm`。

### 第 6 步 · 在 GitHub 上发 Release

**这一步是给人看的，不是给 magpie 看的**（原因见下面的 ⚠）——
但不做，用户就没有一个地方能一眼看出「这个版本改了什么」。

#### 有 workflow 的话：推个 tag 就完事

本模板带了 [`.github/workflows/release.yml`](./.github/workflows/release.yml)：
推一个 `v*` tag，它就用仓库自己的 token 把 `CHANGELOG.md` 里该版本那几条抽出来建成
Release。**正文只有一处来源**，不会和 CHANGELOG 打架。

```bash
git tag v0.1.8 && git push origin v0.1.8
```

⚠ 这个 workflow 只建 Release —— 它**不碰 npm，也不替你 push 分支**。

⚠⚠ **别用「删 tag 再重推」来刷新正文。** 删 tag 并不会删掉 Release —— GitHub 把它
**转成草稿（`draft: true`）**。草稿在网页和匿名 API 上都看不见（`releases/tags/<tag>` 直接
404），只有带 token 的 `releases` 列表能看到它；表现得很像「Release 没了」，其实还在。
想刷新已发版本的正文，去 **Actions 页面手动跑一次 `release`**（workflow 带
`workflow_dispatch`，填 tag 即可），或者干脆改 `CHANGELOG.md` 发下一个版本。

⚠ 如果 Release 已经躺在草稿态（上面那个坑），发出去：

```bash
gh release edit v0.1.8 --draft=false
```

本模板的 workflow 已经在 edit 分支带上 `--draft=false`，不会再把草稿留在草稿态。

#### 没有 workflow 的话：手工发

打开 `https://github.com/<owner>/<repo>/releases/new`：

| 字段 | 填什么 |
|---|---|
| Choose a tag | `v0.1.8` —— 新建，和 `package.json` 的 `version` 一致，前面加 `v` |
| Target | 默认分支 |
| Release title | `0.1.8`（或一句话概括这次最要紧的那条）|
| Describe this release | **把 CHANGELOG 里这个版本那几条原样粘过来，一条一行** |

命令行等价（`gh` 已登录时）：

```bash
sed -n '/^## 0.1.8/,/^## 0.1.7/p' CHANGELOG.md | sed '$d' > /tmp/notes.md
gh release create v0.1.8 --title 0.1.8 --notes-file /tmp/notes.md
```

⚠ **Release / tag 不参与 magpie 的更新检测。** 实测：git 源比的是**默认分支 HEAD 的
commit**，npm 源比的是 registry 上的 **`version`** —— 两条路都不看 Release 和 tag。
所以「发了 Release 就算发布完了」是错的：**push 和 publish 一个都不能少。**

Release 的价值在另外三处：

1. 用户点进去就能读「这个版本改了什么」（一条条），不用去翻 commit log
2. tag 让「某个 bug 出在哪个版本」有据可查
3. GitHub 会自动附上该 tag 的源码包

### 第 7 步 · 验证（四条都要过）

```bash
# ① npm 上是不是新版本（发布后可能要等一两分钟才可见）
npm view <包名> version

# ② 线上 tarball 里确实是新内容 —— 别只看版本号
url=$(npm view <包名>@<新版本> dist.tarball)
curl -s "$url" | tar -xzOf - package/CHANGELOG.md | head -20

# ③ 本机 magpie 认得
magpie plugin list | grep -A1 <名>

# ④ Release 在（tag 与 version 一致）
gh release view v<新版本> --json tagName,url
```

---

## 三、用户侧：怎么拿到更新

### npm 装的人

不用管 —— magpie 自己会更新（`KeepUpdated`），结果记在
`~/.config/magpie/plugin-updates.json` 的 `updated[]` 里（`from` / `to` / `at`）。

想手动催一次：

```bash
magpie plugin update          # 装每个插件的最新版
```

### git 装的人

magpie 只会**提示**，要用户手动更新：

```bash
magpie plugin update
```

⚠ 若版本没动，是 `bun.lock` 锁住了旧 commit —— 这时**单跑 `plugin add` 也没用**
（实测：它会打印 `✓ added`，版本却不变）。先移除再装，才会重新解析：

```bash
magpie plugin rm <插件名>
magpie plugin add github:owner/repo
```

⚠⚠ **`rm` + `add` 会把 `plugins/package.json` 的依赖键改回包名** ——
而那个键**就是卡片上显示的名字**（见 README「常见坑 7」）。
手改回来可以，但下次 `add` / `update` 又会重置；**要永久改名只能改包内
`package.json` 的 `name`**（那会影响 npm 发布名）。

⚠ **别自己去跑 `~/.cache/magpie/bun/*/magpie-bun.exe`** —— magpie 调 bun 时会
自备 CA 环境，裸跑会报 `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`（而且 exit code 是 0，
看不出来）。一律走 `magpie plugin ...`。

### 卡片标题：在仓库里改 `name`，不要指望用户手改

**卡片标题 = 包自己的 `package.json` 的 `name`。** 链路（源码
`internal/plugin/store.go`）：

```
bun 按包内 name 写依赖键   plugins/package.json:  "<name>": "github:owner/repo"
        ↓
magpie 反查键名当标题      gitName():  for name, s := range pj.Dependencies { if s == spec { return name } }
        ↓
                          Name():     IsGit(spec) → gitName(spec)，取不到才回退成 spec 原文
```

实测：`bun add` 一个 `name: "OfficeAce"` 的包，依赖键就写成 `"OfficeAce"`。

⇒ **要永久生效，改仓库里 `package.json` 的 `name`。** 更新多少次都不会变，用户一根手指都不用动。
**这才是正路** —— 手改用户那边的键只是权宜。

⚠ 限制：**npm 不允许新包名含大写**（npm 官方校验库逐字：
`name can no longer contain capital letters`，`validForNewPackages: false`）。所以：

| 卡片标题想要 | `name` 写成 | 能发 npm 吗 |
|---|---|---|
| `officeace` | `"officeace"` | ✅ |
| `OfficeAce` | `"OfficeAce"` | ❌ —— 只能走 git 源，不发 npm |

⚠ **换 `name` 就是换包**：npm 上是一个新包，已装用户要重装一次。
所以**新建插件时就把 `name` 定成想要的显示名**，别等发出去再改。

#### git 源想要大写标题、npm 又要能发？发布时临时换 `name`

两个来源读的是**同一个** `package.json`：

| 谁读 | 读哪份 | 决定了什么 |
|---|---|---|
| bun（`plugin add github:…`）| 仓库里的 `package.json` | 依赖键 → **卡片标题** |
| `npm publish` | **同一份** | npm 上的**包名** |

一个文件喂两个地方，所以想「git 装显示 `OfficeAce`，npm 上仍是小写包名」，
只能在**发布那一下**换掉 `name`：

```js
// publish-npm.mjs —— 用 `npm run publish:npm` 跑
import fs from "node:fs"
import { execSync } from "node:child_process"

const file = "package.json"
const orig = fs.readFileSync(file, "utf8")
const pkg = JSON.parse(orig)

pkg.name = "officeace-auth"                    // npm 上的包名：小写、不变
fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n")
try {
  execSync("npm publish", { stdio: "inherit" })
} finally {
  fs.writeFileSync(file, orig)                 // 无论成败都改回来
}
```

```jsonc
// package.json
"name": "OfficeAce",                           // git 源看到的显示名
"scripts": { "publish:npm": "node publish-npm.mjs" }
```

**实测**（2026-10-26，officeace 与 loomy 各一次）：把 `name` 改成 `OfficeAce` 之后，
`magpie plugin rm OfficeAce` + `plugin add github:MYCF711/magpie-officeace`，
**全程不碰任何文件** —— 装出来的依赖键就是

```jsonc
"OfficeAce": "github:MYCF711/magpie-officeace"
```

`bun.lock` 里也跟着变成 `"OfficeAce": ["OfficeAce@github:…#<sha>", …]`（值首段 = 包名）。
⇒ 从此 `add` / `update` 都写这个键，**再也不用手改**，卡片标题稳定是供应商名。

⚠ 从此**不要裸跑 `npm publish`** —— 那会拿 `OfficeAce` 去发，而 registry 拒绝含大写的
**新**包名（不会静默变小写）。一律用 `npm run publish:npm`。

⚠ 两个来源的包名从此不同：npm 装的依赖键是 `officeace-auth`（标题就是包名），
git 装上的是 `OfficeAce`。**这正是「分开」的含义**，不是 bug。
好处是 npm 那边的包名没变 —— 已装用户照旧收到更新，不用重装。

#### 已经发出去了、又不想换包名

那只能在用户那边手改依赖键（三处同步），并且**每次 `add` / `update` 后都要改回来** ——
bun 会按包内 `name` 重写它。

```jsonc
// ~/.config/magpie/plugins/package.json
"dependencies": {
  "OfficeAce": "github:MYCF711/magpie-officeace",   // 不是 "officeace-auth"
  "Loomy":     "github:MYCF711/magpie-loomy-auth"   // 不是 "magpie-plugin-loomy-auth"
}
```

**为什么是依赖键**：magpie 没有 `displayName`，git 安装的卡片标题由
`plugin.Name()` → `gitName()` 反查 dependencies 的**键名**得来（源码见
[HOOKS.md](./HOOKS.md) 的「九之二、插件名」）。这个键同时是 `node_modules` 下的目录名。

改一处不够，**三处必须同步**：

| # | 位置 | 改什么 |
|---|---|---|
| 1 | `plugins/package.json` | `dependencies` 的键 |
| 2 | `plugins/bun.lock` | 两处键：`workspaces.dependencies` 与 `packages` |
| 3 | `plugins/node_modules/` | 目录 `旧名` → `新名` |

```bash
cd ~/.config/magpie/plugins
# 1、2 用编辑器的批量替换；3 用 mv —— 然后重启 magpie
mv node_modules/officeace-auth node_modules/OfficeAce
```

⚠ 漏掉第 3 步会报：`no such plugin: ...\plugins\node_modules\OfficeAce`。
⚠ `bun.lock` 的 `packages` 段里**键是依赖键、值的第一段是包自己的 `name`** —— 只改键：

```
"OfficeAce": ["officeace-auth@github:MYCF711/magpie-officeace#<sha>", ...]
   ↑ 改成这个            ↑ 这个不动（它是 npm 包名 / 包内 name）
```

（把包内 `name` 改成 `OfficeAce` 之后两者会一致，就不存在这个问题了 —— 见上一节。）

> 为什么值得争这个标题：卡片标题是用户唯一看到的名字。`officeace-auth` 是包名，
> `OfficeAce` 才是他装的那个服务。

---

## 四、更新内容怎么写

放 **`CHANGELOG.md`**，每个版本一节，**一条一行**。

```markdown
# 更新记录

## 0.1.8 — 2026-10-26

- **模型数纠错** —— README 与市场文案写「26 个」，实际界面只显示 7 个（平台目录 vs 计费清单）
- **README 重写** —— 按 magpie-plugin-scaffold 的九段结构；协议细节移入 `docs/internals.md`
- 删掉「跟随代理」一条 —— 包内没有代理代码
- ⚠ **破坏性**：`xxx` 配置项改名，老配置需手动迁移

## 0.1.7 — 2026-10-25

- 不再列出注册表里回 404 的模型 id
```

### 规矩

| 要 | 不要 |
|---|---|
| 一条一行，动词开头 | 一大段散文 |
| 说**用户能感知的变化**（界面、行为、数字） | 「优化了代码」「修复了一些问题」 |
| 带数字、带文件名 | 「若干改进」 |
| 新版本在最上面（倒序） | 正序追加 |
| 破坏性变更单独标 `⚠ **破坏性**` | 埋在中间让人自己发现 |
| 数字写清口径 | 换个版本就没人知道怎么复现的数 |

### 放在哪

| 载体 | 作用 |
|---|---|
| `CHANGELOG.md` | **主记录**，全历史，写在仓库里。`package.json` 的 `files` 要带上它 |
| GitHub Release | **发版动作本身**：tag `v<version>` + 正文放这次那几条（与 CHANGELOG 同源，一条一行）|
| README 末尾一行 | `> 更新记录：[CHANGELOG.md](./CHANGELOG.md)` —— 卡片正文就是 README，这是用户唯一看得见的路标 |

⚠ **magpie 的卡片只渲染 README**，不渲染别的文件。所以更新内容本身放 CHANGELOG，
README 里只留路标 —— 别把 changelog 抄一遍进 README，那是两份会打架的记录。

⚠ **Release 正文里的相对链接点不开。** `[CHANGELOG.md](./CHANGELOG.md)` 在 Release
页面上会相对 `/releases/...` 去解析 —— 正文里要么写全 URL，要么只写文件名。
（CHANGELOG 自己内部留相对链接没问题，那是仓库里的文件。）

---

## 五、发版前检查清单

```
□ CHANGELOG 里这个版本那几条写好了（一条一行，说人话）
□ version 已经 bump（npm 源检测就看它）
□ npm pack --dry-run 清单对（README / CHANGELOG / docs 都在）
□ 推到默认分支了（git 源检测看的是它的 HEAD）
□ npm publish 成功（显示名与包名不同的插件：`npm run publish:npm`）
□ GitHub Release 发了：tag `v<version>`，说明里一条条列了这次的更新
□ npm view <包名> version 已是新版本
□ 线上 tarball 抓下来看过（不只是版本号）
□ 如果是破坏性变更，CHANGELOG 里标了，README 里也提了
```

---

## 六、这套规矩是怎么来的

不是推测，是实测（2026-10-26，magpie 0.1.1254）：

| 结论 | 证据 |
|---|---|
| npm 源比 version、git 源比 HEAD commit | magpie 二进制里的符号 `plugin.GitHeads` / `GitHeadCached`、常量串 `api.github.com` + `git/ref/heads/`、界面文案 `"{n} plugins have updates"` |
| npm 源能自动更新，git 源只提示 | `~/.config/magpie/plugin-updates.json` 的 `updated[]` 里只有 npm 包 |
| `plugin add` 不会更新 git 源的锁 | lock 里 commit 停在旧的，命令照样打印 `✓ added` |
| `rm` + `add` 会更新（并重置依赖键） | lock 的 commit 从旧值变成新值；依赖键从别名退回包名 |
| 裸跑 bun 会因证书失败 | `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`；magpie 二进制里有 `plugin.caEnv` / `writeCAFile` / `systemRoots` |
| **Release / tag 不参与检测** | 二进制里 `/releases/tag/` 只出现在 magpie **自身**的下载地址（`yetone/magpie-releases`）；插件的两条检测路径分别是 `api.github.com` + `git/ref/heads/` 与 npm registry |

⚠ **未实测**：`magpie plugin update` 对 git 源插件的具体行为（没构造出「本地落后于
main」的状态）。上面写的是它该有的语义。
