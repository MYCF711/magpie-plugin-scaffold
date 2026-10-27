# 一个包，多个供应商

同一家厂商的两套云（国内 / 国际）、两种套餐（个人 / 企业）、两条产品线 ——
如果它们在 magpie 里应该是**两张卡**，这段就是标准做法。

本文是**实测过的标准流程**，不是建议。三处参考实现：

| 包 | 承载几个供应商 |
|---|---|
| `magpie-magicrew-auth`（本文的来源） | 2 —— 超级麦吉 / MagiCrew |
| `@magpie-community/opencode-workbuddy-auth` | 2 —— WorkBuddy / WorkBuddy AI |
| `@magpie-community/opencode-qoder-auth` | 4 —— Qoder / Qoder CN / QwenWork / QwenWork 企业版 |

---

## 一、先判断：该不该拆成两个

| 情况 | 做法 |
|---|---|
| 两套后端的 host 不同、账号体系不同、模型目录不同 | **拆成两个供应商** |
| 两套后端 host 相同，只是一个叫「国际版」 | 不拆，做一个 |
| 只有模型目录不同，登录是同一次 | 不拆，`provider.models()` 里按 auth 分支 |
| **不确定** | 拆。合起来的代价是登录态互相覆盖，拆开的代价只是多一行 |

判据很简单：**「同一个账号会不会在两个站各登一次，而它们的登录态必须同时存在」**。
会 → 拆。

反面判据：如果两个站共用一个登录态（一次登录两边都能用），拆开反而会让用户点两次。

---

## 二、机制：magpie 认的是「具名导出」

magpie 加载插件包时，把包里的**每一个具名导出**都当成一个独立插件。
每个插件跑一遍 `config()` 声明自己的 provider，于是各自在供应商列表、用量概览、
模型目录里占一行 —— 天然不聚合，不需要任何额外配置。

```js
export const FooAuthPlugin     = makePlugin(SITES.foo)
export const FooIntlAuthPlugin = makePlugin(SITES.foo_intl)
```

⇒ 两个插件、两个 provider id、两组 `auth`、两份登录态。

⚠ 唯一的隐式约定：**导出名要以 `Plugin` 结尾**（`WorkBuddyAuthPlugin` / `QoderCNAuthPlugin`
/ `MagicrewIntlAuthPlugin`）。照抄这个形状，别自己发明。
`_internal` 之类的调试导出不会被当成插件，但别在里面放带 `config` 字段的对象。

---

## 三、标准骨架

```js
// ── 站点表：一个站点一条，id 就是 magpie 的供应商 id ──
const SITES = {
  foo: {
    id: "foo",                    // ← 供应商 id，全局唯一，装过就不能改
    name: "Foo",                  // ← 供应商名（供应商列表里那一行），不是插件卡片标题
    host: "https://api.foo.cn",
    web: "https://www.foo.cn",
    icon: ICON_CN,                // ← 各站各的图
    // 站点间任何会变的东西都放这：区号选项、语言、支付方式、网关差异标记
  },
  foo_intl: {
    id: "foo-intl",
    name: "Foo International",
    host: "https://api.foo.ai",
    web: "https://www.foo.ai",
    icon: ICON_INTL,
  },
}

// ── 工厂：一个 SITE 进，一个完整插件出 ──
function makePlugin(SITE) {
  const PROVIDER = SITE.id
  const NAME = SITE.name
  const BASE = `${SITE.host}/v1`

  return async ({ client, directory }) => ({
    config: async (cfg) => {
      cfg.provider ??= {}
      cfg.provider[PROVIDER] ??= {
        name: NAME,
        npm: SDK,
        api: BASE,
        models: /* 见 §五：别写死 */,
      }
    },

    auth: {
      provider: PROVIDER,          // ← 必须是这个站点的 id
      icon: SITE.icon,
      methods: [ /* 每个站点自己的一套 */ ],
      async refresh(auth) { /* 用 SITE.host */ },
      async loader(getAuth) { /* 用 BASE + SITE 的网关差异 */ },
      async usage(getAuth) { /* 用 SITE.host */ },
      async checkin(getAuth) { /* 用 SITE.host */ },
    },

    provider: {
      id: PROVIDER,
      async models(provider, { auth }) { /* 用 SITE.host */ },
    },
  })
}

// ── 导出：每个站点一行，别循环生成 ──
export const FooAuthPlugin     = makePlugin(SITES.foo)
export const FooIntlAuthPlugin = makePlugin(SITES.foo_intl)
```

