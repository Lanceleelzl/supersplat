import { Container, Element, NumericInput, Label, Button } from '@playcanvas/pcui';
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
import { localize } from './localization';
import closeSvg from './svg/close_01.svg';
import { Tooltips } from './tooltips';

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
    private aspectButtons?: { fourThree: Button, sixteenNine: Button };
    private tooltips?: Tooltips;
    // 新增：传感器宽度与锁定模式、派生FOV显示、预设选择
    private sensorWidthMm: number = 32.76; // 由57.4°@30mm推导出的等效传感器宽度
    private lockMode: 'horizontal' | 'diagonal' = 'horizontal';
    private derivedFovLabel?: Label;
    private presetSelectEl?: HTMLSelectElement;
    // 新增：输入单位与传感器宽度输入
    private unitMode: 'equivalent' | 'real' = 'equivalent';
    private sensorWidthInput?: NumericInput;
    // 防抖：程序设置焦距输入时不触发计算
    private suppressFocalChange = false;

    constructor(events: Events, scene: Scene, tooltips?: Tooltips, args = {}) {
        super({
            id: 'snapshot-panel',
            class: 'snapshot-view',
            ...args
        });

        this.events = events;
        this.scene = scene;
        this.tooltips = tooltips;

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

        // 注册快照设置查询函数，供导出流程读取
        this.events.function('snapshot.getSettings', () => {
            const aspectNum = this.currentAspect === '16:9' ? (16 / 9) : (4 / 3);
            const hDeg = this.snapshotCamera?.camera?.fov ?? 57.4;
            const hRad = hDeg * Math.PI / 180;
            const t = Math.tan(hRad / 2);
            const dDeg = 2 * Math.atan(t * Math.sqrt(1 + 1 / (aspectNum * aspectNum))) * 180 / Math.PI;

            // 计算真实与等效焦距，以单位模式返回
            const realFocal = (this.sensorWidthMm / (2 * Math.tan(hRad / 2)));
            const eqFocal = realFocal * 36 / this.sensorWidthMm;
            const focalOut = this.unitMode === 'equivalent' ? eqFocal : realFocal;

            return {
                aspect: this.currentAspect,
                lockMode: this.lockMode,
                hFovDeg: hDeg,
                dFovDeg: dDeg,
                sensorWidthMm: this.sensorWidthMm,
                unitMode: this.unitMode,
                focal: focalOut,
                presetKey: (this as any).presetKey || undefined
            };
        });
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
            min: 1,
            max: 160,
            enabled: true
        });

        // 新增：比例切换按钮（4:3 / 16:9）
        const aspectToggle = new Container({ class: 'aspect-toggle' });
        aspectToggle.dom.style.display = 'flex';
        aspectToggle.dom.style.gap = '8px';
        aspectToggle.dom.style.marginLeft = '8px';

        const fourThreeBtn = new Button({ class: ['pcui-button', 'pcui-button-active'], text: '4:3' });
        const sixteenNineBtn = new Button({ class: 'pcui-button', text: '16:9' });

        fourThreeBtn.on('click', () => {
            this.setAspect('4:3');
        });
        sixteenNineBtn.on('click', () => {
            this.setAspect('16:9');
        });

        aspectToggle.append(fourThreeBtn);
        aspectToggle.append(sixteenNineBtn);

        fovRow.append(fovLabel);
        fovRow.append(this.fovInput);
        fovRow.append(aspectToggle);

        // 缓存按钮引用
        this.aspectButtons = { fourThree: fourThreeBtn, sixteenNine: sixteenNineBtn };

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
            precision: 1,
            value: 30,                  // 默认等效焦距30mm（DJI等效焦距常见值参考）
            min: 10,
            max: 200,
            enabled: true
        });

        focalRow.append(focalLabel);
        focalRow.append(this.focalInput);

        // 新增：焦距单位切换（等效/真实）
        const unitRow = new Container({ class: 'transform-row' });
        const unitLabel = new Label({ class: 'transform-label', text: '焦距单位' });
        const unitBtns = new Container({ class: 'transform-expand' });
        unitBtns.dom.style.display = 'flex';
        unitBtns.dom.style.gap = '8px';

        const unitEqBtn = new Button({ class: ['pcui-button', 'pcui-button-active'], text: '等效' });
        const unitRealBtn = new Button({ class: 'pcui-button', text: '真实' });

        unitEqBtn.on('click', () => {
            unitEqBtn.class.add('pcui-button-active');
            unitRealBtn.class.remove('pcui-button-active');
            this.unitMode = 'equivalent';
            const hRad = (this.snapshotCamera?.camera?.fov ?? 57.4) * Math.PI / 180;
            const realFocal = this.sensorWidthMm / (2 * Math.tan(hRad / 2));
            const eqFocal = realFocal * 36 / this.sensorWidthMm;
            this.suppressFocalChange = true;
            this.focalInput.value = Number(eqFocal.toFixed(1));
            this.suppressFocalChange = false;
        });

        unitRealBtn.on('click', () => {
            unitRealBtn.class.add('pcui-button-active');
            unitEqBtn.class.remove('pcui-button-active');
            this.unitMode = 'real';
            const hRad = (this.snapshotCamera?.camera?.fov ?? 57.4) * Math.PI / 180;
            const realFocal = this.sensorWidthMm / (2 * Math.tan(hRad / 2));
            this.suppressFocalChange = true;
            this.focalInput.value = Number(realFocal.toFixed(1));
            this.suppressFocalChange = false;
        });

        unitBtns.append(unitEqBtn);
        unitBtns.append(unitRealBtn);
        unitRow.append(unitLabel);
        unitRow.append(unitBtns);

        if (this.tooltips) {
            this.tooltips.register(unitEqBtn, localize('tooltip.focal-equivalent'), 'top');
            this.tooltips.register(unitRealBtn, localize('tooltip.focal-real'), 'top');
        }

        // 新增：传感器宽度输入（mm）
        const sensorRow = new Container({ class: 'transform-row' });
        const sensorLabel = new Label({ class: 'transform-label', text: '传感器宽度(mm)' });
        this.sensorWidthInput = new NumericInput({
            class: 'transform-expand',
            precision: 2,
            value: this.sensorWidthMm,
            min: 2.0,
            max: 40.0,
            enabled: true
        });
        this.sensorWidthInput.on('change', (newWidth: number) => {
            // 更新传感器宽度，并在保持当前水平FOV的前提下，换算焦距显示
            this.sensorWidthMm = newWidth;
            const hRad = (this.snapshotCamera?.camera?.fov ?? 57.4) * Math.PI / 180;
            const realFocal = this.sensorWidthMm / (2 * Math.tan(hRad / 2));
            if (this.unitMode === 'equivalent') {
                const eqFocal = realFocal * 36 / this.sensorWidthMm;
                this.suppressFocalChange = true;
                this.focalInput.value = Number(eqFocal.toFixed(1));
                this.suppressFocalChange = false;
            } else {
                this.suppressFocalChange = true;
                this.focalInput.value = Number(realFocal.toFixed(1));
                this.suppressFocalChange = false;
            }
            this.updateDerivedFovs();
            this.updateFrustumVisualization();
            this.forceRenderSnapshot();
        });
        sensorRow.append(sensorLabel);
        sensorRow.append(this.sensorWidthInput);

        // 新增：派生FOV显示（垂直/对角）
        const derivedRow = new Container({ class: 'transform-row' });
        this.derivedFovLabel = new Label({ class: 'transform-expand', text: '垂直FOV 0.0° | 对角FOV 0.0°' });
        derivedRow.append(this.derivedFovLabel);

        // 新增：DJI机型预设选择
        const presetRow = new Container({ class: 'transform-row' });
        const presetLabel = new Label({ class: 'transform-label', text: '机型预设' });
        const presetContainer = new Element({ class: 'transform-expand' });
        presetContainer.dom.innerHTML = `
            <select id="dji-preset-select" style="width: 100%; padding: 4px 8px; background: #222; color: #ddd; border: 1px solid #555; border-radius: 4px;">
                <option value="default_30mm_57_4">DJI 默认 30mm / 57.4°</option>
                <option value="ff_24mm">全画幅 24mm 等效</option>
                <option value="mavic2pro_28mm_1inch">Mavic 2 Pro 28mm eq / 1"</option>
                <option value="air2s_24mm_1inch">Air 2S 24mm eq / 1"</option>
                <option value="air2_24mm_halfinch">Air 2 24mm eq / 1/2"</option>
                <option value="mini3pro_24mm_1_1_3">Mini 3 Pro 24mm eq / 1/1.3"</option>
                <option value="air3_wide_24mm_1_1_3">Air 3 广角 24mm eq / 1/1.3"</option>
                <option value="air3_tele_70mm_1_1_3">Air 3 中长焦 70mm eq / 1/1.3"</option>
                <option value="mavic3_24mm_fourthirds">Mavic 3 广角 24mm eq / 4/3"</option>
                <option value="mini2_24mm_1_2_3">Mini 2 24mm eq / 1/2.3"</option>
                <option value="air2_diag_84">DJI Air 2 对角 84°</option>
            </select>`;
        this.presetSelectEl = presetContainer.dom.querySelector('#dji-preset-select') as HTMLSelectElement;
        if (this.presetSelectEl) {
            this.presetSelectEl.addEventListener('change', () => {
                const key = this.presetSelectEl!.value;
                this.applyPreset(key);
            });
        }
        presetRow.append(presetLabel);
        presetRow.append(presetContainer);

        // 新增：FOV 锁定（水平/对角）
        const lockRow = new Container({ class: 'transform-row' });
        const lockLabel = new Label({ class: 'transform-label', text: 'FOV 锁定' });
        const lockBtns = new Element({ class: 'transform-expand' });
        lockBtns.dom.innerHTML = `
            <div style="display:flex; gap:8px;">
                <button id="lock-hfov" class="pcui-button pcui-button-active" style="border:1px solid #555; border-radius:4px; padding:2px 6px; cursor:pointer;">水平</button>
                <button id="lock-dfov" class="pcui-button" style="border:1px solid #555; border-radius:4px; padding:2px 6px; cursor:pointer;">对角</button>
            </div>`;
        const lockHFOV = lockBtns.dom.querySelector('#lock-hfov') as HTMLButtonElement;
        const lockDFOV = lockBtns.dom.querySelector('#lock-dfov') as HTMLButtonElement;
        if (lockHFOV && lockDFOV) {
            lockHFOV.addEventListener('click', () => {
                lockHFOV.classList.add('pcui-button-active');
                lockDFOV.classList.remove('pcui-button-active');
                this.setLockMode('horizontal');
            });
            lockDFOV.addEventListener('click', () => {
                lockDFOV.classList.add('pcui-button-active');
                lockHFOV.classList.remove('pcui-button-active');
                this.setLockMode('diagonal');
            });
        }
        lockRow.append(lockLabel);
        lockRow.append(lockBtns);

        // 将所有行添加到控制区域
        controlsContainer.appendChild(fovRow.dom);
        controlsContainer.appendChild(nearRow.dom);
        controlsContainer.appendChild(farRow.dom);
        controlsContainer.appendChild(focalRow.dom);
        controlsContainer.appendChild(unitRow.dom);
        controlsContainer.appendChild(sensorRow.dom);
        controlsContainer.appendChild(derivedRow.dom);
        controlsContainer.appendChild(presetRow.dom);
        controlsContainer.appendChild(lockRow.dom);

        // 初始化比例为4:3
        this.setAspect('4:3');
        // 初始化派生FOV显示
        this.updateDerivedFovs();
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
                const fovInputVal = typeof this.fovInput?.value === 'number' ? this.fovInput.value : this.snapshotCamera.camera.fov;
                const nearClip = typeof this.nearInput?.value === 'number' ? this.nearInput.value : this.snapshotCamera.camera.nearClip;
                const farClip = typeof this.farInput?.value === 'number' ? this.farInput.value : this.snapshotCamera.camera.farClip;

                // 保持水平FOV模式
                this.snapshotCamera.camera.horizontalFov = true;

                // 应用到快照相机，依据锁定模式解释FOV输入
                const aspect = this.currentAspect === '16:9' ? (16 / 9) : (4 / 3);
                if (this.lockMode === 'horizontal') {
                    this.snapshotCamera.camera.fov = fovInputVal as number;
                } else {
                    // 输入为对角FOV，转换为水平FOV
                    const dRad = (fovInputVal as number) * Math.PI / 180;
                    const hRad = 2 * Math.atan(Math.tan(dRad / 2) / Math.sqrt(1 + 1 / (aspect * aspect)));
                    const hDeg = hRad * 180 / Math.PI;
                    this.snapshotCamera.camera.fov = hDeg;
                }

                this.snapshotCamera.camera.nearClip = nearClip;
                this.snapshotCamera.camera.farClip = farClip;

                // 同步控件显示（确保数值一致）
                if (this.lockMode === 'horizontal') {
                    this.fovInput.value = parseFloat(this.snapshotCamera.camera.fov.toFixed(1));
                } else {
                    const hRad = this.snapshotCamera.camera.fov * Math.PI / 180;
                    const dDeg = 2 * Math.atan(Math.tan(hRad / 2) * Math.sqrt(1 + 1 / (aspect * aspect))) * 180 / Math.PI;
                    this.fovInput.value = parseFloat(dDeg.toFixed(1));
                }

                this.nearInput && (this.nearInput.value = nearClip);
                this.farInput && (this.farInput.value = farClip);

                // 根据水平FOV反算焦距(mm)，用于同步焦距控件显示
                const hRadNow = this.snapshotCamera.camera.fov * Math.PI / 180;
                const realFocalFromFov = this.sensorWidthMm / (2 * Math.tan(hRadNow / 2));
                const eqFocalFromFov = realFocalFromFov * 36 / this.sensorWidthMm;
                if (this.focalInput) {
                    this.suppressFocalChange = true;
                    const outFocal = this.unitMode === 'equivalent' ? eqFocalFromFov : realFocalFromFov;
                    const clampedFocal = Math.max(10, Math.min(200, Number(outFocal.toFixed(1))));
                    this.focalInput.value = clampedFocal;
                    this.suppressFocalChange = false;
                }
            }

            console.log('快照预览：相机位置已设置为', this.snapshotCamera.getPosition());
            console.log('快照预览：相机旋转已设置为', this.snapshotCamera.getRotation());

            // 更新视椎体可视化（即使面板隐藏，只要预览启用且有选择则保持）
            if (this.scene.cameraFrustumVisualizer) {
                this.scene.cameraFrustumVisualizer.setTargetCamera(this.snapshotCamera);
                this.scene.cameraFrustumVisualizer.update();
            }

            // 刷新派生FOV显示
            this.updateDerivedFovs();
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

    private forceRenderSnapshot() {
        if (!this.hidden) {
            this.renderSnapshot();
        }
        if (this.scene.forceRender !== undefined) {
            this.scene.forceRender = true;
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
        // FOV控制（兼容水平/对角锁定）
        this.fovInput.on('change', (value: number) => {
            if (!this.snapshotCamera?.camera) return;

            const aspect = this.currentAspect === '16:9' ? (16 / 9) : (4 / 3);
            if (this.lockMode === 'horizontal') {
                console.log('快照预览：设置水平FOV为', value);
                this.snapshotCamera.camera.fov = value;
            } else {
                console.log('快照预览：设置对角FOV为', value);
                const dRad = value * Math.PI / 180;
                const hRad = 2 * Math.atan(Math.tan(dRad / 2) / Math.sqrt(1 + 1 / (aspect * aspect)));
                this.snapshotCamera.camera.fov = hRad * 180 / Math.PI;
            }
            console.log('快照预览：当前相机水平FOV为', this.snapshotCamera.camera.fov);

            // 更新焦距显示（按单位模式）
            const hRadNow = this.snapshotCamera.camera.fov * Math.PI / 180;
            const realFocal = this.sensorWidthMm / (2 * Math.tan(hRadNow / 2));
            const eqFocal = realFocal * 36 / this.sensorWidthMm;
            this.suppressFocalChange = true;
            this.focalInput.value = Number((this.unitMode === 'equivalent' ? eqFocal : realFocal).toFixed(1));
            this.suppressFocalChange = false;

            this.updateDerivedFovs();
            this.updateFrustumVisualization();
            this.forceRenderSnapshot();
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

        // 焦距控制（通过调整水平FOV实现）
        this.focalInput.on('change', (focalLength: number) => {
            if (!this.snapshotCamera?.camera) return;
            if (this.suppressFocalChange) return;
            // 将焦距转换为水平FOV，按单位模式解释输入
            const realFocal = this.unitMode === 'equivalent' ? (focalLength * (this.sensorWidthMm / 36)) : focalLength;
            const hDeg = 2 * Math.atan(this.sensorWidthMm / (2 * realFocal)) * 180 / Math.PI;
            this.snapshotCamera.camera.fov = hDeg;

            // 同步更新FOV输入框（依据锁定模式）
            const aspect = this.currentAspect === '16:9' ? (16 / 9) : (4 / 3);
            if (this.lockMode === 'horizontal') {
                this.fovInput.value = parseFloat(hDeg.toFixed(1));
            } else {
                const hRad = hDeg * Math.PI / 180;
                const dDeg = 2 * Math.atan(Math.tan(hRad / 2) * Math.sqrt(1 + 1 / (aspect * aspect))) * 180 / Math.PI;
                this.fovInput.value = parseFloat(dDeg.toFixed(1));
            }

            this.updateDerivedFovs();
            this.updateFrustumVisualization();
            this.forceRenderSnapshot();
        });
    }

    private updateDerivedFovs() {
        if (!this.derivedFovLabel) return;
        const aspect = this.currentAspect === '16:9' ? (16 / 9) : (4 / 3);
        const hDeg = this.snapshotCamera?.camera?.fov ?? 57.4;
        const hRad = hDeg * Math.PI / 180;
        const t = Math.tan(hRad / 2);
        const vDeg = 2 * Math.atan(t / aspect) * 180 / Math.PI;
        const dDeg = 2 * Math.atan(t * Math.sqrt(1 + 1 / (aspect * aspect))) * 180 / Math.PI;
        this.derivedFovLabel.text = `垂直FOV ${vDeg.toFixed(1)}° | 对角FOV ${dDeg.toFixed(1)}°`;
    }

    private setLockMode(mode: 'horizontal' | 'diagonal') {
        this.lockMode = mode;
        if (!this.snapshotCamera?.camera) return;

        const aspect = this.currentAspect === '16:9' ? (16 / 9) : (4 / 3);
        const inputFov = Number(this.fovInput?.value ?? 57.4);
        if (mode === 'horizontal') {
            // 解释输入为水平FOV
            this.snapshotCamera.camera.horizontalFov = true;
            this.snapshotCamera.camera.fov = inputFov;
        } else {
            // 解释输入为对角FOV，转换为水平FOV
            const dRad = inputFov * Math.PI / 180;
            const hRad = 2 * Math.atan(Math.tan(dRad / 2) / Math.sqrt(1 + 1 / (aspect * aspect)));
            const hDeg = hRad * 180 / Math.PI;
            this.snapshotCamera.camera.horizontalFov = true;
            this.snapshotCamera.camera.fov = hDeg;
        }
        // 同步焦距显示依据单位模式
        const hRadNow = this.snapshotCamera.camera.fov * Math.PI / 180;
        const realFocal = (this.sensorWidthMm / (2 * Math.tan(hRadNow / 2)));
        const eqFocal = realFocal * 36 / this.sensorWidthMm;
        this.focalInput && (this.focalInput.value = Number((this.unitMode === 'equivalent' ? eqFocal : realFocal).toFixed(1)));
        this.updateDerivedFovs();
        this.updateFrustumVisualization();
        this.forceRenderSnapshot();
    }

    private applyPreset(key: string) {
        const aspect = this.currentAspect === '16:9' ? (16 / 9) : (4 / 3);
        if (!this.snapshotCamera?.camera) return;
        let hDeg: number | undefined;
        let focalEq: number | undefined;
        this.presetSelectEl && (this.presetSelectEl.value = key);
        // 记录当前预设
        (this as any).presetKey = key;
        switch (key) {
            case 'default_30mm_57_4':
                this.sensorWidthMm = 32.76;
                focalEq = 30;
                hDeg = 57.4;
                break;
            case 'ff_24mm':
                this.sensorWidthMm = 36.0; // 全画幅宽度
                focalEq = 24;
                break;
            case 'mavic2pro_28mm_1inch':
                this.sensorWidthMm = 13.2; // 1英寸传感器宽度
                focalEq = 28; // 等效焦距
                break;
            case 'air2s_24mm_1inch':
                this.sensorWidthMm = 13.2;
                focalEq = 24;
                break;
            case 'air2_24mm_halfinch':
                this.sensorWidthMm = 6.4; // 1/2"约6.4mm
                focalEq = 24;
                break;
            case 'mini3pro_24mm_1_1_3':
                this.sensorWidthMm = 9.6; // 1/1.3"约9.6mm
                focalEq = 24;
                break;
            case 'air3_wide_24mm_1_1_3':
                this.sensorWidthMm = 9.6;
                focalEq = 24;
                break;
            case 'air3_tele_70mm_1_1_3':
                this.sensorWidthMm = 9.6;
                focalEq = 70;
                break;
            case 'mavic3_24mm_fourthirds':
                this.sensorWidthMm = 17.3; // 4/3传感器水平宽度
                focalEq = 24;
                break;
            case 'mini2_24mm_1_2_3':
                this.sensorWidthMm = 6.2; // 1/2.3"约6.2mm
                focalEq = 24;
                break;
            case 'air2_diag_84':
                // 以对角84°为预设
                {
                    const dDeg = 84.0;
                    const dRad = dDeg * Math.PI / 180;
                    hDeg = 2 * Math.atan(Math.tan(dRad / 2) / Math.sqrt(1 + 1 / (aspect * aspect))) * 180 / Math.PI;
                    // 保持当前sensorWidthMm，根据水平FOV反推等效焦距
                    focalEq = this.sensorWidthMm / (2 * Math.tan((hDeg * Math.PI / 180) / 2));
                }
                break;
            default:
                return;
        }
        // 依据预设计算水平FOV（如果尚未指定hDeg）
        if (hDeg === undefined && focalEq !== undefined) {
            const realFocal = focalEq * (this.sensorWidthMm / 36.0);
            hDeg = 2 * Math.atan(this.sensorWidthMm / (2 * realFocal)) * 180 / Math.PI;
        }

        // 应用到相机与输入框，依据锁定模式
        if (this.lockMode === 'horizontal') {
            this.snapshotCamera.camera.fov = hDeg!;
            this.fovInput && (this.fovInput.value = Number(hDeg!.toFixed(1)));
        } else {
            const hRad = (hDeg! * Math.PI / 180);
            const dDeg = 2 * Math.atan(Math.tan(hRad / 2) * Math.sqrt(1 + 1 / (aspect * aspect))) * 180 / Math.PI;
            this.fovInput && (this.fovInput.value = Number(dDeg.toFixed(1)));
            this.snapshotCamera.camera.fov = hDeg!;
        }
        // 同步更新焦距显示（防抖避免触发二次计算）
        const hRadNow = this.snapshotCamera.camera.fov * Math.PI / 180;
        const realFocal = (this.sensorWidthMm / (2 * Math.tan(hRadNow / 2)));
        const eqFocal = realFocal * 36 / this.sensorWidthMm;
        this.suppressFocalChange = true;
        this.focalInput && (this.focalInput.value = Number((this.unitMode === 'equivalent' ? eqFocal : realFocal).toFixed(1)));
        this.suppressFocalChange = false;
        this.sensorWidthInput && (this.sensorWidthInput.value = Number(this.sensorWidthMm.toFixed(2)));
        this.updateDerivedFovs();
        this.updateFrustumVisualization();
        this.forceRenderSnapshot();
    }

    private updateFrustumVisualization() {
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

        // 在对角锁定时，根据当前输入的对角FOV保持不变并转换相机水平FOV
        if (this.lockMode === 'diagonal' && this.fovInput && this.snapshotCamera?.camera) {
            const aspectNum = this.currentAspect === '16:9' ? (16 / 9) : (4 / 3);
            const dRad = Number(this.fovInput.value) * Math.PI / 180;
            const hRad = 2 * Math.atan(Math.tan(dRad / 2) / Math.sqrt(1 + 1 / (aspectNum * aspectNum)));
            this.snapshotCamera.camera.fov = hRad * 180 / Math.PI;
        }

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
            const activeStyle = (btn: Button, active: boolean) => {
                const el = btn.dom as HTMLButtonElement;
                el.style.background = active ? '#3a78ff' : '';
                el.style.color = active ? '#fff' : '';
                el.style.border = '1px solid #555';
                el.style.borderRadius = '4px';
                el.style.padding = '2px 6px';
                el.style.cursor = 'pointer';
            };
            activeStyle(fourThree, aspect === '4:3');
            activeStyle(sixteenNine, aspect === '16:9');
        }

        // 重新渲染与刷新视椎体
        this.renderSnapshot();
        this.updateFrustumVisualization();
        this.updateDerivedFovs();
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
