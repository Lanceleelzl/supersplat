import { Container, Element, NumericInput, Label } from '@playcanvas/pcui';
import {
    Entity,
    CameraComponent,
    RenderTarget,
    Texture,
    PIXELFORMAT_RGBA8,
    FILTER_LINEAR,
    ADDRESS_CLAMP_TO_EDGE,
    Vec3,
    Quat
} from 'playcanvas';

import { ElementType } from '../element';
import { Events } from '../events';
import { Scene } from '../scene';
import closeSvg from './svg/close_01.svg';

const createSvg = (svgString: string) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement;
};

/**
 * 快照预览窗口 - 显示巡检模型视角的相机画面
 */
class SnapshotView extends Container {
    private events: Events;
    private scene: Scene;
    private canvas: HTMLCanvasElement;
    private snapshotCamera: Entity;
    private renderTarget: RenderTarget;
    private fovInput: NumericInput;
    private nearInput: NumericInput;
    private farInput: NumericInput;
    private focalInput: NumericInput;
    private selectedMarker: any = null;
    // 新增：画布和比例状态
    private currentAspect: '4:3' | '16:9' = '4:3';
    private snapshotWidth = 320;
    private snapshotHeight = 240;
    private aspectButtons?: { fourThree: HTMLButtonElement, sixteenNine: HTMLButtonElement };

    constructor(events: Events, scene: Scene, args = {}) {
        super({
            id: 'snapshot-panel',
            class: 'snapshot-view',
            ...args
        });

        this.events = events;
        this.scene = scene;

        // stop pointer events bubbling - 阻止指针事件冒泡
        ['pointerdown', 'pointerup', 'pointermove', 'wheel', 'dblclick'].forEach((eventName) => {
            this.dom.addEventListener(eventName, (event: Event) => event.stopPropagation());
        });

        this.createUI();
        this.setupDragFunctionality();
        this.setupCamera();
        this.setupEventListeners();

        // 添加clickable类
        this.dom.classList.add('clickable');

        // 初始隐藏
        this.hidden = true;

        // 添加到body
        document.body.appendChild(this.dom);
    }

    private createUI() {
        // 创建快照预览窗口的UI结构
        this.dom.innerHTML = `
            <div class="snapshot-title-bar">
                <span class="snapshot-title">快照预览</span>
                <div class="snapshot-close-container"></div>
            </div>
            <div class="snapshot-content">
                <canvas class="snapshot-canvas" width="320" height="240"></canvas>
                <div class="camera-controls">
                    <div class="control-section">
                        <h4>相机参数</h4>
                    </div>
                </div>
            </div>
        `;

        // 创建关闭按钮并添加SVG图标
        const closeContainer = this.dom.querySelector('.snapshot-close-container') as HTMLElement;
        const closeButton = new Element({
            class: 'snapshot-close-btn'
        });
        closeButton.dom.setAttribute('role', 'button');
        closeButton.dom.setAttribute('tabindex', '0');
        closeButton.dom.appendChild(createSvg(closeSvg));
        closeContainer.appendChild(closeButton.dom);

        // 获取canvas元素
        this.canvas = this.dom.querySelector('.snapshot-canvas') as HTMLCanvasElement;

        // 设置canvas样式，确保与相机参数面板宽度一致
        this.canvas.style.display = 'block';
        this.canvas.style.width = '100%';  // 改为100%以匹配容器宽度
        this.canvas.style.height = '240px';
        this.canvas.style.border = '1px solid #555';
        this.canvas.style.borderRadius = '4px';
        this.canvas.style.background = '#1a1a1a';

        // 创建相机参数控制面板
        this.createCameraControls();
    }

