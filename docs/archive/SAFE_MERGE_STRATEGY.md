# 安全合并策略 - 保护二次开发功能

## 策略概述

基于对现有自定义功能的分析，制定以下安全合并策略，确保GLB模型支持和巡检打点功能在合并官方更新时不受影响。

## 第一阶段：功能测试和验证

### 1.1 启动项目并测试现有功能
```bash
npm run develop
```

### 1.2 测试清单
- [ ] GLB模型导入功能
- [ ] GLB模型拾取（点击选择）
- [ ] 巡检菜单和添加巡检点功能
- [ ] 场景管理器中的巡检点位显示
- [ ] 巡检点位的复制、删除、显示/隐藏
- [ ] 属性面板中的巡检信息显示

## 第二阶段：选择性文件合并

### 2.1 安全文件（可直接合并）
这些文件不包含自定义功能，可以安全地接受官方更新：

- `README.md` - 接受官方版本
- `package.json` - 手动合并依赖项
- `package-lock.json` - 重新生成

### 2.2 需要保护的核心文件
这些文件包含重要的自定义功能，需要特殊处理：

#### 高风险文件（完全保护）
- `src/camera.ts` - 包含GLB拾取系统
- `src/editor.ts` - 包含巡检功能核心逻辑
- `src/gltf-model.ts` - GLB模型类定义
- `src/ui/splat-list.ts` - 巡检点位场景管理器
- `src/ui/properties-panel.ts` - 巡检属性面板

#### 中风险文件（选择性合并）
- `src/asset-loader.ts` - 需要同时支持GLB和LCC
- `src/ui/menu.ts` - 保护巡检菜单
- `src/ui/localization.ts` - 保护巡检相关翻译

### 2.3 新增文件（可能需要的官方功能）
- `src/lcc.ts` - LCC格式支持（如果存在）
- 其他新的工具类文件

## 第三阶段：分步骤合并实施

### 3.1 创建安全分支
```bash
git checkout -b safe-merge-v2.11.7
```

### 3.2 合并安全文件
```bash
# 合并README
git checkout upstream/main -- README.md

# 手动更新package.json（保留自定义依赖）
# 重新生成package-lock.json
npm install
```

### 3.3 选择性合并asset-loader.ts
策略：保留现有GLB加载逻辑，添加LCC支持
- 保留现有的`loadGltf`方法
- 添加官方的`loadLcc`方法
- 更新`loadModel`方法以支持两种格式

### 3.4 测试每个步骤
每次合并后都要测试：
```bash
npm run develop
# 测试所有自定义功能
```

## 第四阶段：冲突解决策略

### 4.1 asset-loader.ts冲突解决
```typescript
// 保留两套导入
import { GltfModel } from './gltf-model';
import { CompressInfo, deserializeFromLcc, LCC_LOD_MAX_SPLATS, LccUnitInfo, parseIndexBin, parseMeta } from './lcc';

// 保留现有loadGltf方法
async loadGltf(url: string, filename: string): Promise<GltfModel> {
    // 现有GLB加载逻辑
}

// 添加官方loadLcc方法
async loadLcc(url: string, filename: string): Promise<Splat> {
    // 官方LCC加载逻辑
}

// 更新loadModel方法
loadModel(url: string, filename: string) {
    if (filename.endsWith('.lcc')) {
        return this.loadLcc(url, filename);
    } else if (filename.endsWith('.gltf') || filename.endsWith('.glb')) {
        return this.loadGltf(url, filename);
    }
    // 其他格式处理
}
```

### 4.2 其他文件冲突处理原则
1. **优先保护自定义功能**
2. **添加而不是替换**
3. **保持向后兼容**

## 第五阶段：功能集成和测试

### 5.1 集成新功能
在确保自定义功能正常后，逐步集成官方新功能：
- LCC文件格式支持
- 性能优化
- 其他新特性

### 5.2 全面测试
- 自定义功能测试
- 新功能测试
- 兼容性测试

## 第六阶段：部署和备份

### 6.1 创建备份
```bash
git tag backup-before-merge-v2.11.7
```

### 6.2 合并到主分支
```bash
git checkout main
git merge safe-merge-v2.11.7
```

## 应急预案

### 如果合并失败
1. 回滚到备份标签
```bash
git reset --hard backup-before-merge-v2.11.7
```

2. 重新评估合并策略

### 如果功能损坏
1. 使用备份文档恢复功能
2. 参考`CUSTOM_FEATURES_BACKUP.md`
3. 逐个文件恢复

## 长期维护策略

### 1. 定期同步
- 每个官方版本发布后评估合并需求
- 优先保护自定义功能

### 2. 文档维护
- 更新自定义功能文档
- 记录每次合并的变更

### 3. 测试自动化
- 建立自定义功能的测试用例
- 确保每次更新后功能正常

## 总结

这个策略的核心原则是：
1. **安全第一** - 确保现有功能不受影响
2. **渐进式合并** - 分步骤、可回滚的合并过程
3. **充分测试** - 每个步骤都要验证功能完整性
4. **文档化** - 记录所有变更和决策

通过这个策略，我们可以在保护现有二次开发功能的同时，安全地集成官方的新功能和改进。