# 远端同步检查与提交计划

检查日期：2026-10-04（Asia/Shanghai）。下列提交计数为本次检查快照；后续提交或远端更新会改变计数。

## 同步结果

已执行 `git fetch --all --prune`，并对当前分支分别执行 `git merge --ff-only origin/main` 和 `git merge --ff-only fork/fix/titlebar-drag-regions-overlays`，两次均返回 `Already up to date.`。没有产生新合并提交或冲突，原有未提交改动保持不变。

| 引用                                      | 提交      | 与当前 HEAD 的关系                         |
| ----------------------------------------- | --------- | ------------------------------------------ |
| 当前 `fix/titlebar-drag-regions-overlays` | `ec781d9` | 当前 HEAD                                  |
| 上游 `origin/main`                        | `56b8493` | 当前分支领先 2、落后 0；上游改动已全部包含 |
| `fork/fix/titlebar-drag-regions-overlays` | `07edc9a` | 当前分支领先 26、落后 0                    |
| `fork/feat/desktop-shell-consolidated`    | `675b027` | 当前分支领先 17、落后 0                    |
| `fork/feat/hot-restart-default-browser`   | `b02a341` | 当前分支领先 42、落后 0                    |
| `fork/main`                               | `685caf4` | 与上游没有共同祖先；保留其早期独立历史     |

