import { Container, Element, NumericInput, Label, Button } from '@playcanvas/pcui';
import {
    Entity,
    Vec3,
    Quat,
    Texture,
    RenderTarget,
    ADDRESS_CLAMP_TO_EDGE,
    FILTER_NEAREST,
    PIXELFORMAT_RGBA8,
    PIXELFORMAT_DEPTH
} from 'playcanvas';

import { ElementType } from '../element';
import { Events } from '../events';
import { Scene } from '../scene';
import { localize } from './localization';
import closeSvg from './svg/close_01.svg';
import lockSvg from './svg/lock_01.svg';
import unlockSvg from './svg/unlock_01.svg';
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
    private snapshotCamera: Entity;
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
    // 视口锁定：仅通过外部巡检相机与点位模型控制视角
    private viewLocked: boolean = true;

    // 面板内嵌预览（离屏）
    private previewCanvas?: HTMLCanvasElement;
    private previewCtx?: CanvasRenderingContext2D;
    private previewRT?: RenderTarget;
    private previewWorkRT?: RenderTarget;
    private previewData?: Uint8Array; // RGBA8
    private previewRafId?: number;
    private panelLocked: boolean = true; // 默认固定
    private pinButton?: Element;
    private closeButton?: Element;

    constructor(events: Events, scene: Scene, tooltips?: Tooltips, args = {}) {
        super({
            id: 'snapshot-panel',
            class: ['panel', 'snapshot-view'],
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

        // 对外暴露快照相机与渲染目标尺寸，便于克隆实例安全同步
        this.events.function('snapshot.getCameraEntity', () => this.snapshotCamera);
        this.events.function('snapshot.getRenderTargetSize', () => ({
            width: this.previewRT?.width ?? this.snapshotWidth,
            height: this.previewRT?.height ?? this.snapshotHeight
        }));
    }

    private createUI() {
        // 创建快照预览窗口的UI结构（采用通用 .panel/.panel-header 体系）
        this.dom.innerHTML = `
            <div class="panel-header">
                <span class="panel-header-label">快照预览</span>
                <div class="panel-header-spacer"></div>
            </div>
            <div class="snapshot-preview-wrap">
                <canvas class="snapshot-preview" style="display:block; width:100%; max-width:100%;"></canvas>
            </div>
            <div class="camera-controls">
                <div class="control-section">
                </div>
            </div>
        `;

        // 创建标题栏按钮并添加到通用 header
        const headerEl = this.dom.querySelector('.panel-header') as HTMLElement;

        // 固定/取消固定按钮（默认固定），复用关闭按钮样式
        const pinButton = new Element({ class: 'panel-header-pin' });
        pinButton.class.add('panel-header-close');
        pinButton.dom.setAttribute('role', 'button');
        pinButton.dom.setAttribute('tabindex', '0');
        // 图标显示“将执行的动作”：当前为固定，显示“取消固定”图标
        pinButton.dom.title = '取消固定';
        pinButton.dom.appendChild(createSvg(unlockSvg));
        headerEl.appendChild(pinButton.dom);
        this.pinButton = pinButton;

        const closeButton = new Element({
            class: 'panel-header-close'
        });
        closeButton.dom.setAttribute('role', 'button');
        closeButton.dom.setAttribute('tabindex', '0');
        closeButton.dom.appendChild(createSvg(closeSvg));
        headerEl.appendChild(closeButton.dom);
        this.closeButton = closeButton;

        // 为关闭按钮注册提示气泡：仅在固定状态下显示，提示位置在右侧
        if (this.tooltips && this.panelLocked) {
            this.tooltips.register(closeButton, '请取消固定，方可关闭', 'right');
        }

        // 创建相机参数控制面板
        this.createCameraControls();
        // 显示相机参数控制面板，便于交互调参
        // （如需锁定模式，可在外部通过CSS或事件开关实现）

        // 绑定预览画布
        const canvas = this.dom.querySelector('.snapshot-preview') as HTMLCanvasElement;
        if (canvas) {
            this.previewCanvas = canvas;
            this.previewCtx = canvas.getContext('2d');
        }

        // 绑定固定/取消固定按钮事件（使用原生事件，确保SVG点击也可触发）
        pinButton.dom.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.panelLocked = !this.panelLocked;
            const container = this.pinButton!.dom;
            container.innerHTML = '';
            // 图标显示“将执行的动作”
            if (this.panelLocked) {
                // 当前为固定 -> 显示“取消固定”
                container.appendChild(createSvg(unlockSvg));
                container.title = '取消固定';
                // 固定状态下注册关闭提示（右侧）
                if (this.tooltips && this.closeButton) {
                    this.tooltips.register(this.closeButton, '请取消固定，方可关闭', 'right');
                }
            } else {
                // 当前为未固定 -> 显示“固定”
                container.appendChild(createSvg(lockSvg));
                container.title = '固定';
                // 解除固定时取消关闭提示
                if (this.tooltips && this.closeButton) {
                    this.tooltips.unregister(this.closeButton);
                }
            }
        });

        // 关闭按钮点击事件（固定时提示，不执行关闭）
        if (this.closeButton) {
            const closeBtn = this.closeButton.dom as HTMLElement;
            closeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (this.panelLocked) {
                    if (this.tooltips) {
                        try {
                            closeBtn.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
                            window.setTimeout(() => {
                                closeBtn.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true }));
                            }, 1500);
                        } catch (_) {
                            this.events.fire('showToast', '请取消固定，方可关闭', 2000);
                        }
                    } else {
                        this.events.fire('showToast', '请取消固定，方可关闭', 2000);
                    }
                    return; // 固定时不允许关闭
                }
                this.hide(false);
            });
        }
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
        aspectToggle.class.add('control-buttons');
        aspectToggle.dom.style.marginLeft = '4px';

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
        // 记录按钮引用，便于切换激活态
        this.aspectButtons = { fourThree: fourThreeBtn, sixteenNine: sixteenNineBtn };

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
        const unitLabel = new Label({ class: 'transform-label', text: '焦距模式' });
        const unitBtns = new Container({ class: 'transform-expand' });
        unitBtns.dom.style.display = 'flex';
        unitBtns.dom.style.gap = '8px';
        unitBtns.class.add('control-buttons');

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
            if (this.scene.forceRender !== undefined) {
                this.scene.forceRender = true;
            }
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
            <div class="control-buttons">
                <button id="lock-hfov" class="pcui-button pcui-button-active">水平</button>
                <button id="lock-dfov" class="pcui-button">对角</button>
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

        // 将所有行添加到控制区域（机型预设置顶）
        controlsContainer.appendChild(presetRow.dom);
        controlsContainer.appendChild(fovRow.dom);
        controlsContainer.appendChild(nearRow.dom);
        controlsContainer.appendChild(farRow.dom);
        controlsContainer.appendChild(focalRow.dom);
        controlsContainer.appendChild(unitRow.dom);
        controlsContainer.appendChild(sensorRow.dom);
        controlsContainer.appendChild(lockRow.dom);
        // 用户需求：将“垂直FOV | 对角FOV”提示行放在最下方
        controlsContainer.appendChild(derivedRow.dom);

        // 初始化比例为4:3
        this.setAspect('4:3');
        // 初始化派生FOV显示
        this.updateDerivedFovs();

        // 始终绑定参数输入控件的监听，使“视口锁定”仅影响鼠标操作
        this.setupCameraControlListeners();
    }

    private setupDragFunctionality() {
        let isDragging = false;
        const dragOffset = { x: 0, y: 0 };
        let dragHandle: HTMLElement | null = null;

        // 找到通用面板标题栏作为拖拽句柄
        const titlebar = this.dom.querySelector('.panel-header') as HTMLElement;
        if (titlebar) {
            dragHandle = titlebar;
            dragHandle.style.cursor = 'move';
            dragHandle.style.userSelect = 'none';
            dragHandle.style.webkitUserSelect = 'none';

            const onPointerDown = (e: PointerEvent) => {
                // 只响应左键点击
                if (e.button !== 0) return;

                // 检查点击的是否是关闭/固定按钮，如果是则不进行拖拽
                const target = e.target as HTMLElement;
                if (target.closest('.panel-header-close') || target.closest('.panel-header-pin')) {
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

        // 关闭按钮事件已在创建UI阶段绑定
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

        // 设置相机的渲染层：Snapshot World + 背景/调试/阴影（不包含 World）
        this.snapshotCamera.camera.layers = [
            this.scene.snapshotLayer.id,
            this.scene.backgroundLayer.id,
            this.scene.debugLayer.id,
            this.scene.shadowLayer.id
        ];

        // 应用与主相机相同的色调映射和曝光设置
        const mainCamera = this.scene.camera.entity.camera;
        this.snapshotCamera.camera.toneMapping = mainCamera.toneMapping;

        // 使用离屏渲染目标，避免与主画布混合冲突
        this.snapshotCamera.camera.clearColorBuffer = true;
        this.snapshotCamera.camera.clearDepthBuffer = true;
        const mainCam = this.scene.camera.entity.camera;
        // Render the snapshot camera before the main camera, so the main camera
        // can finalize and restore viewport / perform the final blit last.
        this.snapshotCamera.camera.priority = (mainCam.priority ?? 0) - 1;
        this.snapshotCamera.camera.enabled = false;

        // 构建预览离屏RT
        this.rebuildPreviewTargets();

        // 将相机添加到场景
        this.scene.app.root.addChild(this.snapshotCamera);

        console.log('快照预览：独立相机创建完成，已配置渲染层和光照');
    }

    // 创建/重建离屏渲染目标与画布尺寸
    private rebuildPreviewTargets() {
        const width = this.snapshotWidth;
        const height = this.snapshotHeight;

        // 调整画布像素尺寸（注意CSS与像素尺寸区别）
        if (this.previewCanvas) {
            this.previewCanvas.width = width;
            this.previewCanvas.height = height;
            // 自适应容器宽度不变，由CSS控制
        }

        // 释放旧资源
        if (this.previewRT) {
            try {
                this.previewRT.destroyTextureBuffers();
            } catch {}
            try {
                this.previewRT.destroy();
            } catch {}
            this.previewRT = undefined;
        }
        if (this.previewWorkRT) {
            try {
                this.previewWorkRT.destroyTextureBuffers?.();
            } catch {}
            try {
                this.previewWorkRT.destroy();
            } catch {}
            this.previewWorkRT = undefined;
        }

        const device = this.scene.graphicsDevice;
        const createTexture = (name: string, w: number, h: number, format: number) => new Texture(device, {
            name,
            width: w,
            height: h,
            format,
            mipmaps: false,
            minFilter: FILTER_NEAREST,
            magFilter: FILTER_NEAREST,
            addressU: ADDRESS_CLAMP_TO_EDGE,
            addressV: ADDRESS_CLAMP_TO_EDGE
        });

        const colorBuffer = createTexture('snapshotColor', width, height, PIXELFORMAT_RGBA8);
        const depthBuffer = createTexture('snapshotDepth', width, height, PIXELFORMAT_DEPTH);
        this.previewRT = new RenderTarget({
            colorBuffer,
            depthBuffer,
            flipY: false,
            autoResolve: false
        });

        const workColorBuffer = createTexture('snapshotWorkColor', width, height, PIXELFORMAT_RGBA8);
        this.previewWorkRT = new RenderTarget({
            colorBuffer: workColorBuffer,
            depth: false,
            autoResolve: false
        });

        // 关联相机渲染到预览RT
        if (this.snapshotCamera?.camera) {
            this.snapshotCamera.camera.renderTarget = this.previewRT;
            this.snapshotCamera.camera.horizontalFov = width > height;
        }

        // 申请CPU读缓冲
        this.previewData = new Uint8Array(width * height * 4);
    }

    // 将离屏渲染结果绘制到面板canvas
    private async drawPreview() {
        if (!this.previewCtx || !this.previewRT || !this.previewWorkRT || !this.previewData) return;
        const width = this.previewRT.width;
        const height = this.previewRT.height;

        // 确保 CPU 缓冲大小与当前 RT 尺寸一致，避免在切换比例时发生越界
        const requiredBytes = width * height * 4;
        if (this.previewData.byteLength !== requiredBytes) {
            this.previewData = new Uint8Array(requiredBytes);
        }

        // 拷贝到非MSAA工作RT
        try {
            this.scene.dataProcessor.copyRt(this.previewRT, this.previewWorkRT);
        } catch {}

        // 读取像素（RGBA8）
        try {
            await this.previewWorkRT.colorBuffer.read(0, 0, width, height, {
                renderTarget: this.previewWorkRT,
                data: this.previewData
            });
        } catch (e) {
            // 读失败通常是帧尚未完成或设备限制，忽略本帧
            return;
        }

        // 垂直翻转缓冲（OpenGL坐标与Canvas坐标差异）
        // 注意：必须使用拷贝缓冲而不是subarray视图，避免就地覆盖造成对称镜像
        for (let y = 0; y < Math.floor(height / 2); y++) {
            const top = y * width * 4;
            const bottom = (height - y - 1) * width * 4;
            const temp = this.previewData.slice(top, top + width * 4); // 独立拷贝
            this.previewData.copyWithin(top, bottom, bottom + width * 4);
            this.previewData.set(temp, bottom);
        }

        // 兼容部分 TS/DOM 类型收窄：先创建空 ImageData 再填充像素
        const pixels = new Uint8ClampedArray(this.previewData.buffer, 0, requiredBytes);
        const imageData = new ImageData(width, height);
        imageData.data.set(pixels);
        this.previewCtx.putImageData(imageData, 0, 0);
    }

    private startPreviewLoop() {
        const loop = async () => {
            // 请求一帧渲染
            if (this.scene.forceRender !== undefined) {
                this.scene.forceRender = true;
            }
            await this.drawPreview();
            this.previewRafId = requestAnimationFrame(loop);
        };
        if (!this.previewRafId) {
            this.previewRafId = requestAnimationFrame(loop);
        }
    }

    private stopPreviewLoop() {
        if (this.previewRafId) {
            cancelAnimationFrame(this.previewRafId);
            this.previewRafId = undefined;
        }
    }

    private setupEventListeners() {
        // 监听巡检模型选择事件
        this.events.on('marker.selected', (marker: any) => {
            console.log('快照预览：接收到marker选择事件', marker);

            const snapshotEnabled = this.events.invoke('snapshot.isEnabled');
            this.selectedMarker = marker;
            this.updateCameraFromMarker();
            // 同步锁定视口下的显示数值
            this.syncInputsFromCamera();

            // 快照预览开启时打开面板并渲染
            if (snapshotEnabled) {
                this.show();
            }
        });

        // 监听巡检模型变换事件（位置、旋转变化）
        this.events.on('marker.transform', (marker: any) => {
            if (this.selectedMarker === marker) {
                console.log('快照预览：marker位置变化，更新相机');
                this.updateCameraFromMarker();
                this.syncInputsFromCamera();
                // 参数与视椎体更新后请求一次渲染
                if (this.scene.forceRender !== undefined) {
                    this.scene.forceRender = true;
                }
            }
        });

        // 监听快照预览隐藏事件（菜单优先级最高：强制关闭）
        this.events.on('snapshot.hide', () => {
            console.log('快照预览：接收到隐藏事件');
            this.hide(true);
        });

        // 监听快照预览开关切换
        this.events.on('snapshot.toggle', () => {
            const isEnabled = this.events.invoke('snapshot.isEnabled');
            if (!isEnabled) {
                // 菜单关闭优先级更高：强制关闭并重置固定状态
                this.panelLocked = true;
                if (this.pinButton) {
                    const container = this.pinButton.dom;
                    container.innerHTML = '';
                    // 重置为固定状态时，图标显示“取消固定”
                    container.appendChild(createSvg(unlockSvg));
                    container.title = '取消固定';
                }
                this.hide(true);
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
                // 若未固定则隐藏
                if (!this.hidden && !this.panelLocked) {
                    this.hide(false);
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
            // 参数与视椎体更新后请求一次渲染
            if (this.scene.forceRender !== undefined) {
                this.scene.forceRender = true;
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

    show() {
        this.hidden = false;
        console.log('快照预览：窗口显示');

        // 启用快照相机并启动预览循环（离屏）
        if (this.snapshotCamera?.camera) {
            this.snapshotCamera.camera.enabled = true;
        }
        this.startPreviewLoop();

        // 显示视椎体可视化（需满足全局开关）
        const frustumEnabled = this.events.invoke('frustum.isEnabled');
        if (frustumEnabled && this.scene.cameraFrustumVisualizer && this.snapshotCamera) {
            this.scene.cameraFrustumVisualizer.setTargetCamera(this.snapshotCamera);
            this.scene.cameraFrustumVisualizer.show();
        }
    }

    hide(force = false) {
        if (!force && this.panelLocked) {
            return; // 固定状态下，非强制关闭无效
        }

        this.hidden = true;
        console.log('快照预览：窗口隐藏');

        // 禁用快照相机并停止预览循环
        if (this.snapshotCamera?.camera) {
            this.snapshotCamera.camera.enabled = false;
        }
        this.stopPreviewLoop();

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
            if (this.scene.forceRender !== undefined) {
                this.scene.forceRender = true;
            }
        });

        // 近裁剪面控制（锁定视口下也允许更新裁剪面）
        this.nearInput.on('change', (value: number) => {
            if (this.snapshotCamera?.camera) {
                console.log('快照预览：设置nearClip为', value);
                this.snapshotCamera.camera.nearClip = value;
                console.log('快照预览：当前相机nearClip为', this.snapshotCamera.camera.nearClip);
                this.updateFrustumVisualization();
                if (this.scene.forceRender !== undefined) {
                    this.scene.forceRender = true;
                }
            }
            // 同步显示为最新相机值
            this.syncInputsFromCamera();
        });

        // 远裁剪面控制（锁定视口下也允许更新裁剪面）
        this.farInput.on('change', (value: number) => {
            if (this.snapshotCamera?.camera) {
                console.log('快照预览：设置farClip为', value);
                this.snapshotCamera.camera.farClip = value;
                console.log('快照预览：当前相机farClip为', this.snapshotCamera.camera.farClip);
                this.updateFrustumVisualization();
                if (this.scene.forceRender !== undefined) {
                    this.scene.forceRender = true;
                }
            }
            // 同步显示为最新相机值
            this.syncInputsFromCamera();
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
            if (this.scene.forceRender !== undefined) {
                this.scene.forceRender = true;
            }
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
        // 切换锁定模式为幂等：不修改相机的实际水平FOV，仅改变输入框的解释与显示
        if (!this.snapshotCamera?.camera) return;

        const aspect = this.currentAspect === '16:9' ? (16 / 9) : (4 / 3);

        // 如果重复点击同一模式，仅同步显示，不做转换
        const wasMode = this.lockMode;
        this.lockMode = mode;

        const hDeg = this.snapshotCamera.camera.fov; // 始终以水平FOV存储
        if (mode === 'horizontal') {
            // 显示为水平FOV
            this.fovInput && (this.fovInput.value = parseFloat(hDeg.toFixed(1)));
        } else {
            // 显示为对角FOV（由水平FOV推导）
            const hRad = hDeg * Math.PI / 180;
            const dDeg = 2 * Math.atan(Math.tan(hRad / 2) * Math.sqrt(1 + 1 / (aspect * aspect))) * 180 / Math.PI;
            this.fovInput && (this.fovInput.value = parseFloat(dDeg.toFixed(1)));
        }

        // 同步焦距显示依据单位模式（基于水平FOV）
        const hRadNow = hDeg * Math.PI / 180;
        const realFocal = (this.sensorWidthMm / (2 * Math.tan(hRadNow / 2)));
        const eqFocal = realFocal * 36 / this.sensorWidthMm;
        this.focalInput && (this.focalInput.value = Number((this.unitMode === 'equivalent' ? eqFocal : realFocal).toFixed(1)));

        this.updateDerivedFovs();
        this.updateFrustumVisualization();
        if (this.scene.forceRender !== undefined) {
            this.scene.forceRender = true;
        }
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
        if (this.scene.forceRender !== undefined) {
            this.scene.forceRender = true;
        }
    }

    // 同步UI控件的显示为当前相机数值（在锁定视口下使用）
    private syncInputsFromCamera() {
        const cam = this.snapshotCamera?.camera;
        if (!cam) return;
        if (this.fovInput) {
            const aspect = this.currentAspect === '16:9' ? (16 / 9) : (4 / 3);
            if (this.lockMode === 'horizontal') {
                this.fovInput.value = parseFloat(cam.fov.toFixed(1));
            } else {
                const hRad = cam.fov * Math.PI / 180;
                const dDeg = 2 * Math.atan(Math.tan(hRad / 2) * Math.sqrt(1 + 1 / (aspect * aspect))) * 180 / Math.PI;
                this.fovInput.value = parseFloat(dDeg.toFixed(1));
            }
        }
        if (this.nearInput) this.nearInput.value = cam.nearClip;
        if (this.farInput) this.farInput.value = cam.farClip;
        this.updateDerivedFovs();
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
        // 根据比例更新预览尺寸（保持宽度，调整高度）
        const baseWidth = 320;
        const height = aspect === '16:9' ? Math.round(baseWidth * 9 / 16) : Math.round(baseWidth * 3 / 4);
        this.snapshotWidth = baseWidth;
        this.snapshotHeight = height;
        this.rebuildPreviewTargets();

        // 确保相机开启与预览循环刷新，避免切换比例后画面暂时丢失
        if (!this.hidden && this.snapshotCamera?.camera) {
            this.snapshotCamera.camera.enabled = true;
        }
        // 重启预览循环以适配新的RT与像素尺寸
        this.stopPreviewLoop();
        this.startPreviewLoop();
        if (this.scene.forceRender !== undefined) {
            this.scene.forceRender = true;
        }

        // 在对角锁定时，根据当前输入的对角FOV保持不变并转换相机水平FOV
        if (this.lockMode === 'diagonal' && this.fovInput && this.snapshotCamera?.camera) {
            const aspectNum = this.currentAspect === '16:9' ? (16 / 9) : (4 / 3);
            const dRad = Number(this.fovInput.value) * Math.PI / 180;
            const hRad = 2 * Math.atan(Math.tan(dRad / 2) / Math.sqrt(1 + 1 / (aspectNum * aspectNum)));
            this.snapshotCamera.camera.fov = hRad * 180 / Math.PI;
        }

        // 更新面板canvas尺寸已在 rebuildPreviewTargets 中完成

        // 更新按钮激活态（使用类，避免内联样式覆盖主题与统一色）
        if (this.aspectButtons) {
            const { fourThree, sixteenNine } = this.aspectButtons;
            if (aspect === '4:3') {
                fourThree.class.add('pcui-button-active');
                sixteenNine.class.remove('pcui-button-active');
            } else {
                sixteenNine.class.add('pcui-button-active');
                fourThree.class.remove('pcui-button-active');
            }
        }

        // 刷新视椎体与派生FOV（仅在相机就绪时）
        if (this.snapshotCamera?.camera) {
            this.updateFrustumVisualization();
            this.updateDerivedFovs();
            if (this.scene.forceRender !== undefined) {
                this.scene.forceRender = true;
            }
        }
    }

    destroy() {
        // 清理资源
        if (this.snapshotCamera) {
            this.snapshotCamera.destroy();
        }

        // 移除DOM元素
        if (this.dom && this.dom.parentNode) {
            this.dom.parentNode.removeChild(this.dom);
        }

        super.destroy();
    }
}

export { SnapshotView };
