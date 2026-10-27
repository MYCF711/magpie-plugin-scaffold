#!/usr/bin/env node
// release.mjs —— 把「发布」从七步里的记忆题变成一条命令
//
// 为什么要有它：push 不是发布。真实的漏法是「代码推上去了，npm 没发、tag 没打、
// Release 没建」，而没有任何命令会报错 —— 表现只是 GitHub 右侧一直写着
// 「暂无发布版本」、用户永远停在旧版本。这个脚本把第 5~6 步（npm / tag / Release）
// 连同前置条件一起做成可执行、可预演的动作。
//
//   node scripts/release.mjs                 # 预演：列计划 + 逐项体检，什么都不改
//   node scripts/release.mjs --yes           # 真做：tag + push + Release
//   node scripts/release.mjs --yes --npm     # 再加 npm 发布（有 publish:npm 脚本就用它）
//
// 体检项（任一不过就退出码 1，且 --yes 也不动手）：
//   ① package.json 有 version               ② CHANGELOG 有这一版那一段
//   ③ 工作区干净                            ④ 当前在默认分支
//   ⑤ 不落后远端                            ⑥ tag 还没被占
//   ⑦ 推得上去（远端可达）
//
// 需要 GitHub token 才能建 Release：
//   GITHUB_TOKEN / GH_TOKEN 环境变量。没有也能跑 —— 它会打印手工建 Release 的命令。

import { execSync } from "node:child_process"
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const argv = new Set(process.argv.slice(2))
const DRY = !argv.has("--yes")
const ALSO_NPM = argv.has("--npm")

const C = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
}

function sh(cmd, opts = {}) {
  return execSync(cmd, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts }).trim()
}
function shOk(cmd) {
  try {
    sh(cmd)
    return true
  } catch {
    return false
  }
}

const problems = []
const notes = []
function bad(msg) {
  problems.push(msg)
}
function note(msg) {
  notes.push(msg)
}

// ── ①② 版本与 CHANGELOG ──────────────────────────────────────────────

if (!existsSync(join(ROOT, "package.json"))) {
  console.error(C.red("✗ 这里没有 package.json —— 请在插件仓库根目录跑"))
  process.exit(1)
}
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"))
const version = pkg.version
const tag = `v${version}`
if (!version) bad("package.json 里没有 version")

const changelogPath = join(ROOT, "CHANGELOG.md")
if (!existsSync(changelogPath)) {
  bad("没有 CHANGELOG.md —— 用户感知不到这一版改了什么（UPDATING.md 第 0 步）")
}

