// src/invite.mjs —— 邀请码 / 推荐码的通用做法
//
// ═══════════════════════════════════════════════════════════════════
// 为什么需要这个模块
// ═══════════════════════════════════════════════════════════════════
//
// 大多数厂商的邀请机制只有一个入口：**登录 URL 上带一个参数**（`?invite=<code>`，
// 或 `?ic=…&sId=…&source=invite_center`）。它必须在「注册那一刻」就在 URL 上，
// 事后补不了；而 magpie 的登录方式是一个**静态 prompts 数组**，天生没法表达
// 「先问邀请码，再接着问主登录的问题」。
//
// 解法是 `ask()` —— 每次返回**下一个**问题，问完返回 `null`（HOOKS 四·陷阱 5）：
//
//   ask({})                       → 邀请码
//   ask({ invite })               → 主登录的第一个问题
//   ask({ invite, ...主问题 })     → null
//   authorize({ invite, ... })    → 保存策略，**直接调用主登录的 authorize**
//
// 这套形态在 `magpie-magicrew-auth` 里跑了一年多，2026-10-29 在 accio 上复刻；
// 本模块是把它抽成不依赖具体厂商的部分。
//
// ═══════════════════════════════════════════════════════════════════
// 语义（用户只需记两个数字）
// ═══════════════════════════════════════════════════════════════════
//
//   0 / 留空 / 非法文本 → 自动（沿用当前策略里的码）
//   1                  → 保持当前（与 0 等价；留 1 是为了「我知道有当前值」的显式表达）
//   其它                → 当作新码
//
// 「自动」的码从哪来：厂商如果能查「自己的邀请码」（登录后 /me 之类的接口），
// 就在登录成功时把拿到的码写回策略（滚动）；查不到就只能靠用户首次填一次。
// ⇒ 两种都支持：`policy.source` 记 'used'（滚动来的）/ 'chosen'（手填的）。

import { homedir } from "node:os"
import { join } from "node:path"

import { BASE } from "./context.mjs"
import { OFFICIAL_UA } from "./http.mjs"
import { assertTrustedUrl, trustedUrlOf, UntrustedUrlError } from "./origin.mjs"
import { readJson, writeJson } from "./store.mjs"

function cacheDir() {
  return join(homedir(), ".cache", "magpie")
}

/**
 * 策略存储：`~/.cache/magpie/<prefix>-invite.json`。
 * 只写 cache，不碰 `~/.config/magpie`（那是 magpie 的目录，见 store.mjs 规矩 ①）。
 *
 * @param {string} prefix 插件短名，如 "accio" / "magicrew"。**必须带**，否则两个插件会抢同一个文件。
 */
export function createInviteStore(prefix) {
  const file = join(cacheDir(), `${prefix}-invite.json`)

  function readPolicy() {
    const v = readJson(file, null)
    return v && typeof v === "object" ? v : null
  }

  /** 当前要用的码（可能空串）。 */
  function read() {
    const v = readPolicy()
    return typeof v?.code === "string" ? v.code.trim() : ""
  }

  /** 与码配对的其他字段（如 `sId`）—— 厂商链接里有几对参数就存几个。 */
  function readExtra(key) {
    const v = readPolicy()
    return typeof v?.[key] === "string" ? v[key].trim() : ""
  }

  /**
   * 写策略。`extra` 是「与这个码绑定的其它参数」（Accio 的 `sId` 就是这种）。
   *
   * ⚠ 换码时必须一起换 `extra`：拿旧 `sId` 去配新 `ic` 是最典型的「填了码但邀请不生效」。
   */
  function write(code, { source = "", extra = {} } = {}) {
    const c = String(code ?? "").trim()
    if (!c) return
    const prev = readPolicy()
    const next = { code: c, source: String(source ?? ""), at: Date.now() }
    // 额外字段（如 sId）与码成对：本次给了就用本次的；没给时**只有同码**才继承旧值 ——
    // 拿旧 sId 配新 ic 是最典型的「填了码但邀请不生效」。
    const extraKeys = new Set([...Object.keys(prev ?? {}), ...Object.keys(extra ?? {})])
    for (const k of extraKeys) {
      if (k === "code" || k === "source" || k === "at") continue
      const s = String(extra?.[k] ?? "").trim()
      if (s) next[k] = s
      else if (prev && prev.code === c && prev[k]) next[k] = prev[k]
    }
    // 与 store 共用独立临时名 + 原子替换；写失败不影响登录。
    writeJson(file, next)
  }

  return { file, read, readExtra, write }
}

