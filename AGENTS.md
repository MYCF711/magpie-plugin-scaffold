# AGENTS.md —— 给 AI 执行者的入口

> 人类请读 [README](./README.md)。这份只回答两件事：
> **你现在该读哪一份**，以及**忘了哪一条会静默出错**。
>
> 从本模板派生出去的插件仓库，请把这份一起带走 —— 下面每一条对派生仓库同样成立。

---

## 一、先定位你在哪一步

别从头读到尾。先看自己在哪一格，只读那一格指的文件。

| 你在做什么 | 必读（按顺序） | 做完的判据 |
|---|---|---|
| **还没开工**，手上只有一台 magpie | 本文件 → [README](./README.md) 的「必读四份」「最小交付面」「三条铁律」 | 能说清「哪些事 magpie 已经做了、插件不该重做」 |
| **决定要不要拆成两个供应商**（国内版 / 国际版） | [MULTI-PROVIDER.md](./MULTI-PROVIDER.md)（只有一个站点：跳过） | 两张卡、两组登录态，互不覆盖 |
| **填那五个 TODO / 改钩子** | [HOOKS.md](./HOOKS.md) —— **按钩子查章节，不要通读** | 每个钩子的返回值形状与第 21 章一致 |
| **代码写完，准备交付** | [CHECKLIST.md](./CHECKLIST.md) 的 **A 表** | A 表全勾 + `node scripts/check.mjs` 退出 0 |
| **要发一个版本** | **[UPDATING.md](./UPDATING.md) 全文** | [CHECKLIST.md](./CHECKLIST.md) 的 **B 表**全勾 + 四条验证 |
| **用户说「有新版本但我这边没动静」** | UPDATING 的「一、magpie 怎么发现新版本」 | 分清是 npm 源（比 `version`）还是 git 源（比 HEAD commit） |

**最容易漏的是第 5 行。** `git push` 不是发布 —— 它是七步里的第 4 步。
少做一步的表现不是报错，而是「本地全对、用户永远停在旧版本」。

---

## 二、十三条会静默出错的坑

「症状」列照着你看到的现象查；「判据」是正确做法；「出处」是完整论证。

| # | 症状（出问题时你看到什么） | 判据 | 出处 |
|---|---|---|---|
| 1 | 额度条永远是 100%；空账号反而排到队首 | `usage.used` **必填**且是有限数字 —— 它也是路由排序输入，漏了按 0% 算 | HOOKS 九 |
| 2 | 免费模型被反复派发；或收费模型被标成免费 | `free` 只认厂商自己的声明（价格字段为 0 / 展示名写免费），**不能从 `rate === 0` 反推**：实测 51 条 `rate=0` 里 38 条仍吃套餐额度 | HOOKS 十一之二 |
| 3 | 点登录后界面转圈很久，或模型列表整个卡住 | `authorize()` 必须**立刻**返回；网络请求一律挪到 `loader` | README 铁律 2 |
| 4 | 刷新一次 token 后某个字段变空，或用户被要求重登 | `refresh` 返回的是**合并**结果，只给新字段会覆盖掉旧的 | README 铁律 3 |
| 5 | 插件装上了，但模型列表空、界面没反应 | `config.models` 必须有内容（可以是静态占位） | README 铁律 1 |
| 6 | 某一个模型报错，**整个账号**被停用 | 模型级错误返回 **404**，不是 401 —— 401 会被当成登录失效 | README 常见坑 2 |
| 7 | 登录偶尔「莫名失效」，多账号同时刷新时更常见 | 一次性 `refresh_token` 必须**串行**（同账号同时只允许一次刷新） | README 常见坑 4 |
| 8 | 流式输出卡住 / 只有第一段就结束 | 不要在 `fetch` 里读流，把 `Response` 原样交回去 | README 常见坑 5 |
| 9 | GitHub 把 license 标成 `NOASSERTION`，卡片上没有许可那一格 | `LICENSE` 必须是**逐字 MIT 正文**，归属说明另放 `NOTICE.md` | README 顶部四件 |
| 10 | 改了代码重装，行为一点没变 | 同版本号重打包会命中 bun 缓存（`no changes`）—— 必须 bump `version` | UPDATING 第 1 步 |
| 11 | `magpie plugin add xxx.tgz` 跑完像成功，实际没装上 | 这个命令有 bug，改 `plugins.json` + `plugins/package.json` 两处 | README 常见坑 1 |
| 12 | 想让卡片标题/文案对，去改了 magpie 的缓存文件 | 插件对 magpie 的目录**只有读的份**；唯一载体是 `registry-entry.json` | README「不要写 magpie 的缓存」 |
| 13 | 用户那边没更新 / Release 页面是空的 / 「暂无发布版本」 | 发布是**七步**（写 CHANGELOG → bump → pack 预演 → 提交 → push → `npm publish` → tag + Release → 四条验证）。**push 只是第 4 步** | UPDATING 二 · CHECKLIST B |

