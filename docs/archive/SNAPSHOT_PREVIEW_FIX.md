# 快照预览与主场景独立修复总结

## 背景
- 在启用快照预览时，主场景出现透明混合错序，视觉上“只有正面显示正常”。
- 同时移动检查模型会出现 `uniform4fv` 的 TypeError，导致渲染卡死。
- 本次修复围绕“第二相机（快照相机）与主相机完全解耦”展开，涵盖图层隔离、排序独立、材质参数安全同步与视口/渲染目标隔离。

## 问题点
- 快照相机与主相机的排序耦合：
  - 启用快照预览后，主场景半透明混合错序，表现为仅前表面显示正确。
  - 根因是两相机共享或相互干扰了 `splat` 实例的排序触发与视口设置，使主相机的 `inst.sort(camEnt)` 未按自身视角及时更新。
- 克隆材质同步的类型不匹配：
  - 在同步快照克隆材质参数时使用了 `material.getParameter()` 返回的内部对象，导致 `uniform4fv` 期望原生数组/`Float32Array` 而收到非原生类型，触发 TypeError 并卡死。

## 解决措施
- 图层与实例完全解耦：
  - 快照相机只渲染 `Snapshot World` 图层；每个 `Splat` 新增独立快照克隆 `snapshotEntity` 并加入 `Snapshot World`，避免与主场景混用同一 `meshInstance`。
  - 代码位置：`src/splat.ts` 增加 `snapshotEntity` 字段与克隆创建；`src/ui/snapshot-view.ts` 配置快照相机图层。
- 双相机独立排序：
  - 在 `src/scene.ts` 的 `onUpdate()` 中分别对主相机与快照相机调用 `inst.sort(camEnt)`，并为两者各自缓存位置/朝向，防止重复与串扰。
  - 快照克隆的 `sorter` 映射与主实例同步更新（删除/过滤一致），避免显示不一致。
- 视口与渲染目标隔离：
  - 仅为快照克隆的 `meshInstance` 设置与快照渲染目标匹配的视口；主场景视口保持独立，防止预览改动影响主渲染。
  - 在 `src/ui/snapshot-view.ts` 中设置 `snapshotCamera.renderTarget = this.previewRT`，并注册查询接口 `snapshot.getCameraEntity`、`snapshot.getRenderTargetSize` 供其他模块使用。
- 材质参数安全同步：
  - 在 `src/splat.ts` 的 `rebuildMaterial` 与 `onPreRender()` 中，统一以原生数组或数字/纹理设置参数，例如 `selectedClr`、`unselectedClr`、`lockedClr`、`clrOffset`、`clrScale`；不再使用 `material.getParameter()` 的内部结构。
  - 避免 `uniform4fv` 类型错误，同时保持快照与主实例的材质一致性。

## 验证结果
- 本地预览中启用/关闭快照预览均正常：主场景与快照画面透明混合正确、排序稳定。
- 移动检查模型不再出现 `uniform4fv` 错误，渲染无卡顿。

## 可能隐患
- 计算与内存开销增加：
  - 双相机独立排序在大型场景会带来额外 CPU 排序开销；快照克隆增加内存占用与材质实例数量。
- 同步遗漏风险：
  - 若后续给主实例增加新材质参数或渲染状态，未在克隆同步路径更新，可能导致快照与主场景显示不一致。
- 图层与特效穿透：
  - 若快照相机需要显示阴影/调试/轮廓等图层，配置不当可能导致主场景或快照场景意外互相影响或遗漏。
- 视口/RT 尺寸变更：
  - 快照预览尺寸变化，需要确保 `snapshot.getRenderTargetSize` 与快照克隆视口更新及时；否则出现缩放或采样异常。
- 设备上下文丢失：
  - WebGL 上下文重置或资源重建时，克隆的材质/视口/排序映射需要重新应用，遗漏会导致预览异常。
- 交互与变换同步：
  - 主实例变换（位置/旋转/缩放）需同步到快照克隆；若存在延迟或遗漏，预览与主场景会错位。

## 建议与后续
- 性能优化：
  - 为排序触发设置阈值（如位置/朝向变化超过一定量再触发），或合并两个相机的排序触发到统一调度，减少频率。
