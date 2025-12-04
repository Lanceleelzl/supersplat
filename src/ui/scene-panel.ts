import { Container, Element, Label } from '@playcanvas/pcui';

import { Events } from '../events';
import { localize } from './localization';
import { SplatList } from './splat-list';
import sceneImportSvg from './svg/import.svg';
import sceneNewSvg from './svg/new.svg';
import { Tooltips } from './tooltips';
import { Transform } from './transform';

const createSvg = (svgString: string) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement;
};

class ScenePanel extends Container {
    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            id: 'scene-panel',
            class: 'panel'
        };

        super(args);

        // stop pointer events bubbling
        ['pointerdown', 'pointerup', 'pointermove', 'wheel', 'dblclick'].forEach((eventName) => {
            this.dom.addEventListener(eventName, (event: Event) => event.stopPropagation());
        });

        // 注意：拖拽功能需在标题栏创建并插入后再绑定

        const sceneHeader = new Container({
            class: 'panel-header'
        });

        const sceneIcon = new Label({
            text: '\uE344',
            class: 'panel-header-icon'
        });

        const sceneLabel = new Label({
            text: localize('panel.scene-manager'),
            class: 'panel-header-label'
        });

        const sceneImport = new Container({
            class: 'panel-header-button'
        });
        sceneImport.dom.appendChild(createSvg(sceneImportSvg));

        const sceneNew = new Container({
            class: 'panel-header-button'
        });
        sceneNew.dom.appendChild(createSvg(sceneNewSvg));

        sceneHeader.append(sceneIcon);
        sceneHeader.append(sceneLabel);
        sceneHeader.append(sceneImport);
        sceneHeader.append(sceneNew);

        sceneImport.on('click', async () => {
            await events.invoke('scene.import');
        });

        sceneNew.on('click', () => {
            events.invoke('doc.new');
        });

        tooltips.register(sceneImport, 'Import Scene', 'top');
        tooltips.register(sceneNew, 'New Scene', 'top');

        const splatList = new SplatList(events);

        const splatListContainer = new Container({
            class: 'splat-list-container'
        });
        splatListContainer.append(splatList);

        const transformHeader = new Container({
            class: 'panel-header'
        });

        const transformIcon = new Label({
            text: '\uE111',
            class: 'panel-header-icon'
        });

        const transformLabel = new Label({
            text: localize('panel.scene-manager.transform'),
            class: 'panel-header-label'
        });

        transformHeader.append(transformIcon);
        transformHeader.append(transformLabel);

        this.append(sceneHeader);
        this.append(splatListContainer);
        this.append(transformHeader);
        this.append(new Transform(events));
        this.append(new Element({
            class: 'panel-header',
            height: 20
        }));

        // 标题栏已就绪，绑定拖拽功能
        this.addDragFunctionality();
    }

    private addDragFunctionality() {
        let isDragging = false;
        const dragOffset = { x: 0, y: 0 };

        // 找到面板头部作为拖拽句柄（所有标题区域都可拖拽）
        const headerElements = this.dom.querySelectorAll('.panel-header');
        if (headerElements.length > 0) {
            headerElements.forEach((handleEl) => {
                const dragHandle = handleEl as HTMLElement;
                dragHandle.style.cursor = 'move';

                const onPointerDown = (e: PointerEvent) => {
                    // 只响应左键点击
                    if (e.button !== 0) return;

                    // 避免点击标题栏按钮触发拖拽
                    const target = e.target as HTMLElement;
                    if (target.closest('.panel-header-button') || target.closest('.panel-header-close') || target.closest('.panel-header-pin')) {
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
                    dragHandle.setPointerCapture(e.pointerId);

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
                    if (isDragging) {
                        isDragging = false;
                        this.dom.style.zIndex = '100';

                        // 释放指针捕获
                        if (dragHandle.hasPointerCapture(e.pointerId)) {
                            dragHandle.releasePointerCapture(e.pointerId);
                        }
                    }
                };

                // 绑定事件到每个拖拽句柄
                dragHandle.addEventListener('pointerdown', onPointerDown);
                dragHandle.addEventListener('pointermove', onPointerMove);
                dragHandle.addEventListener('pointerup', onPointerUp);

                // 处理指针取消事件（例如触摸被中断）
                dragHandle.addEventListener('pointercancel', onPointerUp);
            });
        }
    }
}

export { ScenePanel };
