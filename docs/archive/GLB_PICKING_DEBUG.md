# GLB模型拾取调试和修复指南

## 问题诊断步骤

为了诊断GLB模型无法被拾取的问题，请按以下步骤操作：

### 1. 启用调试模式
在浏览器控制台中执行以下命令：
```javascript
// 启用GLB模型AABB调试
window.GltfModel.debugAabb = true;

// 启用相机拾取调试
window.Camera.debugPick = true;
```

### 2. 检查场景中的GLB模型
```javascript
// 检查场景中是否有GLB模型
const scene = window.scene;
const models = scene.getElementsByType('model');
console.log('场景中的GLB模型:', models);

// 检查每个模型的状态
models.forEach((model, index) => {
    console.log(`模型 ${index}:`, {
        filename: model.filename,
        visible: model.visible,
        entityEnabled: model.entity?.enabled,
        worldBound: model.worldBound,
        entityChildren: model.entity?.children?.length
    });
});
```

### 3. 测试点击拾取
加载GLB模型后，在视口中点击模型，观察控制台输出：
- 查看是否有 "🎯 GLB Picking Ray" 日志
- 查看是否有 "✅ GLB AABB Hit" 或其他命中日志
- 查看是否有 "🎯 DEBUG: Camera focal point picked" 日志

## 可能的问题和解决方案

### 问题1: GLB模型边界框计算错误
如果看到 "No mesh instances with aabb" 警告，说明模型的网格实例没有正确的边界框。

### 问题2: 拾取射线计算问题
检查屏幕坐标到世界坐标的转换是否正确。

### 问题3: 事件监听器问题
确保 'camera.focalPointPicked' 事件被正确监听。

### 问题4: 模型可见性问题
确保模型的 `visible` 属性为 `true` 且实体的 `enabled` 属性为 `true`。

## 临时修复方案

如果问题持续存在，可以尝试以下临时修复：

1. 重新加载GLB模型
2. 手动刷新模型的边界框
3. 检查模型的变换矩阵

## 报告问题时需要的信息

请提供以下调试信息：
1. 控制台中的所有相关日志
2. GLB模型的文件信息
3. 场景中其他元素的情况
4. 浏览器和操作系统版本