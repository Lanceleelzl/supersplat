import { Color, createGraphicsDevice } from 'playcanvas';

import { registerCameraPosesEvents } from './camera-poses';
import { registerDocEvents } from './doc';
import { EditHistory } from './edit-history';
import { registerEditorEvents } from './editor';
import { Events } from './events';
import { initFileHandler } from './file-handler';
import { registerPlySequenceEvents } from './ply-sequence';
import { registerPublishEvents } from './publish';
import { registerRenderEvents } from './render';
import { Scene } from './scene';
import { getSceneConfig } from './scene-config';
import { registerSelectionEvents } from './selection';
import { Shortcuts } from './shortcuts';
import { registerTimelineEvents } from './timeline';
import { BoxSelection } from './tools/box-selection';
import { BrushSelection } from './tools/brush-selection';
import { FloodSelection } from './tools/flood-selection';
import { LassoSelection } from './tools/lasso-selection';
import { MeasureTool } from './tools/measure-tool';
import { MoveTool } from './tools/move-tool';
import { PolygonSelection } from './tools/polygon-selection';
import { RectSelection } from './tools/rect-selection';
import { RotateTool } from './tools/rotate-tool';
import { ScaleTool } from './tools/scale-tool';
import { SphereSelection } from './tools/sphere-selection';
import { ToolManager } from './tools/tool-manager';
import { registerTransformHandlerEvents } from './transform-handler';
import { EditorUI } from './ui/editor';
import { ExcelExporter } from './ui/excel-exporter';
import { SnapshotView } from './ui/snapshot-view';


declare global {
    interface LaunchParams {
        readonly files: FileSystemFileHandle[];
    }

    interface Window {
        launchQueue: {
            setConsumer: (callback: (launchParams: LaunchParams) => void) => void;
        };
        scene: Scene;
    }
}

const getURLArgs = () => {
    // 从URL参数中提取配置设置
    const config = {};

    const apply = (key: string, value: string) => {
        let obj: any = config;
        key.split('.').forEach((k, i, a) => {
            if (i === a.length - 1) {
                obj[k] = value;
            } else {
                if (!obj.hasOwnProperty(k)) {
                    obj[k] = {};
                }
                obj = obj[k];
            }
        });
    };

    const params = new URLSearchParams(window.location.search.slice(1));
    params.forEach((value: string, key: string) => {
        apply(key, value);
    });

    return config;
};

const initShortcuts = (events: Events) => {
    // 初始化快捷键配置
    const shortcuts = new Shortcuts(events);

    shortcuts.register(['Delete', 'Backspace'], { event: 'select.delete' });  // 删除选中项
    shortcuts.register(['Escape'], { event: 'tool.deactivate' });  // 退出当前工具
    shortcuts.register(['Tab'], { event: 'selection.next' });  // 切换到下一个选择
    shortcuts.register(['1'], { event: 'tool.move', sticky: true });  // 移动工具
    shortcuts.register(['2'], { event: 'tool.rotate', sticky: true });  // 旋转工具
    shortcuts.register(['3'], { event: 'tool.scale', sticky: true });  // 缩放工具
    shortcuts.register(['G', 'g'], { event: 'grid.toggleVisible' });  // 切换网格显示
    shortcuts.register(['C', 'c'], { event: 'tool.toggleCoordSpace' });  // 切换坐标空间
    shortcuts.register(['F', 'f'], { event: 'camera.focus' });  // 相机聚焦
    shortcuts.register(['R', 'r'], { event: 'tool.rectSelection', sticky: true });  // 矩形选择
    shortcuts.register(['P', 'p'], { event: 'tool.polygonSelection', sticky: true });  // 多边形选择
    shortcuts.register(['L', 'l'], { event: 'tool.lassoSelection', sticky: true });  // 套索选择
    shortcuts.register(['B', 'b'], { event: 'tool.brushSelection', sticky: true });  // 笔刷选择
    shortcuts.register(['O', 'o'], { event: 'tool.floodSelection', sticky: true });  // 洪水选择工具
    shortcuts.register(['A', 'a'], { event: 'select.all', ctrl: true });  // 全选
    shortcuts.register(['A', 'a'], { event: 'select.none', shift: true });  // 取消选择
    shortcuts.register(['I', 'i'], { event: 'select.invert', ctrl: true });  // 反选
    shortcuts.register(['H', 'h'], { event: 'select.hide' });  // 隐藏选中项
    shortcuts.register(['U', 'u'], { event: 'select.unhide' });  // 显示隐藏项
    shortcuts.register(['['], { event: 'tool.brushSelection.smaller' });  // 缩小笔刷
    shortcuts.register([']'], { event: 'tool.brushSelection.bigger' });  // 放大笔刷
    shortcuts.register(['Z', 'z'], { event: 'edit.undo', ctrl: true, capture: true });  // 撤销
    shortcuts.register(['Z', 'z'], { event: 'edit.redo', ctrl: true, shift: true, capture: true });  // 重做
    shortcuts.register(['M', 'm'], { event: 'camera.toggleMode' });  // 切换相机模式
    shortcuts.register(['D', 'd'], { event: 'dataPanel.toggle' });  // 切换数据面板
    shortcuts.register([' '], { event: 'camera.toggleOverlay' });  // 切换覆盖层

    return shortcuts;
};

