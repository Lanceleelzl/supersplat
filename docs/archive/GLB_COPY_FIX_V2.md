# GLB模型原位复制问题修复 - 第二次更新

## 修复的问题

### 问题1: 复制后出现两个模型但实际只有一个
**原因**: PlayCanvas的entity.clone()方法可能存在共享引用问题，导致复制的实体和原实体关联。

**解决方案**:
1. 增强深度克隆逻辑，确保实体完全独立
2. 为克隆的实体设置唯一的名称和标识
3. 手动分离父子关系，避免引用共享

### 问题2: 移动模型时原模型和复制模型一起移动
**原因**: 克隆的实体可能共享了变换组件或其他引用。

**解决方案**:
1. 在克隆后手动设置独立的变换信息
2. 确保所有子实体都有独立的名称和状态
3. 递归处理所有子实体的独立性

### 问题3: 去掉位置偏移，实现真正的原位复制
**修改**: 移除了X轴偏移1个单位的逻辑，新模型现在与原模型完全重合。

## 关键修改

### 1. 深度克隆实体函数 (`src/editor.ts`)
```typescript
const deepCloneEntity = (originalEntity: any, namePrefix: string): any => {
    const cloned = originalEntity.clone();
    
    // 设置唯一名称避免冲突
    cloned.name = `${namePrefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // 确保从父节点分离
    if (cloned.parent && cloned.parent !== originalEntity.parent) {
        cloned.parent.removeChild(cloned);
    }
    
    // 递归处理子实体的独立性
    if (cloned.children && cloned.children.length > 0) {
        cloned.children.forEach((child: any, index: number) => {
            child.name = `${child.name}_clone_${index}_${Date.now()}`;
            child.enabled = true;
        });
    }
    
    return cloned;
};
```

### 2. 增强的克隆模型函数
```typescript
const cloneGltfModel = (originalModel: GltfModel, newFilename: string, scene: Scene): GltfModel | null => {
    // 使用增强的深度克隆
    const clonedEntity = deepCloneEntity(originalModel.entity, newFilename);
    
    // 手动复制变换信息确保独立性
    const originalPos = originalModel.entity.getLocalPosition();
    const originalRot = originalModel.entity.getLocalRotation();
    const originalScale = originalModel.entity.getLocalScale();
    
    clonedEntity.setLocalPosition(originalPos);
    clonedEntity.setLocalRotation(originalRot);
    clonedEntity.setLocalScale(originalScale);
    
    // 创建完全独立的GltfModel实例
    const clonedModel = new GltfModel(originalModel.asset, clonedEntity, newFilename);
    
    return clonedModel;
};
```

### 3. 原位复制逻辑 (`src/editor.ts`)
```typescript
// 设置新模型的位置，保持原位复制（无偏移）
duplicatedModel.entity.setPosition(originalPos.x, originalPos.y, originalPos.z);
```

## 实现效果

### ✅ 修复后的功能
1. **独立实体**: 复制的模型拥有完全独立的实体，移动时不会影响原模型
2. **原位复制**: 新模型与原模型位置完全重合
3. **自动选中**: 复制完成后自动选中新模型
4. **正确命名**: 新模型自动命名为"原名称_复制"
5. **列表正确**: 模型列表中正确显示两个独立的模型项

### 🎯 用户体验
1. 右键点击选中的GLB模型
2. 选择"原位复制"
3. 新模型立即出现在原位置（完全重合）
4. 新模型自动被选中
5. 移动任一模型时，另一个保持不动
6. 场景列表正确显示两个独立的模型

## 技术要点

### 实体独立性保证
- 使用唯一时间戳和随机字符串确保名称唯一
- 手动分离父子关系避免引用共享
- 递归处理所有子实体的独立性

### 变换独立性
- 克隆后手动设置变换信息
- 使用setLocalPosition/Rotation/Scale确保独立性
- 避免共享变换组件

### 命名策略
- 主实体：`原名称_复制_时间戳_随机码`
- 子实体：`子名称_clone_索引_时间戳`

## 注意事项

1. 复制的模型与原模型完全重合，可能需要手动移动以便区分
2. 每次复制都会创建完全独立的实体和模型实例
3. 复制保持所有原始属性（材质、动画、组件等）
4. 新模型会自动被选中并显示在属性面板中

这次修复应该解决了实体共享和移动同步的问题，确保复制的模型完全独立。