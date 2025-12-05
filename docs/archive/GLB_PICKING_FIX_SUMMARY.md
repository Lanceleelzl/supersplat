# GLB模型拾取问题修复总结

## 问题分析

从用户提供的控制台日志可以看出：
1. GLB模型状态正常（`visible: true`, `entityEnabled: true`）
2. 模型有有效的世界边界框
3. **射线-AABB相交测试失败**（`intersects: false`）
4. 因此系统继续执行splat拾取，选中了splat而不是GLB模型
5. 通过场景管理器选择GLB模型时变换控制器正常工作，说明变换系统本身没问题

## 主要修复

### 1. 坐标系统统一
**文件**: `src/camera.ts`
**问题**: GLB拾取使用了带DPR缩放的坐标，可能与splat拾取不一致
**修复**: 统一使用相同的坐标转换系统
```typescript
// 修复前：使用DPR缩放
const scaledX = screenX * dpr;
const scaledY = screenY * dpr;
cam.screenToWorld(scaledX, scaledY, cam.nearClip, nearPoint);

// 修复后：与splat拾取保持一致
cam.screenToWorld(screenX, screenY, cam.nearClip, nearPoint);
```

### 2. 事件类型定义修复
**文件**: 
- `src/entity-transform-handler.ts`
- `src/entity-transform-handler-new.ts` 
- `src/splats-transform-handler.ts`

**问题**: `camera.focalPointPicked`事件监听器的类型定义只包含splat，不包含GLB模型
**修复**: 更新事件类型定义以支持GLB模型
```typescript
// 修复前
events.on('camera.focalPointPicked', (details: { splat: Splat, position: Vec3 }) => {

// 修复后  
events.on('camera.focalPointPicked', (details: { splat?: Splat, model?: GltfModel, position: Vec3 }) => {
```

### 3. 增强调试信息
**文件**: `src/camera.ts`
**改进**: 添加了详细的射线-AABB相交测试调试信息，包括：
- 射线原点和方向
- AABB中心和范围
- 手动几何相交验证
- 距离计算

### 4. 提高fallback阈值
**文件**: `src/camera.ts`
**问题**: fallback机制的点击阈值太小（25px半径）
**修复**: 增加到50px半径，使GLB模型更容易被选中
```typescript
// 修复前：25px半径 => 625像素²
if (best.dist2 < 625) {

// 修复后：50px半径 => 2500像素²  
if (best.dist2 < 2500) {
```

## 测试验证

### 测试步骤
1. 启动项目并加载GLB模型
2. 点击GLB模型，观察控制台输出
3. 检查是否显示：
   - 正确的射线计算信息
   - AABB相交测试详细结果
   - 手动几何验证结果

### 期望结果
- GLB模型能够被点击选中
- 变换控制器（坐标轴）显示在GLB模型位置
- 可以通过拖拽轴线移动GLB模型

### 如果问题仍然存在
请检查控制台中的详细调试信息：
1. `shouldIntersect` 是否为 `true`
2. 如果几何上应该相交但 `intersects` 为 `false`，可能是PlayCanvas的BoundingBox.intersectsRay实现问题
3. fallback机制是否生效（检查屏幕投影距离）

## 后续优化建议

1. **精确网格拾取**: 当前使用AABB粗略拾取，可以实现精确的三角面拾取
2. **物理拾取**: 利用PlayCanvas的物理系统进行更精确的拾取
3. **拾取优先级**: 根据距离相机的远近确定拾取优先级
4. **视觉反馈**: 添加hover效果等交互反馈

## 相关文件
- `src/camera.ts` - 拾取射线计算和AABB测试
- `src/entity-transform-handler.ts` - GLB模型变换处理
- `src/gltf-model.ts` - GLB模型类定义
- `src/selection.ts` - 选择事件处理