// src/models.mjs —— 模型目录：过滤、降级、以及三个最容易错的字段
//
// 这个文件在四个真实插件里都有（4/4），因为 `provider.models` 是最容易「看起来对、
// 实际错」的钩子。下面每一条都是实测踩出来的，不是设计偏好。

import { BASE, SDK } from "./context.mjs"

/** 默认条目工厂：和 `context.mjs` 的 `staticModels()` 造出来的形状完全一致 */
export function defaultEntry(id, name, vision, opts = {}) {
  const { rate = 0, free = false, context } = opts
  return {
    id,
    name,
    api: { id, url: BASE, npm: SDK },
    status: "active",
    cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
    ...(typeof context === "number" ? { limit: { context, output: 64_000 } } : {}),
    capabilities: {
      temperature: true,
      reasoning: true,
      toolcall: true,
      attachment: !!vision,
      input: { text: true, image: !!vision },
      output: { text: true },
    },
    // free 与 rate 不会同时出现：rate 只在 > 0 时写，free 只在确认为真时写
    ...(free ? { free: true } : {}),
    ...(!free && Number(rate) > 0 ? { rate: Number(rate) } : {}),
  }
}

/** 倍率换算：上游给的是「点数」，magpie 要的是倍数。**这个系数必须实测核对**，别猜 */
export const MULT_BASE = 2000

/** 不算模型的 id：生图 / embedding / rerank —— 列出来用户选了就报错 */
const NOT_CHAT = /embed|rerank|image|video|tts|whisper|sd(xl)?[-.]|flux/i

/**
 * 上游给的模型能不能被用户真正选中。
 * 实测：有的平台「注册表」有 26 个、真正能调的只有 9 个 —— 比少给更糟的是多给。
 */
export function isUsable(m) {
  const id = String(m?.id ?? "")
  if (!id) return false
  if (NOT_CHAT.test(id)) return false
  // VIP / 锁定：选中必报错，直接不列
  const tags = Array.isArray(m?.tags) ? m.tags : []
  if (tags.some((t) => /vip|lock|pay|premium/i.test(String(t?.value ?? t)))) return false
  return true
}

/**
 * 价格三分支 —— **`free` 不能从 `rate` 反推**。这是全模板最容易错的一处。
 *
 * 实测（HOOKS.md 十一之二）：`rate === 0` 的 51 条里，只有 13 条真免费，
 * 另外 38 条是「套餐内不按次计费」—— 照样吃套餐额度。标成 free 会让
 * Free first 一直派到它们身上。
 *
 *   input_points > 0   → 有倍率，free 不设
 *   input_points === 0 → 厂商声明免费 → free: true，且不给 rate
 *   input_points 缺失  → 价格未知 → **不列**（不猜，也不谎标免费）
 */
export function priceOf(pointEntry) {
  const raw = pointEntry?.inputPoints
  const known = raw != null && String(raw).trim() !== "" && Number.isFinite(Number(raw))
  if (!known) return { known: false }
  const n = Number(raw)
  return n === 0 ? { known: true, free: true, rate: 0 } : { known: true, free: false, rate: n / MULT_BASE }
}

/**
 * 上下文窗口：**查 magpie 的模型库，不要填保守值**。
 *
 * 填错的两种后果，实测都发生过：
 *   - 填大了：上游 400，而这个 400 会被当成「模型不可用」
 *   - 填小了：agent 认为「放不下」，长输入被拒 —— 用户以为是模型的锅
 *
 * 早前一律填 256K，实际是 1M。查库的写法见 context.mjs 的 contextOf()。
 */
export function contextOf(_modelId) {
  // TODO: 从 magpie 的模型库查这个 id 的真实窗口。查不到就**别乱填** ——
  // 宁可留空让宿主用它自己的默认，也不要写一个猜的数字。
  return undefined
}

/**
 * 组装 magpie 要的模型条目。
 *
 * `degraded` 是「部分成功」的表达，**三种降级方向必须分清**：
 *   ① 计费接口整个挂了（pointsOk=false）  → 不过滤，宁愿没有倍率也别让列表空掉
 *   ② 计费接口成功、但这条没价格         → 不列（用户选了不知道花多少）
 *   ③ 模型列表整个挂了                   → 不返回空 map，让调用方退回上次快照
 *
 * @param {{id:string,name:string,vision?:boolean}[]} live  上游模型列表
 * @param {Map<string,{inputPoints?:number}>} points        计费（可为空）
 * @param {(id:string,name:string,vision:boolean,opts:object)=>object} entry 显示条目工厂
 */
export function buildModels(live, points, entry = defaultEntry) {
  const pointsOk = points instanceof Map ? points.size > 0 : Object.keys(points || {}).length > 0
  const out = {}
  let droppedUnknownPrice = 0

  for (const m of live || []) {
    if (!isUsable(m)) continue
    const pid = m.pointId ?? m.id
    const p = points instanceof Map ? points.get(pid) : points?.[pid]
    const price = priceOf(p)

    // ② 价格未知 → 不列（只在「计费接口本身是成功的」前提下）
    if (pointsOk && !price.known) {
      droppedUnknownPrice++
      continue
    }

    out[m.id] = entry(m.id, m.name, !!m.vision, {
      rate: price.known ? price.rate : 0,
      free: !!price.free,
      context: contextOf(m.id),
    })
  }

  return { models: out, pointsOk, droppedUnknownPrice }
}