- 同步策略：
  - 建立统一的材质/状态同步函数，确保新增参数时只需改一处就能同步到克隆；集中维护于 `rebuildMaterial`。
- 图层策略：
  - 明确主场景与快照场景各自渲染的图层集合，必要时增设专用调试/轮廓图层，避免交叉影响。
- 尺寸与视口：
  - 将快照预览尺寸变化事件与 `meshInstance.setViewport` 更新绑定，确保预览像素匹配；对高 DPI 情况进行适配。
- 健壮性：
  - 处理 WebGL 上下文恢复流程：在资源重建后调用材质与排序重同步；为克隆实体增加销毁与重建管理，避免泄露。
- 验证与监控：
  - 添加场景验证清单：排序一致性、材质参数一致性、视口与 RT 尺寸一致性；在开发模式下添加断言或日志监控关键事件。

> 通过上述解耦与独立排序、材质安全同步、视口隔离的组合方案，快照预览激活后不再影响主场景的 `splat` 渲染，透明混合与排序在两个相机下都保持正确与稳定。

---

## 2025-10-28 增补：PLY加载报错与快照画面空白修复

### 现象
- 加载部分 `.ply` 文件时报错：`Cannot read properties of null (reading 'events')`。
- 主场景渲染正常，但“快照预览”中 `splat` 与 `glb` 皆不显示（黑屏/空白）。

### 根因
1. Splat 构造阶段访问了 `this.scene.events`：
   - 在被 `scene.add()` 之前，`element.scene` 尚未赋值，导致构造内读取 `this.scene.events` 为 `null` 抛错。
2. 快照图层没有有效内容：
   - `splat` 的快照克隆未在“添加到场景”阶段设置到 `Snapshot World` 图层。
   - `glb` 的渲染组件仅在 `World`，未加入 `Snapshot World`，导致快照相机无可见实例。
3. 快照相机可见图层不足：
   - 仅渲染 `Snapshot World` 时，若未包含背景/调试/阴影图层，会出现全黑或缺少辅助元素。

### 变更与措施
- `src/splat.ts`
  - 删除构造期对 `this.scene.events` 的访问：构造阶段仅使用资源中的 `shBands` 等初值；待 `add()` 后再由 `rebuildMaterial` 做统一同步。
  - 在 `add()` 完成、元素进入场景后，显式将 `snapshotEntity` 的 `render.layers` 设为 `snapshotLayer.id`，确保快照相机可见。
  - 在 `rebuildMaterial()` 中同时更新主实例与快照克隆的材质（混合状态、shader chunk、材质参数），保持显示一致。

- `src/gltf-model.ts`
  - 为 GLB 的所有 `meshInstance` 追加 `snapshotLayer.id`（保留 `World`，并加入 `Snapshot World`），实现主场景与快照场景“双栖”。

- `src/ui/snapshot-view.ts`
  - 快照相机图层配置扩展为渲染：`Snapshot World`、`backgroundLayer`、`debugLayer`、`shadowLayer`（不渲染 `World`，避免与主场景耦合）。

### 验证
- 刷新预览，启用“Snapshot Preview”。
- 依次加载 `.ply` 与 `.glb`：
  - PLY 不再触发 `null.events` 报错，加载成功。
  - 主场景渲染正常；快照窗口可见 `splat` 与 `glb`，背景/调试/阴影元素可按配置显示。
- 旋转主相机与快照相机，透明混合/排序稳定，无一侧可见的问题。

### 注意与边界
- 快照相机不渲染 `World` 层，避免共享 `meshInstance` 导致排序/状态串扰；如需在快照显示特定主场景元素，请将其单独复制或加入 `Snapshot World`。
- 后续新增材质参数或渲染状态时，请在 `rebuildMaterial()` 中补充快照克隆的同步逻辑，防止两视图出现显示不一致。

### 受影响文件
- `src/splat.ts`：构造期去耦、`add()` 时设置快照图层、克隆材质同步。
- `src/gltf-model.ts`：GLB 渲染组件加入 `Snapshot World`。
- `src/ui/snapshot-view.ts`：快照相机图层可见性调整。
