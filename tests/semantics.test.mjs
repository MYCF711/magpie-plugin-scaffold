// tests/semantics.test.mjs —— 锁住「形状对、语义错」的那几处
//
// 为什么需要它：`scripts/check.mjs` 查的是**形状**（导出了什么、字段齐不齐、许可对不对）。
// 但真实踩过的坑几乎都在语义上，而且**都不报错**：
//   · free 从 rate 反推 → 一整批套餐模型被标成免费，Free first 一直派到它们身上
//   · 计费接口整个挂了却按「单条无价格」过滤 → 列表变空
//   · 模型级 400 直接透传成 401 → 整个账号被停用
//   · 流式没带 stream_options.include_usage → 额度永远不扣
//
// 跑法：node --test    （或 node tests/semantics.test.mjs）

import test from "node:test"
import assert from "node:assert/strict"

import { buildModels, priceOf, isUsable, defaultEntry } from "../src/models.mjs"
import { ApiError, asModelError, read } from "../src/api.mjs"
import { withUsage, singleShotToSSE, normalizeUsage } from "../src/chat.mjs"
import { usage, usageWindow } from "../src/quota.mjs"

// 在测试里显式写出来：倍率系数是实测值，改了必须连测试一起改
const MULT_BASE = 2000

const C = { BASE: "https://api.example.com/v1" }
const entry = (id, name, vision, opts) => ({ id, name, vision, ...opts })

// ── free 三分支：全模板最容易错的一处 ────────────────────────────────

test("price: input_points > 0 → 有 rate，不设 free", () => {
  const p = priceOf({ inputPoints: 100 })
  assert.equal(p.known, true)
  assert.equal(p.free, false)
  assert.equal(p.rate, 100 / MULT_BASE)
})

test("price: input_points === 0 → free，且不给 rate", () => {
  const p = priceOf({ inputPoints: 0 })
  assert.deepEqual(p, { known: true, free: true, rate: 0 })
})

test("price: input_points 缺失 → 未知（不猜、不谎标免费）", () => {
  assert.equal(priceOf({}).known, false)
  assert.equal(priceOf(undefined).known, false)
  // 空串是「没填」而不是「等于 0」—— Number("") === 0 会把它误判成免费
  assert.equal(priceOf({ inputPoints: "" }).known, false)
  assert.equal(priceOf({ inputPoints: "abc" }).known, false)
})

test("models: 有价格的模型不会被标成 free（rate 与 free 互斥）", () => {
  const live = [{ id: "a", name: "A" }]
  const { models } = buildModels(live, new Map([["a", { inputPoints: 200 }]]), defaultEntry)
  assert.notEqual(models.a.free, true)
  assert.equal(models.a.rate, 200 / MULT_BASE)
  assert.equal("free" in models.a, false) // defaultEntry 只在确认为真时才写这个字段
})

// ── 三态降级 ────────────────────────────────────────────────────────

test("models: 计费接口整个失败 → 不过滤，列表不空", () => {
  const live = [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
  ]
  const { models, pointsOk } = buildModels(live, {}, entry) // 空计费表 = 接口失败
  assert.equal(pointsOk, false)
  assert.deepEqual(Object.keys(models).sort(), ["a", "b"])
  assert.equal(models.a.rate, 0) // 没有倍率，但有条目
})

test("models: 计费成功但某条没价格 → 不列（用户选了不知道花多少）", () => {
  const live = [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
  ]
  const { models, droppedUnknownPrice } = buildModels(live, new Map([["a", { inputPoints: 50 }]]), entry)
  assert.deepEqual(Object.keys(models), ["a"])
  assert.equal(droppedUnknownPrice, 1)
})

test("models: VIP / 生图 / embedding 不列（选中必报错）", () => {
  assert.equal(isUsable({ id: "gpt-x" }), true)
  assert.equal(isUsable({ id: "gpt-x", tags: [{ value: "vip" }] }), false)
  assert.equal(isUsable({ id: "text-embedding-3" }), false)
  assert.equal(isUsable({ id: "flux-pro" }), false)
  assert.equal(isUsable({}), false)
})

// ── 错误语义：404 不是 401 ──────────────────────────────────────────

test("api: 模型级错误被翻成 404（透传 4xx 会打死整个账号）", () => {
  const e = new ApiError("model not found", { status: 400 })
  assert.equal(asModelError(e).status, 404)
})

test("api: 401 不被改写 —— 那确实是登录失效", () => {
  const e = new ApiError("unauthorized", { status: 401 })
  assert.equal(asModelError(e).status, 401)
})

test("api: 非 ApiError 原样返回", () => {
  const e = new TypeError("boom")
  assert.equal(asModelError(e), e)
})

test("api: read 把非 2xx 变成异常（而不是返回一个空对象）", async () => {
  const res = new Response(JSON.stringify({ message: "bad" }), { status: 500 })
  await assert.rejects(() => read(res, "https://x/y"), (err) => err instanceof ApiError && err.status === 500)
})

