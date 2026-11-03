# MAINTENANCE.md —— 维护台账（给接手的 agent 看）

> 接手前先读这一页，再按 AGENTS.md「一、先定位你在哪一步」读对应文档。
> 每次干完活必须更新「当前状态」与「下一步」。

## 一、身份

| 项 | 值 |
|---|---|
| 仓库 | `MYCF711/magpie-plugin-scaffold` |
| npm 包名 | `magpie-plugin-scaffold` |
| 当前版本 | `0.3.8`（待发布） |
| 定位 | magpie 供应商插件脚手架：九钩子模板 + 27 个通用 `src/` 模块 + 35 条坑表 + 评分卡 + 受控发布脚本 |
| 本批来源 | 当前 magpie 真实启用的 17 个插件；清单与取舍见 `RECYCLING.md` |

## 二、当前状态（2026-11-03）

```text
分支        feat/recycle-active-plugin-utils（从 origin/main ab66e8f 起）
版本        0.3.8
工作区      功能分支待提交；.mirror.json / node.json 是既有本地未跟踪文件，不属于本批
```

| 资产 | 数量 |
|---|---:|
| `src/` 模块 | 27 个 / 5,171 行 |
| `tests/` | 26 个 / 301 条（`node --test` 全过） |
| `HOOKS.md` | 21 章字段级钩子契约 |
| AGENTS.md 坑表 | 35 条 |

本批新增 `http` / `status` / `credential` / `oauth-device` / `checkin` / `stream-reader`，
并增强 `models` / `openai-sse` / `store` / `quota` / `usage-cache` / `api` / `invite` 与入口的
SWR、签到 single-flight、400/422 分类接线。没有回收厂商域名、凭据形状、业务码、模型权限表或站点任务。

已验证：

- `node --test`：301 通过 / 0 失败；
- `npm run check:template`：38 通过 / 0 失败（模板占位名 warning 是既有预期）；
- `npm run check:errors`：退出 0；
- `npm pack --dry-run`：91 个文件，`RECYCLING.md` 与新增模块/测试均在包内；
- `git diff --check`：退出 0。

## 三、下一步

1. 提交本批并跑 `node scripts/privacy-scan.mjs --staged`；
2. 推功能分支 → PR → `rules` 全绿后合并；
3. 从与 `origin/main` 完全一致的提交运行 `node scripts/release.mjs --yes --npm`；
4. 验证 npm 0.3.8、tag v0.3.8、GitHub Release 与 tarball 内容。

后续独立批次候选（不要直接混入本批）：

- Chromium LevelDB SSTable：Snappy 依赖与损坏块夹具；
- 默认浏览器 Cookies / DPAPI：先给来源实现补专属测试；
- JSON Schema 本地 `$ref`：循环、深度与分支排序单独验收；
- 文本 tool_calls / 多模态回退 / 传输自动重试：先定义厂商 conformance 与幂等边界；
- `openai-response`、`device-id`、模型目录磁盘缓存。

## 四、硬约束

- 禁止直推 `main`：功能分支 → PR → 必需检查 `rules` 全绿 → 合并 → 受控发布。
- 发布前必跑：`node --test`、`npm run check:template`、`npm run check:errors`、`npm pack --dry-run`、`node scripts/privacy-scan.mjs --staged`。
- 改 `HOOKS.md` 的结论前先跑 `python extract-contract.py && node scripts/contract-diff.mjs`。
- 判断要不要跟 magpie 升级只看稳定渠道：`node scripts/check-magpie-stable.mjs`。
- 回收插件代码先读 `RECYCLING.md`：不重复已有模块，不把厂商业务常量包装成“通用”。

## 五、给接手者的最短路径

1. 读本文件与 `RECYCLING.md`；
2. `git status` + `git log --oneline -5` 核实现状；
3. 按 AGENTS.md 定位表读对应专档；
4. 修改后跑完整测试与交付门，再更新本文件。