const main = async () => {
    // 根事件对象
    const events = new Events();

    // 当前页面URL
    const url = new URL(window.location.href);

    // 编辑历史管理器
    const editHistory = new EditHistory(events);

    // 编辑器用户界面
    const editorUI = new EditorUI(events);

    // 创建图形设备
    const graphicsDevice = await createGraphicsDevice(editorUI.canvas, {
        deviceTypes: ['webgl2'],
        antialias: false,
        depth: false,
        stencil: false,
        xrCompatible: false,
        powerPreference: 'high-performance'
    });

    const overrides = [
        getURLArgs()
    ];

    // 解析场景配置
    const sceneConfig = getSceneConfig(overrides);

    // 构建场景管理器
    const scene = new Scene(
        events,
        sceneConfig,
        editorUI.canvas,
        graphicsDevice
    );

    // 颜色管理
    const bgClr = new Color();
    const selectedClr = new Color();
    const unselectedClr = new Color();
    const lockedClr = new Color();

    const setClr = (target: Color, value: Color, event: string) => {
        if (!target.equals(value)) {
            target.copy(value);
            events.fire(event, target);
        }
    };

    const setBgClr = (clr: Color) => {
        setClr(bgClr, clr, 'bgClr');
    };
    const setSelectedClr = (clr: Color) => {
        setClr(selectedClr, clr, 'selectedClr');
    };
    const setUnselectedClr = (clr: Color) => {
        setClr(unselectedClr, clr, 'unselectedClr');
    };
    const setLockedClr = (clr: Color) => {
        setClr(lockedClr, clr, 'lockedClr');
    };

    events.on('setBgClr', (clr: Color) => {
        setBgClr(clr);
    });
    events.on('setSelectedClr', (clr: Color) => {
        setSelectedClr(clr);
    });
    events.on('setUnselectedClr', (clr: Color) => {
        setUnselectedClr(clr);
    });
    events.on('setLockedClr', (clr: Color) => {
        setLockedClr(clr);
    });

    events.function('bgClr', () => {
        return bgClr;
    });
    events.function('selectedClr', () => {
        return selectedClr;
    });
    events.function('unselectedClr', () => {
        return unselectedClr;
    });
    events.function('lockedClr', () => {
        return lockedClr;
    });

    events.on('bgClr', (clr: Color) => {
        if (!clr) {
            console.warn('bgClr event received undefined color');
            return;
        }
        const cnv = (v: number) => `${Math.max(0, Math.min(255, (v * 255))).toFixed(0)}`;
        document.body.style.backgroundColor = `rgba(${cnv(clr.r)},${cnv(clr.g)},${cnv(clr.b)},1)`;
    });
    events.on('selectedClr', (_clr: Color) => {
        scene.forceRender = true;
    });
    events.on('unselectedClr', (_clr: Color) => {
        scene.forceRender = true;
    });
    events.on('lockedClr', (_clr: Color) => {
        scene.forceRender = true;
    });

    // 从应用配置初始化颜色
    const toColor = (value: { r: number, g: number, b: number, a: number } | undefined) => {
        if (!value) {
            console.warn('toColor 接收到未定义的值，使用默认颜色');
            return new Color(1, 1, 1, 1); // 默认白色
        }
        if (typeof value.r !== 'number' || typeof value.g !== 'number' ||
            typeof value.b !== 'number' || typeof value.a !== 'number') {
            console.warn('toColor 接收到无效的颜色值:', value);
            return new Color(1, 1, 1, 1); // 默认白色
        }
        return new Color(value.r, value.g, value.b, value.a);
    };
    setBgClr(toColor(sceneConfig.bgClr));
    setSelectedClr(toColor(sceneConfig.selectedClr));
    setUnselectedClr(toColor(sceneConfig.unselectedClr));
    setLockedClr(toColor(sceneConfig.lockedClr));

    // 初始化轮廓选择
    events.fire('view.setOutlineSelection', sceneConfig.show.outlineSelection);

    // 创建遮罩选择画布
    const maskCanvas = document.createElement('canvas');
    const maskContext = maskCanvas.getContext('2d');
    maskCanvas.setAttribute('id', 'mask-canvas');
    maskContext.globalCompositeOperation = 'copy';

    const mask = {
        canvas: maskCanvas,
        context: maskContext
    };

    // 工具管理器
    const toolManager = new ToolManager(events);
    toolManager.register('rectSelection', new RectSelection(events, editorUI.toolsContainer.dom));
    toolManager.register('brushSelection', new BrushSelection(events, editorUI.toolsContainer.dom, mask));
    toolManager.register('floodSelection', new FloodSelection(events, editorUI.toolsContainer.dom, mask, editorUI.canvasContainer));
    toolManager.register('polygonSelection', new PolygonSelection(events, editorUI.toolsContainer.dom, mask));
    toolManager.register('lassoSelection', new LassoSelection(events, editorUI.toolsContainer.dom, mask));
    toolManager.register('sphereSelection', new SphereSelection(events, scene, editorUI.canvasContainer));
    toolManager.register('boxSelection', new BoxSelection(events, scene, editorUI.canvasContainer));
    toolManager.register('move', new MoveTool(events, scene));
    toolManager.register('rotate', new RotateTool(events, scene));
    toolManager.register('scale', new ScaleTool(events, scene));
    toolManager.register('measure', new MeasureTool(events, scene, editorUI.toolsContainer.dom, editorUI.canvasContainer));

    editorUI.toolsContainer.dom.appendChild(maskCanvas);

    window.scene = scene;

    registerEditorEvents(events, editHistory, scene);
    registerSelectionEvents(events, scene);
    registerTimelineEvents(events);
    registerCameraPosesEvents(events);
    registerTransformHandlerEvents(events);
    registerPlySequenceEvents(events);
    registerPublishEvents(events);
    registerDocEvents(scene, events);
    registerRenderEvents(scene, events);
    initShortcuts(events);

    // 初始化Excel导出器
    const excelExporter = new ExcelExporter(events);

    // 初始化文件处理器
    initFileHandler(scene, events, editorUI.appContainer.dom);

    // 加载异步模型
    scene.start();

    // 创建单一的快照窗口（在scene启动后）
    const snapshotView = new SnapshotView(events, scene, editorUI.tooltips);
    editorUI.canvasContainer.append(snapshotView);
    snapshotView.hide(); // 默认隐藏

    // 设置固定位置
    snapshotView.element.style.position = 'absolute';
    snapshotView.element.style.left = '320px';
    snapshotView.element.style.top = '120px';

    // 快照预览开关状态
    let snapshotPreviewEnabled = false;
    // 属性预览开关状态 - 默认关闭
    let attributePreviewEnabled = false;
    // 视椎体开关状态 - 默认开启
    let frustumEnabled = true;

    // 添加获取快照预览状态的事件处理器
    events.function('snapshot.isEnabled', () => {
        return snapshotPreviewEnabled;
    });

    // 添加获取属性预览状态的事件处理器
    events.function('attribute.isEnabled', () => {
        return attributePreviewEnabled;
    });

    // 添加获取视椎体状态的事件处理器
    events.function('frustum.isEnabled', () => {
        return frustumEnabled;
    });

    // 监听快照预览开关切换
    events.on('snapshot.toggle', () => {
        snapshotPreviewEnabled = !snapshotPreviewEnabled;

        // 同步菜单显示状态
        editorUI.menu.updateSnapshotPreviewStatus(snapshotPreviewEnabled);

        if (!snapshotPreviewEnabled) {
            snapshotView.hide();
        }
    });

    // 监听视椎体开关切换
    events.on('frustum.toggle', () => {
        frustumEnabled = !frustumEnabled;

        // 同步菜单显示状态
        editorUI.menu.updateFrustumStatus(frustumEnabled);

        // 关闭时强制隐藏视椎体
        if (!frustumEnabled) {
            if (scene.cameraFrustumVisualizer) {
                scene.cameraFrustumVisualizer.hide();
            }
        } else {
            // 打开时由snapshot-view根据当前上下文（选中/面板状态）决定是否显示
            // 这里无需强制展示，避免不必要的UI跳动
        }
    });

    // 监听属性预览开关切换
    events.on('attribute.toggle', () => {
        attributePreviewEnabled = !attributePreviewEnabled;

        // 同步菜单显示状态
        editorUI.menu.updateAttributePreviewStatus(attributePreviewEnabled);

        // 触发属性面板的状态更新事件，使用不同的事件名避免循环
        events.fire('attribute.statusChanged', attributePreviewEnabled);
    });

    // 初始化时同步菜单状态
    setTimeout(() => {
        editorUI.menu.updateAttributePreviewStatus(attributePreviewEnabled);
        editorUI.menu.updateSnapshotPreviewStatus(snapshotPreviewEnabled);
        editorUI.menu.updateFrustumStatus(frustumEnabled);
    }, 100);

    // 监听marker选择事件
    events.on('marker.selected', (model: any) => {
        // 只有开启快照预览时才显示窗口和视椎体
        if (snapshotPreviewEnabled) {
            snapshotView.show();
        }
    });

    // 监听视口点击GLB模型事件，转换为marker选择
    events.on('camera.focalPointPicked', (data: any) => {
        // 处理巡检模型的快照预览功能
        if (data.model && (data.model as any).isInspectionModel) {
            if (snapshotPreviewEnabled) {
                // 触发marker选择事件，统一处理逻辑
                events.fire('marker.selected', data.model);
            }
        }

        // 属性预览功能对所有模型都生效，不仅限于巡检模型
        if (data.model && attributePreviewEnabled) {
            // 属性面板的显示逻辑已经在PropertiesPanel中处理
            // 这里不需要额外的处理，因为PropertiesPanel已经监听了camera.focalPointPicked事件
        }
    });

    // 监听快照窗口关闭事件
    events.on('snapshot.close', () => {
        snapshotView.hide();
    });

    // 处理加载参数
    const loadList = url.searchParams.getAll('load');
    for (const value of loadList) {
        const decoded = decodeURIComponent(value);
        await events.invoke('import', [{
            filename: decoded.split('/').pop(),
            url: decoded
        }]);
    }

    // 在PWA模式下处理基于系统的文件关联
    if ('launchQueue' in window) {
        window.launchQueue.setConsumer(async (launchParams: LaunchParams) => {
            for (const file of launchParams.files) {
                await events.invoke('import', [{
                    filename: file.name,
                    contents: await file.getFile()
                }]);
            }
        });
    }
};

export { main };
