// src/account-name.mjs —— 卡片上那个账号名从哪来
//
// ═══════════════════════════════════════════════════════════════════
// 问题
// ═══════════════════════════════════════════════════════════════════
//
// OAuth 换码的响应里通常**没有**账号名（Accio / 多数国内厂商都一样）。于是卡片只能显示
// 「Signed in」或者供应商名 —— 用户看不出这是哪个号，多账号时更明显。
//
// 解法：凭据拿到之后，立刻调一个「读当前账号」的接口，把手机号 / 邮箱塞进 `accountId`。
//
// ═══════════════════════════════════════════════════════════════════
// 四条规矩
// ═══════════════════════════════════════════════════════════════════
//
// ① **失败不能阻塞登录**：取不到账号名只是显示问题，登录本身已经成功。
//    `accountId` 留空串 → magpie 回退到供应商名（HOOKS 八的三级回退），不编造。
// ② **优先级固定**：手机号 → 邮箱 → 用户 id → 空串。手机号要**打码**
//    （`0086-18970098051` / `+86 189 7009 8051` / `18970098051` 一律 `189****8051`），
//    和别的供应商一致。
// ③ **别把 `accountId` 当唯一键**：它是给人看的；区分同名账号靠 `uid`（HOOKS 八）。
// ④ **内部 ID 不是名字**：`iam::<domain>:user:<name>`、`urn:…`、uuid、裸 hash、
//    华为 IAM 的 `hw061571365626786` —— 这些都是**身份**，写进 `accountId` 就永久留在
//    卡片上（续期与合并都会原样保留），用户看到的是三串看不懂的 ID。它们进 `uid`。
//
//    反例（真实事故，CodeArts 0.2.4）：卡片的账号名取了 refresh token 里的
//    `principal_urn`，三个账号显示成 `iam::01a1642a…:user:hw0615…` 三行，用户以为是乱码，
//    而那串 ID 从没被换掉过。修法是登录后读一次 IAM 的手机号 —— 见 `resolveAccount`。

/** 手机号打码成 `189****8051`：厂商给 `0086-1…`、`+86 1…`、已打码的，都认。 */
export function maskPhone(raw) {
  let digits = String(raw ?? "").replace(/\D/g, "")
  // 国家码去掉：`0086…` / `86…`，但要给后面留够一个号码的长度 ——
  // 否则 "86123456789" 这种 86 开头的真号码会被砍掉头两位。
  if (digits.startsWith("0086") && digits.length - 4 >= 7) digits = digits.slice(4)
  else if (digits.startsWith("86") && digits.length - 2 >= 7) digits = digits.slice(2)
  if (digits.length < 7) return ""
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`
}

// 「这看起来是 ID，不是名字」。判据都是**能一眼看出**的形状，不做语义猜测：
const IDENTIFIER_PATTERNS = [
  /::/, // iam::<domain>:user:<name> / arn:…:…
  /^urn:/i, // urn:…
  /^hw[0-9a-z]{8,}$/i, // 华为 IAM 的账号名：hw061571365626786
  /^[0-9a-f]{8}-[0-9a-f]{4}-/i, // uuid
  /^[0-9a-f]{16,}$/i, // 裸 hash / 32 位 domain id
]

/** 这个值像「内部 ID」吗？像就不该当名字显示。 */
export function looksLikeIdentifier(v) {
  const s = String(v ?? "").trim()
  if (!s) return false
  return IDENTIFIER_PATTERNS.some((re) => re.test(s))
}

/**
 * 从「当前账号」接口的响应里挑一个给人看的名字。
 *
 * @param {object|null} info 接口返回的用户对象
 * @param {object} [o]
 * @param {string[]} [o.mobile] 手机号字段名（按优先级）
 * @param {string[]} [o.email]  邮箱字段名（按优先级）
 * @param {string[]} [o.id]     id 字段名（最后兜底）
 * @param {RegExp} [o.strip]   不打码时要去掉的前缀（默认去掉 `+86 `）
 * @param {boolean} [o.mask]   手机号是否打码，默认 `true`（规矩 ②）
 * @param {boolean} [o.allowId] 允许 `id` 兜底里像内部 ID 的值，默认 `false`（规矩 ④）
 */
export function accountLabelOf(info, o = {}) {
  if (!info || typeof info !== "object") return ""
  const mobileKeys = o.mobile ?? ["maskedMobile", "mobile", "phone", "phoneNumber"]
  const emailKeys = o.email ?? ["email", "desensitizedEmail", "mail"]
  const idKeys = o.id ?? ["userId", "username", "name", "accountId"]
  const strip = o.strip ?? /^\+?86\s*/
  const mask = o.mask ?? true
  const allowId = o.allowId ?? false

  for (const k of mobileKeys) {
    const v = String(info[k] ?? "").trim()
    if (!v) continue
    const masked = mask ? maskPhone(v) : ""
    // 打码失败（不是号码形状）就退回原值：宁可显示，也不要空着
    return masked || v.replace(strip, "")
  }
  for (const k of emailKeys) {
    const v = String(info[k] ?? "").trim()
    if (v) return v
  }
  for (const k of idKeys) {
    const v = String(info[k] ?? "").trim()
    if (v && (allowId || !looksLikeIdentifier(v))) return v
  }
  return ""
}

/**
 * 包一层：调接口取账号名，失败就 `log` 一句并返回空串。
 * 让 callback 里只写一行 `accountId: await resolveAccountLabel(fetchUserInfo, cred, log)`。
 */
export async function resolveAccountLabel(fetchUserInfo, credential, log = () => {}, o = {}) {
  try {
    const info = await fetchUserInfo(credential)
    return accountLabelOf(info, o)
  } catch (e) {
    log(`拿不到账号信息，卡片将显示供应商名：${e?.message ?? e}`)
    return ""
  }
}

/**
 * 登录成功时该交给宿主的那两个字段：`accountId` 是人看的名字，`uid` 是身份（规矩 ③ + ④）。
 *
 * ```js
 * const { urn, phone, name } = await readWhoSignedIn(cred) // 你的接口
 * return { type: "success", refresh, access, expires, ...resolveAccount({ phone, name, urn }) }
 * // → { accountId: "189****8051", uid: "iam::…:user:hw…" }
 * ```
 *
 * 名字全取不到就**不给 `accountId`**（宿主回退到供应商名），而不是拿 URN 顶上。
 */
export function resolveAccount({ phone, name, urn } = {}) {
  const phoneLabel = maskPhone(phone)
  const rawName = String(name ?? "").trim()
  const nameLabel = rawName && !looksLikeIdentifier(rawName) ? rawName : ""
  const accountId = phoneLabel || nameLabel
  const uid = String(urn ?? "").trim()
  return { ...(accountId ? { accountId } : {}), ...(uid ? { uid } : {}) }
}