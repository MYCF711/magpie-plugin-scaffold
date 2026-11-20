# MAINTENANCE.md —— 维护台账（给接手的 agent 看）

> 接手前先读这一页，再按 AGENTS.md「一、先定位你在哪一步」读对应文档。
> 每次干完活必须更新「当前状态」与「下一步」。

## 一、身份

| 项 | 值 |
|---|---|
| 仓库 | `MYCF711/magpie-plugin-scaffold` |
| npm 包名 | `magpie-plugin-scaffold` |
| 当前版本 | `0.3.15`（main / tag / Release 已发布） |
| 定位 | magpie 供应商插件脚手架：九钩子模板 + 28 个通用 `src/` 模块 + 38 条坑表 + 评分卡 + 受控发布脚本 |
| 本批来源 | 当前 magpie 真实启用的 17 个插件；清单与取舍见 `RECYCLING.md` |

## 二、当前状态（2026-11-20）

```text
分支        main（PR #40 已合入，a523763）
版本        0.3.15（tag / Release / npm 发布流程已完成）
本批新增    src/invite-policy.mjs · tests/invite-policy.test.mjs（12 项）· HOOKS 四之一 5b · AGENTS 坑表第 41 条
```

| 资产 | 数量 |
|---|---:|
| `src/` 模块 | 32 个 |
| `tests/` | 33 个 / 418 条（`node --test` 全过） |
| `HOOKS.md` | 21 章字段级钩子契约 |
| AGENTS.md 坑表 | 41 条 |

本批从 `magpie-croli` 与 `magpie-monkeycode` 回收通用邀请来源选择状态机：`inviteSource` 支持
latest / 指定 uid / manual，分别记忆；`ask()` 按账号取码，`authorize()` 零出站。账号目录、厂商 URL、
凭据形状与取码函数全部留在派生插件，不进入通用层。

已验证（0.3.15）：

- `node --test`：418 通过 / 0 失败（新增 `tests/invite-policy.test.mjs` 12 项）；
- `npm run check:template`：40 通过 / 0 失败（模板 registry 占位名 warning 是既有预期）；
- `npm run check:errors`：2 通过 / 0 失败；
- `node scripts/check-docs.mjs --sync`：9 处版本引用已同步到 0.3.15；
- `git diff --check`：退出 0；`privacy-scan`：PASS；
- `npm pack --dry-run`：110 个文件，`src/invite-policy.mjs` 与 `tests/invite-policy.test.mjs` 均在包内；
- PR #40 的 rules / action-self-test 全绿；main 的 check / Scorecard / release workflow 全绿；Release `v0.3.15` 非 draft，npm 日志确认 `magpie-plugin-scaffold@0.3.15` 发布。

## 三、下一步

- 本批已完成：PR #40 合入、`v0.3.15` 标签与 Release、main CI、npm 发布；后续变更另起功能分支。

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