/** 数字框的灰色字：每次点开按当前策略现算（magpie 的 prompts 没有复合控件）。 */
export function inviteHint(current) {
  return current
    ? `当前模式：自动（${current}）· 输入 1 保持不变，或直接填新码`
    : "还没有邀请码：直接填，留空则不带"
}

/** 数字语义：0 / 空 / 1 → 沿用当前；其它 → 新码（原样大写，具体厂商可再处理）。 */
export function resolveInvite(raw, current) {
  const s = String(raw ?? "").trim()
  if (s === "" || s === "0" || s === "1") return String(current ?? "").trim()
  return s
}

/**
 * 生成「邀请码」登录方式。
 *
 * @param {object} o
 * @param {string} o.label        面板上显示的名字（可带当前码后缀）
 * @param {object} o.mainMethod   主登录方式（必须实现 authorize）
 * @param {object[]} o.followUps  主登录要问的问题（邀请码问完之后依次问）
 * @param {(inputs:object)=>string} o.pick  从 inputs 里取用户填的邀请码
 * @param {(code:string)=>void} o.save    保存策略（通常是 store.write）
 * @param {(inputs:object)=>object} [o.beforeAuthorize] 可选：在调主登录前做点事（记录、校验）
 */
export function makeInviteMethod({ label, mainMethod, followUps = [], pick, save, beforeAuthorize }) {
  const keys = followUps.map((p) => p.key)
  const inviteKey = "invite"

  /** 这个 key 问过没有 —— 用 hasOwnProperty，因为「填了空字符串」也算问过 */
  const has = (inputs, key) =>
    !!inputs && typeof inputs === "object" && Object.prototype.hasOwnProperty.call(inputs, key)

  return {
    type: "oauth",
    label,
    // 面板列表里要能显示「第一个问题」，否则一条没有任何 prompts 的方式看起来像坏掉了
    get prompts() {
      return [invitePrompt()]
    },
    async ask(inputs) {
      // 第一个问题
      if (!has(inputs, inviteKey)) return invitePrompt()
      // 之后是主登录的问题，按顺序问
      for (const p of followUps) {
        if (!has(inputs, p.key)) return p
      }
      return null
    },
    async authorize(inputs) {
      const code = pick(inputs ?? {})
      if (code) save(code)
      if (typeof beforeAuthorize === "function") await beforeAuthorize(inputs ?? {}, code)
      // ⚠ 直接复用主登录的 authorize —— 邀请码不是一个独立流程，
      //   它是「主登录的一个前置问题」。复制一份 callback 必然有一天只改一边。
      return await mainMethod.authorize(inputs ?? {})
    },
  }

  function invitePrompt() {
    return { type: "text", key: inviteKey, message: "邀请码", placeholder: inviteHint("") }
  }
}

// ═══════════════════════════════════════════════════════════════════
// 邀请登录协议层（只接登录 URL 参数）
// ═══════════════════════════════════════════════════════════════════
//
// 厂商带邀请的入口**不是** OAuth `authorize` 的参数，而是 Web 登录页的一个
// 顶层查询参数：
//
//   <登录页路径>?next=<完整授权 URL>&<状态参数名>=<状态值>
//
// `authorize` 上的未知参数只会被折进 `next` 里，而登录页不读 `next` 里的
// 状态参数（实测过，别指望「多传一个参数」）。状态值要从公开分享页
// `GET <分享前缀><code>` 的 HTML 里取。
//
// 安全边界（这是本模块唯一新增的请求）：
//   · 只在调用方明确给了 code 时才抓一次分享页；空码 / 非法码**零请求**
//   · 匿名 GET：不带 Authorization、不带 x-desktop-* 设备头
//   · 同 origin（`trustedUrlOf`）、官方 UA、Accept text/html、redirect:manual、10s 超时
//   · 失败只回 `{state:"", reason}`，**不阻塞登录**
//   · 登录路径（`ask` / `authorize` / `callback`）**永不**自动调厂商的
//     「绑定邀请 / 查自己的邀请码」写面 —— 那些属于账号自己的数据，是别的模块的事
//
// ⚠ 厂商相关值全部集中在下面这一段，**派生仓库只改这一段就够**。
//   端点 origin 由 `src/context.mjs` 的 `BASE` 决定，这里只放站点路径与参数名。
//   每个值都写了「不换会怎样」—— 这几条写错都不报错，只是邀请静默失效。
//   一组自洽的默认值已经能跑通测试；占位提醒只在注释里，不写成跑不起来的 `<...>`。
//
// 没有邀请功能的厂商：**不要**把本模块接进登录流程，也不要在 `index.mjs` 声明
// 对应的 `auth.options`；让 `src/invite-source.mjs` 的 `resolve()` 永远返回
// `kind:"none"` 即可，不需要删文件。