test("api: read 把非 JSON 也变成异常（带原文片段，否则查不出是什么）", async () => {
  const res = new Response("<html>502 Bad Gateway</html>", { status: 200 })
  await assert.rejects(() => read(res), /不是 JSON/)
})

// ── 流式三坑 ────────────────────────────────────────────────────────

test("chat: withUsage 给流式请求补 include_usage", () => {
  const b = withUsage({ stream: true, model: "m" })
  assert.deepEqual(b.stream_options, { include_usage: true })
})

test("chat: withUsage 不碰非流式请求", () => {
  const b = withUsage({ stream: false, model: "m" })
  assert.equal(b.stream_options, undefined)
})

test("chat: singleShotToSSE 产出可解析的帧，并以 [DONE] 收尾", async () => {
  const res = singleShotToSSE({ model: "m", text: "你好", usage: { prompt: 3, completion: 4, total: 7 } })
  assert.match(res.headers.get("content-type"), /text\/event-stream/)
  const text = await res.text()
  const frames = text
    .split("\n\n")
    .map((s) => s.trim())
    .filter(Boolean)
  assert.ok(frames.length >= 4, `帧太少：${frames.length}`)
  assert.equal(frames.at(-1), "data: [DONE]")
  const last = JSON.parse(frames.at(-2).replace(/^data: /, ""))
  assert.deepEqual(last.usage, { prompt: 3, completion: 4, total: 7 })
})

test("chat: normalizeUsage 兼容两套字段名，坏数据返回 null", () => {
  assert.deepEqual(normalizeUsage({ prompt_tokens: 1, completion_tokens: 2 }), { prompt: 1, completion: 2, total: 3 })
  assert.deepEqual(normalizeUsage({ input_tokens: 5, output_tokens: 6 }), { prompt: 5, completion: 6, total: 11 })
  assert.equal(normalizeUsage(null), null)
  assert.equal(normalizeUsage({ prompt_tokens: "x" }), null)
})

// ── 额度窗口：五类「写错不报错，但 GUI / 智能路由会坏」的写法 ────────
// 这些错误不会让插件崩：卡片显示「剩余额度未知」、这个号在路由里被当成不存在，
// 而日志里什么都没有。src/quota.mjs 把它们变成运行时错误 —— 这里锁住那些错误。

test("quota: aside 窗口给 amount/limit → 抛（否则整条窗口被丢掉，路由当它不存在）", () => {
  assert.throws(
    () => usageWindow({ name: "赠送", used: 0, aside: true, amount: 1, limit: 2 }),
    /aside: true 的窗口不能给 amount\/limit/,
  )
})

test("quota: used 缺省 → 抛（否则按 0% = 满额算，空号排到路由队首）", () => {
  assert.throws(() => usageWindow({ name: "5 小时", resetsAt: "2026-10-28T00:00:00Z" }), /used 必填/)
  assert.throws(() => usageWindow({ name: "5 小时", used: "37%" }), /used 必填/)
})

test("quota: 厂商原样时间 / 秒级时间戳 → 统一成 ISO", () => {
  assert.equal(usageWindow({ name: "a", used: 1, resetsAt: "2026-10-28 23:59:59" }).resetsAt, new Date(2026, 9, 28, 23, 59, 59).toISOString())
  assert.equal(usageWindow({ name: "a", used: 1, resetsAt: 1793000000 }).resetsAt, new Date(1793000000 * 1000).toISOString())
  assert.throws(() => usageWindow({ name: "a", used: 1, resetsAt: "昨天" }), /无法解析/)
})

test("quota: 钱包型（balance）不能再给 used → 抛（否则被当占比读）", () => {
  assert.throws(() => usageWindow({ name: "积分", balance: 6291, used: 0, unit: "积分" }), /钱包型/)
  const w = usageWindow({ name: "积分", balance: 6291, unit: "积分" })
  assert.equal(w.balance, 6291)
  assert.equal(w.used, undefined)
})

test("quota: span 不是正整数 → 抛；正常窗口原样通过", () => {
  assert.throws(() => usageWindow({ name: "a", used: 1, span: 0 }), /span/)
  assert.throws(() => usageWindow({ name: "a", used: 1, span: 1.5 }), /span/)
  const w = usageWindow({ name: "5 小时", used: 37, span: 18000, resetsAt: 1793000000 })
  assert.deepEqual(w, { name: "5 小时", used: 37, span: 18000, resetsAt: new Date(1793000000 * 1000).toISOString() })
})

test("quota: usage() 逐个过一遍窗口，并且不改动其余字段", () => {
  const u = usage({
    plan: "Pro",
    windows: [{ name: "5 小时", used: 37, span: 18000 }, { name: "积分", balance: 100, unit: "积分" }],
  })
  assert.equal(u.plan, "Pro")
  assert.equal(u.windows.length, 2)
  assert.equal(u.windows[0].used, 37)
  assert.equal(u.windows[1].balance, 100)
})
