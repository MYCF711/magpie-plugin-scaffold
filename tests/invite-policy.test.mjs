import test from "node:test"
import assert from "node:assert/strict"

import {
  createInvitePolicy,
  INVITE_PREFERRED_OPTION,
  INVITE_SOURCE_LATEST,
  INVITE_SOURCE_MANUAL,
} from "../src/invite-policy.mjs"

function memoryStore(initial = "") {
  let value = initial
  return {
    read: () => value,
    write: (next) => { value = next },
    get value() { return value },
  }
}

function memorySourceStore(initial = {}, latestUid = "user_B") {
  const codes = new Map(Object.entries(initial).map(([uid, code]) => [uid, { uid, code, shareUrl: `https://vendor.example/invite/${code}` }]))
  return {
    noteAccount() {},
    saveCode({ uid, code, shareUrl }) {
      const entry = { uid, code, shareUrl: shareUrl || `https://vendor.example/invite/${code}` }
      codes.set(uid, entry)
      return entry
    },
    resolve({ preferFirst = false, preferredUid = "", reservedCode = "" } = {}) {
      if (preferFirst && preferredUid && codes.has(preferredUid)) return { ...codes.get(preferredUid), kind: "preferred" }
      if (!preferFirst && codes.has(latestUid)) return { ...codes.get(latestUid), kind: "latest" }
      if (reservedCode) return { code: reservedCode, shareUrl: reservedCode, kind: "reserved", uid: "" }
      return { code: "", shareUrl: "", kind: "none", uid: "" }
    },
  }
}

const accounts = () => [
  { uid: "user_A", label: "首选账号", firstSeenAt: 1000 },
  { uid: "user_B", label: "最新账号", firstSeenAt: 2000 },
]

function setup({ preferred = true, saved = "", reserved = "", codes = {}, rows = accounts, fetchCode } = {}) {
  const preferredStore = memoryStore(saved)
  const reservedStore = memoryStore(reserved)
  const sourceStore = memorySourceStore(codes)
  const calls = []
  const policy = createInvitePolicy({
    ctx: { magpie: { option: () => preferred } },
    provider: "demo",
    sourceStore,
    preferredStore,
    reservedStore,
    readAccounts: rows,
    readPreferredUid: () => "user_A",
    readAccountInviteCode: async (account) => {
      calls.push(account.uid)
      if (fetchCode) return fetchCode(account)
      return { code: account.uid === "user_A" ? "CodeA123" : account.uid === "user_B" ? "CodeB123" : "CodeC123" }
    },
  })
  return { policy, preferredStore, reservedStore, sourceStore, calls }
}

test("默认首选下拉排第一，ask 取码后 prepare 零取码", async () => {
  const { policy, calls } = setup()
  assert.equal(INVITE_PREFERRED_OPTION.default, false, "模板默认保持兼容；派生可显式开启")
  assert.equal(policy.prompts()[0].type, "select")
  assert.equal(policy.prompts()[0].options[0].value, "user_A")
  assert.equal((await policy.ask({})).key, "inviteSource")
  assert.equal(await policy.ask({ inviteSource: "user_A" }), null)
  assert.deepEqual(calls, ["user_A"])
  const resolved = policy.prepare()()
  assert.equal(resolved.code, "CodeA123")
  assert.equal(resolved.kind, "preferred")
  assert.equal(resolved.selection, "user_A")
  assert.deepEqual(calls, ["user_A"])
})

test("指定账号使用自己的码，并跨实例记住 uid", async () => {
  const { policy, preferredStore } = setup()
  await policy.ask({})
  await policy.ask({ inviteSource: "user_B" })
  assert.equal(policy.prepare()().code, "CodeB123")
  assert.equal(preferredStore.value, "user_B")
  const next = setup({ saved: preferredStore.value })
  assert.equal(next.policy.prompts()[0].options[0].value, "user_B")
})

test("latest 记住滚动策略而不是当前 uid", async () => {
  const { policy, preferredStore } = setup()
  await policy.ask({})
  await policy.ask({ inviteSource: INVITE_SOURCE_LATEST })
  const resolved = policy.prepare()()
  assert.equal(resolved.code, "CodeB123")
  assert.equal(resolved.selection, INVITE_SOURCE_LATEST)
  assert.equal(preferredStore.value, INVITE_SOURCE_LATEST)
  const next = setup({ saved: preferredStore.value })
  assert.equal(next.policy.prompts()[0].options[0].value, INVITE_SOURCE_LATEST)
})

