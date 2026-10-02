# 上游 DSH 的 macOS 桌面集成契约，与本壳的偏离

日期：2026-09-24。范围：DSH runtime `0.1.7-alpha.2`，壳 `DSH-Desktop`。
本文只回答一件事：**`<html data-platform="darwin">` 这个标记是什么、为什么我们的壳该打它、代价是什么。**

---

## 1. 标记是什么

上游把「运行在 macOS 桌面壳里」这件事，编码成一个 DOM 标记：

```js
// @deepseek-ai/dsh-client-ui-primitives/lib/index.js
/**
 * Whether the client runs in the macOS desktop shell: the Electron preload
 * marks `<html>` with `data-platform="darwin"`; plain web never sets it.
 * Read at render time — the mark may arrive as late as DOMContentLoaded.
 */
function isDarwinDesktop() {
  return document.documentElement.dataset.platform === "darwin"
}
```

契约写得很直白：**由桌面 preload 打标记，普通 Web 页面永不设置**。
`ui-sidebar` 与 `ui-layout` 两份 README 都重复了同一句话
（"set only by the desktop preload"），说明这是有意设计的对外接口，不是内部实现细节。

## 2. 我们的壳没有打这个标记

`src/preload.ts` 全文没有写 `data-platform`；已安装的 `app.asar` 里
`preload.js` / `main.js` / `desktop-bridge.js` 三份也都不含该字符串。

后果：**上游 30 条 darwin 门控规则全部休眠**。枚举结果（8 个包）：

| 包 | 条数 | 代表性内容 |
| --- | --- | --- |
| `ui-layout` | 11 | `--dsh-frame-top-clearance: 48px`、sidebar 渐变底、`--dsh-frame-leading-clearance`、collapse 时隐藏整列 |
| `ui-sidebar` | 7 | `.topStrip` 52px 顶部条、`logoRow` drag、brand `cursor: default`、New Session 半透明底 |
| `ui-sidebar-right` | 4 | **全屏面板 strip 88px 内缩**、column=1 回 10px、原生全屏时回 10px |
| `ui-conversation` | 3 | `headerLeading/Actions/Utilities/Corner` 的 no-drag |
| `ui-plugin-manager` | 2 | 入口页 `padding-top: var(--dsh-frame-top-clearance)` |
| `ui-settings-account` | 1 | `.trafficLights` 占位块 `display: block`（宽 60.667px） |
| `ui-settings-general` | 1 | 设置浮层 no-drag |
| `ui-workspace` | 1 | `[data-platform=darwin] .fade { display: none }` |

JS 层也有三处依赖，不只是样式：

1. `ui-layout`：`const darwin = dataset.platform === "darwin"` 参与列宽计算 ——
   `collapsedWidth = darwin || hasAttribute('data-windows-titlebar') ? 0 : 56`，
   即 **darwin 下收起侧栏不保留 56px 轨道**（整列隐藏）。
2. `ui-sidebar`：`darwinDesktop && <div className={topStrip}>{toggle}</div>` ——
   **整个顶部条节点及其收起按钮是条件渲染的**，没标记就不存在。
3. `ui-sidebar-right`：`if (dataset.platform !== "darwin") return` ——
   一段 darwin 专属的 `data-sidebar-right-region-nudge` 布局抖动修正被整段跳过。

## 3. 我们一直在用自写 CSS 重造这些

本壳 `src/titlebar-chrome.ts` 承担的正是标记本该带来的效果：

| 上游 `[data-platform=darwin]` | 我们的替代实现 |
| --- | --- |
| `logoRow` 上方 52px `.topStrip` | `logoRow { margin-top: 20px !important }` |
| `logoRow` / 顶栏的 drag 区 | 手写 `app-region` 规则 + `centerCol::before` 伪元素通条 |
| 全屏面板 strip 88px 内缩 | 选择器锚 pane（**0.1.7 起失配，见下**） |
| 面板/浮层 no-drag | 手写 `[data-sidebar-right-panel]` 等 no-drag |

**这次修的 bug 就是这种重造的直接后果。** 上游 0.1.7 自带
`--dsh-dockkit-strip-inline-start: 88px`，但被标记锁着用不上；
我们自写的那条锚在 `[data-dockkit-pane] > [data-dockkit-strip]`，
而 0.1.7 在两者之间插入了 `.tabHostHeader` 包装层，规则匹配 0 个元素、静默失效。