补充两条只在发布侧出现的：

| # | 症状 | 判据 | 出处 |
|---|---|---|---|
| 14 | 推了分支，magpie 还说没更新 | git 源比的是**默认分支** HEAD 的 commit；推别的分支不算。而 `plugin add` 不会更新已有的锁 | UPDATING 一 / 六 |
| 15 | magpie 的 Discover 里搜不到自己的包 | `keywords` 要含 `opencode` + `plugin`/`auth`/`provider` + `magpie`；仓库要打 `magpie-plugin` topic | README 顶部四件 |

再三条与代码结构有关的 —— 它们不报错，但会让插件在多账号 / 部分成功 / 长大后出问题：

| # | 症状 | 判据 | 出处 |
|---|---|---|---|
| 16 | 加了第二个账号，第一个账号的数据变了 / 串号 | 一切按账号落盘的东西，文件名必须带账号（`<plugin>-<siteId>__<account>.json`）；**不要用模块级变量存 per-account 状态** —— 宿主是同一个进程跑所有账号 | [`src/hooks/models.mjs`](HOOKS.md) 的 `inScope` |
| 17 | 接口抖一下，列表整个空掉；或某个模型缺价格，用户选了报错 | **部分成功有三态**，方向要各自选对：① 整个接口失败 → 退回上次快照（不要返回空表）② 接口成功但单条缺字段 → **不列**（不猜）③ 登录失效 → 抛 `signIn: "expired"` | [`src/models.mjs`](./src/models.mjs) 的 `buildModels` |
| 18 | 越改越乱，`index.mjs` 涨到几百行，改一个钩子要读全篇 | 成熟形态是**`index.mjs` 只做九项钩子的装配，实现全在 `src/`**。实测四个真实插件的 `index.mjs` 是 80~715 行，而 `src/` 是 1.4k~3.7k 行 —— 而本模板现在是反过来的（index 535 行 / src 78 行） | 本文件「五、长大之后」 |

还有两条是 **magpie 0.1.1763 重新提取契约后才发现**的（2026-10-28）：

| # | 症状 | 判据 | 出处 |
|---|---|---|---|
| 19 | 某个能力「明明实现了却没生效」：模型不会联网、不能收图、没有思考档、折扣前的倍率不显示 | 模型 / provider 条目上有一批**不写就等于关掉**的字段：`searches`（模型级=这条自己会搜，provider 级=上游整体会搜）、`decides`（decision 模型，从 agent 列表隐藏）、`rateWas`（折扣前倍率）、`fast`、`serviceTiers`、`modalities`（图片 / 音频能力全靠它） | HOOKS 十一之三 |
| 20 | 厂商有画图模型，插件里当垃圾过滤掉了；或者反过来，列进去之后用户在 chat 里选中报 400 | magpie **0.1.1707 起**支持插件供图（`DrawsID` + `ImagesAPI` + npm 是 `@ai-sdk/openai-compatible`）。但它**同时**留在 chat 模型列表里 —— 列不列是取舍，判据见 [`src/models.mjs`](./src/models.mjs) 的 `LIST_IMAGE_MODELS` | HOOKS 十一之三的「插件供图」 |
| 21 | 花一晚上追 magpie 的「每个版本」，改了一堆文档，用户那边一点变化都没有 | **判断要不要同步，看稳定渠道**（magpie 设置里那个「更新渠道：每个版本 / 稳定版」）。`curl -s "https://usemagpie.ai/api/latest?channel=stable"` 拿稳定版版本号；2026-10-28 实测：每版本 0.1.1763 / **稳定版 0.1.1327**，逐字段比对后插件相关字段**完全一致** —— 追每版本几乎全是白跑。一条命令判断：`node scripts/check-magpie-stable.mjs` | HOOKS 顶部 · UPDATING 一 |