test("关闭首选后 prompts 为空，强制 latest，不复用保存的指定 uid", async () => {
  const { policy, preferredStore } = setup({ preferred: false, saved: "user_A" })
  assert.deepEqual(policy.prompts(), [])
  assert.equal(await policy.ask({}), null)
  const resolved = policy.prepare()()
  assert.equal(resolved.code, "CodeB123")
  assert.equal(resolved.selection, INVITE_SOURCE_LATEST)
  assert.equal(preferredStore.value, "user_A", "关闭时只读策略，不改写用户选择")
})

test("manual 才显示手动输入，预留码和 manual 选择分别记住", async () => {
  const { policy, preferredStore, reservedStore } = setup()
  await policy.ask({})
  assert.equal((await policy.ask({ inviteSource: INVITE_SOURCE_MANUAL })).key, "invite")
  assert.equal(await policy.ask({ inviteSource: INVITE_SOURCE_MANUAL, invite: "Manual123" }), null)
  const resolved = policy.prepare()()
  assert.equal(resolved.code, "Manual123")
  assert.equal(resolved.selection, INVITE_SOURCE_MANUAL)
  assert.equal(preferredStore.value, INVITE_SOURCE_MANUAL)
  assert.equal(reservedStore.value, "Manual123")
  const next = setup({ saved: preferredStore.value, reserved: reservedStore.value })
  assert.equal(next.policy.prompts()[0].options[0].value, INVITE_SOURCE_MANUAL)
})

test("手动留空 / 0 / 1 沿用预留码，不被自动派生覆盖", async () => {
  for (const invite of ["", "0", "1"]) {
    const { policy, reservedStore } = setup({ reserved: "Reserved123" })
    await policy.ask({ inviteSource: INVITE_SOURCE_MANUAL, invite })
    assert.equal(policy.prepare()().code, "Reserved123")
    assert.equal(reservedStore.value, "Reserved123")
  }
})

test("手动 token / Key 被拒绝且不落盘", async () => {
  const { policy, reservedStore } = setup({ reserved: "Reserved123" })
  const prompt = await policy.ask({ inviteSource: INVITE_SOURCE_MANUAL, invite: "sk-secret" })
  assert.match(prompt.message, /不要填写 token/)
  assert.equal(reservedStore.value, "Reserved123")
  assert.equal(policy.prepare()().code, "")
})

test("无效 uid 只回退 latest，并把选择修回 latest", async () => {
  const { policy, preferredStore } = setup()
  await policy.ask({ inviteSource: "missing" })
  const resolved = policy.prepare()()
  assert.equal(resolved.code, "CodeB123")
  assert.equal(resolved.selection, INVITE_SOURCE_LATEST)
  assert.equal(preferredStore.value, INVITE_SOURCE_LATEST)
})

test("取码失败只回退同一 uid 的旧缓存，不抛错也不换号", async () => {
  const { policy } = setup({ codes: { user_A: "CachedA123" }, fetchCode: () => "" })
  await policy.ask({ inviteSource: "user_A" })
  const resolved = policy.prepare()()
  assert.equal(resolved.code, "CachedA123")
  assert.equal(resolved.uid, "user_A")
  assert.equal(resolved.kind, "preferred")
})

test("无账号时降级手动输入，不生成空 options 的 select", async () => {
  const { policy } = setup({ rows: () => [], reserved: "Reserved123" })
  assert.equal(policy.prompts()[0].type, "text")
  assert.equal(policy.prompts()[0].key, "invite")
  await policy.ask({ invite: "" })
  assert.equal(policy.prepare()().code, "Reserved123")
})

test("prepare 可直接读缓存且 targetIdentity 相同会 skip 自邀", () => {
  const { policy } = setup({ codes: { user_A: "CachedA123" } })
  assert.equal(policy.prepare()().code, "CachedA123")
  const skipped = policy.prepare()("user_A")
  assert.equal(skipped.kind, "skip")
  assert.equal(skipped.code, "")
})

test("prompt 只暴露 uid 与 label，不序列化账号 auth 或 reserved", async () => {
  const secretAuth = { access: "sk-secret", refresh: "refresh-secret" }
  const { policy, reservedStore } = setup({
    reserved: "Reserved123",
    rows: () => [{ uid: "user_A", label: "我的账号", auth: secretAuth, firstSeenAt: 1000 }],
  })
  const prompt = await policy.ask({})
  const serialized = JSON.stringify(prompt)
  assert.equal(serialized.includes("sk-secret"), false)
  assert.equal(serialized.includes("refresh-secret"), false)
  assert.equal(serialized.includes("Reserved123"), false)
  assert.equal(reservedStore.value, "Reserved123")
})
