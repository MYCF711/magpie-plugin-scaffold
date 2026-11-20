// src/invite-policy.mjs —— 通用「邀请来源选择」交互（ask → prepare → authorize）
//
// 只负责策略与宿主提问时序，不知道厂商 URL、token 形状或邀请端点。
// 调用方注入账号目录、首选 uid、取码函数与三个存储：
//   sourceStore    = createInviteSourceStore(provider)（账号/码缓存）
//   preferredStore = createInviteStore(`${provider}-invite-source`)（latest/uid/manual）
//   reservedStore  = createInviteStore(provider)（用户手动预留码）
//
// 三条不可破坏的契约：
//   ① latest / 指定 uid / manual 分别持久化，latest 绝不能记成当前 uid；
//   ② ask() 才允许等待取码，authorize() 用 prepare() 的同一快照、零出站；
//   ③ 自动派生只写 sourceStore，reservedStore 只有用户手动输入才写。

import { inviteHint, resolveInvite } from "./invite.mjs"

export const INVITE_PREFERRED_KEY = "invite_preferred"
export const INVITE_SOURCE_KEY = "inviteSource"
export const INVITE_MANUAL_KEY = "invite"
export const INVITE_SOURCE_LATEST = "latest"
export const INVITE_SOURCE_MANUAL = "manual"

/** 默认保持旧的「自动最新」行为；派生插件可展开后改 default:true。 */
export const INVITE_PREFERRED_OPTION = Object.freeze({
  key: INVITE_PREFERRED_KEY,
  label: "首选账号作为邀请源",
  description: "关闭：自动使用最新注册账号滚动邀请；开启：登录时选择最新账号、指定账号或手动邀请码，并记住选择。",
  default: false,
  placement: "top",
})

function text(value) {
  return typeof value === "string" ? value.trim() : ""
}

function asked(inputs, key) {
  return inputs !== null && typeof inputs === "object" && Object.prototype.hasOwnProperty.call(inputs, key)
}

function readOption(ctx, provider, key) {
  try {
    return ctx?.magpie?.option?.(provider, key) === true
  } catch {
    return false
  }
}

function normalizeAccounts(value) {
  const rows = Array.isArray(value) ? value : []
  const seen = new Set()
  const out = []
  for (const row of rows) {
    const uid = text(row?.uid)
    if (!uid || seen.has(uid)) continue
    seen.add(uid)
    out.push({
      ...row,
      uid,
      label: text(row?.label) || text(row?.accountId) || `账号 ${out.length + 1}`,
      firstSeenAt: Number(row?.firstSeenAt) || 0,
      lastSeenAt: Number(row?.lastSeenAt) || 0,
    })
  }
  return out.sort((a, b) => b.firstSeenAt - a.firstSeenAt || b.lastSeenAt - a.lastSeenAt || a.uid.localeCompare(b.uid))
}

function defaultManualCode(value) {
  const code = text(value)
  if (!code) return ""
  // 预留码可以是厂商链接或裸码，但绝不能把凭据存进策略文件或拼进登录 URL。
  if (/^(?:eyJ|sk-|bearer\s|di_|refresh[_-]|access[_-])/i.test(code)) return ""
  return code
}

function emptyResolution(selection = INVITE_SOURCE_LATEST) {
  return { code: "", shareUrl: "", kind: "none", uid: "", selection, reason: "no-invite-source" }
}

/**
 * 创建一个登录流程的邀请策略。readAccountInviteCode 只在 ask() 中 await；
 * 返回字符串或 {code, shareUrl}。失败返回空串即可，登录不会被邀请码阻塞。
 */
