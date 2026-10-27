# magpie 插件模板

一个可直接克隆的 magpie / OpenCode 供应商插件模板 —— **九项全实现，一项不缺**。

> 克隆这个仓库，改三处配置，实现五个 TODO，就是一个标准 magpie 插件。

---

## ⚠ 动手前先读这三份

**1. [README-TEMPLATE.md](./README-TEMPLATE.md) —— 写插件介绍页的模板，照抄。**
用户只看 README 决定装不装：开头给数字、功能一句一条、不踩别人、安装放最后、
技术细节全进 `docs/internals.md`。**参考源是必填段** —— 用了别人的协议结论或实现思路，
列出来（MIT 要求，也让读者知道依据）。

**2. [HOOKS.md](./HOOKS.md) —— 钩子契约。**
从 magpie 二进制里提取的 21 章，比官方文档全（官方漏了 `auth.checkin`）。
其中一条最容易错：**`usage` 的 `used` 是必填**，它不只画进度条，还是路由排序输入 ——
漏了会被当成 0% = 满额，空号反而排到队首。

**3. [MULTI-PROVIDER.md](./MULTI-PROVIDER.md) —— 同一厂商两套云，一个包放两个供应商。**
国内版 / 国际版这种情形，做对了在 magpie 里是**两张卡、两组登录态**；做错了是
登录态互相覆盖。判据、骨架、五条铁律、验证清单都在里面。**只有一个站点的插件不用读这份。**

写完代码，这几件事**每件都踩过**：

| 事 | 判据 |
|---|---|
| `LICENSE` 必须是标准 MIT 正文 | 归属说明插在正文里，GitHub 返回 `NOASSERTION`，插件卡片就没有许可那一格 |
| 包名先 `npm view <名> version` | 撞名 = magpie 的「更新」会装成别人的包 |
| `keywords` 含 `opencode` + `plugin`/`auth`/`provider` | 否则 npm 搜索找不到 |
| 改代码要 bump `version` 再打包 | 同版本重打，bun 命中缓存（`no changes`），装了个寂寞 |

细节见 [README-TEMPLATE.md](./README-TEMPLATE.md) 的「仓库里还该有什么」一节。

## 目录

