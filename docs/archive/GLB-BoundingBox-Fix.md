# GLB模型包围盒位置修复

## 问题根因

GLB模型的包围盒位置不正确的根本原因是**重复应用了世界变换**：

1. **GLB模型worldBound计算**: 已经使用了`mi.node.getWorldTransform()`来计算世界坐标
2. **包围盒渲染**: 错误地又应用了`this.entity.getWorldTransform()`
3. **结果**: 包围盒被"双重变换"，位置偏移

## 解决方案

### 修复前的错误代码
```typescript
// 错误：重复应用变换
const scale = new Mat4().setTRS(bound.center, Quat.IDENTITY, bound.halfExtents);
scale.mul2(this.entity.getWorldTransform(), scale); // ❌ 不应该再应用实体变换
```

### 修复后的正确代码
```typescript
// 正确：直接使用worldBound
const scale = new Mat4().setTRS(bound.center, Quat.IDENTITY, bound.halfExtents);
// ✅ 不再应用额外变换，因为worldBound已经是世界坐标
```

## 技术细节

### GLB worldBound计算过程
```typescript
// 在 GltfModel.worldBound getter 中
for (const mi of meshInstances) {
    const localAabb = mi.aabb;                    // 网格的局部边界框
    const worldTransform = mi.node.getWorldTransform(); // 节点的世界变换
    const worldAabb = new BoundingBox();
    worldAabb.setFromTransformedAabb(localAabb, worldTransform); // 应用变换
    bound.add(worldAabb);                         // 合并到最终边界框
}
```

这个过程已经将所有的局部边界框变换到世界坐标系，所以最终的`bound`就是正确的世界坐标边界框。

### 与Splat模型的区别
- **Splat模型**: 使用`localBound + entity.getWorldTransform()`
- **GLB模型**: 使用`worldBound`（已经包含所有变换）

## 验证方法

启用调试模式来验证修复：
```javascript
events.invoke('debug.modelAabb.enable');
```

观察控制台输出，应该看到：
- `worldBound.center`: GLB模型在世界坐标系中的正确中心位置
- `entityTransform.position`: 实体的位置（可能为零或其他值）
- 包围盒应该正确显示在模型位置，而不是偏移的位置

## 结果

现在GLB模型的包围盒应该：
- ✅ 正确显示在模型的实际位置
- ✅ 与模型的尺寸完全匹配  
- ✅ 不会因为模型位置变化而出现偏移
- ✅ 与outline高亮效果保持一致