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

现在在视口中加载的 `.glb` / `.gltf` 模型支持直接单击选择：

- 单击模型：通过射线与模型包围盒 (AABB) 的最近交点进行拾取。
- 选中后：
   - 模型会加入高亮描边 (与 Splat 选中一致)。
   - 会弹出信息弹窗显示模型名称及可见性状态。
- 若点击空白区域且没有命中模型，将继续使用原有的 Splat 拾取逻辑。

实现要点：
1. 在 `camera.pickFocalPoint` 中优先做 GLB 包围盒射线检测，命中后立即触发 `camera.focalPointPicked` 事件并返回。
2. `selection.ts` 监听该事件并在用户交互时触发弹窗。
3. `outline.ts` 已扩展支持对模型 meshInstances 递归添加高亮层。

如需进一步扩展为精确 Mesh 三角面拾取，可在当前 AABB 粗测后加入网格级 BVH 或逐 meshInstance 射线检测。

### 物理射线拾取 (Physics Raycast Picking)

在支持并启用了 PlayCanvas 物理系统 (collision + rigidbody) 的情况下，系统会优先尝试基于刚体系统的射线拾取：

拾取顺序：
1. 物理射线 `rigidbody.raycastFirst` 命中带有 `pickable` 标签的实体（由 `GltfModel.setupPhysicsPicking()` 自动添加的盒体）
2. 若物理未命中或未启用：遍历所有 GLB 的世界包围盒 (AABB) 做最近交点测试
3. 若仍未命中：基于模型包围盒中心投影到屏幕的距离做近似挑选（像素半径阈值 25px）
4. 若仍无结果：回退到原有的 Splat 拾取流程

实现细节：
- `GltfModel` 构造时会尝试调用 `setupPhysicsPicking()` 创建一个名为 `__gltfCollider` 的子实体，添加 box `collision` + `kinematic` `rigidbody`，并打上 `pickable` 标签。
- `camera.pickFocalPoint` 最前加入对物理系统的安全 `try/catch` 射线检测，命中后直接触发选中事件并终止后续逻辑。
- 物理不可用（无系统或出错）时自动静默降级为 AABB + fallback。
- 模型通过 `move()` 方法更新变换时会自动同步 collider 的位置与尺寸（重新计算 worldBound）。

调试：
- 可使用事件开启或关闭调试日志（例如：`events.invoke('debug.pick.enable')`）。
- `GltfModel.debugAabb = true` 可输出包围盒计算细节。

注意：出于性能与通用性，目前物理 collider 采用模型整体包围盒，而非精确网格；若需要细粒度精确拾取，可扩展为多 collider 或引入 BVH。 
