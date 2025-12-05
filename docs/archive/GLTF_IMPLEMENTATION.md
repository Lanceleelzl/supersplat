# glTF/GLB Support Implementation

本实现为Supersplat项目添加了对glTF/GLB格式3D模型文件的支持。

## 新增功能

### 1. 文件类型支持
- 添加了对 `.gltf` 和 `.glb` 文件格式的支持
- 文件拖拽和文件选择器都已支持这些格式

### 2. 核心组件

#### GltfModel 类 (`src/gltf-model.ts`)
- 扩展了 `Element` 基类来管理glTF模型
- 提供模型的基本操作：添加、移除、销毁
- 实现世界边界框计算
- 支持序列化（用于保存/加载场景状态）

#### AssetLoader 扩展 (`src/asset-loader.ts`)
- 新增 `loadGltf()` 方法处理glTF/GLB文件加载
- 使用PlayCanvas的Container Asset系统
- 支持二进制GLB和文本GLTF格式
- 自动创建实体并添加到场景根节点

#### FileHandler 更新 (`src/file-handler.ts`)
- 在文件类型验证中添加了`.gltf`和`.glb`支持
- 更新了文件选择器的accept属性
- 修改了文件导入逻辑以处理glTF文件

## 使用方法

1. **拖拽导入**: 将glTF/GLB文件直接拖拽到编辑器窗口
2. **文件选择**: 使用文件选择器选择glTF/GLB文件
3. **场景操作**: 导入的模型将作为独立元素添加到场景中，可以进行变换操作

## 技术特性

- **完全集成**: glTF模型作为标准场景元素，与现有的Splat和其他元素无缝集成
- **边界框支持**: 自动计算模型的世界边界框，用于相机适配和选择
- **内存管理**: 正确的资源清理和销毁机制
- **错误处理**: 完善的错误处理和用户反馈

## 兼容性

- 支持glTF 2.0规范
- 兼容带嵌入资源的GLB格式
- 支持带外部引用的GLTF格式（纹理、几何等）
- 保持与现有Supersplat功能的完全兼容性

## 注意事项

- glTF模型将使用PlayCanvas的标准渲染管线，与Gaussian Splat的渲染方式不同
- 大型模型可能会影响性能，建议对复杂模型进行优化
- 动画和骨骼功能需要进一步的UI集成才能完全使用

## 文件结构

```
src/
├── gltf-model.ts       # glTF模型元素类
├── asset-loader.ts     # 资源加载器（已扩展）
└── file-handler.ts     # 文件处理器（已更新）
```