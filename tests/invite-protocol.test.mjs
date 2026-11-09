// tests/invite-protocol.test.mjs —— 邀请登录协议层（厂商无关）
//
// 这里锁的是「登录 URL 上带邀请状态」这一条最小安全面：
//   · 授权 URL 必须**逐字**包进 `<BASE origin><loginPath>?next=…&<stateParam>=…`
//   · 空 / 非法 state、不可信 next / base → 原样返回授权 URL（零请求）
//   · 状态只认可配置前缀（默认 `rs1.`）；只认 login / register 的 href
//   · 分享页 GET 匿名（无 Authorization / 无 x-desktop-*）、官方 UA、redirect:manual、10s 超时
//   · 任何失败只回 `{state:"",reason}`，不抛、不阻塞登录
//   · code 白名单 + 错误文案不回显原值
//
// 全部离线：HOME 重定向到 mkdtemp（策略文件写在 ~/.cache/magpie 下），fetch 全部注入。

import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

// 策略文件写在 ~/.cache/magpie 下，不能污染真实目录
const sandbox = mkdtempSync(join(tmpdir(), "scaffold-invite-protocol-"))
process.env.HOME = sandbox
process.env.USERPROFILE = sandbox

// 动态 import：模块/导出缺失时整个文件直接红（「失败分支先红后绿」的证据）
const {
  buildInviteLoginUrl,
  parseReferralState,
  referralShareUrl,
  fetchReferralState,
  createInviteStore,
  inviteModeOf,
  InvalidReferralCodeError,
  INVITE_LOGIN_PATH,
  INVITE_REGISTER_PATH,
  INVITE_SHARE_PREFIX,
  INVITE_FETCH_TIMEOUT_MS,
  REFERRAL_STATE_PARAM,
  REFERRAL_STATE_PREFIX,
  REFERRAL_STATE_RE,
  REFERRAL_CODE_RE,
  INVITE_WIRING,
} = await import("../src/invite.mjs")
const { BASE } = await import("../src/context.mjs")
const { OFFICIAL_UA } = await import("../src/http.mjs")
const { UntrustedUrlError } = await import("../src/origin.mjs")

/** 信任锚的 origin —— 协议层的所有出站都落在这一个 origin 上 */
const ORIGIN = new URL(BASE).origin

/** 分享页 URL（按协议层的解析语义：站点路径挂在 origin 根上，不带 BASE 的 /v1） */
const shareUrlOf = (code) => new URL(`${INVITE_SHARE_PREFIX}${code}`, ORIGIN).toString()

/** 一个「真实形状」的授权 URL：含 state / code_challenge / redirect_uri 与百分号编码 */
const AUTHORIZE_URL =
  `${BASE}/oauth/authorize?client_id=example-cli&response_type=code` +
  "&redirect_uri=http%3A%2F%2F127.0.0.1%3A19499%2Foauth%2Fcallback&scope=user%3Aprofile" +
  "&code_challenge=abc_123-XYZ&code_challenge_method=S256&state=opaque%2Bstate%3D1"

/** 分享页 HTML：链接里带状态参数（参数名来自常量，派生仓库改名后这份夹具仍然对） */
const SHARE_HTML = `<a href="/login?next=%2Foauth%2Fauthorize&amp;${REFERRAL_STATE_PARAM}=${REFERRAL_STATE_PREFIX}abc.DEF-123">登录</a>`

/** 记录调用的假 fetch；返回 `Response`，默认是带合法 state 的分享页 */
function mockFetch({ status = 200, body = SHARE_HTML, headers = {} } = {}) {
  const calls = []
  const fn = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(body, { status, headers })
  }
  fn.calls = calls
  return fn
}

// ═══════════════════════════════════════════════════════════════════
// 0. 常量形状：派生仓库改错时立刻红（不是运行到一半才发现）
// ═══════════════════════════════════════════════════════════════════