/** 登录页路径（`/oauth/authorize` 307 的目标）。⚠ 派生后按你的厂商改：不换会 404，邀请永远不生效。 */
export const INVITE_LOGIN_PATH = "/login"

/** 注册页路径（分享页里的注册链接也可能带状态参数）。⚠ 派生后按你的厂商改：没有独立注册页就写成和登录页一样。 */
export const INVITE_REGISTER_PATH = "/register"

/**
 * 公开分享页前缀：`<BASE 的 origin><分享前缀><code>`，例如 `/r/`。
 * ⚠ 派生后按你的厂商改：不换会抓到 404 → `reason:"http_error"`，邀请静默不生效。
 * ⚠ 这是**站点路径**（网页），不是 API 路径：按 URL 语义解析到 BASE 的 origin 根，
 *   所以 BASE 带 `/v1` 这类前缀时也会被丢掉。厂商的网页在另一个域名时，这套协议层不适用。
 */
export const INVITE_SHARE_PREFIX = "/r/"

/** 邀请状态参数名（登录页上那个 `?…=`）。⚠ 派生后按你的厂商改：不换上游直接忽略 → 邀请静默失效。 */
export const REFERRAL_STATE_PARAM = "referral_state"

/** 状态值前缀，只认这一族（默认 `rs1.`）。⚠ 派生后按你的厂商改：不换所有 state 都被判非法、邀请永远带不上。 */
export const REFERRAL_STATE_PREFIX = "rs1."

/** 分享页 GET 的超时（毫秒）。⚠ 派生后按你的厂商改：太小会频繁 timeout，太大会拖慢登录。 */
export const INVITE_FETCH_TIMEOUT_MS = 10_000

/**
 * 邀请码白名单（同时也是分享页 code 的白名单）。
 * ⚠ 按你的厂商的码字符集改：放宽会引入路径注入面，收紧会把真码拒掉。
 */
export const REFERRAL_CODE_RE = /^[A-Za-z0-9._-]{1,200}$/

/** 转义正则里的元字符（前缀 / 路径都是从常量拼进正则的，派生者改成 `a+b` 也不会炸） */
function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** 状态参数会出现在哪些页面的链接里（`parseReferralState` 只认这两条路径） */
const INVITE_LINK_PATHS = Object.freeze([INVITE_LOGIN_PATH, INVITE_REGISTER_PATH])

/** 分享页 href 的白名单：只认上面那两条路径（`https://…`、`//host/…` 都不算） */
const REFERRAL_LINK_RE = new RegExp(
  `^(?:${INVITE_LINK_PATHS.map(escapeRegExp).join("|")})(?:[?#]|$)`,
  "i",
)

/** 状态值白名单：由 `REFERRAL_STATE_PREFIX` 派生，改前缀就够，这里不用动 */
export const REFERRAL_STATE_RE = new RegExp(`^${escapeRegExp(REFERRAL_STATE_PREFIX)}[A-Za-z0-9._-]+$`)

/**
 * 协议层「接线图」：把上面那批厂商相关值收在一处，派生仓库改这里一处就够。
 * 冻结它只是防止运行期被别的模块改写（测试会按它检查常量形状）。
 */
export const INVITE_WIRING = Object.freeze({
  loginPath: INVITE_LOGIN_PATH,
  registerPath: INVITE_REGISTER_PATH,
  sharePrefix: INVITE_SHARE_PREFIX,
  referralStateParam: REFERRAL_STATE_PARAM,
  referralStatePrefix: REFERRAL_STATE_PREFIX,
  referralStatePattern: REFERRAL_STATE_RE,
  codePattern: REFERRAL_CODE_RE,
  fetchTimeoutMs: INVITE_FETCH_TIMEOUT_MS,
  linkPaths: INVITE_LINK_PATHS,
})

/** 非法邀请码。文案**不含**原值（邀请码 / 状态一律不进日志）。 */
export class InvalidReferralCodeError extends Error {
  constructor() {
    super("邀请码不合法：只允许 [A-Za-z0-9._-]{1,200}")
    this.name = "InvalidReferralCodeError"
    this.code = "invalid_code"
  }
}

