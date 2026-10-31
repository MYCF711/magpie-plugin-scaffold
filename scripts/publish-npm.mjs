#!/usr/bin/env node
// 发布时临时换 name：仓库里的 name 是卡片显示名，npm 上必须是另一个合法的包名。
// 用法：npm run publish:npm
//
// 为什么不能直接 npm publish：package.json.name 现在是「⚠ 未命名插件 Unnamed Plugin」
// 这类显示名（中文 + English），npm 会拒绝含中文/大写的新包名。发布前临时换成
// PUBLISH_AS，发布完无论成败都恢复原文件。

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
} finally {
  writeFileSync(file, original)
}
