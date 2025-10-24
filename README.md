# SuperSplat - 3D Gaussian Splat Editor

[![Github Release](https://img.shields.io/github/v/release/playcanvas/supersplat)](https://github.com/playcanvas/supersplat/releases)
[![License](https://img.shields.io/github/license/playcanvas/supersplat)](https://github.com/playcanvas/supersplat/blob/main/LICENSE)
[![Discord](https://img.shields.io/badge/Discord-5865F2?style=flat&logo=discord&logoColor=white&color=black)](https://discord.gg/RSaMRzg)
[![Reddit](https://img.shields.io/badge/Reddit-FF4500?style=flat&logo=reddit&logoColor=white&color=black)](https://www.reddit.com/r/PlayCanvas)
[![X](https://img.shields.io/badge/X-000000?style=flat&logo=x&logoColor=white&color=black)](https://x.com/intent/follow?screen_name=playcanvas)

| [SuperSplat Editor](https://superspl.at/editor) | [User Guide](https://developer.playcanvas.com/user-manual/gaussian-splatting/editing/supersplat/) | [Blog](https://blog.playcanvas.com) | [Forum](https://forum.playcanvas.com) |

SuperSplat is a free and open source tool for inspecting, editing, optimizing and publishing 3D Gaussian Splats. It is built on web technologies and runs in the browser, so there's nothing to download or install.

A live version of this tool is available at: https://superspl.at/editor

![image](https://github.com/user-attachments/assets/b6cbb5cc-d3cc-4385-8c71-ab2807fd4fba)

To learn more about using SuperSplat, please refer to the [User Guide](https://developer.playcanvas.com/user-manual/gaussian-splatting/editing/supersplat/).

## Local Development

To initialize a local development environment for SuperSplat, ensure you have [Node.js](https://nodejs.org/) 18 or later installed. Follow these steps:

1. Clone the repository:

   ```sh
   git clone https://github.com/playcanvas/supersplat.git
   cd supersplat
   ```

2. Install dependencies:

   ```sh
   npm install
   ```

3. Build SuperSplat and start a local web server:

   ```sh
   npm run develop
   ```

4. Open a web browser tab and make sure network caching is disabled on the network tab and the other application caches are clear:

   - On Safari you can use `Cmd+Option+e` or Develop->Empty Caches.
   - On Chrome ensure the options "Update on reload" and "Bypass for network" are enabled in the Application->Service workers tab:

   <img width="846" alt="Screenshot 2025-04-25 at 16 53 37" src="https://github.com/user-attachments/assets/888bac6c-25c1-4813-b5b6-4beecf437ac9" />

5. Navigate to `http://localhost:3000`

When changes to the source are detected, SuperSplat is rebuilt automatically. Simply refresh your browser to see your changes.

## Contributors

SuperSplat is made possible by our amazing open source community:

<a href="https://github.com/playcanvas/supersplat/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=playcanvas/supersplat" />
</a>

## GLB / glTF 模型点击选中 (Click Selection)

特性说明：
- 支持对已加载的 `.glb` / `.gltf` 模型进行点击选中与高亮显示。
- 点击空白区域时自动回退到点云（Splat）拾取逻辑。
- 选中后显示基本信息（名称、可见性）并与相关 UI 面板联动。

### 物理射线拾取 (Physics Raycast Picking)

- 拾取优先级：物理射线 → AABB 包围盒 → 点云 Splat。
- 性能与通用性权衡：默认采用整体包围盒近似，不做精确网格级拾取。
## 巡检模块（Inspection）

- 顶部“巡检”菜单：一键添加巡检点，自动命名并定位到当前相机位置。
- 场景管理器：以层级展示巡检点及其标记，支持显隐、选择、原位复制、删除、重命名。
- 导出：通过“导出巡检参数”面板一次性导出点位信息、位置坐标、云台参数与快照设置。
## 视图控制（View Control）

- 视图模式：支持透视与六向正视图的自由切换。
- 正视视图：限制旋转，仅允许平移与缩放，便于正交观察与标注。
- 视图选项：快速调整背景与选中颜色、FoV、SH Bands、点大小、网格/边界显示、相机速度、高精度渲染。
- 右侧联动：右侧“视图模式”子菜单与“设置”面板保持一致的右侧间距，样式扁平化无阴影。
## 二次功能开发更新

- 右侧视图模式子菜单与“设置”面板保持一致的右侧间距，样式扁平无阴影。
- 构建阶段过滤第三方库的循环依赖警告（如 mediabunny），清理日志不影响功能与输出。