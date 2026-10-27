#!/usr/bin/env node
// 供应商插件规定 —— 可执行版
//
//   node scripts/check.mjs            # 检查当前目录
//   node scripts/check.mjs ../my-plugin
//
// 退出码 0 = 合规，1 = 不合规（CI 靠它卡门）。
//
// 为什么要有这个：规定写在 md 里只有认真的人会看；写成断言，谁都绕不过去。
// 它是给**作者自己**用的自查表 —— CI 绿了说明这个插件符合 magpie 的插件契约，
// 可以放心发布；把结果贴进 issue 也省得维护者一条条问。
//
// 它不做任何「提交到社区」的动作：收不收、收哪个，是维护者的事。

import { readFileSync, existsSync, statSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

const ROOT = resolve(process.argv[2] ?? ".")
const results = []

function ok(cond, name, note, fix) {
  results.push({ level: cond ? "pass" : "fail", name, note, fix })
  return cond
}
function warn(cond, name, note, fix) {
  results.push({ level: cond ? "pass" : "warn", name, note, fix })
  return cond
}
function walk(dir) {
  const out = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".git") continue
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(p))
    else out.push(p)
  }
  return out
}

// ── 读 package.json ───────────────────────────────────────────────────

let pkg = null
const pkgPath = join(ROOT, "package.json")
if (ok(existsSync(pkgPath), "package.json 存在", "插件必须是一个 npm 包")) {
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf8"))
  } catch (e) {
    ok(false, "package.json 可解析", String(e.message ?? e))
  }
}

if (pkg) {
  // ── ① 身份 ────────────────────────────────────────────────────────
  ok(typeof pkg.name === "string" && pkg.name.length > 0,
     "package.json 的 name 非空",
     "magpie 用包名做依赖键，卡片标题也从它来")

  warn(pkg.name !== "magpie-plugin-scaffold" && pkg.name !== "magpie-plugin-template",
       "name 已改成自己的（不是脚手架默认值）",
       "还叫脚手架名的话，别人装了会跟脚手架撞",
       "改成 <你的包名>")

  ok(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(pkg.version ?? ""),
     "version 是语义化版本",
     "更新检测靠比版本号；不合法就一直显示「有新版」",
     `现在是 ${pkg.version}`)

  ok(typeof pkg.description === "string" && pkg.description.length >= 20,
     "description 说清楚了签入什么",
     "发现页只显示这一行")

  // ── ② 能不能被加载 ────────────────────────────────────────────────
  ok(pkg.type === "module",
     "type 是 module",
     "magpie 用 import() 加载，commonjs 会失败")

  const entry = pkg.main ?? (typeof pkg.exports === "string" ? pkg.exports : pkg.exports?.["."]?.import ?? pkg.exports?.["."])
  ok(!!entry, "声明了入口（main 或 exports）", "否则 magpie 猜不到从哪加载")
  if (entry) {
    ok(existsSync(join(ROOT, String(entry))), `入口文件存在：${entry}`)
  }

  ok(Array.isArray(pkg.files) && pkg.files.length > 0,
     "files 白名单非空",
     "不写就把整个仓库（含测试、截图）发到 npm")

  // ── ③ 能不能被搜到 ────────────────────────────────────────────────
  const kw = Array.isArray(pkg.keywords) ? pkg.keywords.map((k) => String(k).toLowerCase()) : []
  ok(kw.includes("opencode"), "keywords 含 opencode", "市场搜索问的是 npm `<query> opencode`")
  ok(kw.some((k) => k === "plugin" || k === "auth" || k === "provider"),
     "keywords 含 plugin / auth / provider 之一")
  ok(kw.some((k) => k === "magpie" || k === "magpie-plugin"),
     "keywords 含 magpie", "社区按这个收")

  // ── ④ 许可 ────────────────────────────────────────────────────────
  ok(pkg.license === "MIT", "license 是 MIT", "社区默认许可", `现在是 ${pkg.license}`)

  // ── ⑤ 图标：两个位置各管一块，最常漏的一条 ────────────────────────
  const icon = pkg.magpie?.icon
  if (icon) {
    ok(/^(https:\/\/|data:image\/)/i.test(icon),
       "magpie.icon 是 https:// 或 data:image/ 开头",
       "magpie 只认这两种（ownIcon）")
    ok(icon.length <= (3 << 19),
       "magpie.icon ≤ 1 MB",
       "超了会被丢掉，插件卡片回退成灰方块")
  } else {
    warn(false, "magpie.icon 已设置",
         "插件卡片（列表那一行、详情页左上角）只认它；auth.icon 到不了那里",
         "把 auth.icon 那份 data URI 抄进 package.json 的 magpie.icon")
  }

  const mc = pkg.magpie?.maxConcurrency
  if (mc !== undefined) {
    ok(Number.isInteger(mc) && mc >= 1 && mc <= 1000,
       "magpie.maxConcurrency 是 1-1000 的整数", "超出范围会被忽略")
  }

  // 一个包承载多个供应商时，卡片上的「承载」徽章由这个字段给
  // （不是必须的：一个供应商的包不写，卡片上那行本来就说得清）
  const car = pkg.magpie?.carries
  if (car !== undefined) {
    if (ok(Array.isArray(car), "magpie.carries 是数组", "一个名字一项")) {
      ok(car.length >= 1 && car.length <= 8,
         "magpie.carries 是 1-8 项", "超出 8 项的部分不会被显示")
      ok(car.every((s) => typeof s === "string" && s.trim() !== ""),
         "magpie.carries 每项是非空字符串", "空白项会被丢弃")
      ok(car.every((s) => typeof s !== "string" || [...s.trim()].length <= 48),
         "magpie.carries 每项 ≤48 字", "超长会被截断")
    }
  }
}