- [写 README](./README-TEMPLATE.md) —— **插件介绍页的模板，照抄这份**
- [更新途径](./UPDATING.md) —— **发下一个版本、用户拿更新，照这份走**
- [单插件多供应商](./MULTI-PROVIDER.md) —— **同一厂商两套云（国内/国际），一个包两个供应商**
- [最小交付面](#最小交付面) —— 这个模板的设计原则
- [magpie 是什么](#magpie-是什么)
- [九项清单](#九项清单)
- [三条铁律](#三条铁律)
- [怎么用](#怎么用)
- [实现五个 TODO](#实现五个-todo)
- [调试](#调试)
- [常见坑](#常见坑)
- [怎么发布](#怎么发布)
- [参考](#参考)

---

## 最小交付面

**一个插件只交付 magpie 自己没有的那部分，别的一律不做。**

magpie 已经内置了这些能力，插件**重复实现就是错**：

| magpie 已提供 | 所以插件**不要**做 |
|---|---|
| 签到调度（北京时间，每账号每天一次，失败当天重试）| 不要写 `setInterval` 或启动定时器 |
| 签到记账（`plugin-checkin.json`）| 不要自己存状态文件 |
| 签到 UI（「今日已签到 +100 · 连续 21 天」）| 不要做界面 |
| token 续期调度（`refreshLead` + 串行化）| 不要在每个请求里判断过期 |
| 账号池（`provider` / `provider#xxxxxx`）| 不要自己管理账号列表 |
| 登录作用域（`inScope`）| 不要用模块变量按 provider 存状态 |
| 代理（`via.run(proxy, ...)`）| 不要自己做代理转发 |
| 故障转移（限流/5xx 换账号或模型）| 不要自己重试换号 |
| 额度趋势（`credits-daily.json`）| 不要自己画图表 |
| 登录态标记（`X-Magpie-Sign-In`）| 不要自己判断 401 该不该停账号 |
| SDK 请求头（按 npm 包自动加 `x-api-key` / `x-goog-api-key` / `Bearer`）| 不要手动拼这些头 |
| 流式转发（分帧 + 背压）| 不要在 fetch 里读流 |
| 多语言提示、插件卡片、路由策略 | 不要碰 |

**剥掉这些之后，剩下的才是插件的交付面：九个钩子。**

这就是为什么这个模板这么小 —— 它只写 magpie 自己做不到的事。

> ⚠ 实测：`magpie-community/plugins` 的 25 个包里，**没有一个把九项全用上**。
> codearts 最全（5/6，缺 `chat.headers`），zen-free 一个都没用（它靠 pi 包适配层）。
> 「最完美的插件」目前还不存在 —— 这个模板就是那个目标形态。

---

## magpie 是什么

[magpie](https://usemagpie.ai) 是一个供应商网关。它把「一个服务的登录 + 模型 + 额度」
变成所有 agent（Claude Code、Codex、DSH、OpenCode…）都能用的一排模型。

插件是一个 npm 包 / git 仓库 / 文件夹，导出**一个 async 函数**：

```js
export const AcmeAuthPlugin = async ({ client }) => ({
  config, auth, provider, "chat.headers"
})
```

magpie 把每个插件加载进一个 Bun 进程（plugin host），通过 stdin/stdout 传 JSON。

**插件负责协议，magpie 负责其余一切。**

---

## 九项清单

### 钩子（magpie 会调）

| # | 钩子 | 作用 |
|---|---|---|
| ① | `config(cfg)` | 声明 provider 和**静态模型表** |
| ② | `auth.methods[].authorize()` | 登录 |
| ③ | `auth.refresh(auth, provider)` | token 续期 |
| ④ | `auth.loader(getAuth, provider)` | 接管请求（返回 `fetch`）|
| ⑤ | `auth.usage(getAuth, provider)` | 额度 → 卡片进度条 |
| ⑥ | `auth.checkin(getAuth, provider)` | **每日签到** |
| ⑦ | `provider.models(provider, { auth })` | 每账号的模型目录 |
| ⑧ | `"chat.headers"(input, output)` | 每请求加头 |

### 数据字段（不是钩子，但决定 UI）

| # | 字段 | 作用 |
|---|---|---|
| ⑨ | 登录返回的 `accountId` / `uid` | 卡片显示名 / 区分同名账号 |
| | `auth.icon` 或 `magpie.icon` | 卡片图标 |
| | `auth.maxConcurrency` 或 `magpie.maxConcurrency` | 并发数 |

### 非钩子但必需

```
npm README      → 插件卡片上的介绍页正文（magpie 读 npm 的 README）
package.json    → 版本、许可证、repository 链接（卡片上自动显示）
```

**⚠ 官方文档漏了 `auth.checkin`。** 它只写了
「the hooks magpie calls are `config`, `auth` (its methods, loader and usage),
`provider.models` and `chat.headers`」—— 少了签到钩子。

但 magpie 二进制里嵌着 **200 KB / 21 章**的插件契约源码，其中有一整章
`// ---- check-in ----`。这份契约才是权威。`extract-contract.py` 能把它提出来。

---

## 三条铁律

### 1. `config.models` 必须有内容

```js
config: async (cfg) => {
  cfg.provider ??= {}
  cfg.provider["acme"] ??= {
    name: "Acme",
    npm: "@ai-sdk/openai-compatible",
    api: BASE,
    models: staticModels(),   // ⚠ 没有它，未登录时显示 "0 models"
  }
}
```

magpie 在**未登录**时也会渲染供应商卡片。`provider.models()` 拿不到账号只能返回空，
所以静态表必须在 `config` 里给。

### 2. `authorize()` 必须立刻返回

```js
// ❌ 死锁
async authorize() {
  const token = await waitForUserToLogin()   // 在这里等 = magpie 双向死锁
  return { type: "success", access: token }
}

// ✅
async authorize() {
  const flow = startLoginFlow()
  return {
    url: flow.url,            // magpie 拿这个去开浏览器
    method: "auto",
    callback: async (code) => {   // 真正等登录的是这里
      const token = await flow.result
      return { type: "success", access: token }
    },
  }
}
```

### 3. `refresh` 返回的是**合并**

```js
// auth.refresh 的返回值合并到旧账号上
auth: { async refresh(auth) { return { access, refresh, expires } } }

// 而 client.auth.set 是整体替换 —— 两者语义不同，别搞混
await client.auth.set({ path: { id }, body: wholeObject })
```

---

## 怎么用

### 方式一：克隆到自己的 GitHub

```bash
# 1. 在 GitHub 上点 "Use this template"（或 fork）
# 2. 克隆下来
git clone https://github.com/YOUR_NAME/YOUR_PROVIDER.git
cd YOUR_PROVIDER
```

### 方式二：本地直接开始

```bash
git clone https://github.com/MYCF711/magpie-plugin-scaffold.git my-provider
cd my-provider
rm -rf .git && git init    # 换掉历史
```

### 然后改三处

**① `package.json`**

```json
{
  "name": "opencode-acme-auth",           ← 改成你的包名
  "description": "…",                      ← 一句话说清楚签入什么
  "repository": { "url": "…" },            ← 改成你的仓库
  "keywords": ["opencode", "opencode-plugin", "acme"],
  "magpie": {
    "icon": "https://acme.example/icon.svg",
    "maxConcurrency": 4
  }
}
```

⚠ **`keywords` 决定 magpie 市场能不能搜到你。**
搜索会问 npm `<query> opencode`，只显示名字或 keywords **含 `opencode`**
**且**含 `auth` / `plugin` / `provider` 之一的包。

**② `index.mjs` 顶部的配置**

```js
const PROVIDER = "acme"                    // provider id
const PROVIDER_NAME = "Acme"
const BASE = "https://api.acme.example/v1"
const SDK = "@ai-sdk/openai-compatible"    // 决定 API 形状
const MODELS = [["acme-coder", "Acme Coder", 200_000], ...]
```

**`SDK` 决定 magpie 用哪个 API 形状**：

| SDK | API | 路径 |
|---|---|---|
| `@ai-sdk/openai-compatible` | Chat completions | `/chat/completions` |
| `@ai-sdk/openai` | OpenAI Responses | `/responses` |
| `@ai-sdk/anthropic` | Anthropic Messages | `/messages` |
| `@ai-sdk/google` | Gemini | `/models/<id>:streamGenerateContent` |

**③ `README.md`** —— 这个文件会显示在 magpie 的插件卡片上。
写清四件事：签入什么服务、怎么登录、登录态存在哪、有哪些模型。

---

## 实现五个 TODO

模板里有五个 `TODO` 函数，全部集中在 `index.mjs` 底部：

```js
startLoginFlow(inputs)      // 启动登录流程 → 返回 { url, result }
exchangeRefresh(token)      // 换 token → 返回 { access_token, refresh_token, expires_in }
fetchUsage(auth)            // 额度查询 → 返回 { plan, used, total, resetsAt }
doCheckin(auth)             // 签到 → 返回 { supported, alreadyToday, credit, ... }
fetchLiveModels(auth)       // 模型目录 → 返回 [{ id, name }]
```

### 五个 TODO 的输入输出约定

**① `startLoginFlow(inputs)`**

```js
// 返回 url（立刻可用）和 result（promise，登录完成后兑现 token）
return { url: "https://acme.example/login?...", result: promiseOfToken }
```

如果登录要用户粘贴授权码，返回 `method: "code"`。

**② `exchangeRefresh(refreshToken)`**

```js
return { access_token, refresh_token, expires_in }   // expires_in 是秒
```

⚠ refresh_token **一次性**的厂商额外注意：模板已经带了并发去重闸，
但要把 `refresh` 钩子接到那个闸上，别直接调 `exchangeRefresh`。

**③ `fetchUsage(auth)`**

```js
return {
  plan: "Pro",                    // 卡片上的套餐标签
  used: 370, total: 1000,
  resetsAt: "2026-11-01T00:00:00Z",
  windows: [{ name, used, display, amount, limit, unit, resetsAt, aside }]
}
```

**`usage.windows` 拼出卡片上的进度条**：

```
name     → 进度条上方的标签
used     → 已用百分比（0-100，超额 >100）
display  → 数字显示，如 "2,131.63 / 3,400 积分"
amount   → 已用
limit    → 总量
unit     → 单位
resetsAt → 重置时间
aside    → true 表示用光不停账号（附加额度，magpie 收进折叠区）
```

只给 `used` 不给 `display`/`amount`/`limit` → 只有一个光秃秃的进度条。

**④ `doCheckin(auth)`**

返回 magpie 的六种 outcome 之一：

```js
"claimed"     刚签到成功
"done"        今天已经签过了
"ineligible"  这个账号不能参加
"inactive"    没有签到活动        ← 厂商没有签到功能时用这个
"captcha"     厂商要验证码        ← 让用户去官方 App 手动签，永不解
"failed"      失败
```

⚠ **`done` 和 `failed` 必须分清。** 重复领取通常返回 2xx 但内容为空 ——
那是 `done`（今天已领完），不是 `failed`。只看 HTTP 状态码会误报。

⚠ **`captcha` 永远不要去解。** 契约原文：
> the vendor asks for a captcha: the user checks in in its own app; **never solved**

**⑤ `fetchLiveModels(auth)`**

```js
return [{ id: "acme-coder", name: "Acme Coder", context: 200_000 }]
```

⚠ 拉不到就**原样返回兜底表**（模板已经这么做了）——
不要抛异常，也不要标 `Symbol.for("magpie.fellBack")`（那会让 magpie 整份丢弃）。

---

## 卡片上的许可证和「源码」按钮

magpie 从**社区 registry** 读这几个字段：

| 卡片元素 | 来源 |
|---|---|
| 标题 | entry 的 `name` |
| 「源码」按钮 | entry |
| 摘要正文 | entry 的 `summary` |
| 版本、更新于、图标、许可证 | npm 或 GitHub 元数据（**不需要 entry**）|

包不在那个 registry 里，卡片标题就退回包名，也没有「源码」按钮。

### 模板已经处理好了

`src/self-register.mjs` 在插件加载时把条目**写一次**进 magpie 的市场缓存：

```js
const REGISTRY_ENTRY = {
  package: "你的包名",     // ⚠ 等于 package.json 的 name
  name: "卡片标题",
  providers: ["你的provider"],
  community: true,
  summary: { en: "...", zh: "..." },
}

export const YourPlugin = async ({ client, directory }) => {
  startSelfRegister(REGISTRY_ENTRY, { configDir: directory, log })
  return { ... }
}
```

**改 `REGISTRY_ENTRY` 就行，不用动别的。**

### 只写一次，绝不轮询

**实测（2026-10-25）：**

```
手工往缓存里加一条 → 等 10 秒 → 没被覆盖
再跑 plugin update → 也没被覆盖
连续观察 3 分钟     → mtime 零变化
```

**magpie 只在启动时重写这个文件，静默运行期间完全不碰。**

### 多插件同时启动不会打架

并发注册用「写完读回来验证 + 有限重试」：

```
5 个同时注册   → 5/5 存活  ✅
10 个同时注册  → 10/10 存活 ✅（3 轮）
8 个分批启动   → 8/8 存活  ✅
官方条目       → 全部保留   ✅
```

### ⚠⚠ 绝对不要用 fs.watch 或 setInterval

**这是我踩过的最大的坑。**

我最初加了 `fs.watch` 去「补」magpie 的覆盖，结果是：

```
我们写文件（rename）→ 触发自己的 watch → 又写
    ↓
每秒 3-4 次，永不停止，日志刷屏
```

**实测数据：** 60 秒内 mtime 变化 19 次。

**而且它是完全多余的** —— magpie 静默时根本不碰这个文件。
删掉 watch 后，60 秒内变化 **0 次**。

### 根本解法

`magpie-community/plugins#394` 里建议 **拉取时合并进缓存而不是整体替换**，
那样连这一次写都不需要。如果采纳，这一段可以整个删掉。

## 调试

**永远在沙箱里试，不要碰你自己的 magpie。**

```bash
sb=$(mktemp -d)
m() { env HOME=$sb XDG_CONFIG_HOME=$sb/.config XDG_CACHE_HOME=$sb/.cache \
      MAGPIE_ADDR=127.0.0.1:3499 magpie "$@" ; }

m plugin add ./              # 文件夹就地加载，不安装
m plugin --json              # 插件列出的方法、账号、模型、加载错误
m plugin login acme          # 逐个走登录方式和问题
m provider test acme         # 每个 API 一个极小请求
m provider test acme acme-coder
m quota                      # usage 钩子
m plugin logout acme
```

**插件打印的任何东西都进 stderr**，magpie 记为 `plugin: …` 行。

**单元测试**：把要测的东西放到 `export const _internal = { ... }`，
然后 `bun test`。

⚠ **入口文件不要导出 helper 函数** —— magpie 会把**每个导出的函数**都当插件调用。
测试用的东西一律放进 `_internal`。

---

## 上下文窗口要实测，别凭印象填

`provider.models` 里每个模型的 `limit.context` 会被 magpie 转给 agent（DSH 等），
**决定它什么时候压缩对话**。

### 填错的两种后果

```
填小了  → agent 在 12.8 万就压缩，模型明明能收 100 万，浪费 8 倍容量
        → 更要紧：路由组按「组内最大」算窗口，一个填小的成员拉低整组
填大了  → agent 以为还有余量，超了上游才报错
        → 用户看到「内容太长了」，以为是 bug
```

### 最容易犯的错：把「最大输出」当成「上下文」

DeepSeek 系常见组合：

```
最大输出 128,000     ← 每次回复的上限
上下文   1,000,000   ← 能塞进多少历史
```

**两个数字长得很像，填反了差 8 倍。** 我们就填反过：

```js
// 错的
limit: { context: 128_000, output: 8192 }
// 对的（实测后）
limit: { context: 1_000_000, output: 128_000 }
```

### 实测办法

```js
// 造一份约 N token 的文本发过去，看 usage.prompt_tokens 和是否 200
for (const n of [200_000, 500_000, 800_000, 1_000_000, 1_100_000]) {
  const body = JSON.stringify({
    model: "your/model",
    messages: [{ role: "user", content: "填充文本".repeat(...) + " OK" }],
    max_tokens: 20, stream: false,
  })
  const r = await fetch(gatewayUrl, { method: "POST", headers, body })
  const d = await r.json()
  console.log(n, d.choices ? "OK " + d.usage.prompt_tokens : "ERR " + d.error.message)
}
```

**找到第一次失败的位置，取稍低一点的圆整值**（如 258,556 → 256K）。

### 另一个坑：路由组的窗口

magpie 的路由组可以按「组内最大」或「固定值」决定窗口。**如果组用「最大」，
而你在某个成员卡片里手动改小，组的值不会变——但这个成员的对外值变了，
agent 看到窗口变化会重新组装上下文，可能一次发出两倍的历史。**

**建议：组用「自定义」，固定成组内成员共同的一个值。**

## 常见坑

### 1. `magpie plugin add xxx.tgz` 有 bug

它把 tgz 当 JS 文件 `import()`，报 `exports no OpenCode plugin function`。

**手动安装**：

```bash
DST=~/.config/magpie/plugins/node_modules/<包名>
mkdir -p "$DST"
tar -xzf <包名>.tgz -C "$DST" --strip-components=1

# plugins.json 的 plugins 数组加 {"spec": "<包名>"}
# plugins/package.json 的 dependencies 加 "<包名>": "file:./node_modules/<包名>"
magpie-bun install
```

**删除时五处都要清**：`plugins.json`、`plugins/package.json`、
`plugins/node_modules/<包名>/`、`plugin-auth.json`、`plugin-providers.json`。

### 2. 模型级错误要用 404，不是 401

| 情况 | 做法 | magpie 的行为 |
|---|---|---|
| 模型不存在 | 返回 **404** + 错误 JSON | 只搁置**这个模型** |
| 登录被拒 | 401 或 `signIn: "expired"` | 标记**这个账号** |
| 这个 401 是别的事 | 响应头 `X-Magpie-Sign-In: kept` | 不标记 |
| 已续期 | 响应头 `X-Magpie-Sign-In: renewed` | 清除标记 |

用 401 报告「模型不存在」会把整个账号标成失效 —— 用户得重新登录。

### 3. User-Agent 常常是硬校验

很多厂商校验客户端身份。照抄官方客户端的 User-Agent 形状，
不要用自己的包名。

例：CodeBuddy 不是 `CodeBuddyIDE/<version>` 形状就返回 10085（拒绝服务）。

### 4. 一次性 refresh_token 必须串行

两个并发请求同时看到临期 → 各发一次续期 → 第二次消费已被消费的 token
→ 凭据**永久失效**，只能重新登录。

**去重的键要用凭据身份（refreshToken），不是 provider id** ——
账号池下同一 provider 有多个账号，按 provider 键控会让账号 B 共享账号 A 的结果。

### 5. 别在 `fetch` 里读流

magpie 负责分帧转发。插件改写响应体时要去掉
`content-length` 和 `content-encoding`。

### 6. 单章解析：magpie 二进制里的契约怎么提

```bash
python extract-contract.py
# 或指定路径
python extract-contract.py /path/to/magpie
```

⚠ Windows 上**没有 `strings` 命令**（Git for Windows 不带），必须用 Python。

### 7. 插件在卡片上叫什么，改不了（除非动三处）

**magpie 没有 `displayName`。** 卡片标题由 `plugin.Name()` 决定：

| 安装方式 | 标题 |
|---|---|
| 路径 `./my-plugin` | 那个路径 |
| npm `my-package` | 包名 |
| git `github:owner/repo` | **`plugins/package.json` 里 dependencies 的键名** |

git 安装时，`gitName()` 反查的**键名同时是 `node_modules` 下的目录名**，所以改名要三处同步：

```bash
cd ~/.config/magpie/plugins
# 1. package.json 的 dependencies 键
# 2. bun.lock 的两个同名键（workspaces.dependencies 和 packages）
# 3. node_modules/<旧名> → node_modules/<新名>
```

漏掉第 3 步会报 `no such plugin: ...\node_modules\<新名>`。

⚠ **`magpie plugin add` / `update` 会把键名改回包自己的 `name`。** 手改不是永久的。
要永久改名只能改包内 `package.json` 的 `name`（会影响 npm 发布名）。

完整说明见 [HOOKS.md](./HOOKS.md) 的「九之二、插件名」。

### 8. 已安装卡片只显示版本和 README

publisher、周下载量、license、stars **只在「发现」面板显示**，已安装列表没有这些字段
（`internal/gui/plugins.go` 的 `pluginEntryJSON` 不传出它们）。

想让某条信息出现在已安装卡片上，**写进 README** —— 卡片正文就是 README 的内容。

另外：`weekly` 为 0 时下载量整个元素不渲染（`if (l.npm?.weekly)`），新发布的包看不到它。

---

## 怎么发布

### npm

```bash
npm publish
```

用户就能 `magpie plugin add opencode-acme-auth` 了。

⚠ 若**卡片标题与 npm 包名不一样**（包内 `name` 是 `OfficeAce`，npm 上是 `officeace-auth`），
别裸跑 —— 那会拿 `OfficeAce` 去发，registry 拒绝含大写的新包名。那种插件用发布脚本，
见 [UPDATING.md](./UPDATING.md) 的「git 源想要大写标题、npm 又要能发」。

### 收录进 magpie 的市场

**方式一：GitHub topic（最快）**

给仓库打上 `magpie-plugin` 标签：

```bash
# 在 GitHub 仓库页面 → About 齿轮 → Topics → 加 magpie-plugin
# 或用 API
curl -X PUT -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/OWNER/REPO/topics \
  -d '{"names":["magpie-plugin","magpie","opencode","opencode-plugin"]}'
```

**package.json 必须在仓库根目录。**

打了标签的仓库会出现在 magpie 的 **Plugins → Discover → Unofficial**
（按 star 排序，标注「未经审核」）。magpie 最多每 10 分钟问一次 GitHub。

⚠ fork、archived 的仓库会被排除。
⚠ 没发 npm 的从仓库原样安装，所以**加载的文件必须提交**。

**方式二：提 PR 到 magic-community**

放到 `packages/<name>/`，命名规则：

```
provider    @magpie-community/opencode-<name>-auth
middleware  @magpie-community/middleware-<name>
tools       @magpie-community/tools-<name>
page        @magpie-community/page-<name>
agent       @magpie-community/agent-<name>
```

推到 main 的版本号变更会自动发布。

**方式三：registry.json —— 不必费心**

社区的 [registry.json](https://github.com/magpie-community/plugins) 是上游的
**推荐位**（商业化入口），进不进、什么时候进不由 PR 决定。**不要指望它**：

- 对自用/自发布的插件来说，前两条（npm + GitHub topic）已经够用；
- 把精力花在这上面，回报接近零。

真要自己维护一份自注册条目（让卡片显示对的标题与图标），`src/self-register.mjs`
就是干这个的 —— 它写的是本地市场缓存，不依赖任何上游审核。

### 之后每一次更新

上面讲的是**第一次**发出去。后面每发一个版本，照
[UPDATING.md](./UPDATING.md) 走 —— 那份只讲「之后」：

- magpie 怎么发现新版本（npm 源比 `version`、git 源比默认分支 HEAD 的 commit，
  **两条路都不看 GitHub Release / tag**）
- 发版六步：写 CHANGELOG → bump → push 默认分支 → `npm publish`（显示名与包名不同的
  插件用 `npm run publish:npm`）→
  GitHub Release（tag + 更新内容一条条列）→ 验证
- 用户侧怎么拿到更新（npm 源自动、git 源要手动；`rm` + `add` 会把卡片显示名重置成包名）

---

## 参考

| 资源 | 地址 |
|---|---|
| 官方文档 | https://usemagpie.ai/docs/plugins |
| 社区插件仓库 | https://github.com/magpie-community/plugins |
| 官方文档说的钩子 | `config`, `auth`(methods/loader/usage), `provider.models`, `chat.headers` |
| **实际存在的钩子** | 上面**加上 `auth.checkin`**（文档漏了）|

**看真实实现**：

- 最小骨架（免登录）：[`packages/zen-free`](https://github.com/magpie-community/plugins/tree/main/packages/zen-free)
- 最全（5/6 钩子）：[`packages/codearts`](https://github.com/magpie-community/plugins/tree/main/packages/codearts)
- 多站点工厂：[`packages/workbuddy`](https://github.com/magpie-community/plugins/tree/main/packages/workbuddy)

**别参考的**：聚合形态（一个 provider 里塞多个渠道）。会破坏故障转移、
额度展示、单独停用。magpie 的 25 个官方社区包**全是**一个包一个供应商。

---

## 鸣谢

模板里的钩子契约来自 **[yetone/magpie](https://github.com/yetone/magpie)**（MIT）。

| 来源 | 用在了哪 |
|---|---|
| `internal/plugin/` 的 Go 实现 | 九个钩子的调用时机、返回值形状、错误语义 |
| 二进制里嵌的契约注释（约 200 KB / 21 章） | `HOOKS.md` 的正文，以及官方文档漏掉的 `auth.checkin` |
| `internal/plugin/market.go` 的 `market()` | 为什么市场缓存会被整体替换、为什么自注册写一次就够 |

**`extract-contract.py`** 是提取那份嵌入契约的脚本，可以重新跑一遍核对。

上游是 MIT，本模板也是 MIT。

## 许可

MIT