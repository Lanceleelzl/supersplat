import { Container, NumericInput } from '@playcanvas/pcui';
import { Mat4, Quat, TranslateGizmo, Vec3 } from 'playcanvas';

import { TransformTool } from './transform-tool';
import { Events } from '../events';
import { Pivot } from '../pivot';
import { Scene } from '../scene';

// 移动工具类，用于拖拽移动场景中的对象
class MoveTool extends TransformTool {
    private selectToolbar: Container;
    private stepInput: NumericInput;
    private step: number = 0.1;
    private active = false;
    private canvasContainer?: Container;
    private scene: Scene;
    private _events: Events;

    constructor(events: Events, scene: Scene, parent?: HTMLElement, canvasContainer?: Container) {
        // 创建平移小工具
        const gizmo = new TranslateGizmo(scene.camera.entity.camera, scene.gizmoLayer);

        super(gizmo, events, scene);
        this._events = events;
        this.scene = scene;

        // UI：单位距离输入框（参考测量工具样式）
        this.stepInput = new NumericInput({
            width: 120,
            placeholder: 'Step',
            precision: 3,
            min: 0.000001,
            value: this.step
        });

        this.stepInput.on('change', (value: number) => {
            if (typeof value === 'number' && isFinite(value) && value > 0) {
                this.step = value;
            }
        });

        this.selectToolbar = new Container({
            class: 'select-toolbar',
            hidden: true
        });
        this.selectToolbar.dom.addEventListener('pointerdown', e => e.stopPropagation());
        this.selectToolbar.append(this.stepInput);

        this.canvasContainer = canvasContainer;
        if (canvasContainer) {
            canvasContainer.append(this.selectToolbar);
        } else if (parent) {
            // 兜底：如果未提供canvasContainer，则直接追加到父容器
            parent.appendChild(this.selectToolbar.dom);
        }

        // 监听箭头键事件（由快捷键系统派发）
        const onArrow = (dir: 'up' | 'down' | 'left' | 'right') => {
            if (!this.active) return;
            const activeTool = events.invoke('tool.active');
            if (activeTool !== 'move') return;

            const pivot = events.invoke('pivot') as Pivot;
            if (!pivot) return;
            // 屏幕方向：使用相机的世界空间right/up向量
            const camEntity = this.scene.camera.entity;
            const worldDelta = new Vec3(0, 0, 0);
            switch (dir) {
                case 'up':
                    worldDelta.add(camEntity.up.clone().mulScalar(this.step));
                    break;
                case 'down':
                    worldDelta.add(camEntity.up.clone().mulScalar(-this.step));
                    break;
                case 'left':
                    worldDelta.add(camEntity.right.clone().mulScalar(-this.step));
                    break;
                case 'right':
                    worldDelta.add(camEntity.right.clone().mulScalar(this.step));
                    break;
            }

            const newPos = new Vec3();
            newPos.copy(pivot.transform.position).add(worldDelta);

            // 应用一次微移动（支持长按重复触发）
            pivot.start();
            pivot.moveTRS(newPos, pivot.transform.rotation as Quat, pivot.transform.scale);
            pivot.end();
        };

        // 通过键盘事件实现微调（长按产生重复keydown事件）
        const keydown = (e: KeyboardEvent) => {
            if (!this.active) return;
            switch (e.key) {
                case 'ArrowUp':
                    onArrow('up');
                    e.preventDefault();
                    e.stopPropagation();
                    break;
                case 'ArrowDown':
                    onArrow('down');
                    e.preventDefault();
                    e.stopPropagation();
                    break;
                case 'ArrowLeft':
                    onArrow('left');
                    e.preventDefault();
                    e.stopPropagation();
                    break;
                case 'ArrowRight':
                    onArrow('right');
                    e.preventDefault();
                    e.stopPropagation();
                    break;
            }
        };

        // 阻止箭头键的 keyup 事件传递到相机控制器，避免残留状态
        const keyup = (e: KeyboardEvent) => {
            if (!this.active) return;
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                e.stopPropagation();
            }
        };

        // 保存为实例方法以便在activate/deactivate中挂载与卸载
        (this as any)._keydownHandler = keydown;
        (this as any)._keyupHandler = keyup;
        // 保存正交状态监听器：正交时显示并启用；透视时隐藏并禁用
        (this as any)._orthoListener = (_value: boolean) => {
            if (this.stepInput) {
                this.stepInput.enabled = true;
            }
            const repositionFn = (this as any)._reposition as () => void;
            if (this.selectToolbar) {
                const prevVis = this.selectToolbar.dom.style.visibility;
                const prevOp = this.selectToolbar.dom.style.opacity;
                this.selectToolbar.hidden = false;
                this.selectToolbar.dom.style.visibility = 'hidden';
                this.selectToolbar.dom.style.opacity = '0';
                if (repositionFn) repositionFn();
                this.selectToolbar.dom.style.visibility = prevVis || '';
                this.selectToolbar.dom.style.opacity = prevOp || '';
            }
        };