/**
 * 把授权 URL 包进登录页；state 为空 / 非法时**原样返回**授权 URL。
 *
 * 关键点：`next` 必须用 `URLSearchParams.set` 编码，解出来要**逐字**等于原授权 URL
 * （含 `state` / `code_challenge` / `redirect_uri`）。先 encode 再 set 会二次编码。
 *
 * base 不可信时同样回退裸授权 URL（宁可邀请不生效，也不把用户带去别的 origin）。
 *
 * `next`（= `authorizeUrl`）**也**要过同一道闸：这个导出函数不许变成开放重定向
 * gadget —— 拿一个外站 URL 当 `next` 塞进可信登录页，用户点完就被带去别处。
 * 只接受「绝对 https + 可信 origin」；不可信 / 相对 / 畸形一律原样返回。
 *
 * @param {{base?: string, authorizeUrl: string, referralState: string}} o
 * @returns {string}
 */
export function buildInviteLoginUrl({ base = BASE, authorizeUrl, referralState } = {}) {
  const target = String(authorizeUrl ?? "")
  const state = String(referralState ?? "").trim()
  if (!REFERRAL_STATE_RE.test(state)) return target

  // 先校验 next（必须是可信 origin 上的绝对 https URL），否则绝不包装。
  // 注意这里用 assertTrustedUrl 而不是 trustedUrlOf：相对路径不是「完整授权 URL」。
  try {
    assertTrustedUrl(target)
  } catch {
    return target
  }

  let login
  try {
    // 按调用方给的 base 解析，但**信任锚始终是插件自己的 BASE**：
    // 不能拿 `trustedUrlOf(path, { base })`（那等于「自己信自己」）。
    login = new URL(INVITE_LOGIN_PATH, String(base))
    trustedUrlOf(login.toString())
  } catch {
    return target
  }
  login.searchParams.set("next", target)
  login.searchParams.set(REFERRAL_STATE_PARAM, state)
  return login.toString()
}

/** 解 HTML 实体：分享页把 `&` 写成 `&amp;`（也容忍数字实体） */
function decodeHtmlEntities(value) {
  return String(value ?? "").replace(/&#x([0-9a-f]+);|&#(\d+);|&(amp|quot|apos|#39);/gi, (m, hex, dec, name) => {
    if (hex) {
      const n = Number.parseInt(hex, 16)
      return Number.isFinite(n) && n <= 0x10ffff ? String.fromCodePoint(n) : ""
    }
    if (dec) {
      const n = Number.parseInt(dec, 10)
      return Number.isFinite(n) && n <= 0x10ffff ? String.fromCodePoint(n) : ""
    }
    switch (String(name).toLowerCase()) {
      case "amp":
        return "&"
      case "quot":
        return '"'
      case "apos":
      case "#39":
        return "'"
      default:
        return m
    }
  })
}

/**
 * 从分享页 HTML 里取**第一个合法**的状态值。
 *
 * 只认登录 / 注册页的 href（大小写不敏感），其它链接（分享页自己、外站、
 * 协议相对）一律跳过。参数名大小写不敏感，值必须匹配 `REFERRAL_STATE_RE`；
 * 畸形值继续往后找，一个都没有就返回空串。
 *
 * ⚠ 不打印、不回显任何值：调用方拿到的只有「合法状态」或空串。
 *
 * @param {string} html
 * @returns {string}
 */
export function parseReferralState(html) {
  const source = typeof html === "string" ? html : ""
  if (!source) return ""

  const wanted = REFERRAL_STATE_PARAM.toLowerCase()
  // 属性名大小写不敏感（`HREF=`），值可有单 / 双引号或无引号
  const hrefRe = /(?:\s|^)href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+))/gi
  let m
  while ((m = hrefRe.exec(source)) !== null) {
    const href = decodeHtmlEntities(m[1] ?? m[2] ?? m[3] ?? "").trim()
    // 只认相对路径的登录 / 注册页；`https://…/login`、`//host/login` 都不算
    if (!REFERRAL_LINK_RE.test(href)) continue

    let url
    try {
      url = new URL(href, "https://referral.invalid")
    } catch {
      continue
    }
    for (const [key, value] of url.searchParams) {
      if (key.toLowerCase() !== wanted) continue
      if (REFERRAL_STATE_RE.test(value)) return value
    }
  }
  return ""
}

/**
 * 分享页 URL：`<BASE origin><分享前缀><code>`，code 先过白名单，再过 `trustedUrlOf`（同 origin）。
 *
 * @param {string} [base]
 * @param {string} code
 * @returns {string}
 */
