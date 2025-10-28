import {
    EVENT_POSTRENDER_LAYER,
    EVENT_PRERENDER_LAYER,
    LAYERID_DEPTH,
    SORTMODE_NONE,
    BoundingBox,
    CameraComponent,
    Color,
    Entity,
    Layer,
    GraphicsDevice
} from 'playcanvas';

import { AssetLoader } from './asset-loader';
import { Camera } from './camera';
import { CameraFrustumVisualizer } from './camera-frustum-visualizer';
import { DataProcessor } from './data-processor';
import { Element, ElementType, ElementTypeList } from './element';
import { Events } from './events';
import { GltfModel } from './gltf-model';
import { InfiniteGrid as Grid } from './infinite-grid';
import { Outline } from './outline';
import { PCApp } from './pc-app';
import { SceneConfig } from './scene-config';
import { SceneState } from './scene-state';
import { Splat } from './splat';
import { SplatOverlay } from './splat-overlay';
import { Underlay } from './underlay';

// 场景管理类，负责管理3D场景中的所有元素
class Scene {
    events: Events;
    config: SceneConfig;
    canvas: HTMLCanvasElement;
    app: PCApp;
    backgroundLayer: Layer;  // 背景层
    shadowLayer: Layer;      // 阴影层
    debugLayer: Layer;       // 调试层
    overlayLayer: Layer;     // 覆盖层
    gizmoLayer: Layer;       // 小工具层
    snapshotLayer: Layer;    // 快照世界层（仅快照相机渲染）
    sceneState = [new SceneState(), new SceneState()];  // 场景状态缓存
    elements: Element[] = [];  // 场景元素列表
    boundStorage = new BoundingBox();  // 边界框存储
    boundDirty = true;       // 边界框是否需要更新
    forceRender = false;     // 强制渲染标志

    lockedRenderMode = false;  // 锁定渲染模式
    lockedRender = false;      // 锁定渲染

    canvasResize: {width: number; height: number} | null = null;
    targetSize = {
        width: 0,
        height: 0
    };

    dataProcessor: DataProcessor;
    assetLoader: AssetLoader;
    camera: Camera;
    cameraFrustumVisualizer: CameraFrustumVisualizer;
    splatOverlay: SplatOverlay;
    grid: Grid;
    outline: Outline;
    underlay: Underlay;

    contentRoot: Entity;
    cameraRoot: Entity;

    // 巡检点位管理
    inspectionPoints: Map<string, {
        models: GltfModel[],
        position: any,
        cameraParams?: {
            position: { x: number, y: number, z: number },
            target: { x: number, y: number, z: number },
            fov: number,
            nearClip: number,
            farClip: number,
            aperture: number,
            sensitivity: number,
            shutter: number,
            toneMapping: number,
            timestamp: number
        }
    }>;

