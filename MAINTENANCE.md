# MAINTENANCE.md —— 维护台账（给接手的 agent 看）

> 接手前先读这一页。读完再按 AGENTS.md「一、先定位你在哪一步」去读对应文档。
> **每次干完活必须回来更新「当前状态」与「下一步」。**

---

## 一、身份

| 项 | 值 |
|---|---|
| 仓库 | `magpie-plugin-scaffold` |
| npm 包名 | `magpie-plugin-scaffold` |
| 当前版本 | `0.1.34` |
| 定位 | magpie 供应商插件脚手架：模板 + 20 个通用 `src/` 模块 + 27 条坑表 + 评分卡 + 受控发布脚本 |
| 现状负责人 | 待派（候选角色：`plugin-forge`） |

## 二、当前状态（2026-10-30 16:09）

```
分支        feat/tool-schema（新建，未提交）
未提交      src/tool-schema.mjs / tests/tool-schema.test.mjs 新增；
            AGENTS.md / README.md / CHANGELOG.md / NOTICE.md / package.json / MAINTENANCE.md 修改；
            kifu/ 仍未跟踪
main vs origin/main  已同步（37b9394 Merge PR #11）
```

| 资产 | 数量 |
|---|---|
| `src/` 模块 | 20 个（见 AGENTS.md 第五节表） |
| `tests/` | 16 个（`node --test` 全跑） |
| `HOOKS.md` | 21 章字段级钩子契约 |
| AGENTS.md 坑表 | 27 条 |

## 三、下一步

**P1 · `src/tool-schema.mjs` 已完成（v0.1.34，`feat/tool-schema` 分支，待 Lead 提 PR）。**

- 模块：默认关闭的显式 adapter；工具名截断保唯一 + `additionalProperties` 非布尔→`true`、删 `items:{}`、`items` 子树摊平且不留空 `{}`
- 测试：`tests/tool-schema.test.mjs` 17 条（identity / 唯一性 / 布尔边界 / items / 深冻结不可变）
- 与 `src/request-rewrite.mjs` 完全独立，未改其一行

**下一批候选（按原顺序）：**

```
- openai-response   Responses API 形态
- credential        凭据读取的公共层
- device-id         设备身份头
- catalog           模型目录缓存
```

## 四、硬约束

- **禁止直推 `main`**：功能分支 → PR → 必需检查 `rules` 全绿 → 合并 → `node scripts/release.mjs` 从与 `origin/main` 一致的提交发版。
- 发布前必跑：`node scripts/check.mjs`（退出 0）、`node --test`、`node scripts/check-maintenance.mjs`、`npm pack --dry-run`。
- 改 `HOOKS.md` 的结论前先跑 `python extract-contract.py && node scripts/contract-diff.mjs`，按差集判断。
- 判断要不要跟 magpie 升级：只看稳定渠道（`node scripts/check-magpie-stable.mjs`）。

## 五、相关会话棋谱

`kifu/` 下有两份，读 `kifu/README.md` 看导读：

- `kifu/session-6af827bd/` —— 联系 magpie 官方 + 脚手架改造（190 节点）
- `kifu/session-c328440a/` —— 仓库维护方法与受控发布（388 节点）

## 六、给接手者的最短路径

1. 读本文件
2. `git status` + `git log --oneline -5` 核实现状
3. 读 `AGENTS.md` 的定位表 → 按任务读对应文档
4. 干活 → `node scripts/check.mjs` + `node --test` → 更新本文件 → 回报 Lead