/** 从 CHANGELOG 里抽出某个版本那一节（到下一个 ## 为止） */
function changelogSection(v) {
  if (!existsSync(changelogPath)) return ""
  const text = readFileSync(changelogPath, "utf8").replace(/\r\n/g, "\n")
  const esc = v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const re = new RegExp(`^##\\s+${esc}\\b[^\\n]*\\n`, "m")
  const m = re.exec(text)
  if (!m) return ""
  const rest = text.slice(m.index + m[0].length)
  const next = rest.search(/^##\s/m)
  const body = (next >= 0 ? rest.slice(0, next) : rest).trim()
  return body
}
const section = version ? changelogSection(version) : ""
if (version && !section) bad(`CHANGELOG.md 里没有「## ${version}」那一段 —— 先写更新内容再发版`)

/**
 * 去掉 `> 起因：…` 那段 —— 它写给维护者，不进 Release 正文。
 * （UPDATING 四：一条一行说的是改了什么，`> 起因` 说的是为什么。用户感知不到后者。）
 */
function stripCause(md) {
  const out = []
  let skipping = false
  for (const line of md.split("\n")) {
    if (/^>\s*起因[：:]/.test(line)) {
      skipping = true
      continue
    }
    if (skipping) {
      if (/^>/.test(line)) continue // 引用块续行
      skipping = false
      if (line.trim() === "") continue
    }
    out.push(line)
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim()
}
const releaseBody = stripCause(section)

// ── ③④⑤ git 体检 ───────────────────────────────────────────────────

let branch = ""
let remote = ""
try {
  branch = sh("git rev-parse --abbrev-ref HEAD")
  remote = sh("git config --get remote.origin.url")
} catch {
  bad("这不是一个 git 仓库（或没有 origin）")
}
if (branch) {
  let def = ""
  try {
    def = sh("git symbolic-ref --short refs/remotes/origin/HEAD").replace(/^origin\//, "")
  } catch {
    def = "main"
  }
  if (branch !== def) bad(`当前分支是 ${branch}，默认分支是 ${def} —— magpie 的 git 源只认默认分支`)
}
if (branch) {
  const dirty = shOk("git diff --quiet") && shOk("git diff --cached --quiet")
  if (!dirty) bad("工作区有未提交的改动 —— 发布的内容必须和提交一致")
}

/** owner/repo —— 支持 ssh 与 https 两种 remote */
function parseRepo(url) {
  const m = String(url).match(/github\.com[:/]([^/]+)\/([^/.]+?)(?:\.git)?$/)
  return m ? { owner: m[1], repo: m[2] } : null
}
const gh = remote ? parseRepo(remote) : null
if (!gh) bad(`remote.origin 不是 GitHub 仓库（${remote || "空"}）—— 这个脚本只处理 GitHub`)

let behind = 0
if (gh && branch) {
  try {
    sh("git fetch origin --quiet")
    const counts = sh(`git rev-list --left-right --count origin/${branch}...HEAD`)
    const [b, a] = counts.split(/\s+/).map(Number)
    behind = b || 0
    if (behind > 0) bad(`落后远端 ${behind} 个提交 —— 先 pull / merge，别在旧基线上发版`)
    if (a > 0) note(`本地领先远端 ${a} 个提交（发布时会一起推上去）`)
  } catch {
    note("git fetch 失败 —— 跳过「是否落后远端」检查")
  }
}

// ── ⑥ tag 是否已被占 ─────────────────────────────────────────────────

let tagExistsLocal = false
let tagExistsRemote = false
if (gh) {
  tagExistsLocal = shOk(`git rev-parse -q --verify refs/tags/${tag}`)
  try {
    const out = sh(`git ls-remote --tags origin refs/tags/${tag}`)
    tagExistsRemote = out.length > 0
  } catch {}
  if (tagExistsLocal || tagExistsRemote) {
    bad(`tag ${tag} 已存在 —— 同一个版本号不能发两次；先 bump version`)
  }
}

// ── 体检结果 ─────────────────────────────────────────────────────────

const CHANGELOG_STEPS = [
  "第 0 步 写 CHANGELOG",
  "第 1 步 bump version",
  "第 2 步 npm pack --dry-run",
  "第 3 步 提交",
  "第 4 步 git push <默认分支>",
  "第 5 步 npm publish（本脚本的 --npm）",
  "第 6 步 tag + Release（本脚本）",
  "第 7 步 四条验证",
]

console.log(C.bold(`\n发布预演 · ${gh ? `${gh.owner}/${gh.repo}` : "(未知仓库)"} · ${tag}\n`))
console.log(C.dim("七步里这一步在做什么："))
console.log(C.dim("  0 写 CHANGELOG → 1 bump → 2 pack 预演 → 3 提交 → 4 push →"))
console.log(C.dim("  5 npm publish → 6 tag+Release → 7 四条验证"))
console.log(C.dim(`  ${CHANGELOG_STEPS.join(" · ")}\n`))

if (problems.length) {
  console.log(C.red("✗ 体检没通过，下面这些先解决：\n"))
  for (const p of problems) console.log(C.red(`  · ${p}`))
  console.log()
  process.exit(1)
}

console.log(C.green("✓ 体检通过：版本 / CHANGELOG / 工作区 / 分支 / tag 都没问题\n"))
for (const n of notes) console.log(C.yellow(`  ! ${n}`))

// ── 计划 ─────────────────────────────────────────────────────────────

const plan = []
plan.push({ what: `git push origin ${branch}`, why: "第 4 步：git 源检测看默认分支 HEAD" })
plan.push({ what: `git tag ${tag} && git push origin ${tag}`, why: "第 6 步：tag 让「某 bug 出在哪版」可查" })
plan.push({
  what: `POST /repos/${gh.owner}/${gh.repo}/releases`,
  why: `第 6 步：Release 正文 = CHANGELOG 的 ${version} 段（${releaseBody.split("\n").length} 行，已去掉 > 起因）`,
})
if (ALSO_NPM) {
  const script = pkg.scripts?.["publish:npm"] ? "npm run publish:npm" : "npm publish"
  plan.push({ what: script, why: "第 5 步：npm 源的用户比 registry 上的 version" })
}
plan.push({ what: "四条验证", why: "第 7 步：npm 版本 / tarball 内容 / magpie plugin list / Release 在" })

console.log(C.bold("计划：\n"))
for (const [i, s] of plan.entries()) {
  console.log(`  ${i + 1}. ${s.what}`)
  console.log(C.dim(`     ${s.why}`))
}

if (DRY) {
  console.log(C.yellow("\n这是预演（dry-run），什么都没改。真做：node scripts/release.mjs --yes [--npm]\n"))
  process.exit(0)
}

// ── 真做 ─────────────────────────────────────────────────────────────

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || ""
console.log()

function run(cmd, label) {
  process.stdout.write(`  ${label} … `)
  try {
    sh(cmd, { stdio: "pipe" })
    console.log(C.green("ok"))
    return true
  } catch (e) {
    console.log(C.red("失败"))
    console.log(C.dim(String(e.stderr || e.message).trim().split("\n").slice(0, 4).join("\n")))
    return false
  }
}

const pushed = run(`git push origin ${branch}`, `push ${branch}`)
const tagged = run(`git tag ${tag} && git push origin ${tag}`, `tag ${tag}`)

let released = false
if (token) {
  try {
    const res = await fetch(`https://api.github.com/repos/${gh.owner}/${gh.repo}/releases`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
        "user-agent": "magpie-plugin-release",
      },
      body: JSON.stringify({
        tag_name: tag,
        target_commitish: branch,
        name: version,
        body: releaseBody,
        draft: false,
        prerelease: false,
      }),
    })
    const body = await res.json().catch(() => ({}))
    if (res.ok) {
      console.log(`  Release … ${C.green("ok")} ${body.html_url}`)
      released = true
    } else {
      console.log(`  Release … ${C.red(`HTTP ${res.status}`)} ${body.message || ""}`)
    }
  } catch (e) {
    console.log(`  Release … ${C.red("失败")} ${String(e.message).slice(0, 120)}`)
  }
} else {
  console.log(C.yellow("  Release … 跳过（没有 GITHUB_TOKEN / GH_TOKEN）"))
  console.log(C.dim("    手工建：GitHub → Releases → Draft a new release → 选 " + tag))
  console.log(C.dim("    正文直接把 CHANGELOG 里 " + version + " 那一段粘过去"))
}

let published = null
if (ALSO_NPM) {
  const script = pkg.scripts?.["publish:npm"] ? "npm run publish:npm" : "npm publish"
  console.log(C.dim(`\n  ${script}（npm 登记有 1~2 分钟延迟，别在这窗口里重试）\n`))
  try {
    execSync(script, { cwd: ROOT, stdio: "inherit" })
    published = true
  } catch {
    published = false
    console.log(C.red("  npm 发布失败"))
  }
}

// ── 第 7 步留给人看的清单 ─────────────────────────────────────────────

console.log(C.bold("\n第 7 步 · 四条验证（逐条跑，别只看版本号）：\n"))
const name = pkg.name
console.log(`  ① npm view ${name} version                 # 已是 ${version}？`)
console.log(`  ② curl -s $(npm view ${name}@${version} dist.tarball) | tar -xzOf - package/CHANGELOG.md | head -5`)
console.log(`     # 要看到新内容，不只看版本号`)
console.log(`  ③ magpie plugin list                       # 本机认得新版本 / 新 commit？`)
console.log(`  ④ curl -s -H "Authorization: Bearer $GITHUB_TOKEN" \\`)
console.log(`       https://api.github.com/repos/${gh.owner}/${gh.repo}/releases/tags/${tag}`)
console.log(`     # 200 且 "draft": false`)
console.log()
console.log(
  C.dim(
    "没过这四条，不要说「已发布」。detail: https://github.com/MYCF711/magpie-plugin-scaffold/blob/main/UPDATING.md\n",
  ),
)

const failed = !pushed || !tagged || (ALSO_NPM && !published)
process.exit(failed ? 1 : 0)
