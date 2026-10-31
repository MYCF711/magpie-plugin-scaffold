#!/usr/bin/env node
// 发布时临时换 name：仓库里的 name 是显示名（中文+English，无空格），
// npm 上必须是合法的 ASCII 包名。发布后无论成败都恢复原文件。
// 用法：npm run publish:npm
//
// 为什么不能直接 npm publish：package.json.name 是 bun 依赖键（slug），
// npm 名可能不同；发布前临时换成 PUBLISH_AS，发布完（包括失败）都恢复。

import { execSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"

const PUBLISH_AS = "magpie-plugin-scaffold"
const file = new URL("../package.json", import.meta.url)
const original = readFileSync(file, "utf8")
const pkg = JSON.parse(original)

pkg.name = PUBLISH_AS
writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n")
try {
  execSync("npm publish --access public", { stdio: "inherit" })
} catch (error) {
  // 同版本已存在是发布脚本最常见的可重试失败：说清楚，别让人对着 npm 的堆栈猜。
  console.error(
    `\n✗ npm 发布失败：${PUBLISH_AS}@${pkg.version}\n` +
      `  如果 npm 说版本已存在（E409 / EPUBLISHCONFLICT / cannot publish over），先 bump version 再重试。\n` +
      `  原始退出码：${error?.status ?? "?"}\n`,
  )
  process.exitCode = 1
} finally {
  writeFileSync(file, original)
}
