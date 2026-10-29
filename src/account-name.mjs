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
// 三条规矩
// ═══════════════════════════════════════════════════════════════════
//
// ① **失败不能阻塞登录**：取不到账号名只是显示问题，登录本身已经成功。
//    `accountId` 留空串 → magpie 回退到供应商名（HOOKS 八的三级回退），不编造。
// ② **优先级固定**：手机号 → 邮箱 → 用户 id → 空串。打码的值（`+86 189****8051`）
//    比完整的邮箱更适合放在卡片上，且和别的供应商一致。
// ③ **别把 `accountId` 当唯一键**：它是给人看的；区分同名账号靠 `uid`（HOOKS 八）。

/**
 * 从「当前账号」接口的响应里挑一个给人看的名字。
 *
 * @param {object|null} info 接口返回的用户对象
 * @param {object} [o]
 * @param {string[]} [o.mobile] 手机号字段名（按优先级）
 * @param {string[]} [o.email]  邮箱字段名（按优先级）
 * @param {string[]} [o.id]     id 字段名（最后兜底）
 * @param {RegExp} [o.strip]   要去掉的前缀（默认去掉 `+86 `）
 */
export function accountLabelOf(info, o = {}) {
  if (!info || typeof info !== "object") return ""
  const mobileKeys = o.mobile ?? ["maskedMobile", "mobile", "phone", "phoneNumber"]
  const emailKeys = o.email ?? ["email", "desensitizedEmail", "mail"]
  const idKeys = o.id ?? ["userId", "username", "name", "accountId"]
  const strip = o.strip ?? /^\+?86\s*/

  for (const k of mobileKeys) {
    const v = String(info[k] ?? "").trim()
    if (v) return v.replace(strip, "")
  }
  for (const k of emailKeys) {
    const v = String(info[k] ?? "").trim()
    if (v) return v
  }
  for (const k of idKeys) {
    const v = String(info[k] ?? "").trim()
    if (v) return v
  }
  return ""
}

/**
 * 包一层：调接口取账号名，失败就 `log` 一句并返回空串。
 * 让 callback 里只写一行 `accountId: await resolveAccountLabel(fetchUserInfo, cred, log)`。
 */
export async function resolveAccountLabel(fetchUserInfo, credential, log = () => {}) {
  try {
    const info = await fetchUserInfo(credential)
    return accountLabelOf(info)
  } catch (e) {
    log(`拿不到账号信息，卡片将显示供应商名：${e?.message ?? e}`)
    return ""
  }
}