export function referralShareUrl(base = BASE, code) {
  const c = String(code ?? "").trim()
  if (!REFERRAL_CODE_RE.test(c)) throw new InvalidReferralCodeError()

  try {
    // 与 buildInviteLoginUrl 同一套：先按 base 解析，再用 BASE 做信任锚
    const share = new URL(`${INVITE_SHARE_PREFIX}${c}`, String(base))
    return trustedUrlOf(share.toString()).toString()
  } catch (err) {
    // 错误里不带 code / 原 URL：失败文案只说明「不可信」
    throw new UntrustedUrlError("分享页 URL 不在可信 origin 上", {
      reason: err?.reason || "origin",
    })
  }
}

/**
 * 抓一次公开分享页，取状态值。
 *
 * 返回形状固定为 `{state, reason}`：
 *   · 成功            → `{state:"…", reason:""}`
 *   · 非法 / 空 code  → `{state:"", reason:"invalid_code"}`（**零 fetch**）
 *   · base 不可信     → `{state:"", reason:"untrusted_origin"}`（零 fetch）
 *   · 3xx（manual）   → `{state:"", reason:"redirect"}`
 *   · 非 2xx          → `{state:"", reason:"http_error"}`
 *   · 超时 / 取消     → `{state:"", reason:"timeout"}` / `"aborted"`
 *   · 网络错误        → `{state:"", reason:"network"}`
 *   · HTML 里没有     → `{state:"", reason:"no_state"}`
 *
 * 任何失败都不抛：调用方回退裸授权 URL，登录继续。
 *
 * @param {{base?: string, code: string, fetchImpl?: typeof fetch, signal?: AbortSignal}} o
 */
export async function fetchReferralState({ base = BASE, code, fetchImpl = globalThis.fetch, signal } = {}) {
  const c = String(code ?? "").trim()
  if (!REFERRAL_CODE_RE.test(c)) return { state: "", reason: "invalid_code" }

  let shareUrl
  try {
    shareUrl = referralShareUrl(base, c)
  } catch {
    return { state: "", reason: "untrusted_origin" }
  }

  // 调用方已经取消：不发明请求
  if (signal?.aborted) return { state: "", reason: "aborted" }

  const controller = new AbortController()
  let timedOut = false
  let callerAborted = false

  const onAbort = () => {
    callerAborted = true
    try {
      controller.abort(signal.reason)
    } catch {
      controller.abort()
    }
  }
  if (signal?.addEventListener) signal.addEventListener("abort", onAbort, { once: true })

  // 超时用 Promise.race 兜底：即使注入的 fetch 不理会 AbortSignal，10s 也一定返回。
  // race 会替两边挂上处理器，迟到的 fetch 失败不会变成 unhandled rejection。
  let rejectTimeout
  const timeoutPromise = new Promise((_, reject) => {
    rejectTimeout = reject
  })
  const timer = setTimeout(() => {
    timedOut = true
    try {
      controller.abort(new Error("invite_timeout"))
    } catch {
      controller.abort()
    }
    rejectTimeout(new Error("invite_timeout"))
  }, INVITE_FETCH_TIMEOUT_MS)
  if (typeof timer?.unref === "function") timer.unref()

  try {
    // 匿名 GET：只有官方 UA 与 Accept，**没有** Authorization / x-desktop-*
    const res = await Promise.race([
      fetchImpl(shareUrl, {
        method: "GET",
        redirect: "manual",
        headers: { "user-agent": OFFICIAL_UA, accept: "text/html" },
        signal: controller.signal,
      }),
      timeoutPromise,
    ])

    const status = Number(res?.status ?? 0)
    if (status >= 300 && status < 400) return { state: "", reason: "redirect" }
    if (!(status >= 200 && status < 300)) return { state: "", reason: "http_error" }

    const html = await res.text()
    const state = parseReferralState(html)
    return state ? { state, reason: "" } : { state: "", reason: "no_state" }
  } catch {
    if (timedOut) return { state: "", reason: "timeout" }
    if (callerAborted) return { state: "", reason: "aborted" }
    return { state: "", reason: "network" }
  } finally {
    clearTimeout(timer)
    if (signal?.removeEventListener) signal.removeEventListener("abort", onAbort)
  }
}

/**
 * 邀请模式：`off`（默认）或不带码的 `on` 都等于「不带邀请」。
 * 只在这里表达取舍；真正的 URL 构造仍在 `buildInviteLoginUrl`。
 *
 * @param {{enabled?: boolean, referralState?: string}} [policy]
 * @returns {"on"|"off"}
 */
export function inviteModeOf(policy) {
  if (policy?.enabled !== true) return "off"
  return REFERRAL_STATE_RE.test(String(policy?.referralState ?? "").trim()) ? "on" : "off"
}