export function createInvitePolicy({
  ctx = {},
  provider,
  optionKey = INVITE_PREFERRED_KEY,
  sourceStore,
  preferredStore,
  reservedStore,
  readAccounts = () => [],
  readPreferredUid = () => "",
  readAccountInviteCode = async () => "",
  parseManualCode = defaultManualCode,
  now = Date.now,
} = {}) {
  let pending = null
  let manualError = ""

  const preferred = {
    read: () => {
      try { return text(preferredStore?.read()) } catch { return "" }
    },
    write: (value) => {
      try { preferredStore?.write(value, { source: "chosen" }) } catch {}
    },
  }
  const reserved = {
    read: () => {
      try { return text(reservedStore?.read()) } catch { return "" }
    },
    write: (value) => {
      try { reservedStore?.write(value, { source: "chosen" }) } catch {}
    },
  }

  function safeResolve(input) {
    try {
      const result = sourceStore?.resolve?.(input)
      if (result && typeof result === "object") return result
    } catch {}
    return emptyResolution(input?.preferFirst ? text(input?.preferredUid) : INVITE_SOURCE_LATEST)
  }

  function accounts() {
    try { return normalizeAccounts(readAccounts()) } catch { return [] }
  }

  function state(inputs = {}) {
    const preferredEnabled = readOption(ctx, provider, optionKey)
    const rows = accounts()
    const savedSelection = preferred.read()
    const selectedSelection = asked(inputs, INVITE_SOURCE_KEY) ? text(inputs[INVITE_SOURCE_KEY]) : undefined
    let preferredUid = ""
    try { preferredUid = text(readPreferredUid()) } catch {}
    const selection = preferredEnabled
      ? selectedSelection ?? savedSelection ?? preferredUid ?? INVITE_SOURCE_LATEST
      : INVITE_SOURCE_LATEST
    return {
      preferredEnabled,
      rows,
      savedSelection,
      selectedSelection,
      preferredUid,
      selection: selection || preferredUid || INVITE_SOURCE_LATEST,
      manualMode: rows.length === 0 || (preferredEnabled && selection === INVITE_SOURCE_MANUAL),
    }
  }

  function manualPrompt() {
    return {
      type: "text",
      key: INVITE_MANUAL_KEY,
      message: "手动邀请码（仅新注册账号有效）",
      placeholder: inviteHint(reserved.read()),
      placement: "top",
    }
  }

  function sourcePrompt(current) {
    const automatic = { value: INVITE_SOURCE_LATEST, label: "最新账号（自动滚动邀请）" }
    const manual = { value: INVITE_SOURCE_MANUAL, label: "手动输入邀请码" }
    const options = [automatic, ...current.rows.map((row) => ({ value: row.uid, label: `${row.label}（${row.uid}）` })), manual]
    const remembered = (current.selectedSelection ?? current.savedSelection) || current.preferredUid || INVITE_SOURCE_LATEST
    const first = options.find((option) => option.value === remembered)
    return {
      type: "select",
      key: INVITE_SOURCE_KEY,
      message: "邀请来源（记住本次选择）",
      options: first ? [first, ...options.filter((option) => option !== first)] : options,
      placement: "top",
    }
  }

  function nextPrompt(inputs, current) {
    if (current.preferredEnabled && current.rows.length > 0 && !asked(inputs, INVITE_SOURCE_KEY)) return sourcePrompt(current)
    if (current.manualMode && !asked(inputs, INVITE_MANUAL_KEY)) return manualPrompt()
    return null
  }

  function remember(current, selection) {
    if (current.preferredEnabled && current.selectedSelection !== undefined) preferred.write(selection)
  }

  function withSelection(result, selection) {
    return { ...emptyResolution(selection), ...result, selection }
  }

  function selfInvite(snapshot, targetIdentity = "") {
    const target = text(targetIdentity)
    if (target && snapshot.uid && target === snapshot.uid) {
      return { ...snapshot, code: "", shareUrl: "", kind: "skip", reason: "self-invite" }
    }
    return snapshot
  }

  function manualSnapshot(current, inputs) {
    const candidate = resolveInvite(asked(inputs, INVITE_MANUAL_KEY) ? text(inputs[INVITE_MANUAL_KEY]) : "", reserved.read())
    let code = ""
    try { code = text(parseManualCode(candidate)) } catch { code = "" }
    if (candidate && !code) {
      manualError = "邀请码格式无效：请填写厂商邀请码或官方邀请链接，不要填写 token / Key"
      return null
    }
    if (code) reserved.write(code)
    const resolved = safeResolve({ preferFirst: true, preferredUid: "", reservedCode: code })
    return withSelection({ ...resolved, kind: resolved.code ? "manual" : "none", uid: "" }, INVITE_SOURCE_MANUAL)
  }

  async function capture(current, inputs) {
    if (current.manualMode) {
      remember(current, INVITE_SOURCE_MANUAL)
      pending = manualSnapshot(current, inputs)
      return
    }

    const chosen = current.selection === INVITE_SOURCE_LATEST
      ? current.rows[0]
      : current.rows.find((row) => row.uid === current.selection)
    const account = chosen ?? current.rows[0]
    if (!account) {
      pending = withSelection(safeResolve({ preferFirst: false, reservedCode: reserved.read() }), INVITE_SOURCE_LATEST)
      return
    }
    const effectiveSelection = chosen ? current.selection : INVITE_SOURCE_LATEST
    remember(current, effectiveSelection)

    let provided = ""
    try { provided = await readAccountInviteCode(account) } catch {}
    const code = text(provided?.code ?? provided)
    const shareUrl = text(provided?.shareUrl)
    try { sourceStore?.noteAccount?.({ uid: account.uid, accountId: account.accountId ?? account.label, at: now() }) } catch {}
    let saved = null
    if (code) {
      try { saved = sourceStore?.saveCode?.({ uid: account.uid, code, shareUrl, at: now() }) ?? null } catch {}
    }
    if (saved) {
      pending = withSelection({ ...saved, kind: effectiveSelection === INVITE_SOURCE_LATEST ? "latest" : "preferred", reason: "selected-account-invite" }, effectiveSelection)
      return
    }
    // 取码失败：只回退同一 uid 的旧缓存 / 用户预留，不联网、不静默换号。
    const fallback = safeResolve({
      preferFirst: effectiveSelection !== INVITE_SOURCE_LATEST,
      preferredUid: account.uid,
      reservedCode: reserved.read(),
    })
    pending = withSelection(fallback, effectiveSelection)
  }

  async function ask(inputs = {}) {
    manualError = ""
    const current = state(inputs)
    const next = nextPrompt(inputs, current)
    if (next) return next
    await capture(current, inputs)
    return manualError ? { ...manualPrompt(), message: manualError } : null
  }

  function prompts() {
    const first = nextPrompt({}, state())
    return first ? [first] : []
  }

  /** 同步快照：authorize() 不再取码；targetIdentity 相同则显式 skip，避免自邀。 */
  function prepare(inputs = {}) {
    if (!pending && manualError) {
      const invalid = emptyResolution(INVITE_SOURCE_MANUAL)
      return () => invalid
    }
    if (!pending) {
      const current = state(inputs)
      if (current.manualMode) pending = manualSnapshot(current, inputs)
      else {
        const exists = current.selection === INVITE_SOURCE_LATEST || current.rows.some((row) => row.uid === current.selection)
        const selection = current.preferredEnabled && exists ? current.selection : INVITE_SOURCE_LATEST
        const resolved = safeResolve({
          preferFirst: current.preferredEnabled && selection !== INVITE_SOURCE_LATEST,
          preferredUid: selection === INVITE_SOURCE_LATEST ? "" : selection,
          reservedCode: reserved.read(),
        })
        pending = withSelection(resolved, selection)
      }
    }
    const snapshot = pending ?? emptyResolution()
    return (targetIdentity = "") => selfInvite(snapshot, targetIdentity)
  }

  return { ask, prompts, prepare }
}
