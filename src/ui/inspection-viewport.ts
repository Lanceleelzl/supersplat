import { Container } from '@playcanvas/pcui';
import { Entity, Quat } from 'playcanvas';

import { Events } from '../events';
import { ElementType } from '../element';
import { Scene } from '../scene';

/**
 * 巡检视口 - 以第二相机在主画布上开窗渲染
 * 使用 camera.rect 在画布内指定区域渲染，不复制RenderTarget
 */
class InspectionViewport extends Container {
    private events: Events;
    private scene: Scene;
    private overlay: HTMLElement;
    private cameraEntity: Entity;
    private isEnabled = false;
    private renderingInspection = false;
    private useSplitScreen = false;

    // 开窗区域的初始大小（CSS像素），后续可支持拖拽/缩放
    private initialWidth = 320;
    private initialHeight = 240;
    private initialMargin = 16;

    constructor(events: Events, scene: Scene, args = {}) {
        super({ id: 'inspection-viewport', class: 'inspection-viewport', ...args });
        this.events = events;
        this.scene = scene;

        // 阻止面板内部事件影响3D交互（视口为只读显示）
        ['pointerdown', 'pointerup', 'pointermove', 'wheel', 'dblclick'].forEach((eventName) => {
            this.dom.addEventListener(eventName, (event: Event) => event.stopPropagation());
        });

        this.createUI();
        this.createCamera();
        this.setupListeners();

        // 初始显示状态：默认禁用，等待快照预览激活时再显示
        this.isEnabled = false;
        this.hidden = true;
    }

    private createUI() {
        // 简单边框，使用主画布子矩形进行渲染（不再复制像素到独立canvas）
        this.overlay = document.createElement('div');
        this.overlay.classList.add('inspection-viewport-overlay');
        this.overlay.style.position = 'absolute';
        this.overlay.style.right = `${this.initialMargin}px`;
        this.overlay.style.bottom = `${this.initialMargin}px`;
        this.overlay.style.width = `${this.initialWidth}px`;
        this.overlay.style.height = `${this.initialHeight}px`;
        this.overlay.style.border = '1px solid #4a90e2';
        this.overlay.style.borderRadius = '4px';
        this.overlay.style.boxShadow = '0 0 0 1px rgba(74,144,226,0.3), 0 4px 12px rgba(0,0,0,0.3)';
        this.overlay.style.pointerEvents = 'auto';
        this.overlay.style.background = 'transparent';

        this.dom.appendChild(this.overlay);

        // 覆盖层内拦截事件，防止穿透主场景
        const intercept = (e: Event) => { e.preventDefault(); e.stopPropagation(); };
        const optsWheel: AddEventListenerOptions = { capture: true, passive: false };
        const opts: AddEventListenerOptions = { capture: true };
        ['pointerdown','pointermove','pointerup','mousedown','mouseup','click','dblclick','contextmenu'].forEach(name => {
            this.overlay.addEventListener(name, intercept, opts);
        });
        this.overlay.addEventListener('wheel', intercept, optsWheel);
    }

    private createCamera() {
        // 创建第二相机实体
        this.cameraEntity = new Entity('InspectionCamera');
        this.cameraEntity.addComponent('camera', {
            fov: 57.4,
            nearClip: 0.6,
            farClip: 20,
            projection: 0,
            horizontalFov: true
        });

        // 设置相机渲染层（避免绘制背景层覆盖主画面）
        const mainCam = this.scene.camera.entity.camera;
        this.cameraEntity.camera.layers = [
            this.scene.app.scene.layers.getLayerByName('World').id,
            this.scene.debugLayer.id
        ];
        this.cameraEntity.camera.toneMapping = mainCam.toneMapping;
        // 不在主屏上混合，优先级仅用于引擎内部排序
        this.cameraEntity.camera.priority = Math.max((mainCam.priority ?? 0) + 1, 1);

        // 初始朝向 +Y（与巡检模型约定一致）
        this.cameraEntity.setEulerAngles(90, 0, 0);

        // 加入场景
        this.scene.app.root.addChild(this.cameraEntity);

        // 不使用离屏渲染目标，直接在主画布的子矩形上渲染
        this.cameraEntity.camera.renderTarget = null;
        // 清除策略：仅清深度，保留主画面颜色
        this.cameraEntity.camera.clearColorBuffer = false;
        this.cameraEntity.camera.clearDepthBuffer = true;
        // 同步主相机近远裁剪，避免内容被裁掉导致黑屏
        this.cameraEntity.camera.nearClip = mainCam.nearClip;
        this.cameraEntity.camera.farClip = mainCam.farClip;
        // 默认禁用，待快照预览开启或用户显式开启
        this.cameraEntity.camera.enabled = false;
    }