// ── ⑥ LICENSE 逐字 MIT ────────────────────────────────────────────────

const licPath = join(ROOT, "LICENSE")
if (ok(existsSync(licPath), "LICENSE 文件存在", "GitHub 靠它认许可，卡片才有许可那一格")) {
  const lic = readFileSync(licPath, "utf8")
  ok(/Permission is hereby granted,\s*free of charge/i.test(lic),
     "LICENSE 是 MIT 正文",
     "归属说明别插进正文，否则 GitHub 返回 NOASSERTION")
  warn(!/^Portions of this/im.test(lic),
       "归属说明没有夹在 LICENSE 里",
       "夹了的话 GitHub 认不出 MIT",
       "挪到 NOTICE.md")
}

// ── ⑦ 入口加载 + 导出形状 ────────────────────────────────────────────
//
// 官方原话：模块导出的**每个函数**都会被当作插件调用。
// 所以入口文件里不许有辅助函数 —— 这条不查出来，装上去会多出一堆假供应商。

const entryFile = pkg?.main ?? (typeof pkg?.exports === "string" ? pkg.exports : pkg?.exports?.["."]?.import ?? pkg?.exports?.["."])
if (entryFile && existsSync(join(ROOT, String(entryFile)))) {
  const p = join(ROOT, String(entryFile))
  let mod = null
  let loadErr = ""
  try {
    mod = await import(pathToFileURL(p).href)
  } catch (e) {
    loadErr = String(e?.message ?? e)
  }

  if (ok(!loadErr, "入口能被 import", "加载失败 = 插件完全不工作", loadErr.slice(0, 300))) {
    const fns = Object.entries(mod).filter(([, v]) => typeof v === "function")
    ok(fns.length > 0, "至少导出一个插件函数", "形如 export const XxxAuthPlugin = async (...) => ({...})")

    for (const [name, fn] of fns) {
      let hooks = null
      try {
        hooks = await fn({ client: {}, directory: ROOT }, undefined)
      } catch (e) {
        ok(false, `导出函数 ${name} 能被调起来`,
           "加载时抛错会让整个插件宿主起不来",
           String(e?.message ?? e).slice(0, 200))
        continue
      }
      const keys = hooks && typeof hooks === "object" ? Object.keys(hooks) : []
      const known = keys.filter((k) => ["config", "auth", "provider", "chat.headers"].includes(k))
      ok(known.length > 0, `导出函数 ${name} 返回了钩子`,
         "一个都没有 = 它不是插件，只是被误导出（辅助函数要挂到 _internal 对象上）",
         `拿到的键：${keys.join(",") || "(空)"}`)
    }

    const objExports = Object.keys(mod).filter((k) => k !== "default" && typeof mod[k] === "object")
    warn(true,
         objExports.length ? `对象导出（不会被当插件）：${objExports.join(", ")}` : "没有多余的对象导出",
         "测试用的东西放 _internal 这类对象里")
  }
}

