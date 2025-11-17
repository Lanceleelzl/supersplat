# 经纬度坐标查询图标的显示与加载方式说明

本文档总结当前“经纬度坐标查询”工具的图标显示与加载方式，以及图标/直径球体的切换逻辑。该实现已达到期望的视觉效果，相比之前的尝试更稳定、可控。

## 显示方式（图标模式）
- 标记类型：DOM 覆盖的 `<img>` 图标（不使用 3D 实体）。
- 资源来源：`location.png` 静态图片，通过 `createImgEl(locationPng)` 创建。
- 容器位置：将图标插入到 `canvasContainerDom` 之内，使用 `absolute` 定位，并设置 `transform: translate(-50%, -100%)` 使图标尾部对准点击点。
- 尺寸控制：通过字段 `markerDesiredPx` 控制屏幕像素直径，`updateMarker2D()` 每帧设置 `width/height` 样式为该像素值。
- 位置更新：使用 `camera.worldToScreen(this.markerWorld)` 获取屏幕坐标，`left/top` 定位到画布内，越界或不可见时隐藏图标。
- 交互屏蔽：`pointer-events: none`，避免影响画布交互；`z-index: 1001` 保证图标在前景层显示。

## 显示方式（直径模式）
- 标记类型：PlayCanvas 3D 球体实体，材质为发光色，禁用深度测试与深度写入，剔除关闭以避免被裁剪。
- 实体创建：`ensureMarkerEntity()` 创建 `Entity('coordinateMarker')` 并添加 `render: 'sphere'`，材质使用 `StandardMaterial`，设置到 `scene.gizmoLayer` 图层以与编辑器辅助层对齐。
- 尺寸控制：`updateMarker3D()` 中根据相机类型（透视/正交）和目标屏幕像素直径 `markerDesiredPx` 计算世界空间半径，`setLocalScale()` 以保证屏幕上的直径稳定为期望值。
- 位置更新：实体位置跟随 `this.markerWorld`，不可见或遮挡条件下禁用实体。

## 切换逻辑
- 切换入口：工具面板的标签文字（初始显示为“图标”）。
- 行为说明：点击标签在两种模式间切换：
  - 当标签为“图标”时，查询坐标显示 DOM 图标。
  - 切换为“直径(px)”时，查询坐标显示 3D 球体，屏幕直径为 `markerDesiredPx`。
- 拖拽调整：仅在“直径(px)”模式下，支持在标签上左右拖拽以调整直径数值，拖动 2px 增减 1 单位。
- 每帧更新：统一通过 `updateMarker()` 根据 `markerMode` 分发到 `updateMarker2D()` 或 `updateMarker3D()`。

## 相关代码位置
- 文件：`src/tools/coordinate-lookup.ts`
- 主要方法：
  - `ensureMarkerDom()`：创建并挂载 DOM 图标。
  - `ensureMarkerEntity()`：创建球体实体与材质并加入场景。
  - `placeMarker(world)`：设置世界坐标并预备所需资源后调用 `updateMarker()`。
  - `updateMarker2D()`：计算屏幕坐标与尺寸，定位并显示 DOM 图标。
  - `updateMarker3D()`：根据相机参数与目标像素直径计算球体世界尺寸与位置。
  - `updateMarker()`：统一入口，依据 `markerMode` 调用对应更新方法。
  - 标签点击切换：`sizeLabel.dom.addEventListener('click', ...)` 切换 `markerMode` 并更新文案与显示。

## 设计要点与稳定性
- 与之前依赖纹理/材质的 3D Billboard 方案不同，图标模式完全使用 DOM 覆盖，不引入 3D 渲染依赖，避免光照、透明度、深度测试等问题导致的视觉偏差。
- 直径模式通过世界尺度计算确保屏幕直径稳定，适配透视与正交相机，增强可控性。
- 在底部菜单激活或相机更新时，统一通过 `updateMarker()` 进行显示状态与位置更新，降低耦合与复杂度。

---

如需进一步定制图标样式（颜色、大小、居中方式）或球体材质效果（颜色、发光强度），可在上述方法内直接调整对应的 DOM 样式与材质参数。当前实现已满足“图标显示与加载达到预期效果”的需求。