    constructor(
        events: Events,
        config: SceneConfig,
        canvas: HTMLCanvasElement,
        graphicsDevice: GraphicsDevice
    ) {
        this.events = events;
        this.config = config;
        this.canvas = canvas;

        // 初始化巡检点位管理
        this.inspectionPoints = new Map();

        // 配置PlayCanvas应用程序。我们渲染到离屏缓冲区，因此只需要最简单的后缓冲区
        this.app = new PCApp(canvas, { graphicsDevice });

        // 仅在指令下渲染场景
        this.app.autoRender = false;
        // @ts-ignore
        this.app._allowResize = false;
        // 禁用集群光照以避免渲染错误
        this.app.scene.clusteredLightingEnabled = false;

        // 临时方案：禁用光照映射器的首次烘焙，直到我们提供相关选项
        // @ts-ignore
        this.app.off('prerender', this.app._firstBake, this.app);

        // @ts-ignore
        this.app.loader.getHandler('texture').imgParser.crossOrigin = 'anonymous';

        // 这是获取全分辨率AR模式后缓冲区所必需的
        this.app.graphicsDevice.maxPixelRatio = window.devicePixelRatio;

        // 配置应用程序画布
        const observer = new ResizeObserver((entries: ResizeObserverEntry[]) => {
            if (entries.length > 0) {
                const entry = entries[0];
                if (entry) {
                    if (entry.devicePixelContentBoxSize) {
                        // 在非Safari浏览器上，我们获得像素完美的画布尺寸
                        this.canvasResize = {
                            width: entry.devicePixelContentBoxSize[0].inlineSize,
                            height: entry.devicePixelContentBoxSize[0].blockSize
                        };
                    } else if (entry.contentBoxSize.length > 0) {
                        // 在Safari浏览器上，我们必须自己从CSS尺寸计算像素尺寸
                        // 并希望浏览器执行相同的计算
                        const pixelRatio = window.devicePixelRatio;
                        this.canvasResize = {
                            width: Math.ceil(entry.contentBoxSize[0].inlineSize * pixelRatio),
                            height: Math.ceil(entry.contentBoxSize[0].blockSize * pixelRatio)
                        };
                    }
                }
                this.forceRender = true;
            }
        });

        observer.observe(window.document.getElementById('canvas-container'));

        // configure depth layers to handle dynamic refraction
        const depthLayer = this.app.scene.layers.getLayerById(LAYERID_DEPTH);
        this.app.scene.layers.remove(depthLayer);
        this.app.scene.layers.insertOpaque(depthLayer, 2);

        // register application callbacks
        this.app.on('update', (deltaTime: number) => this.onUpdate(deltaTime));
        this.app.on('prerender', () => this.onPreRender());
        this.app.on('postrender', () => this.onPostRender());

        // force render on device restored
        this.app.graphicsDevice.on('devicerestored', () => {
            this.forceRender = true;
        });

        // fire pre and post render events on the camera
        this.app.scene.on(EVENT_PRERENDER_LAYER, (camera: CameraComponent, layer: Layer, transparent: boolean) => {
            camera.fire('preRenderLayer', layer, transparent);
        });

        this.app.scene.on(EVENT_POSTRENDER_LAYER, (camera: CameraComponent, layer: Layer, transparent: boolean) => {
            camera.fire('postRenderLayer', layer, transparent);
        });

        // background layer
        this.backgroundLayer = new Layer({
            enabled: true,
            name: 'Background Layer',
            opaqueSortMode: SORTMODE_NONE,
            transparentSortMode: SORTMODE_NONE
        });

        // shadow layer
        // this layer contains shadow caster scene mesh instances, shadow-casting
        // virtual light, shadow catching plane geometry and the main camera.
        this.shadowLayer = new Layer({
            name: 'Shadow Layer'
        });

        // debug layer
        this.debugLayer = new Layer({
            enabled: true,
            name: 'Debug Layer',
            opaqueSortMode: SORTMODE_NONE,
            transparentSortMode: SORTMODE_NONE
        });

        // overlay layer
        this.overlayLayer = new Layer({
            name: 'Overlay',
            clearDepthBuffer: false,
            opaqueSortMode: SORTMODE_NONE,
            transparentSortMode: SORTMODE_NONE
        });

        // gizmo layer
        this.gizmoLayer = new Layer({
            name: 'Gizmo',
            clearDepthBuffer: true,
            opaqueSortMode: SORTMODE_NONE,
            transparentSortMode: SORTMODE_NONE
        });

        // snapshot layer（与 World 解耦，专供快照相机使用）
        this.snapshotLayer = new Layer({
            enabled: true,
            name: 'Snapshot World',
            opaqueSortMode: SORTMODE_NONE,
            transparentSortMode: SORTMODE_NONE
        });

        const layers = this.app.scene.layers;
        const worldLayer = layers.getLayerByName('World');
        const idx = layers.getOpaqueIndex(worldLayer);
        layers.insert(this.backgroundLayer, idx);
        layers.insert(this.shadowLayer, idx + 1);
        layers.insert(this.debugLayer, idx + 1);
        // 将 Snapshot World 插入在 World 层前，排序独立；仅快照相机会使用它
        layers.insert(this.snapshotLayer, idx);
        layers.push(this.overlayLayer);
        layers.push(this.gizmoLayer);

        this.dataProcessor = new DataProcessor(this.app.graphicsDevice);
        this.assetLoader = new AssetLoader(this.app, events, this.app.graphicsDevice.maxAnisotropy);

        // create root entities
        this.contentRoot = new Entity('contentRoot');
        this.app.root.addChild(this.contentRoot);

        this.cameraRoot = new Entity('cameraRoot');
        this.app.root.addChild(this.cameraRoot);

        // create elements
        this.camera = new Camera();
        this.add(this.camera);

        this.cameraFrustumVisualizer = new CameraFrustumVisualizer();
        this.add(this.cameraFrustumVisualizer);

        this.splatOverlay = new SplatOverlay();
        this.add(this.splatOverlay);

        this.grid = new Grid();
        this.add(this.grid);

        this.outline = new Outline();
        this.add(this.outline);
        this.underlay = new Underlay();
        this.add(this.underlay);

        // 添加场景光照以支持GLB模型渲染
        this.setupSceneLighting();
    }

    // 设置场景光照
    private setupSceneLighting() {
        // 设置环境光，提供基础照明
        this.app.scene.ambientLight.set(0.4, 0.4, 0.5);

        // 添加一个主方向光，模拟太阳光
        const lightEntity = new Entity('DirectionalLight');
        lightEntity.addComponent('light', {
            type: 'directional',
            color: new Color(1.0, 0.95, 0.8), // 暖白色
            intensity: 1.2,
            castShadows: false, // 暂时禁用阴影避免渲染问题
            shadowDistance: 50,
            shadowResolution: 1024
        });

        // 设置光源方向（从右上方照射）
        lightEntity.setEulerAngles(45, 30, 0);

        // 将光源添加到场景
        this.app.root.addChild(lightEntity);
    }