远端地址：上游 [JustGenius-s/DSH-Desktop](https://github.com/JustGenius-s/DSH-Desktop)，fork [Rory-X/DSH-Desktop](https://github.com/Rory-X/DSH-Desktop)。

相对 fork 功能分支领先的 26 个提交中，24 个属于上游已有历史，另外 2 个是本地 `2e56de6`（保存桌面修复的 WIP）和 `ec781d9`（合并上游）。相对上游，已提交净差异为 41 个文件；加上原有未提交改动后为 46 个文件、3673 行新增、457 行删除，不含本文。

本次同步已确认上游代码完整。本地新增提交尚未推送到 fork；本次交付为检查结果和提交计划。

## 当前工作区的提交顺序

### 1. `fix(notify): use system notifications and handle delivery receipts`

将以下 6 个文件作为一个原子提交，避免实现、API 说明和现有测试不一致：

- `src/main/notifications/service.ts`
- `src/main/notifications/banners.ts`（删除）
- `src/main/notifications/web-bridge.ts`
- `src/shared/api.ts`
- `test/unit/main/notifications/notifications.test.ts`（已有改动）
- `docs/desktop-api.md`

提交内容：移除壳内通知浮层，等待系统 `show` / `failed` 回执；失败返回 `shown: false`，关闭、替换及页面销毁时清理监听和确认计时器。1.5 秒没有回执时按已投递处理，因此 `shown: true` 仍不保证用户实际看到通知。

提交时只暂存这些明确路径：

```sh
git add -- src/main/notifications/service.ts src/main/notifications/banners.ts src/main/notifications/web-bridge.ts src/shared/api.ts test/unit/main/notifications/notifications.test.ts docs/desktop-api.md
git diff --cached --check
git diff --cached --stat
git commit -m 'fix(notify): use system notifications and handle delivery receipts'
```

### 2. `docs: record remote sync status and commit plan`

只提交本文，保留远端快照、验证结论和后续上游提交范围。执行后文的功能拆分会产生新快照，届时相应更新本文。

```sh
git add -- docs/sync-and-commit-plan-2026-10-04.md
git diff --cached --check
git commit -m 'docs: record remote sync status and commit plan'
```

这两个提交完成后，可以将当前分支作为完整工作快照正常推送到同名 fork 分支，无需强推：

```sh
git fetch --all --prune
git push fork HEAD:fix/titlebar-drag-regions-overlays
```

若推送前远端出现新提交，先检查并合并其改动，再重新验证。

## 向上游提交的功能拆分

保留当前分支作为工作快照。后续发布在最新 `origin/main` 上新建 `codex/desktop-shell-fixes`，从最终净差异中按下表生成提交。旧 WIP 混合多个功能且使用重构前的文件路径，因此直接移植最终文件和必要代码块比整批 cherry-pick 更清晰；无需改写当前分支历史。

| 顺序 | 建议提交标题                                                         | 代码范围与关联文档                                                                                                                                   |
| ---- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `fix(titlebar): preserve drag regions and fullscreen state`          | `windows/titlebar.ts`、`windows/titlebar-controller.ts`、`main-window.ts` 的标题栏代码块、`preload.ts` 的 darwin 标记；已有标题栏测试和 preload 测试 |
| 2    | `fix(overlays): serialize opens and cancel disposed windows`         | `overlays/manager.ts`、`overlays/operations.ts`；已有 overlay 与操作队列测试                                                                         |
| 3    | `fix(menu): deduplicate contributions and native accelerators`       | `menus/seats.ts`、`menus/seat-state.ts`；已有菜单状态测试                                                                                            |
| 4    | `fix(lifecycle): bind restart prompts to the owning main frame`      | `app.ts` 的就绪/退出判断、`restart.ts`；现有 restart 测试；`desktop-api.md` 中提示生命周期说明                                                       |
| 5    | `fix(notify): use system notifications and handle delivery receipts` | 上述通知修复的 6 个文件；仅选取 `desktop-api.md` 中通知相关代码块                                                                                    |
| 6    | `fix(macos): declare microphone permissions and sign app bundles`    | `platform/microphone.ts`、`main-window.ts` 的权限代码块、两份 entitlements、`package.json` 的权限和签名配置；现有麦克风测试、权限与签名文档          |
| 7    | `chore: clean validation artifacts and refresh desktop docs`         | 清理历史临时 probe，更新受影响的复现说明，整理可复用文档和 `.gitignore`；版本号和 buildVersion 按实际发布单独确认                                    |

代码路径以 `src/main/` 为根，`preload.ts` 位于 `src/`。`main-window.ts`、`desktop-api.md`、`package.json` 有跨功能改动，需按代码块暂存；现有测试跟随对应实现，按仓库要求不新增测试。

第 7 项涉及已有 `scripts/full-main-restart-probe.cjs`、`scripts/lifecycle-ipc-probe.cjs`、`scripts/overlay-restart-probe.cjs`。本次没有运行或创建这些脚本。正式提交前清理其临时用途，并同步处理文档引用。历史验收记录包含本机绝对路径、旧文件结构和另一工作区的材料，应整理为可复用说明后再纳入上游提交。

第 6 项签名和打包配置需要在实际发包时核对；本次测试结果不覆盖 macOS 系统通知展示、系统权限弹窗或签名安装包运行。

## 已完成验证

- `git diff --check`：通过。
- Node `24.18.0`、pnpm `10.30.3` 下的 `pnpm check`：通过。
- Prettier 格式检查、两份 TypeScript 类型检查和构建：通过。
- Vitest：14 个文件、69 项测试通过。
- Node test runner：9 个文件、49 项测试通过。

本机默认 Node `20.20.2` 会使原有完整检查命令失败：不支持引号内递归 glob，且启动测试使用的 `--no-use-system-ca` 也不被支持。切换现有 Node 24 后完整检查通过，无需为旧验证环境修改产品代码。复现可先运行 `nvm use 24.18.0`，再执行 `pnpm check`。

首次检查阶段没有新增测试、临时验证脚本、提交或推送，没有启动浏览器端到端验证，也没有替换已安装的应用。

## 提交执行

用户随后授权提交并准备上游 PR。通知修复已保存为 `a29e3aa`，本文作为独立文档提交。当前功能分支保留为完整本地快照；上游 PR 使用从最新 `origin/main` 创建的 `codex/desktop-shell-fixes`，按上述功能范围生成独立提交。

PR 分支只包含运行时代码、已有测试和可复用说明。历史本机验收记录、同步计划及临时 probe 保留在快照分支；版本号和 buildVersion 留待实际发布时确认。