### 为什么导出要一行一行写，不在循环里 `Object.fromEntries`

因为导出名是 magpie 认插件的唯一凭据。循环生成的导出名是运行时的，静态分析、
tree-shaking、以及「我到底装了几个供应商」的排查都看不见。三行字换来的可读性，值。

---

## 四、五条铁律

### 1. `SITE.id` 一旦发布就别改

已经装过的用户，`auth` 存储、`plugins.json`、用量历史全挂在 provider id 上。
改了 id = 用户重新登录一次 + 积分历史断开。

**新增站点是加一条，不是改一条。**

### 2. `auth` 里不存站点

```js
// ❌ 错：单 provider 时代的遗留写法
{ type: "success", access, jwt, org, site: siteId }

// ✅ 对：站点由闭包决定，auth 里只放这个账号的东西
{ type: "success", access, jwt, org }
```

单 provider 时把 `site` 塞进 `auth` 是能跑的；多 provider 时它是**灾难** ——
两个插件共用一个 provider id，登录态互相覆盖，用户会看到「明明登录了却显示未登录」。

### 3. 图标和名字必须分得开

两个供应商在同一屏里并排，靠的就是这两个字段。

```js
icon: SITE.icon,        // 各站各自的品牌图（base64 内嵌，见 HOOKS.md §九）
name: SITE.name,        // "超级麦吉" / "MagiCrew"，不要写成 "MagiCrew (国内)"
```

⚠ 名字里别塞站点后缀。卡片已经用图标区分了；塞后缀只会让列表窄得放不下。
国际版就用它的官方英文名。

### 4. 站点差异集中在一处

网关层差异（比如某个站强制要某个 header）不要散在 `loader`、`models`、`usage` 里各判一次：

```js
// SITES 里声明一次
foo_intl: { ..., needsOrgOnGateway: true }

// 需要的地方读一次
if (SITE.needsOrgOnGateway && fresh.org) headers["organization-code"] = fresh.org
```

### 5. 未登录时的 `config.models` 别给假货

见下节。

### 6. 卡片要自己说「承载」哪些供应商

magpie 插件卡片上那个蓝色「承载 X、Y」的徽章，默认**只有内置订阅迁到插件上**时才出现
（`internal/provider/migrate.go` 的 `MovedOnto` 只遍历 `movers` 表）。你的包承载的供应商
magpie 从来没内置过 —— 所以那一格空着，数据得你自己在 `package.json` 里给：

```json
"magpie": {
  "icon": "https://acme.example/icon.svg",
  "maxConcurrency": 4,
  "carries": ["Acme", "Acme International (acme.example)"]
}
```

| | |
|---|---|
| 形状 | 字符串数组，1–8 项，每项 ≤48 字；空白项被丢弃，超长被截断 |
| 名字 | 跟卡片底部那行供应商名一致；站点域名放括号里，两站才分得开 |
| 卡片显示 | `承载 Acme、Acme International (acme.example)` |

**只有承载两个及以上供应商时才写**。一个供应商的包不需要这个字段，卡片上那行
`foo (Foo, 12 models)` 已经说清了。

⚠ 这个字段要 **magpie 侧支持**（`magpie.carries`，读进 `pluginEntryJSON.Carries`）。
不支持它的 magpie 会**忽略**这个字段 —— 不报错、也不显示，所以加了没有副作用，
但也别以为它在每个版本上都出现。判断方法：装一个带 `carries` 的 magpie 构建，
看卡片上有没有那个徽章。

---

## 五、模型目录：别写死

`config.models` 必须有内容（HOOKS.md 铁律 1），但**不该是一张要你去维护的清单**。

