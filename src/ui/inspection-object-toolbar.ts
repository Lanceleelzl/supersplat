import { Container, Element as PcuiElement, Label, NumericInput } from '@playcanvas/pcui';

import createFaceSvg from './svg/createFace.svg';
import createLineSvg from './svg/createLine.svg';
import createPointSvg from './svg/createPoint.svg';

const createSvg = (svgString: string) => {
    const content = svgString.startsWith('data:image/svg+xml,') ?
        decodeURIComponent(svgString.substring('data:image/svg+xml,'.length)) :
        svgString;
    return new DOMParser().parseFromString(content, 'image/svg+xml').documentElement;
};

class InspectionObjectToolbar extends Container {
    private dragHandle: Container;
    private sizeInput: NumericInput | null = null;
    public btnPoint!: Container;
    public btnLine!: Container;
    public btnFace!: Container;
    private currentMode: 'point'|'line'|'face'|null = null;

    constructor(args = {}) {
        args = {
            ...args,
            id: 'inspection-object-toolbar',
            class: ['select-toolbar'],
            hidden: true
        };
        super(args);

        // 三个功能按钮（容器采用与底部工具栏一致的样式）
        this.btnPoint = new Container({ id: 'xjdx-btn-point', class: 'bottom-toolbar-tool' });
        this.btnLine = new Container({ id: 'xjdx-btn-line', class: 'bottom-toolbar-tool' });
        this.btnFace = new Container({ id: 'xjdx-btn-face', class: 'bottom-toolbar-tool' });

        const iconPoint = createSvg(createPointSvg) as HTMLElement;
        const iconLine = createSvg(createLineSvg) as HTMLElement;
        const iconFace = createSvg(createFaceSvg) as HTMLElement;
        iconPoint.style.width = '20px';
        iconPoint.style.height = '20px';
        iconLine.style.width = '20px';
        iconLine.style.height = '20px';
        iconFace.style.width = '20px';
        iconFace.style.height = '20px';
        this.btnPoint.dom.appendChild(iconPoint);
        this.btnLine.dom.appendChild(iconLine);
        this.btnFace.dom.appendChild(iconFace);

        // 图标大小设置（默认 30），放入按钮容器中以统一样式高度
        // 暂不提供大小调节控件

        // 拖拽头部区域（右侧），使用分隔条样式
        this.dragHandle = new Container({ class: 'select-toolbar-button' });
        this.dragHandle.dom.style.cursor = 'move';
        this.dragHandle.dom.style.width = '12px';
        this.dragHandle.dom.style.minWidth = '12px';
        this.dragHandle.dom.style.height = '38px';
        this.dragHandle.dom.style.background = 'transparent';

        this.append(this.btnPoint);
        this.append(this.btnLine);
        this.append(this.btnFace);
        this.append(this.dragHandle);

        // 强制与选择工具条一致的横向布局
        this.dom.style.display = 'flex';
        this.dom.style.flexDirection = 'row';
        this.dom.style.alignItems = 'center';

        // 事件抛出供 main.ts / 工具使用
        const setActive = (mode: 'point'|'line'|'face'|null) => {
            this.btnPoint.class[mode === 'point' ? 'add' : 'remove']('active');
            this.btnLine.class[mode === 'line' ? 'add' : 'remove']('active');
            this.btnFace.class[mode === 'face' ? 'add' : 'remove']('active');
            this.currentMode = mode as any;
        };
        const toggleMode = (mode: 'point'|'line'|'face') => {
            if (this.currentMode === mode) {
                setActive(null);
                this.emit('toggleActive', false);
            } else {
                setActive(mode);
                this.emit('setMode', mode);
                this.emit('toggleActive', true);
            }
        };
        this.btnPoint.dom.addEventListener('click', () => toggleMode('point'));
        this.btnLine.dom.addEventListener('click', () => toggleMode('line'));
        this.btnFace.dom.addEventListener('click', () => toggleMode('face'));
        // 暂无大小调节事件

        // 简易拖拽定位
        const onDown = (e: PointerEvent) => {
            const startX = e.clientX;
            const startY = e.clientY;
            const rect = this.dom.getBoundingClientRect();
            const baseLeft = rect.left;
            const baseTop = rect.top;
            this.dragHandle.dom.setPointerCapture(e.pointerId);
            const move = (ev: PointerEvent) => {
                if ((ev as any).buttons === 0) return; // 仅在按下时拖动
                const dx = ev.clientX - startX;
                const dy = ev.clientY - startY;
                this.dom.style.left = `${Math.round(baseLeft + dx)}px`;
                this.dom.style.top = `${Math.round(baseTop + dy)}px`;
            };
            const up = (ev: PointerEvent) => {
                try {
                    this.dragHandle.dom.releasePointerCapture(e.pointerId);
                } catch {}
                this.dragHandle.dom.removeEventListener('pointermove', move);
                this.dragHandle.dom.removeEventListener('pointerup', up);
            };
            this.dragHandle.dom.addEventListener('pointermove', move);
            this.dragHandle.dom.addEventListener('pointerup', up);
        };
        this.dragHandle.dom.addEventListener('pointerdown', onDown);

        // 阻止穿透到场景
        const stop = (e: Event) => {
            e.stopPropagation();
            (e as any).preventDefault?.();
        };
        this.dom.style.pointerEvents = 'auto';
        // 捕获与冒泡阶段都阻止
        ['pointerdown','pointerup','mousedown','mouseup','contextmenu'].forEach((type) => {
            this.dom.addEventListener(type as any, stop);
        });
        this.dom.addEventListener('wheel', stop, { passive: false } as any);
        // 按钮也阻止事件穿透
        [this.btnPoint.dom, this.btnLine.dom, this.btnFace.dom, this.dragHandle.dom].forEach((el) => {
            ['pointerdown','pointerup','mousedown','mouseup','contextmenu'].forEach((type) => {
                el.addEventListener(type as any, stop);
            });
        });

        // 初始无激活状态，悬停仅由CSS提供边框高亮
    }
}

export { InspectionObjectToolbar };
