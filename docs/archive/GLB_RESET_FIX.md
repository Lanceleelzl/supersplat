# GLB模型重置修复

## 问题描述
在场景管理器中执行重置操作时，已加载的glTF/GLB模型没有被正确清除，只有splat文件被清除了。

## 根本原因
1. `scene.clear()` 方法只清除了 `ElementType.splat` 类型的元素，忽略了 `ElementType.model` 类型的GLB模型
2. `scene.empty()` 函数只检查splats的数量，没有考虑GLB模型的存在

## 修复内容

### 1. 修复 scene.clear() 方法 (src/scene.ts)
```typescript
// 修复前
clear() {
    const splats = this.getElementsByType(ElementType.splat);
    splats.forEach((splat) => {
        this.remove(splat);
        (splat as Splat).destroy();
    });
}

// 修复后
clear() {
    // Clear all splats
    const splats = this.getElementsByType(ElementType.splat);
    splats.forEach((splat) => {
        this.remove(splat);
        (splat as Splat).destroy();
    });

    // Clear all GLB models
    const models = this.getElementsByType(ElementType.model);
    models.forEach((model) => {
        this.remove(model);
        model.destroy();
    });
}
```

### 2. 修复 scene.empty() 函数 (src/file-handler.ts)
```typescript
// 修复前
events.function('scene.empty', () => {
    return getSplats().length === 0;
});

// 修复后
events.function('scene.empty', () => {
    const splats = getSplats();
    const models = scene.getElementsByType(ElementType.model);
    return splats.length === 0 && models.length === 0;
});
```

## 影响范围
- 场景重置功能现在会正确清除所有GLB模型
- 新建场景功能会正确清除所有GLB模型
- 场景空状态检查现在考虑GLB模型
- 文档加载时的重置确认对话框现在能正确识别GLB模型的存在

## 测试建议
1. 加载一个或多个GLB模型到场景中
2. 使用菜单中的"重置场景"功能
3. 验证所有GLB模型都被正确清除
4. 验证在有GLB模型时，系统不会认为场景是空的

## 相关文件
- `src/scene.ts` - 场景清理方法
- `src/file-handler.ts` - 场景状态检查
- `src/doc.ts` - 文档重置逻辑
- `src/gltf-model.ts` - GLB模型销毁方法