        // 定位到“移动”按钮上方
        const reposition = () => {
            try {
                const btn = document.getElementById('bottom-toolbar-translate');
                const containerDom = this.canvasContainer?.dom ?? this.selectToolbar.dom.parentElement;
                if (!btn || !containerDom) {
                    // 无法定位时保持隐藏或在屏幕外，避免闪现
                    this.selectToolbar.dom.style.left = '-9999px';
                    this.selectToolbar.dom.style.top = '0';
                    this.selectToolbar.dom.style.bottom = '';
                    this.selectToolbar.dom.style.transform = 'translate(0, 0)';
                    return;
                }
                const btnRect = btn.getBoundingClientRect();
                const contRect = containerDom.getBoundingClientRect();
                const leftPx = btnRect.left + (btnRect.width / 2) - contRect.left;
                // 测量高度时使用不可见状态，避免闪现
                const prevVisibility = this.selectToolbar.dom.style.visibility;
                const prevOpacity = this.selectToolbar.dom.style.opacity;
                this.selectToolbar.dom.style.visibility = 'hidden';
                this.selectToolbar.dom.style.opacity = '0';
                const height = this.selectToolbar.dom.offsetHeight || 54;
                // 在设定位置后再恢复可见性

                const topPx = (btnRect.top - contRect.top) - height - 8;

                this.selectToolbar.dom.style.left = `${leftPx}px`;
                this.selectToolbar.dom.style.top = `${Math.max(0, topPx)}px`;
                this.selectToolbar.dom.style.bottom = '';
                this.selectToolbar.dom.style.transform = 'translate(-50%, 0)';
                this.selectToolbar.dom.style.visibility = prevVisibility || '';
                this.selectToolbar.dom.style.opacity = prevOpacity || '';
            } catch (_e) {
                // 忽略定位错误
            }
        };
        (this as any)._reposition = reposition;

        // 继承父类的 activate/deactivate（父类为实例属性），并在此进行扩展
        const parentActivate = this.activate.bind(this);
        const parentDeactivate = this.deactivate.bind(this);

        this.activate = () => {
            parentActivate();
            this.active = true;
            this.stepInput.enabled = true;
            const repositionFn = (this as any)._reposition as () => void;
            if (this.selectToolbar) {
                const prevVis = this.selectToolbar.dom.style.visibility;
                const prevOp = this.selectToolbar.dom.style.opacity;
                this.selectToolbar.hidden = false;
                this.selectToolbar.dom.style.visibility = 'hidden';
                this.selectToolbar.dom.style.opacity = '0';
                if (repositionFn) repositionFn();
                this.selectToolbar.dom.style.visibility = prevVis || '';
                this.selectToolbar.dom.style.opacity = prevOp || '';
            }
            // 激活时监听键盘方向键
            const handler = (this as any)._keydownHandler as (e: KeyboardEvent) => void;
            const upHandler = (this as any)._keyupHandler as (e: KeyboardEvent) => void;
            if (handler) {
                document.addEventListener('keydown', handler, true);
            }
            if (upHandler) {
                document.addEventListener('keyup', upHandler, true);
            }
            // 监听正交状态变化
            const orthoListener = (this as any)._orthoListener as (value: boolean) => void;
            if (orthoListener) {
                this._events.on('camera.ortho', orthoListener);
            }
            if (repositionFn) {
                window.addEventListener('resize', repositionFn, true);
            }
        };

        this.deactivate = () => {
            parentDeactivate();
            this.active = false;
            if (this.selectToolbar) {
                this.selectToolbar.hidden = true;
            }
            const handler = (this as any)._keydownHandler as (e: KeyboardEvent) => void;
            const upHandler = (this as any)._keyupHandler as (e: KeyboardEvent) => void;
            if (handler) {
                document.removeEventListener('keydown', handler, true);
            }
            if (upHandler) {
                document.removeEventListener('keyup', upHandler, true);
            }
            const orthoListener = (this as any)._orthoListener as (value: boolean) => void;
            if (orthoListener) {
                this._events.off('camera.ortho', orthoListener);
            }
            const repositionFn = (this as any)._reposition as () => void;
            if (repositionFn) {
                window.removeEventListener('resize', repositionFn, true);
            }
        };
    }

    // 移除方法定义，使用构造函数中定义的实例属性

    // 移除方法定义，使用构造函数中定义的实例属性
}

export { MoveTool };