// ── ⑧ CHANGELOG 有当前版本 ───────────────────────────────────────────

const chgPath = join(ROOT, "CHANGELOG.md")
if (existsSync(chgPath) && pkg?.version) {
  const chg = readFileSync(chgPath, "utf8")
  ok(chg.includes(pkg.version),
     `CHANGELOG 有 ${pkg.version} 这一段`,
     "发版时 Release 正文从它抽；没有就等于没写更新说明")
}

// ── ⑨ 敏感信息 ────────────────────────────────────────────────────────
//
// 别人会 fork、会 PR。真 token 混进来一次就是一次泄露。

const SUSPECT = [
  [/eyJhbGciOiJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]{20,}/, "看起来像真的 JWT"],
  [/[Cc]:[\\/]Users[\\/][A-Za-z0-9._-]+/, "硬编码的本机用户路径"],
]

for (const target of ["index.mjs", "src", "README.md", "docs", "tests", "tools", "scripts"]) {
  const p = join(ROOT, target)
  if (!existsSync(p)) continue
  const files = statSync(p).isDirectory() ? walk(p) : [p]
  for (const f of files) {
    if (!/\.(m?js|ts|json|md)$/.test(f)) continue
    const text = readFileSync(f, "utf8")
    for (const [re, why] of SUSPECT) {
      const m = text.match(re)
      if (!m) continue
      const hit = m[0]
      if (/fake|example|placeholder|占位|demo|deadbeef|test-jwt/i.test(hit)) continue
      if (/Users[\\/]+(Administrator|test|user|you)\b/i.test(hit) && /your|example|占位/i.test(hit)) continue
      const rel = f.replace(ROOT + "\\", "").replace(ROOT + "/", "")
      warn(false, `${rel}: ${why}`,
           `命中的是 ${hit.slice(0, 44)}`,
           why.includes("路径") ? "换成 join(homedir(), ...)" : "换成占位符")
    }
  }
}

// ── ⑩ 自注册条目与包名一致 ───────────────────────────────────────────

if (entryFile && existsSync(join(ROOT, String(entryFile))) && pkg?.name) {
  const src = readFileSync(join(ROOT, String(entryFile)), "utf8")
  const m = src.match(/package:\s*["']([^"']+)["']/)
  if (m) {
    ok(m[1] === pkg.name,
       "自注册条目的 package 与 package.json 的 name 一致",
       "不一致会让市场认错包（UPDATING.md「改名的三处必须同步」）",
       `条目写 ${m[1]}，package.json 是 ${pkg.name}`)
  }
}

// ── 输出 ──────────────────────────────────────────────────────────────

const fails = results.filter((r) => r.level === "fail")
const warns = results.filter((r) => r.level === "warn")
const passes = results.filter((r) => r.level === "pass")

const mark = { pass: "\x1b[32m✓\x1b[0m", fail: "\x1b[31m✗\x1b[0m", warn: "\x1b[33m!\x1b[0m" }
console.log(`\n供应商插件规定检查 · ${ROOT}\n`)
for (const r of results) {
  console.log(`  ${mark[r.level]} ${r.name}`)
  if (r.level !== "pass" && r.note) console.log(`      ${r.note}`)
  if (r.level !== "pass" && r.fix) console.log(`      → ${r.fix}`)
}
console.log(`\n  通过 ${passes.length} · 警告 ${warns.length} · 失败 ${fails.length}\n`)
process.exit(fails.length ? 1 : 0)