    private setupListeners() {
        // 画布尺寸变化：仅更新相机rect，无需离屏RT
        const canvasContainer = document.getElementById('canvas-container');
        if (canvasContainer) {
            const ro = new ResizeObserver(() => {
                this.updateCameraRectFromOverlay();
            });
            ro.observe(canvasContainer);
        }

        // 允许外部开关显示
        this.events.on('inspectionViewport.toggle', () => {
            this.isEnabled = !this.isEnabled;
            this.hidden = !this.isEnabled;
            this.cameraEntity.enabled = this.isEnabled;
            if (this.cameraEntity.camera) this.cameraEntity.camera.enabled = this.isEnabled;
            if (this.isEnabled) {
                this.updateCameraRectFromOverlay();
            }
        });

        // 与快照预览开关联动：仅在快照预览开启时显示，关闭时隐藏
        this.events.on('snapshot.toggle', () => {
            // 新方案：快照预览由面板内嵌离屏视口承担，这里始终禁用覆盖视口
            this.isEnabled = false;
            this.hidden = true;
            this.cameraEntity.enabled = false;
            if (this.cameraEntity.camera) this.cameraEntity.camera.enabled = false;
        });

        // 快照预览隐藏时同步隐藏第二视口
        this.events.on('snapshot.hide', () => {
            this.isEnabled = false;
            this.hidden = true;
            this.cameraEntity.enabled = false;
            if (this.cameraEntity.camera) this.cameraEntity.camera.enabled = false;
            // 恢复主相机全屏视口
            try {
                const mainCam = this.scene.camera.entity.camera;
                if (mainCam && mainCam.rect) {
                    mainCam.rect.x = 0;
                    mainCam.rect.y = 0;
                    mainCam.rect.z = 1;
                    mainCam.rect.w = 1;
                }
            } catch {}
        });

        // 巡检模型选中时，若快照预览启用，则绑定第二相机到该巡检点的相机参数
        this.events.on('marker.selected', (marker: any) => {
            try {
                const enabled = !!this.events.invoke('snapshot.isEnabled');
                if (!enabled || !marker || !(marker as any).isInspectionModel) return;
                const name = (marker as any).inspectionMarkerName;
                const point = this.scene.inspectionPoints.get(name);
                const params = point?.cameraParams;
                const cam = this.cameraEntity.camera;

                if (params) {
                    if (params.fov !== undefined) cam.fov = params.fov;
                    if (params.nearClip !== undefined) cam.nearClip = params.nearClip;
                    if (params.farClip !== undefined) cam.farClip = params.farClip;
                    if (params.toneMapping !== undefined) cam.toneMapping = params.toneMapping;

                    if (params.position && params.target) {
                        this.cameraEntity.setPosition(params.position.x, params.position.y, params.position.z);
                        this.cameraEntity.lookAt(params.target.x, params.target.y, params.target.z);
                    }
                } else {
                    // 若无记录参数，回退到与巡检模型实体同位姿
                    const markerEntity = marker.entity;
                    if (markerEntity) {
                        const position = markerEntity.getPosition();
                        const rotation = markerEntity.getRotation();
                        const initialRotation = new Quat().setFromEulerAngles(90, 0, 0);
                        const finalRotation = new Quat();
                        finalRotation.mul2(rotation, initialRotation);
                        this.cameraEntity.setPosition(position);
                        this.cameraEntity.setRotation(finalRotation);
                    }
                }
            } catch {}
        });

        // 巡检模型移动/旋转时，实时同步第二相机位姿（在快照预览开启时）
        this.events.on('marker.transform', (marker: any) => {
            try {
                const enabled = !!this.events.invoke('snapshot.isEnabled');
                if (!enabled || !marker || !(marker as any).isInspectionModel) return;
                const markerEntity = marker.entity;
                if (!markerEntity) return;
                const position = markerEntity.getPosition();
                const rotation = markerEntity.getRotation();
                const initialRotation = new Quat().setFromEulerAngles(90, 0, 0);
                const finalRotation = new Quat();
                finalRotation.mul2(rotation, initialRotation);
                this.cameraEntity.setPosition(position);
                this.cameraEntity.setRotation(finalRotation);
            } catch {}
        });

        // 移除追加渲染，依赖引擎一次渲染循环与相机优先级
    }

    private updateCameraRectFromOverlay() {
        try {
            const overlayRect = this.overlay.getBoundingClientRect();
            const canvasContainer = document.getElementById('canvas-container');
            if (!canvasContainer || !this.cameraEntity?.camera) return;
            const canvasRect = canvasContainer.getBoundingClientRect();

            const nx = (overlayRect.left - canvasRect.left) / canvasRect.width;
            const nw = overlayRect.width / canvasRect.width;
            const nh = overlayRect.height / canvasRect.height;
            // PlayCanvas 的 rect.y 从底部开始计算，这里按底部对齐换算
            const ny = (canvasRect.bottom - overlayRect.bottom) / canvasRect.height;

            const camRect = this.cameraEntity.camera.rect;
            camRect.x = Math.max(0, Math.min(1, nx));
            camRect.y = Math.max(0, Math.min(1, ny));
            camRect.z = Math.max(0, Math.min(1, nw));
            camRect.w = Math.max(0, Math.min(1, nh));

            // 第二相机清除自身视口区域的深度，颜色清除关闭以保留主屏图像
            this.cameraEntity.camera.clearColorBuffer = false;
            this.cameraEntity.camera.clearDepthBuffer = true;
        } catch {}
    }
}

export { InspectionViewport };