## 3.5 官方机制的机制细节（已核实，含一处修正）

上游 `0.1.7` 与前代的**承担方式不同**，这决定了「官方是否已解决」这个问题的答案边界：

| | 0.1.6-alpha.2 | 0.1.7-alpha.2 |
| --- | --- | --- |
| 面板自身 no-drag | `.P3OORG_panel[data-sidebar-right-panel=fullscreen] { -webkit-app-region: no-drag }` | **删除了**（该包内 `app-region` 仅剩 1 处，是 region-nudge） |
| 面板 strip drag | `[data-platform=darwin] ... [data-dockkit-strip] { -webkit-app-region: drag }` | **删除了** |
| 顶部拖拽带 | 无（依赖各区域自己声明） | `.pI_x6G_leadingBand` 1280×52，`pointer-events:none; -webkit-app-region: drag` |
| 渲染条件 | — | `darwin && <div className={leadingBand} data-shell-leading-band />`（**JS 条件渲染**） |
| 88px 内缩 | 打在 `.P3OORG_panelBody` 上（后代继承） | 打在 `[data-dockkit-host=dock][data-dockkit-column="0"]` 上 |

也就是说 0.1.7 把拖拽职责**上收到框架层的单条全宽 band**，面板自己不再声明任何 drag。
这条 band 由 `dataset.platform === 'darwin'` 直接门控（JSX 层），
**没有标记时整个节点不存在** —— 这也是上一节「无标记时全页零 drag 区」的出处。

### chip 可点性验证（纯官方机制，无任何本壳 CSS）

在 dev 实例上仅打标记、不注入本壳任何样式，展开面板并切全屏后测得：

- `strip` padding-left = `88px`，首个 chip `box.x = 89`（红绿灯带右界保守取 72pt）
- 在 chip 中心做 `elementFromPoint`：命中对象**是 chip 内部节点**，
  `isInsideTab = true` —— 说明它没有被 `.leadingBand` 的 drag 区吃掉

即：**官方机制在本例中不仅让开了红绿灯，也没有破坏 chip 的点击**。

> 修正：本文早期版本称「上游已用同一变量给同一节点，本壳第 5 条可删」。
> 更准确的说法是——0.1.7 的 88px 内缩规则**选择器与变量名都和本壳相同**，
> 但它是 `[data-platform=darwin]` 门控的，且 0.1.7 已不再由面板自己声明 drag。

## 4. 实测：加上标记会怎样

在真实 dev 实例（`0.1.7-alpha.2`）上，用 `addInitScript` 模拟 preload 提前打标记，
每格都用**全新页面**测量（避免 `addInitScript` 跨调用残留）：

| 场景 | 标记 | 我们的 CSS | `.topStrip` | `logoRow` y | `--dsh-frame-top-clearance` | strip |
| --- | --- | --- | --- | --- | --- | --- |
| s2 裸奔（上游默认） | ✗ | ✗ | 未挂载 | **6px** | 无 | 10px |
| s1 现状 | ✗ | ✓ | 未挂载 | 26px | 无 | 88px |
| s3 标记 + 保留旧 hack | ✓ | ✓ | 挂载 | **72px（双重叠加）** | 48px | 88px |
| s4 标记 + 撤掉 hack | ✓ | ✗ | 挂载 | **40px** | 48px | 88px |

两个结论：

- **只加标记、保留自写 hack 是错的**（s3）：上游 52px topStrip 与我们的
  `margin-top: 20px !important` 叠加成 72px，侧栏内容被推得过低。
- **正确组合是 s4**：标记 + 撤掉重复的 hack，`logoRow` 干净落在 40px。

### 红绿灯重叠判据

红绿灯三枚 12pt 圆，圆心 x = 20/40/60 → 竖直带 y 20–32、水平伸到 ~66pt
（用户截图独立复核：green 右缘 ≈71.5pt，取保守上界 72pt）。

| 场景 | `logoRow` 竖直范围 | 是否与红绿灯带相交 |
| --- | --- | --- |
| s2 裸奔 | y 6–66 | **相交 ❌** |
| s1 现状（我们的 20px） | y 26–86 | **相交 ❌**（26 < 32） |
| s4 标记方案 | y 40–100 | 不相交 ✅ |

