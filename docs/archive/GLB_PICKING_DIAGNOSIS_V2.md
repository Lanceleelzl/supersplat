# GLB模型拾取问题诊断指南

## 问题现状
- GLB模型状态正常（可见、启用）
- 射线-AABB相交测试失败（intersects: false）
- 只能通过场景管理器列表选择GLB模型
- 在视口中点击无法选中GLB模型

## 已实施的修复

### 1. 手动射线-AABB相交测试
实现了自己的射线-AABB相交算法，以防PlayCanvas的方法有问题。

### 2. 增强的调试信息
添加了以下调试信息：
- 相机位置和朝向
- GLB模型相对于相机的位置
- 手动计算的相交结果
- 屏幕投影距离计算

### 3. 大幅增加fallback阈值
将点击阈值增加到100px半径（10000像素²），确保GLB模型能通过fallback机制被选中。

## 测试步骤

1. **启用调试模式**
   在浏览器控制台执行：
   ```javascript
   window.Camera.debugPick = true;
   ```

2. **点击GLB模型**
   点击视口中的GLB模型，观察控制台输出。

3. **检查关键调试信息**
   - `Model position relative to camera` - 确认模型在相机前方（`isInFront: true`）
   - `manualIntersects` - 查看手动计算的相交结果
   - `Fallback candidate check` - 确认fallback机制是否触发

## 期望结果

点击GLB模型后应该看到：
- 手动相交测试可能成功（`manualIntersects: true`）
- 如果手动测试也失败，fallback机制应该生效
- 最终应该触发GLB模型选择

## 如果问题仍然存在

### 可能的原因：
1. **射线方向计算错误** - 检查`rayDirection`向量
2. **坐标系统不匹配** - GLB模型和射线使用不同的坐标系
3. **相机参数问题** - near/far clip planes设置不正确
4. **模型位置异常** - GLB模型位置超出合理范围

### 进一步调试：
如果fallback机制也失败，请提供：
- 完整的控制台调试日志
- GLB模型的确切位置信息
- 相机的位置和朝向信息
- 点击时的屏幕坐标

### 临时解决方案：
如果技术修复仍然失败，可以考虑：
1. 实现基于屏幕坐标的简单拾取
2. 使用PlayCanvas的物理拾取系统
3. 为GLB模型添加不可见的拾取代理几何体

## 测试命令

```javascript
// 在控制台中查看当前场景状态
const models = window.scene.getElementsByType('model');
console.log('GLB模型信息:', models.map(m => ({
    filename: m.filename,
    position: m.entity.getPosition().toString(),
    worldBound: m.worldBound?.center.toString(),
    visible: m.visible
})));

// 查看相机信息
const camera = window.scene.camera;
console.log('相机信息:', {
    position: camera.entity.getPosition().toString(),
    forward: camera.entity.forward.toString(),
    up: camera.entity.up.toString()
});
```