---

## 三、命令

```bash
# 合规检查 —— 退出码非 0 就是不合规，别靠眼睛看
node scripts/check.mjs              # 检查当前目录
node scripts/check.mjs ../my-plugin # 检查别的仓库

# 打包面预演：README / CHANGELOG / docs 在不在包里
npm pack --dry-run

# 包名撞车检查（撞了 = magpie 的「更新」会装成别人的包）
npm view <包名> version

# 语义测试 —— check 查「形状」，它查「语义」（free 三分支 / 三态降级 / 404 vs 401 / 流式 usage）
node --test

# 卡片标题与 npm 包名不同（包内 name 是大写标题）时发布
npm run publish:npm

# 一键发布：预演 → 真做 → 带 npm（tag + push + Release 一次做完）
node scripts/release.mjs             # 预演：体检六项 + 打印计划，什么都不改
node scripts/release.mjs --yes       # 真做（要 GITHUB_TOKEN 才建 Release）
node scripts/release.mjs --yes --npm # 再加 npm publish

# 手工版（release.mjs 用不了时）
git tag v0.1.8 && git push origin v0.1.8

# 重新提取 magpie 二进制里的钩子契约（核对 HOOKS.md 用）
python extract-contract.py [magpie 可执行文件]

# magpie 升级后必做：重新提取 + 自动找出 HOOKS.md 漏写的字段
python extract-contract.py && node scripts/contract-diff.mjs
#   退出码 2 = 有差集（列出前 40 个）。挑「不写会关掉某个能力」的补进 HOOKS 十一之三。

# 该不该跟着 magpie 升级动这份文档？**看稳定渠道，不看每版本渠道**
node scripts/check-magpie-stable.mjs
#   0 = 基线就是当前稳定版，不用动；2 = 稳定版变了，按它打印的三步走
#   裸查：curl -s "https://usemagpie.ai/api/latest?channel=stable"
```

---

## 四、两个交付门

**门 1 · 代码交付**（给用户能装之前）

```
□ node scripts/check.mjs 退出码 = 0
□ CHECKLIST.md 的 A 表全勾（check 脚本查不到的那部分）
□ 五个 TODO 的语义按 HOOKS.md 对过一遍，不是「能跑就算」
```

**门 2 · 发布**（说「已发布」之前）

```
□ CHECKLIST.md 的 B 表全勾
□ 四条验证都跑过：npm 版本 / tarball 内容 / 本机 magpie 认得 / Release 在
```

⚠ **没过门 2 不许说「已发布」。** 只 push 过就说已发布，是在用印象代替验证。

---

## 五、长大之后：从单文件到 `src/`

本模板刻意是**单文件入门**（九个钩子一屏读完，五个 TODO 在底部）。但插件一旦有登录、
缓存、多账号、签到…就会长。四个真实插件的实测形态是这样：

| 仓库 | `index.mjs` | `src/` | `tests/` |
|---|---|---|---|
| 本模板 | 535 行 | 1 文件 / 78 行 | 0 |
| `magpie-magicrew-auth` | **80** | 21 文件 / 3,683 行 | 6 |
| `magpie-officeace` | 347 | 7 文件 / 1,397 行 | 0 |
| `magpie-loomy-auth` | 611 | 9 文件 / 1,905 行 | 4 |
| `magpie-today` | 715 | 18 文件 / 2,812 行 | 7 |