    private createCameraControls() {
        const controlsContainer = this.dom.querySelector('.camera-controls .control-section') as HTMLElement;

        // 使用与变换区域相同的布局结构
        // 创建FOV行
        const fovRow = new Container({
            class: 'transform-row'
        });

        const fovLabel = new Label({
            class: 'transform-label',
            text: 'FOV'
        });

        this.fovInput = new NumericInput({
            class: 'transform-expand',
            precision: 1,
            value: 57.4,               // 默认水平视场角（依据4:3参考）
            min: 10,
            max: 120,
            enabled: true
        });

        // 新增：比例切换按钮（4:3 / 16:9）
        const aspectToggle = new Element({ class: 'aspect-toggle' });
        aspectToggle.dom.style.display = 'flex';
        aspectToggle.dom.style.gap = '8px';
        aspectToggle.dom.style.marginLeft = '8px';
        aspectToggle.dom.innerHTML = `
            <button class="aspect-btn" data-aspect="4:3">4:3</button>
            <button class="aspect-btn" data-aspect="16:9">16:9</button>
        `;

        fovRow.append(fovLabel);
        fovRow.append(this.fovInput);
        fovRow.append(aspectToggle);

        // 缓存按钮引用并注册事件
        const fourThreeBtn = aspectToggle.dom.querySelector('button[data-aspect="4:3"]') as HTMLButtonElement;
        const sixteenNineBtn = aspectToggle.dom.querySelector('button[data-aspect="16:9"]') as HTMLButtonElement;
        this.aspectButtons = { fourThree: fourThreeBtn, sixteenNine: sixteenNineBtn };
        const bindAspect = (btn: HTMLButtonElement, aspect: '4:3'|'16:9') => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.setAspect(aspect);
            });
        };
        bindAspect(fourThreeBtn, '4:3');
        bindAspect(sixteenNineBtn, '16:9');

        // 创建近裁剪面行
        const nearRow = new Container({
            class: 'transform-row'
        });

        const nearLabel = new Label({
            class: 'transform-label',
            text: '近裁剪面'
        });

        this.nearInput = new NumericInput({
            class: 'transform-expand',
            precision: 2,
            value: 0.6,                 // 默认近裁剪面0.6
            min: 0.01,
            max: 10,
            enabled: true
        });

        nearRow.append(nearLabel);
        nearRow.append(this.nearInput);

        // 创建远裁剪面行
        const farRow = new Container({
            class: 'transform-row'
        });

        const farLabel = new Label({
            class: 'transform-label',
            text: '远裁剪面'
        });

        this.farInput = new NumericInput({
            class: 'transform-expand',
            precision: 0,
            value: 20,                  // 默认远裁剪面20
            min: 10,
            max: 1000,
            enabled: true
        });

        farRow.append(farLabel);
        farRow.append(this.farInput);

        // 创建焦距行
        const focalRow = new Container({
            class: 'transform-row'
        });

        const focalLabel = new Label({
            class: 'transform-label',
            text: '焦距(mm)'
        });

        this.focalInput = new NumericInput({
            class: 'transform-expand',
            precision: 0,
            value: 30,                  // 默认等效焦距30mm（DJI等效焦距常见值参考）
            min: 10,
            max: 200,
            enabled: true
        });

        focalRow.append(focalLabel);
        focalRow.append(this.focalInput);

        // 将所有行添加到控制区域
        controlsContainer.appendChild(fovRow.dom);
        controlsContainer.appendChild(nearRow.dom);
        controlsContainer.appendChild(farRow.dom);
        controlsContainer.appendChild(focalRow.dom);

        // 初始化比例为4:3
        this.setAspect('4:3');
    }

    private setupDragFunctionality() {
        let isDragging = false;
        const dragOffset = { x: 0, y: 0 };
        let dragHandle: HTMLElement | null = null;

        // 找到标题栏作为拖拽句柄
        const titlebar = this.dom.querySelector('.snapshot-title-bar') as HTMLElement;
        if (titlebar) {
            dragHandle = titlebar;
            dragHandle.style.cursor = 'move';
            dragHandle.style.userSelect = 'none';
            dragHandle.style.webkitUserSelect = 'none';

            const onPointerDown = (e: PointerEvent) => {
                // 只响应左键点击
                if (e.button !== 0) return;

                // 检查点击的是否是关闭按钮，如果是则不进行拖拽
                const target = e.target as HTMLElement;
                if (target.closest('.snapshot-close-btn')) {
                    return;
                }

                isDragging = true;
                const rect = this.dom.getBoundingClientRect();
                dragOffset.x = e.clientX - rect.left;
                dragOffset.y = e.clientY - rect.top;

                // 设置面板为绝对定位
                this.dom.style.position = 'absolute';
                this.dom.style.zIndex = '1000';

                // 捕获指针，确保鼠标移出元素时仍能响应事件
                dragHandle!.setPointerCapture(e.pointerId);

                e.preventDefault();
                e.stopPropagation();
            };

            const onPointerMove = (e: PointerEvent) => {
                if (!isDragging) return;

                const newX = e.clientX - dragOffset.x;
                const newY = e.clientY - dragOffset.y;

                // 限制拖拽范围在窗口内
                const maxX = window.innerWidth - this.dom.offsetWidth;
                const maxY = window.innerHeight - this.dom.offsetHeight;

                const clampedX = Math.max(0, Math.min(newX, maxX));
                const clampedY = Math.max(0, Math.min(newY, maxY));

                this.dom.style.left = `${clampedX}px`;
                this.dom.style.top = `${clampedY}px`;
                this.dom.style.right = 'auto';
                this.dom.style.bottom = 'auto';

                e.preventDefault();
            };

            const onPointerUp = (e: PointerEvent) => {
                if (!isDragging) return;

                isDragging = false;
                dragHandle!.releasePointerCapture(e.pointerId);

                e.preventDefault();
            };

            // 绑定事件到拖拽句柄
            dragHandle.addEventListener('pointerdown', onPointerDown);
            dragHandle.addEventListener('pointermove', onPointerMove);
            dragHandle.addEventListener('pointerup', onPointerUp);

            // 处理指针取消事件（例如触摸被中断）
            dragHandle.addEventListener('pointercancel', onPointerUp);
        }

        // 关闭按钮事件
        const closeBtn = this.dom.querySelector('.snapshot-close-btn') as HTMLButtonElement;
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.hide();
            });
        }
    }

    private setupCamera() {
        // 创建独立的相机实体用于快照预览
        this.snapshotCamera = new Entity('SnapshotCamera');
    
        // 添加相机组件，使用新的相机参数配置
        this.snapshotCamera.addComponent('camera', {
            fov: 57.4,                 // 水平视场角（参考4:3）
            nearClip: 0.6,             // 近裁剪面0.6
            farClip: 20,               // 远裁剪面20
            clearColor: [0.4, 0.4, 0.4, 1.0],  // 与主场景相同的背景色
            projection: 0,              // 透视投影
            horizontalFov: true         // 使用水平视野角
        });
    
        // 设置相机初始朝向为+Y方向，与巡检模型的朝向一致
        this.snapshotCamera.setEulerAngles(90, 0, 0);
    
        // 设置相机的渲染层，包含所有主要层
        this.snapshotCamera.camera.layers = [
            this.scene.app.scene.layers.getLayerByName('World').id,
            this.scene.backgroundLayer.id,
            this.scene.shadowLayer.id,
            this.scene.debugLayer.id
        ];
    
        // 应用与主相机相同的色调映射和曝光设置
        const mainCamera = this.scene.camera.entity.camera;
        this.snapshotCamera.camera.toneMapping = mainCamera.toneMapping;
    
        // 创建渲染目标（按当前比例）
        const colorBuffer = new Texture(this.scene.app.graphicsDevice, {
            width: this.snapshotWidth,
            height: this.snapshotHeight,
            format: PIXELFORMAT_RGBA8,
            minFilter: FILTER_LINEAR,
            magFilter: FILTER_LINEAR,
            addressU: ADDRESS_CLAMP_TO_EDGE,
            addressV: ADDRESS_CLAMP_TO_EDGE
        });
    
        this.renderTarget = new RenderTarget({
            colorBuffer: colorBuffer,
            depth: true,
            flipY: true,
            autoResolve: false
        });
    
        // 设置相机的渲染目标
        this.snapshotCamera.camera.renderTarget = this.renderTarget;
    
        // 将相机添加到场景
        this.scene.app.root.addChild(this.snapshotCamera);
    
        console.log('快照预览：独立相机创建完成，已配置渲染层和光照');
    }

    private setupEventListeners() {
        // 监听巡检模型选择事件
        this.events.on('marker.selected', (marker: any) => {
            console.log('快照预览：接收到marker选择事件', marker);

            const snapshotEnabled = this.events.invoke('snapshot.isEnabled');
            this.selectedMarker = marker;
            this.updateCameraFromMarker();

            // 快照预览开启时打开面板并渲染
            if (snapshotEnabled) {
                this.show();
                this.renderSnapshot();
            }

            // 无论快照预览是否开启，都根据全局视椎体开关更新可视化
            this.updateFrustumVisualization();
        });

        // 监听巡检模型变换事件（位置、旋转变化）
        this.events.on('marker.transform', (marker: any) => {
            if (this.selectedMarker === marker) {
                console.log('快照预览：marker位置变化，更新相机');
                this.updateCameraFromMarker();
                if (!this.hidden) {
                    this.renderSnapshot();
                }
            }
        });

        // 监听快照预览隐藏事件
        this.events.on('snapshot.hide', () => {
            console.log('快照预览：接收到隐藏事件');
            this.hide();
        });

        // 监听快照预览开关切换
        this.events.on('snapshot.toggle', () => {
            const isEnabled = this.events.invoke('snapshot.isEnabled');
            if (!isEnabled) {
                // 如果关闭了快照预览，隐藏窗口
                this.hide();
            }
        });

        // 监听视椎体开关切换，确保全局关闭时视椎体不显示
        this.events.on('frustum.toggle', () => {
            const frustumEnabled = this.events.invoke('frustum.isEnabled');
            if (!frustumEnabled && this.scene.cameraFrustumVisualizer) {
                this.scene.cameraFrustumVisualizer.hide();
            } else {
                // 满足已选择巡检点时展示（不再依赖快照预览开关）
                if (this.selectedMarker && this.snapshotCamera && this.scene.cameraFrustumVisualizer) {
                    this.scene.cameraFrustumVisualizer.setTargetCamera(this.snapshotCamera);
                    this.scene.cameraFrustumVisualizer.show();
                    this.scene.cameraFrustumVisualizer.update();
                    // 强制下一帧渲染，确保参数和变换立即生效
                    if (this.scene.forceRender !== undefined) {
                        this.scene.forceRender = true;
                    }
                }
            }
        });

        // 当选择状态变化（例如点击空白处清空选择）时，确保视椎体与面板状态同步
        this.events.on('selection.changed', (element: any) => {
            const frustumEnabled = this.events.invoke('frustum.isEnabled');

            // 非巡检模型或清空选择：隐藏视椎体并清除选中的marker
            if (!element || !(element as any).isInspectionModel) {
                this.selectedMarker = null;
                if (this.scene.cameraFrustumVisualizer) {
                    this.scene.cameraFrustumVisualizer.hide();
                }
                // 若面板当前打开，同时也收起面板
                if (!this.hidden) {
                    this.hide();
                }
                return;
            }

            // 巡检模型保持选中：更新相机与视椎体（不强制打开面板）
            this.selectedMarker = element;
            this.updateCameraFromMarker();
            if (frustumEnabled && this.scene.cameraFrustumVisualizer && this.snapshotCamera) {
                this.scene.cameraFrustumVisualizer.setTargetCamera(this.snapshotCamera);
                this.scene.cameraFrustumVisualizer.show();
                this.scene.cameraFrustumVisualizer.update();
                if (this.scene.forceRender !== undefined) {
                    this.scene.forceRender = true;
                }
            }
            if (!this.hidden) {
                this.renderSnapshot();
            }
        });

        // 设置相机参数控制事件监听器
        this.setupCameraControlListeners();
    }

    private updateCameraFromMarker() {
        if (!this.selectedMarker || !this.snapshotCamera) {
            return;
        }

        try {
            // 获取巡检模型的位置和旋转
            const markerEntity = this.selectedMarker.entity;
            if (!markerEntity) {
                console.warn('快照预览：巡检模型没有entity');
                return;
            }

            const position = markerEntity.getPosition();
            const rotation = markerEntity.getRotation();

            console.log('快照预览：更新相机位置和旋转');
            console.log('巡检模型位置:', position.x, position.y, position.z);
            console.log('巡检模型旋转:', rotation.x, rotation.y, rotation.z, rotation.w);

            // 设置相机位置与巡检模型相同
            this.snapshotCamera.setPosition(position);

            // 计算相机的最终旋转：巡检模型旋转 + 相机初始90度X轴旋转
            // 这样确保快照预览相机始终朝向+Y方向，与巡检模型保持一致
            const cameraRotation = new Quat();
            const initialCameraRotation = new Quat().setFromEulerAngles(90, 0, 0);
            cameraRotation.mul2(rotation, initialCameraRotation);

            this.snapshotCamera.setRotation(cameraRotation);

            // 优先使用快照预览控件的当前参数作为视椎体初始参数
            if (this.snapshotCamera?.camera) {
                const fov = typeof this.fovInput?.value === 'number' ? this.fovInput.value : this.snapshotCamera.camera.fov;
                const nearClip = typeof this.nearInput?.value === 'number' ? this.nearInput.value : this.snapshotCamera.camera.nearClip;
                const farClip = typeof this.farInput?.value === 'number' ? this.farInput.value : this.snapshotCamera.camera.farClip;

                // 应用到快照相机
                this.snapshotCamera.camera.fov = fov;
                this.snapshotCamera.camera.nearClip = nearClip;
                this.snapshotCamera.camera.farClip = farClip;

                // 同步控件显示（确保数值一致）
                if (this.fovInput) {
                    this.fovInput.value = parseFloat(fov.toFixed(1));
                }
                if (this.nearInput) {
                    this.nearInput.value = nearClip;
                }
                if (this.farInput) {
                    this.farInput.value = farClip;
                }
                // 根据FOV反算焦距(mm)，用于同步焦距控件显示
                const sensorWidth = 32.76; // 由57.4°@30mm推导出的等效传感器宽度
                const focalLength = sensorWidth / (2 * Math.tan((fov * Math.PI / 180) / 2));
                if (this.focalInput) {
                    const clampedFocal = Math.max(10, Math.min(200, Math.round(focalLength)));
                    this.focalInput.value = clampedFocal;
                }
            }

            console.log('快照预览：相机位置已设置为', this.snapshotCamera.getPosition());
            console.log('快照预览：相机旋转已设置为', this.snapshotCamera.getRotation());

            // 更新视椎体可视化（即使面板隐藏，只要预览启用且有选择则保持）
            if (this.scene.cameraFrustumVisualizer) {
                this.scene.cameraFrustumVisualizer.setTargetCamera(this.snapshotCamera);
                this.scene.cameraFrustumVisualizer.update();
            }
        } catch (error) {
            console.error('快照预览：更新相机位置失败', error);
        }
    }

    private renderSnapshot() {
        if (!this.snapshotCamera || !this.renderTarget || !this.canvas) {
            console.warn('快照预览：相机或渲染目标未初始化');
            return;
        }

        try {
            // 临时保存主相机的渲染目标
            const mainCamera = this.scene.camera.entity.camera;
            const originalRenderTarget = mainCamera.renderTarget;

            // 保存所有高斯泼溅模型的视口参数，防止被快照渲染污染
            const splatViewportBackup = new Map<any, any>();
            const splats = this.scene.getElementsByType(ElementType.splat);
            splats.forEach((splat: any) => {
                try {
                    const instance = splat.entity && splat.entity.gsplat && splat.entity.gsplat.instance;
                    const meshInstance = instance && instance.meshInstance;
                    if (meshInstance) {
                        const currentViewport = meshInstance.getParameter('viewport');
                        if (Array.isArray(currentViewport) || (currentViewport && typeof (currentViewport as any).length === 'number')) {
                            splatViewportBackup.set(splat, Array.from(currentViewport as any));
                        } else {
                            splatViewportBackup.set(splat, currentViewport ?? null);
                        }
                        // 设置新的视口（示例：全屏覆盖），实际逻辑保持不变
                        meshInstance.setParameter('viewport', [0, 0, this.renderTarget.width, this.renderTarget.height]);
                    }
                } catch (err) {
                // 忽略单个元素的参数异常，保证主流程不被中断
                }
            });

            // 设置快照相机的渲染目标
            this.snapshotCamera.camera.renderTarget = this.renderTarget;

            // 使用PlayCanvas的正确渲染方式
            const app = this.scene.app;

            // 临时设置快照相机为主相机进行渲染（使用 any 规避类型限制）
            const originalCamera = (app.scene as any).defaultCamera;
            (app.scene as any).defaultCamera = this.snapshotCamera.camera;

            // 执行渲染
            app.render();

            // 恢复原始相机
            (app.scene as any).defaultCamera = originalCamera;

            // 保持快照相机的渲染目标绑定，以确保视椎体按快照比例计算
            // 注意：不需要清空renderTarget，否则视椎体会回落到主画布比例

            // 恢复所有高斯泼溅模型的视口参数
            splatViewportBackup.forEach((viewport, splat) => {
                if (splat.entity && splat.entity.gsplat && splat.entity.gsplat.instance) {
                    const meshInstance = splat.entity.gsplat.instance.meshInstance;
                    meshInstance.setParameter('viewport', viewport);
                }
            });

            // 将渲染结果复制到canvas
            this.copyRenderTargetToCanvas();

            console.log('快照预览：渲染完成，已恢复高斯泼溅模型视口参数');
        } catch (error) {
            console.error('快照预览：渲染失败', error);
        }
    }

    private copyRenderTargetToCanvas() {
        try {
            const gl = (this.scene.app.graphicsDevice as any).gl;
            const ctx = this.canvas.getContext('2d');

            if (ctx && gl && this.renderTarget) {
                const w = this.renderTarget.width;
                const h = this.renderTarget.height;

                // 绑定渲染目标的帧缓冲区
                gl.bindFramebuffer(gl.FRAMEBUFFER, this.renderTarget.impl._glFrameBuffer);

                // 读取像素数据
                const pixels = new Uint8Array(w * h * 4);
                gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

                // 创建ImageData
                const imageData = new ImageData(new Uint8ClampedArray(pixels), w, h);

                // 清除canvas
                ctx.clearRect(0, 0, w, h);

                // 翻转Y轴并绘制到canvas
                ctx.save();
                ctx.scale(1, -1);
                ctx.translate(0, -h);
                ctx.putImageData(imageData, 0, 0);
                ctx.restore();

                // 恢复默认帧缓冲区
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            }
        } catch (error) {
            console.error('快照预览：复制渲染目标到canvas失败', error);
        }
    }


    show() {
        this.hidden = false;
        console.log('快照预览：窗口显示');

        // 显示视椎体可视化（需满足全局开关）
        const frustumEnabled = this.events.invoke('frustum.isEnabled');
        if (frustumEnabled && this.scene.cameraFrustumVisualizer && this.snapshotCamera) {
            this.scene.cameraFrustumVisualizer.setTargetCamera(this.snapshotCamera);
            this.scene.cameraFrustumVisualizer.show();
        }
    }

    hide() {
        this.hidden = true;
        console.log('快照预览：窗口隐藏');

        const frustumEnabled = this.events.invoke('frustum.isEnabled');
        if (frustumEnabled && this.selectedMarker && this.snapshotCamera) {
            // 保持视椎体显示并跟随快照相机（仅在视椎体开关开启时）
            if (this.scene.cameraFrustumVisualizer) {
                this.scene.cameraFrustumVisualizer.setTargetCamera(this.snapshotCamera);
                this.scene.cameraFrustumVisualizer.show();
            }
            // 不清除selectedMarker，以便继续跟随
        } else {
            // 没有选中模型或视椎体开关关闭时，完全隐藏
            this.selectedMarker = null;
            if (this.scene.cameraFrustumVisualizer) {
                this.scene.cameraFrustumVisualizer.hide();
            }
        }
    }

    private setupCameraControlListeners() {
        // FOV控制
        this.fovInput.on('change', (value: number) => {
            if (this.snapshotCamera?.camera) {
                console.log('快照预览：设置FOV为', value);
                this.snapshotCamera.camera.fov = value;
                console.log('快照预览：当前相机FOV为', this.snapshotCamera.camera.fov);
                this.renderSnapshot();
                this.updateFrustumVisualization();
            }
        });

        // 近裁剪面控制
        this.nearInput.on('change', (value: number) => {
            if (this.snapshotCamera?.camera) {
                console.log('快照预览：设置nearClip为', value);
                this.snapshotCamera.camera.nearClip = value;
                console.log('快照预览：当前相机nearClip为', this.snapshotCamera.camera.nearClip);
                this.renderSnapshot();
                this.updateFrustumVisualization();
            }
        });

        // 远裁剪面控制
        this.farInput.on('change', (value: number) => {
            if (this.snapshotCamera?.camera) {
                console.log('快照预览：设置farClip为', value);
                this.snapshotCamera.camera.farClip = value;
                console.log('快照预览：当前相机farClip为', this.snapshotCamera.camera.farClip);
                this.renderSnapshot();
                this.updateFrustumVisualization();
            }
        });

        // 焦距控制（通过调整FOV实现）
        this.focalInput.on('change', (focalLength: number) => {
            // 将焦距转换为水平FOV
            // 57.4° = 2 * arctan(sensorWidth / (2 * 30))
            // 为了精确匹配 57.4° @ 30mm，对应传感器宽度 ≈ 32.76mm
            const sensorWidth = 32.76;
            const horizontalFov = 2 * Math.atan(sensorWidth / (2 * focalLength)) * (180 / Math.PI);

            if (this.snapshotCamera?.camera) {
                this.snapshotCamera.camera.fov = horizontalFov;
                // 同步更新FOV输入框
                this.fovInput.value = parseFloat(horizontalFov.toFixed(1));
                this.renderSnapshot();
                this.updateFrustumVisualization();
            }
        });
    }

    private updateFrustumVisualization() {
        // 更新视椎体可视化（在面板隐藏的情况下也保持），需满足全局开关
        const frustumEnabled = this.events.invoke('frustum.isEnabled');
        if (this.scene.cameraFrustumVisualizer && this.snapshotCamera) {
            this.scene.cameraFrustumVisualizer.setTargetCamera(this.snapshotCamera);
            if (frustumEnabled) {
                this.scene.cameraFrustumVisualizer.show();
                this.scene.cameraFrustumVisualizer.update();
            } else {
                this.scene.cameraFrustumVisualizer.hide();
            }
            if (this.scene.forceRender !== undefined) {
                this.scene.forceRender = true;
            }
        }
    }

    private setAspect(aspect: '4:3' | '16:9') {
        this.currentAspect = aspect;
        // 高度根据宽度320和比例反算
        this.snapshotWidth = 320;
        this.snapshotHeight = aspect === '4:3' ? Math.round(320 * 3 / 4) : Math.round(320 * 9 / 16);

        // 更新画布尺寸（属性与样式）
        if (this.canvas) {
            this.canvas.width = this.snapshotWidth;
            this.canvas.height = this.snapshotHeight;
            this.canvas.style.width = '100%';
            this.canvas.style.height = `${this.snapshotHeight}px`;
        }

        // 重建渲染目标以匹配新比例
        try {
            if (this.renderTarget) {
                this.renderTarget.destroy();
            }
            const colorBuffer = new Texture(this.scene.app.graphicsDevice, {
                width: this.snapshotWidth,
                height: this.snapshotHeight,
                format: PIXELFORMAT_RGBA8,
                minFilter: FILTER_LINEAR,
                magFilter: FILTER_LINEAR,
                addressU: ADDRESS_CLAMP_TO_EDGE,
                addressV: ADDRESS_CLAMP_TO_EDGE
            });
            this.renderTarget = new RenderTarget({
                colorBuffer,
                depth: true,
                flipY: true,
                autoResolve: false
            });
            if (this.snapshotCamera?.camera) {
                this.snapshotCamera.camera.renderTarget = this.renderTarget;
            }
        } catch (e) {
            console.warn('快照预览：切换比例时重建渲染目标失败', e);
        }

        // 更新按钮激活态
        if (this.aspectButtons) {
            const { fourThree, sixteenNine } = this.aspectButtons;
            const activeStyle = (btn: HTMLButtonElement, active: boolean) => {
                btn.style.background = active ? '#3a78ff' : '';
                btn.style.color = active ? '#fff' : '';
                btn.style.border = '1px solid #555';
                btn.style.borderRadius = '4px';
                btn.style.padding = '2px 6px';
                btn.style.cursor = 'pointer';
            };
            activeStyle(fourThree, aspect === '4:3');
            activeStyle(sixteenNine, aspect === '16:9');
        }

        // 重新渲染与刷新视椎体
        this.renderSnapshot();
        this.updateFrustumVisualization();
        if (this.scene.forceRender !== undefined) {
            this.scene.forceRender = true;
        }
    }

    destroy() {
        // 清理资源
        if (this.snapshotCamera) {
            this.snapshotCamera.destroy();
        }
        if (this.renderTarget) {
            this.renderTarget.destroy();
        }

        // 移除DOM元素
        if (this.dom && this.dom.parentNode) {
            this.dom.parentNode.removeChild(this.dom);
        }

        super.destroy();
    }
}

export { SnapshotView };