```js
// ❌ 会过期：三个月后这张表一定缺模型
const MODELS = [["gpt-5.4", ...], ["claude-haiku-5.5", ...], ...]

// ✅ 快照：登录过就从上次的真实列表读，没登录过就是空
config: async (cfg) => {
  cfg.provider[PROVIDER] ??= {
    name: NAME, npm: SDK, api: BASE,
    models: readSnapshot(SITE.id) ?? {},
  }
}

provider: {
  id: PROVIDER,
  async models(provider, { auth }) {
    const snapshot = readSnapshot(SITE.id)
    if (!auth) return snapshot ?? {}
    try {
      const live = await fetchModels(auth.jwt, auth.org, SITE.host)
      if (!live.length) return snapshot ?? {}
      const out = Object.fromEntries(live.map(m => [m.id, modelEntry(m)]))
      writeSnapshot(SITE.id, out)
      return out
    } catch (e) {
      if (/401|403|unauthorized|expired/i.test(String(e?.message))) {
        throw Object.assign(new Error("登录已失效"), { signIn: "expired" })
      }
      return snapshot ?? {}   // 网络抖动退回快照，别让供应商整个消失
    }
  }
}
```

快照路径按站点分开，落在 magpie 自己的缓存目录：

```js
join(homedir(), ".cache", "magpie", `foo-models-${siteId}.json`)
```

未登录 + 从没登录过 = 空表 = 卡片显示 0 models。
**这是诚实的** —— 那会儿你确实不知道账号能选什么。给一张猜的表才是撒谎。

---

## 六、反例对照

| ❌ 不要 | ✅ 要 |
|---|---|
| 一个 provider，登录时 `prompts` 选站点 | 两个 provider，各登各的 |
| `auth.site = siteId`，然后 `siteOf(auth.site).host` | 闭包里 `const BASE = SITE.host` |
| `export const XxxAuthPlugin = makePlugin()` 里再读全局 `DEFAULT_SITE` | 站点作为参数传进工厂 |
| 两个供应商同名、同图标 | `name` 用官方名，`icon` 用各自品牌图 |
| 循环生成导出名 | 一行一个具名导出 |
| 改掉已发布的 provider id 来「统一命名」 | 保留旧 id，新增 id |
| `config.models` 塞一张手写清单 | 快照 + `provider.models()` 实时拉 |

---

## 七、验证清单（发布前逐条过）

写一个 `tests/multi-provider.mjs`，不花钱地跑一遍。最少验这五条：

```js
for (const [label, factory, siteId] of cases) {
  const ctx = await factory({ client: null, directory: "." })

  // ① 每个插件只声明自己那一个 provider
  const cfg = {}
  await ctx.config(cfg)
  assert(Object.keys(cfg.provider).length === 1)
  assert(Object.keys(cfg.provider)[0] === SITES[siteId].id)

  // ② auth.provider / provider.id 和声明一致
  assert(ctx.auth.provider === SITES[siteId].id)
  assert(ctx.provider.id === SITES[siteId].id)

  // ③ 两个 id 互不相同
  ids.add(ctx.auth.provider)

  // ④ 模型目录各拉各的（有凭据时）
  // ⑤ loader 拼出来的头按站点不同（网关差异标记生效）
}
assert(ids.size === cases.length)
```

跑的时候用 **bun**，别用 node —— magpie 跑在 bun 上：

```bash
bun tests/multi-provider.mjs
```

装完再看一眼真实的：

```bash
magpie plugin list
# 一个包两行，就是对的：
#   magpie-foo-auth  on
#     foo (Foo, 27 models)          signed in as ...
#     foo-intl (Foo International, 49 models)  signed in as ...
```

供应商列表里也是两张卡、用量概览里两张卡 —— **同一屏并排出现，就是「不聚合」的证据**。

---

## 八、registry 登记

`startSelfRegister()` 的 `providers` 字段列全部 id：

```js
const COMMUNITY_ENTRY = {
  package: "magpie-foo-auth",
  name: "Foo / Foo International",
  providers: ["foo", "foo-intl"],   // ← 全部，按发布顺序
  community: true,
  summary: { en: "...", zh: "..." },
}
```

两个插件实例都会调 `startSelfRegister`，它内部有队列去重，只会登记一条。

---

## 九、参考实现

| 仓库 | 看什么 |
|---|---|
| [MYCF711/magpie-magicrew-auth](https://github.com/MYCF711/magpie-magicrew-auth) | 本文的来源：`makePlugin(SITE)` 工厂 + 两站网关差异标记 + 模型快照 |
| [magpie-community/plugins · packages/workbuddy](https://github.com/magpie-community/plugins/tree/main/packages/workbuddy) | 两导出，最简形态 |
| [magpie-community/plugins · packages/qoder](https://github.com/magpie-community/plugins/tree/main/packages/qoder) | 四导出，每站还带自己的登录方式 |