结论：**`index.mjs` 只做装配，实现全在 `src/`** —— 最成熟的那个（magicrew）index 只有 80 行。

已经备好四块骨架（前三块四个插件里 4/4 都有；`store` 只有 magicrew 独立成文件，
另两个各自实现了等价逻辑）：

| 文件 | 里面写什么 | 为什么单独拎出来 |
|---|---|---|
| [`src/api.mjs`](./src/api.mjs) | `headersFor` / `read` / `get` / `asModelError` / `asSignInExpired` | 错误语义只在一处定义 —— 401 与 404 混用会打死整个账号 |
| [`src/models.mjs`](./src/models.mjs) | `isUsable` / `priceOf` / `buildModels` / `defaultEntry` | 三态降级 + `free` 三分支，错法都长得像「正常」 |
| [`src/chat.mjs`](./src/chat.mjs) | `passThrough` / `withUsage` / `singleShotToSSE` / `normalizeUsage` | 流式三坑：读干流、漏 `include_usage`、`stream:false` 不被接受 |
| [`src/store.mjs`](./src/store.mjs) | `fileOf` / `readJson` / `writeJson` + 快照 / 登录态 / 一次性标记三件套 | 只写 `~/.cache/magpie`、文件名带账号、原子写、可整目录删 |
| [`tests/semantics.test.mjs`](./tests/semantics.test.mjs) | 16 条语义锁 | `check.mjs` 查不到的那部分，只有它能拦 |

**拆分示例**：[`examples/split/`](./examples/split/) 把「index 只装配」这件事摆了一遍
（三个钩子各占一个文件 + 一个 40 行的 index）。钩子只有三种形态，其余五个照同一规则搬。

**什么时候该搬**（出现任一情形就搬，别等）：

- 某个钩子函数超过 60 行，或同一个 `fetch` 在三个钩子里重复出现 → 抽 `src/api.mjs`
- 需要在两次调用之间记住东西（token、快照、当天做过的标记）→ 加 `src/store.mjs`，
  **文件名里必须带账号**（坑 16）
- 开始有第二个账号进来 → 先查有没有模块级变量在存 per-account 状态

---

## 六、文档地图

| 文件 | 管什么 | 什么时候读 |
|---|---|---|
| [README](./README.md) | 这个模板的设计原则：最小交付面、九项清单、三条铁律、常见坑 | 开工前 |
| [HOOKS.md](./HOOKS.md) | 21 章钩子契约（**比官方文档全**，官方漏了 `auth.checkin`） | 写代码时按钩子查 |
| [MULTI-PROVIDER.md](./MULTI-PROVIDER.md) | 一个包两个供应商（国内/国际）：判据、骨架、五条铁律 | 只有多站点时 |
| [UPDATING.md](./UPDATING.md) | 发版本的七步、magpie 怎么发现新版本、用户怎么拿到 | **每次发布前** |
| [README-TEMPLATE.md](./README-TEMPLATE.md) | 插件介绍页模板（用户只看它决定装不装） | 写 README 时 |
| [CHECKLIST.md](./CHECKLIST.md) | 两张勾选表：交付前 / 发版前 | 两个交付门 |
| [CHANGELOG.md](./CHANGELOG.md) | 本模板自己的更新记录（格式即范例） | 找「为什么这样改」 |

---

## 七、这份文件的维护规矩

1. **任何一份专档新增/改写一条「会静默出错」的结论，就在第二节加一行**（症状 → 判据 → 出处）。
   不加的后果：这份表会慢慢过期，而 AI 会照样信它。
2. 第二节只放一句话判据，**论证留在出处那一份**。别在这里复制长段落 —— 两份会打架。
3. 新增一份文档，就要在第五节加一行，并说明「什么时候读」。
4. 判据要能**当场验证**（能跑的命令、能看的字段）。写不成判据的，是感想，不是规矩。