    start() {
        // start the app
        this.app.start();

        // 触发scene启动事件
        this.events.fire('scene.started');
    }

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

    // add a scene element
    add(element: Element) {
        if (!element.scene) {
            // add the new element
            element.scene = this;
            element.add();
            this.elements.push(element);

            // mark scene bound as dirty when adding new elements
            this.boundDirty = true;

            // notify all elements of scene addition
            this.forEachElement(e => e !== element && e.onAdded(element));

            // notify listeners
            this.events.fire('scene.elementAdded', element);
        }
    }

    // remove an element from the scene
    remove(element: Element) {
        if (element.scene === this) {
            // remove from list
            this.elements.splice(this.elements.indexOf(element), 1);

            // mark scene bound as dirty when removing elements
            this.boundDirty = true;

            // notify listeners
            this.events.fire('scene.elementRemoved', element);

            // notify all elements of scene removal
            this.forEachElement(e => e.onRemoved(element));

            element.remove();
            element.scene = null;
        }
    }

    // get the scene bound
    get bound() {
        if (this.boundDirty) {
            let valid = false;
            this.forEachElement((e) => {
                const bound = e.worldBound;
                if (bound) {
                    if (!valid) {
                        valid = true;
                        this.boundStorage.copy(bound);
                    } else {
                        this.boundStorage.add(bound);
                    }
                }
            });

            this.boundDirty = false;
            this.events.fire('scene.boundChanged', this.boundStorage);
        }

        return this.boundStorage;
    }

    getElementsByType(elementType: ElementType) {
        return this.elements.filter(e => e.type === elementType);
    }

    get graphicsDevice() {
        return this.app.graphicsDevice;
    }

    private forEachElement(action: (e: Element) => void) {
        this.elements.forEach(action);
    }

    private onUpdate(deltaTime: number) {
        // allow elements to update
        this.forEachElement(e => e.onUpdate(deltaTime));

        // fire global update
        this.events.fire('update', deltaTime);

        // fire a 'serialize' event which listers will use to store their state. we'll use
        // this to decide if the view has changed and so requires rendering.
        const i = this.app.frame % 2;
        const state = this.sceneState[i];
        state.reset();
        this.forEachElement(e => state.pack(e));

        // diff with previous state
        const result = state.compare(this.sceneState[1 - i]);

        // generate the set of all element types that changed
        const all = new Set([...result.added, ...result.removed, ...result.moved, ...result.changed]);

        // compare with previously serialized
        if (this.lockedRenderMode) {
            this.app.renderNextFrame = this.lockedRender;
            this.lockedRender = false;
        } else if (!this.app.renderNextFrame) {
            this.app.renderNextFrame = this.forceRender || all.size > 0;
        }
        this.forceRender = false;

        // raise per-type update events
        ElementTypeList.forEach((type) => {
            if (all.has(type)) {
                this.events.fire(`updated:${type}`);
            }
        });

        // allow elements to postupdate
        this.forEachElement(e => e.onPostUpdate());
    }

    private onPreRender() {
        if (this.canvasResize) {
            this.canvas.width = this.canvasResize.width;
            this.canvas.height = this.canvasResize.height;
            this.canvasResize = null;
        }

        // update render target size
        this.targetSize.width = Math.ceil(this.app.graphicsDevice.width / this.config.camera.pixelScale);
        this.targetSize.height = Math.ceil(this.app.graphicsDevice.height / this.config.camera.pixelScale);

        this.forEachElement(e => e.onPreRender());

        this.events.fire('prerender', this.camera.entity.getWorldTransform());

        // debug - display scene bound
        if (this.config.debug.showBound) {
            // draw element bounds
            this.forEachElement((e: Element) => {
                if (e.type === ElementType.splat) {
                    const splat = e as Splat;

                    const local = splat.localBound;
                    this.app.drawWireAlignedBox(
                        local.getMin(),
                        local.getMax(),
                        Color.RED,
                        true,
                        undefined,
                        splat.entity.getWorldTransform());

                    const world = splat.worldBound;
                    this.app.drawWireAlignedBox(
                        world.getMin(),
                        world.getMax(),
                        Color.GREEN);
                }
            });

            // draw scene bound
            this.app.drawWireAlignedBox(this.bound.getMin(), this.bound.getMax(), Color.BLUE);
        }
    }

    private onPostRender() {
        this.forEachElement(e => e.onPostRender());

        this.events.fire('postrender');
    }
}

export { SceneConfig, Scene };
