# GLB模型拾取测试指南

## 当前修复内容

1. **确保GLB模型默认可见**：在GltfModel构造函数中添加了`this.visible = true`
2. **增加调试信息**：在拾取过程中添加了详细的调试日志

## 测试步骤

### 1. 加载项目并添加GLB模型
1. 启动项目（解决PowerShell执行策略问题后运行 `npm run develop`）
2. 在浏览器中打开应用
3. 导入一个GLB模型文件

### 2. 检查GLB模型状态
在浏览器控制台中执行：
```javascript
// 检查场景中的模型
const models = window.scene.getElementsByType('model');
console.log('GLB模型数量:', models.length);
models.forEach((model, i) => {
    console.log(`模型 ${i}:`, {
        filename: model.filename,
        visible: model.visible,
        entityEnabled: model.entity?.enabled,
        worldBound: model.worldBound
    });
});
```

### 3. 测试拾取功能
1. 在视口中点击GLB模型
2. 观察控制台输出，应该看到：
   - "🎯 DEBUG: Pick attempt started"
   - "🎯 DEBUG: GLB models in scene"
   - "🔍 DEBUG: Checking GLB model"
   - "🔍 DEBUG: Testing model world bound"
   - "🔍 DEBUG: Ray-AABB intersection test"

### 4. 分析问题
如果仍然无法拾取GLB模型，检查：
1. 模型是否可见（`visible: true`）
2. 实体是否启用（`entityEnabled: true`）
3. 是否有世界边界（`worldBound` 不为 null）
4. 射线-AABB相交测试是否成功（`intersects: true`）

## 可能的问题和解决方案

### 问题1: 模型不可见
**症状**: `visible: false` 或 `entityEnabled: false`
**解决**: 手动设置可见性：
```javascript
models[0].visible = true;
```

### 问题2: 没有世界边界
**症状**: `worldBound: null`
**解决**: 可能是模型加载问题，尝试重新加载模型

### 问题3: 射线不相交
**症状**: `intersects: false`
**解决**: 可能是坐标转换问题或模型位置问题

### 问题4: 拾取后没有选中
**症状**: 有相交但没有触发选择
**解决**: 检查事件系统是否正常工作

## 关闭调试日志
测试完成后，可以在控制台中关闭调试：
```javascript
// 删除pick调试日志（需要修改代码）
```

## 报告问题
如果问题仍然存在，请提供：
1. 控制台中的完整日志
2. GLB模型文件信息
3. 浏览器和操作系统版本
4. 场景中其他元素的情况