即：**我们现在的 20px hack 其实还没完全让开**，只是把 logoRow 从 6px 推到 26px，
仍落在红绿灯竖直带内。上游的 52px topStrip 才是正确量级。

## 5. 冲突面清单（接标记时需要一并处理）

1. `titlebar-chrome.ts` 第 1 条（macOS 侧栏 logo 行）
   - `margin-top: 20px !important` → 与上游 topStrip 叠加，**必须删**
   - `:has(> logoRow)::before` 40px 假通条 → 上游有 `.leadingBand`（实测存在，
     `app-region: drag`，高 52px），**应删**
   - `logoRow` 的 `app-region: drag` → 上游已提供，**应删**
2. `titlebar-chrome.ts` 第 5 条（全屏面板 strip）
   - 上游已用同一变量给同一节点，**可删**（保留也无害，但属重复）
3. `titlebar-chrome.ts` 第 3 条（`centerCol::before` 40px 通条）
   - **已实测确证**：无标记时全页**不存在任何** drag 区（遍历 body 取
     `-webkit-app-region: drag` 且尺寸 >100px 的元素，结果为空数组）；
     加标记后出现 `.leadingBand`（1280×52，`app-region: drag`）。
   - 即：上游整条顶部拖拽带是被标记锁着的，这就是本壳必须手写 8 处
     `app-region` 规则的**根本原因**。加标记后第 1、3 条的假通条可整体删除，
     由 `.leadingBand` 统一承担。
4. `ui-conversation` 的 no-drag 只给了 `headerLeading/Actions/Utilities/Corner`，
   我们额外给 `header` 整行 drag —— 两者不冲突，但存在职责重叠，可简化。
5. 注意 `.leadingBand` 只有 52px 高，而我们的 `centerCol::before` 也是 40px、
   `header` 整行 drag 还覆盖 header 自身高度（实测 `header` 高 40px、
   `headerBlank` 态存在）。删除前需确认「hero 空会话态下顶栏不可见时
   窗口仍可拖动」由 `.leadingBand` 覆盖 —— 从几何看 52px > 40px，成立。

## 6. 代价与收益

**收益**

- 红绿灯避让回归上游维护，不再随 runtime 升级悄悄失效（这次 bug 的根因消失）。
- 整条顶部拖拽带（`.leadingBand` 52px）由上游提供，本壳 8 处手写 `app-region`
  规则可大幅精简 —— 这是「无标记时全页零 drag 区」的实测结论推出的。
- 侧栏顶部条、收起态整列隐藏、入口页 48px 顶距、New Session 半透明底、
  sidebar 渐变底等一批外观细节一次到位。
- 上游后续为 darwin 加的任何规则自动生效。

**代价 / 风险**

- **观感变化明显**：侧栏顶部出现 52px 条（含收起按钮），展开态 logo 行下移到 40px；
  收起态由「保留 56px 轨道」变为「整列隐藏」。
- 需要同步删掉本壳约 3–4 条 hack，删错会丢拖拽能力（拖不动窗口），
  属于「必须整体验证」而非可以局部改动。
- 收起态下上游会挂 `shell.leading` 座（红绿灯旁的重开 + New Session 控件）；
  实测当前 `leadingSeat` **未挂载**，接标记后才会出现，需重新验收该区域。
- 该标记同时被 `ui-settings-account` 的 `.trafficLights`（60.667px 占位）依赖，
  设置里的账号页布局也会随之改变。

## 7. 建议

分两步，不要合并：

1. **本次已完成的修复照常落地**（选择器锚 `data-dockkit-column`，独立于本议题，
   且对 0.1.6/0.1.7 都成立）。它把当前这个 bug 修掉，风险最低。
2. **标记作为独立改动另开一轮**：加 `data-platform=darwin` + 删重复 hack +
   收起态/入口页/设置账号页三处回归验收。建议在 dev 实例里出前后对比图再决定。

不接标记也能长期运行 —— 但要接受「每次 runtime 升级都可能再次弄坏自写选择器」
这一结构性成本，本 bug 已是第二次同类事件。
