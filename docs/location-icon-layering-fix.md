# 坐标查询位置图标与菜单/面板叠加层级调整记录

## 背景
- 需求：当坐标查询位置图标与界面菜单/面板发生重叠时，位置图标应被菜单/面板遮住，但不应被整体隐藏。
- 问题表现：仅场景管理器和坐标查询结果面板能遮住位置图标，其他面板（右侧菜单、顶部菜单、顶部中间面板、底部数据面板、底部工具栏、时间线等）在重叠时没有遮挡效果。

## 修改方式总览
- 统一确立 UI 层级策略，并在需要的容器上补充 `z-index`，避免因父级堆叠上下文导致的“高层级子元素仍被低层级覆盖”的情况。
- 降低位置图标 DOM 的层级，移除与菜单开关的强绑定隐藏逻辑，保证图标正常显示，仅在与面板/菜单重叠区域被遮住。

## 层级策略（目标）
- 位置图标（Coordinate Lookup DOM 图标）：`z-index: 50`
- 通用面板类（如视图设置、颜色、属性、时间线等）：`z-index: 100`
- 顶部菜单栏、顶部中间面板、底部数据面板、底部工具栏：`z-index: 100`
- 菜单面板（`.menu-panel` 下拉）：`z-index: 2000`
- 提示层（`#tooltips-container`）：`z-index: 3000`
- 上下文菜单（右键）：`z-index: 10000`

## 具体改动

### 坐标查询位置图标（DOM）
- 文件：`src/tools/coordinate-lookup.ts`
  - 调低图标层级：`el.style.zIndex = '50'`（src/tools/coordinate-lookup.ts:275）
  - 移除“底部菜单激活时整体隐藏位置图标”的逻辑，使图标仅在未激活或无坐标时隐藏：
    - 2D 模式：删除 `this.bottomMenuActive` 参与隐藏的条件（src/tools/coordinate-lookup.ts:327-331）
    - 3D 模式：删除 `this.bottomMenuActive` 参与隐藏的条件（src/tools/coordinate-lookup.ts:354-357）

### 菜单面板（下拉）
- 保持高层级：`src/ui/scss/menu-panel.scss:5` → `.menu-panel { z-index: 2000; }`（原有设置，未改动）

### 右侧菜单与其面板
- 文件：`src/ui/scss/right-toolbar.scss` → 为 `#right-toolbar` 增加 `z-index: 100`
- 文件：`src/ui/scss/view-panel.scss` → 为 `#view-panel` 增加 `z-index: 100`
- 文件：`src/ui/scss/color-panel.scss` → 为 `#color-panel` 增加 `z-index: 100`

### 顶部左上角菜单条、顶部中间面板
- 文件：`src/ui/scss/menu.scss` → 为 `#menu-bar` 增加 `z-index: 100`
- 文件：`src/ui/scss/mode-toggle.scss` → 为 `#mode-toggle` 增加 `z-index: 100`

### 底部区域
- 文件：`src/ui/scss/bottom-toolbar.scss` → 为 `#bottom-toolbar` 增加 `z-index: 100`
- 文件：`src/ui/scss/timeline-panel.scss` → 为 `#timeline-panel` 增加 `z-index: 100`
- 文件：`src/ui/scss/data-panel.scss` → 为 `#data-panel` 增加 `position: relative; z-index: 100`

### 通用面板类
- 文件：`src/ui/scss/panel.scss` → 为 `.panel` 增加 `z-index: 100`，覆盖所有基于该类的面板（如属性面板等）。

## 生效与验证
- 样式编译：本项目的 SCSS 不在 Rollup 里编译，需执行预编译以生成 `dist/index.css`。
  - 命令：`npm run prebuild`
- 开发预览：`npm run develop` 后访问 `http://localhost:3000` 或本地端口（当前环境为 `http://localhost:7387/`）。
- 浏览器缓存：在开发者工具中禁用缓存或在 URL 追加查询参数（例如 `?v=2`）确保最新 `index.css` 被加载。
- 验证路径：
  - 打开顶部左上角菜单条（及其下拉）、顶部中间模式切换面板、右侧菜单面板、底部工具栏、时间线面板、底部数据面板，与位置图标产生重叠；位置图标应在其下方，仅在重叠区域被遮住。

## 维护建议
- 新增面板或自定义容器时：
  - 若容器使用 `transform`/`filter` 会形成新的堆叠上下文，请在该容器根元素上设置显式 `z-index`（建议≥100）。
  - 遵循既定层级策略，避免将一般面板提升到超过 `menu-panel` 的层级（2000），以免下拉菜单无法覆盖。
- 位置图标层级原则：维持在普通面板之下（50），在提示层、上下文菜单、下拉菜单之下，保证交互与可视一致性。

## 回滚方式
- 将上述 SCSS 文件中新增的 `z-index` 调整删除或恢复为原值；
- 将 `src/tools/coordinate-lookup.ts` 中 `z-index` 恢复到变更前值，并恢复对 `bottomMenuActive` 的隐藏逻辑（如确需旧行为）。

## 参考定位
- 坐标图标层级调整：`src/tools/coordinate-lookup.ts:275`
- 位置图标隐藏逻辑更新点：`src/tools/coordinate-lookup.ts:327-331`, `src/tools/coordinate-lookup.ts:354-357`
- 菜单面板层级：`src/ui/scss/menu-panel.scss:5`