test("常量形状：登录 / 注册路径以 / 开头，分享前缀以 / 开头和 / 结尾", () => {
  assert.match(INVITE_LOGIN_PATH, /^\/[^/?#\s]+$/, `登录页路径必须形如 /login，实际 ${INVITE_LOGIN_PATH}`)
  assert.match(INVITE_REGISTER_PATH, /^\/[^/?#\s]+$/, `注册页路径必须形如 /register，实际 ${INVITE_REGISTER_PATH}`)
  assert.match(INVITE_SHARE_PREFIX, /^\/[^/?#\s]*\/$/, `分享前缀必须形如 /r/，实际 ${INVITE_SHARE_PREFIX}`)
})

test("常量形状：状态参数名可用、状态前缀以 . 结尾、超时是正数", () => {
  // 参数名要能直接进 URLSearchParams：不许带 ? & = # 空格
  assert.equal(typeof REFERRAL_STATE_PARAM, "string")
  assert.ok(REFERRAL_STATE_PARAM.length > 0)
  assert.doesNotMatch(REFERRAL_STATE_PARAM, /[?&=#\s]/, `状态参数名不合法：${REFERRAL_STATE_PARAM}`)

  // 前缀必须带分隔符（`rs1.`），否则 `rs1abc` 也会被当成合法状态
  assert.match(REFERRAL_STATE_PREFIX, /\.$/, `状态前缀必须以 . 结尾，实际 ${REFERRAL_STATE_PREFIX}`)

  assert.equal(typeof INVITE_FETCH_TIMEOUT_MS, "number")
  assert.ok(Number.isFinite(INVITE_FETCH_TIMEOUT_MS) && INVITE_FETCH_TIMEOUT_MS > 0, "超时必须是正数")
})

test("常量形状：两个正则真的拦得住，且与常量一致", () => {
  assert.ok(REFERRAL_STATE_RE instanceof RegExp)
  assert.equal(REFERRAL_STATE_RE.test(`${REFERRAL_STATE_PREFIX}abc.DEF-123_xyz`), true)
  assert.equal(REFERRAL_STATE_RE.test(REFERRAL_STATE_PREFIX), false, "只有前缀不算合法状态")
  assert.equal(REFERRAL_STATE_RE.test(`${REFERRAL_STATE_PREFIX}a b`), false)
  assert.equal(REFERRAL_STATE_RE.test("rs2.abc"), false, "别的前缀不许放行")

  assert.ok(REFERRAL_CODE_RE instanceof RegExp)
  assert.equal(REFERRAL_CODE_RE.test("ABC-123_x.y"), true)
  assert.equal(REFERRAL_CODE_RE.test("a".repeat(200)), true)
  assert.equal(REFERRAL_CODE_RE.test("a".repeat(201)), false)
  assert.equal(REFERRAL_CODE_RE.test("a/b"), false)
})

test("INVITE_WIRING：把厂商相关值收在一处，且被冻结（改这里一处就够）", () => {
  assert.ok(Object.isFrozen(INVITE_WIRING))
  assert.equal(INVITE_WIRING.loginPath, INVITE_LOGIN_PATH)
  assert.equal(INVITE_WIRING.registerPath, INVITE_REGISTER_PATH)
  assert.equal(INVITE_WIRING.sharePrefix, INVITE_SHARE_PREFIX)
  assert.equal(INVITE_WIRING.referralStateParam, REFERRAL_STATE_PARAM)
  assert.equal(INVITE_WIRING.referralStatePrefix, REFERRAL_STATE_PREFIX)
  assert.equal(INVITE_WIRING.referralStatePattern, REFERRAL_STATE_RE)
  assert.equal(INVITE_WIRING.codePattern, REFERRAL_CODE_RE)
  assert.equal(INVITE_WIRING.fetchTimeoutMs, INVITE_FETCH_TIMEOUT_MS)
  assert.deepEqual([...INVITE_WIRING.linkPaths].sort(), [INVITE_LOGIN_PATH, INVITE_REGISTER_PATH].sort())
  // 链接路径表同样冻结：改一个派生值不该在运行时被别的模块改写
  assert.ok(Object.isFrozen(INVITE_WIRING.linkPaths))
})

// ═══════════════════════════════════════════════════════════════════
// 1. 授权 URL 包进登录页，next 逐字相等
// ═══════════════════════════════════════════════════════════════════

test("合法 state：next 逐字往返（含 state / code_challenge / redirect_uri）", () => {
  const state = `${REFERRAL_STATE_PREFIX}abc.DEF-123_xyz`
  const out = buildInviteLoginUrl({ base: BASE, authorizeUrl: AUTHORIZE_URL, referralState: state })
  const url = new URL(out)

  assert.equal(url.origin, ORIGIN)
  assert.equal(url.pathname, INVITE_LOGIN_PATH)
  // 解出来的 next 必须逐字等于原授权 URL
  assert.equal(url.searchParams.get("next"), AUTHORIZE_URL)
  assert.equal(url.searchParams.get(REFERRAL_STATE_PARAM), state)
  assert.deepEqual([...url.searchParams.keys()].sort(), ["next", REFERRAL_STATE_PARAM].sort())

  // 必须经 URLSearchParams 编码：next 是百分号编码的整串，不是裸 URL
  assert.match(out, /[?&]next=https%3A%2F%2F/)
  assert.match(out, new RegExp(`${REFERRAL_STATE_PARAM}=${REFERRAL_STATE_PREFIX.replace(/\./g, "\\.")}abc`))
})

test("next 里有 + / % 时也只解一层，逐字相等（不二次编码）", () => {
  const tricky = `${AUTHORIZE_URL}&note=a%2Bb%20c%25d`
  const out = buildInviteLoginUrl({
    base: BASE,
    authorizeUrl: tricky,
    referralState: `${REFERRAL_STATE_PREFIX}s`,
  })
  assert.equal(new URL(out).searchParams.get("next"), tricky)
})

// ═══════════════════════════════════════════════════════════════════
// 2. 空码 / 非法 state / 不可信 base / 不可信 next → 原样返回
// ═══════════════════════════════════════════════════════════════════

test("空 state 与非法 state 原样返回 authorizeUrl（零请求回退）", async () => {
  const fetchImpl = mockFetch()
  const bad = [
    "",
    "   ",
    undefined,
    null,
    REFERRAL_STATE_PREFIX, // 只有前缀
    `${REFERRAL_STATE_PREFIX}a b`,
    `${REFERRAL_STATE_PREFIX}a\nb`,
    "rs2.abc",
    `RS1.abc`,
    `${REFERRAL_STATE_PREFIX}a/b`,
    `${REFERRAL_STATE_PREFIX}a&b`,
  ]
  for (const state of bad) {
    assert.equal(
      buildInviteLoginUrl({ base: BASE, authorizeUrl: AUTHORIZE_URL, referralState: state }),
      AUTHORIZE_URL,
      `state=${JSON.stringify(state)} 必须回退裸授权 URL`,
    )
  }
  // 回退分支不产生任何网络调用
  assert.equal(fetchImpl.calls.length, 0)
})

test("不可信 base 不回显到构造结果（回退授权 URL）", () => {
  for (const base of [
    "https://evil.example",
    `${ORIGIN}.evil.example`,
    `http://${new URL(ORIGIN).host}`,
    "javascript:alert(1)",
    "not a base",
  ]) {
    assert.equal(
      buildInviteLoginUrl({ base, authorizeUrl: AUTHORIZE_URL, referralState: `${REFERRAL_STATE_PREFIX}abc` }),
      AUTHORIZE_URL,
      `base=${base} 必须回退`,
    )
  }
})

test("不可信 next：绝不包装、原样返回，且不带状态参数（防开放重定向）", () => {
  const state = `${REFERRAL_STATE_PREFIX}abc.DEF-123`
  const badNext = [
    "https://evil.example/oauth/authorize?client_id=x",
    `${ORIGIN}.evil.example/oauth/authorize?client_id=x`,
    `https://evil.${new URL(ORIGIN).host}/oauth/authorize?client_id=x`,
    `http://${new URL(ORIGIN).host}/oauth/authorize?client_id=x`,
    `https://user@${new URL(ORIGIN).host}/oauth/authorize`,
    `https://user:user@${new URL(ORIGIN).host}/oauth/authorize`, // 带 userinfo 一律拒
    "//evil.example/oauth/authorize",
    "/oauth/authorize?client_id=x", // 相对路径不是「完整授权 URL」
    "not a url",
    "",
  ]

  for (const authorizeUrl of badNext) {
    const out = buildInviteLoginUrl({ base: BASE, authorizeUrl, referralState: state })
    assert.equal(out, authorizeUrl, `authorizeUrl=${JSON.stringify(authorizeUrl)} 必须原样返回、不包装`)
    assert.doesNotMatch(out, new RegExp(REFERRAL_STATE_PARAM), "不可信 next 绝不带状态参数")
    assert.doesNotMatch(out, /next=/, "不可信 next 绝不能被塞进登录页")
  }

  // 对照：可信 next 照常包装
  const ok = buildInviteLoginUrl({ base: BASE, authorizeUrl: AUTHORIZE_URL, referralState: state })
  assert.equal(new URL(ok).searchParams.get("next"), AUTHORIZE_URL)
})

// ═══════════════════════════════════════════════════════════════════
// 3. HTML 解析：只认登录 / 注册链接 + 可配置参数名与前缀
// ═══════════════════════════════════════════════════════════════════

test("只接受可配置前缀与参数名，其它 / 畸形值返回空", () => {
  const S = REFERRAL_STATE_PREFIX
  const P = REFERRAL_STATE_PARAM
  assert.equal(parseReferralState(`<a href="/login?next=%2Fx&amp;${P}=${S}abc">x</a>`), `${S}abc`)
  assert.equal(parseReferralState(`<a href="${INVITE_REGISTER_PATH}?${P}=${S}def">x</a>`), `${S}def`)
  // 别的路径、别的 origin、协议相对
  assert.equal(parseReferralState(`<a href="/account/referrals?${P}=${S}abc">x</a>`), "")
  assert.equal(parseReferralState(`<a href="https://evil.example/login?${P}=${S}abc">x</a>`), "")
  assert.equal(parseReferralState(`<a href="//evil.example/login?${P}=${S}abc">x</a>`), "")
  // 错误前缀 / 畸形值
  assert.equal(parseReferralState(`<a href="/login?${P}=rs2.abc">x</a>`), "")
  assert.equal(parseReferralState(`<a href="/login?${P}=${S}">x</a>`), "")
  assert.equal(parseReferralState(`<a href="/login?${P}=${S}a%20b">x</a>`), "")
  assert.equal(parseReferralState(`<a href="/login?other=${S}abc">x</a>`), "")
  assert.equal(parseReferralState(""), "")
  assert.equal(parseReferralState(null), "")
})

test("多链接取第一个合法值；容忍 &amp;、单双引号、大小写、无引号", () => {
  const S = REFERRAL_STATE_PREFIX
  const P = REFERRAL_STATE_PARAM
  const html = `
    <a href="${INVITE_SHARE_PREFIX}SHARE">分享</a>
    <a href="/login?${P}=bad">坏值</a>
    <A HREF='/login?next=%2Fx&amp;${P}=${S}first'>单引号</A>
    <a href="${INVITE_REGISTER_PATH}?${P}=${S}second">第二个</a>
  `
  assert.equal(parseReferralState(html), `${S}first`)

  // 同一 href 里前面有坏值、后面有合法值：取第一个合法
  assert.equal(parseReferralState(`<a href="/login?${P}=bad&amp;${P}=${S}good">x</a>`), `${S}good`)
  // 无引号属性也要能认
  assert.equal(parseReferralState(`<a href=/login?${P}=${S}unquoted>x</a>`), `${S}unquoted`)
  // 参数名大小写不敏感
  assert.equal(parseReferralState(`<a href="/login?${P.toUpperCase()}=${S}upper">x</a>`), `${S}upper`)
})

// ═══════════════════════════════════════════════════════════════════
// 4. 分享页 GET 的匿名与安全形状
// ═══════════════════════════════════════════════════════════════════

test("合法 code：仅一次匿名 GET，官方 UA / Accept / redirect:manual / signal", async () => {
  const fetchImpl = mockFetch()
  const out = await fetchReferralState({ base: BASE, code: "ABC-123_xyz", fetchImpl })

  assert.deepEqual(out, { state: `${REFERRAL_STATE_PREFIX}abc.DEF-123`, reason: "" })
  assert.equal(fetchImpl.calls.length, 1)
  const [{ url, init }] = fetchImpl.calls

  assert.equal(url, shareUrlOf("ABC-123_xyz"))
  assert.equal(init.method, "GET")
  assert.equal(init.redirect, "manual")
  assert.equal(init.headers["user-agent"], OFFICIAL_UA)
  assert.equal(init.headers.accept, "text/html")
  // 匿名：不带凭据，也不带设备签名头
  assert.equal(init.headers.authorization, undefined)
  assert.equal(
    Object.keys(init.headers).some((k) => /^x-desktop-/i.test(k)),
    false,
    "分享页不能带 x-desktop-*",
  )
  assert.ok(init.signal, "必须可被超时 / 调用方 signal 取消")
  assert.equal(INVITE_FETCH_TIMEOUT_MS, 10_000)
})

test("非法 / 空 code：零 fetch，返回 invalid_code", async () => {
  const fetchImpl = mockFetch()
  for (const code of ["", "   ", undefined, null, "../evil", "a/b", "a b", "a\nb", "x".repeat(201)]) {
    const out = await fetchReferralState({ base: BASE, code, fetchImpl })
    assert.deepEqual(out, { state: "", reason: "invalid_code" }, `code=${JSON.stringify(code)}`)
  }
  assert.equal(fetchImpl.calls.length, 0)
})

test("不可信 base：零 fetch，返回 untrusted_origin", async () => {
  const fetchImpl = mockFetch()
  const out = await fetchReferralState({ base: "https://evil.example", code: "ABC", fetchImpl })
  assert.deepEqual(out, { state: "", reason: "untrusted_origin" })
  assert.equal(fetchImpl.calls.length, 0)
})

// ═══════════════════════════════════════════════════════════════════
// 5. 分享页失败不阻塞登录（只回 reason，不抛）
// ═══════════════════════════════════════════════════════════════════

test("非 2xx / 3xx / 无 state / 网络错误都返回 {state:'',reason}，不抛", async () => {
  const cases = [
    [{ status: 500, body: "boom" }, "http_error"],
    [{ status: 404, body: "not found" }, "http_error"],
    [{ status: 302, body: "", headers: { location: `${ORIGIN}${INVITE_LOGIN_PATH}` } }, "redirect"],
    [{ status: 200, body: "<html>没有链接</html>" }, "no_state"],
    [{ status: 200, body: `<a href="/login?${REFERRAL_STATE_PARAM}=bad">x</a>` }, "no_state"],
  ]
  for (const [opts, reason] of cases) {
    const fetchImpl = mockFetch(opts)
    const out = await fetchReferralState({ base: BASE, code: "ABC", fetchImpl })
    assert.deepEqual(out, { state: "", reason }, `status=${opts.status}`)
    assert.equal(fetchImpl.calls.length, 1)
  }

  const throwing = async () => {
    throw new Error("socket hang up")
  }
  assert.deepEqual(await fetchReferralState({ base: BASE, code: "ABC", fetchImpl: throwing }), {
    state: "",
    reason: "network",
  })
})

test("10s 超时：返回 timeout（注入的 fetch 不理 signal 也要兜底）", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  let calls = 0
  // 故意让注入的 fetch 既不 resolve 也不理会 signal
  const fetchImpl = () => {
    calls += 1
    return new Promise(() => {})
  }

  const pending = fetchReferralState({ base: BASE, code: "ABC", fetchImpl })
  t.mock.timers.tick(INVITE_FETCH_TIMEOUT_MS)
  const out = await pending

  assert.deepEqual(out, { state: "", reason: "timeout" })
  assert.equal(calls, 1)
})

test("调用方 signal：已取消零 fetch；途中取消返回 aborted", async () => {
  // 已取消
  const pre = new AbortController()
  pre.abort()
  let calls = 0
  const counter = async () => {
    calls += 1
    return new Response(SHARE_HTML, { status: 200 })
  }
  assert.deepEqual(await fetchReferralState({ base: BASE, code: "ABC", fetchImpl: counter, signal: pre.signal }), {
    state: "",
    reason: "aborted",
  })
  assert.equal(calls, 0)

  // 请求途中取消
  const ac = new AbortController()
  const hung = (url, init) => {
    calls += 1
    return new Promise((_, reject) => {
      init.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true })
    })
  }
  const pending = fetchReferralState({ base: BASE, code: "ABC", fetchImpl: hung, signal: ac.signal })
  ac.abort()
  assert.deepEqual(await pending, { state: "", reason: "aborted" })
  assert.equal(calls, 1)
})

test("分享页流程只请求分享前缀，绝不碰 referrals/bind|code|me|relations 写面", async () => {
  const seen = []
  const fetchImpl = async (url, init = {}) => {
    seen.push({ url: String(url), method: init.method ?? "GET" })
    return new Response(SHARE_HTML, { status: 200 })
  }

  const out = await fetchReferralState({ base: BASE, code: "CODE-1", fetchImpl })
  assert.equal(out.state, `${REFERRAL_STATE_PREFIX}abc.DEF-123`)
  assert.equal(seen.length, 1)
  for (const c of seen) {
    assert.equal(c.method, "GET")
    assert.equal(new URL(c.url).pathname, `${INVITE_SHARE_PREFIX}CODE-1`)
    assert.doesNotMatch(c.url, /referrals\/(bind|code|me|relations)/)
  }
})

// ═══════════════════════════════════════════════════════════════════
// 6. code 白名单
// ═══════════════════════════════════════════════════════════════════

test("referralShareUrl：code 白名单，同 origin", () => {
  assert.equal(referralShareUrl(BASE, "ABC-123_x.y"), shareUrlOf("ABC-123_x.y"))
  assert.equal(referralShareUrl(BASE, "a".repeat(200)), shareUrlOf("a".repeat(200)))

  const bad = ["", "  ", "../evil", "a/b", "a b", "a\nb", "a+b", "a&b", "a?b", "a#b", "中文", "a".repeat(201)]
  for (const code of bad) {
    assert.throws(
      () => referralShareUrl(BASE, code),
      (err) => err instanceof InvalidReferralCodeError && err.code === "invalid_code",
      `code=${JSON.stringify(code)} 必须被白名单拒绝`,
    )
  }

  // 不可信 base 由 origin 闸门拒掉（http / 别的 origin 都不行）
  for (const base of [`https://evil.example`, `http://${new URL(ORIGIN).host}`]) {
    assert.throws(
      () => referralShareUrl(base, "ABC"),
      (err) => err instanceof UntrustedUrlError && /可信 origin/.test(err.message),
      `base=${base} 必须被拒`,
    )
  }
})

// ═══════════════════════════════════════════════════════════════════
// 7. 策略存储：与码成对的额外字段（同码继承 / 换码丢弃）
// ═══════════════════════════════════════════════════════════════════

test("createInviteStore：状态参数同码继承、换码丢弃，旧 API 不变", () => {
  const store = createInviteStore("zzrefstate")

  store.write("CODE-1", { source: "chosen", extra: { referralState: `${REFERRAL_STATE_PREFIX}one`, referralStateAt: 111 } })
  assert.equal(store.read(), "CODE-1")
  assert.equal(store.readExtra("referralState"), `${REFERRAL_STATE_PREFIX}one`)
  assert.equal(store.readExtra("referralStateAt"), "111")

  // 同码重写、不带 extra → 继承
  store.write("CODE-1", { source: "used" })
  assert.equal(store.readExtra("referralState"), `${REFERRAL_STATE_PREFIX}one`)
  assert.equal(store.readExtra("referralStateAt"), "111")

  // 换码、不带 extra → 旧状态必须丢掉（不能拿旧 state 配新码）
  store.write("CODE-2", { source: "chosen" })
  assert.equal(store.read(), "CODE-2")
  assert.equal(store.readExtra("referralState"), "")
  assert.equal(store.readExtra("referralStateAt"), "")

  // 空码不覆盖已有策略
  store.write("", { extra: { referralState: `${REFERRAL_STATE_PREFIX}empty` } })
  assert.equal(store.read(), "CODE-2")
  assert.equal(store.readExtra("referralState"), "")
})

// ═══════════════════════════════════════════════════════════════════
// 8. 错误脱敏：状态 / code 原值不进文案
// ═══════════════════════════════════════════════════════════════════

test("失败结果与错误文案不回显 state / code 原值", async () => {
  const secretState = `${REFERRAL_STATE_PREFIX}credential-looking-${"A".repeat(120)} `
  const html = `<a href="/login?${REFERRAL_STATE_PARAM}=${encodeURIComponent(secretState)}">x</a>`
  const fetchImpl = mockFetch({ body: html })
  const out = await fetchReferralState({ base: BASE, code: "SAFE-CODE", fetchImpl })
  assert.deepEqual(out, { state: "", reason: "no_state" })
  assert.doesNotMatch(JSON.stringify(out), /credential-looking/)

  // 非法 code 的错误文案不含原值
  const secretCode = `credential-looking-${"x".repeat(200)}`
  try {
    referralShareUrl(BASE, secretCode)
    assert.fail("非法 code 必须抛")
  } catch (err) {
    assert.equal(err.code, "invalid_code")
    assert.doesNotMatch(err.message, /credential-looking/)
    assert.doesNotMatch(err.message, /x{20}/)
  }

  // 没有可配置前缀的长串一律不当作状态
  assert.equal(parseReferralState(`<a href="/login?${REFERRAL_STATE_PARAM}=long-credential-looking-token">x</a>`), "")
})

// ═══════════════════════════════════════════════════════════════════
// 9. 模式判定：没有可用状态就等于关闭
// ═══════════════════════════════════════════════════════════════════

test("inviteModeOf：off 默认；on 只在 enabled 且状态合法时成立", () => {
  assert.equal(inviteModeOf(), "off")
  assert.equal(inviteModeOf(null), "off")
  assert.equal(inviteModeOf({}), "off")
  assert.equal(inviteModeOf({ enabled: false, referralState: `${REFERRAL_STATE_PREFIX}a` }), "off")
  assert.equal(inviteModeOf({ enabled: true }), "off")
  assert.equal(inviteModeOf({ enabled: true, referralState: "" }), "off")
  assert.equal(inviteModeOf({ enabled: true, referralState: "rs2.a" }), "off")
  assert.equal(inviteModeOf({ enabled: true, referralState: `${REFERRAL_STATE_PREFIX}a` }), "on")
  // 顺手 trim
  assert.equal(inviteModeOf({ enabled: true, referralState: `  ${REFERRAL_STATE_PREFIX}a  ` }), "on")
})
