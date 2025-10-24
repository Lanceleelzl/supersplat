import { Button, Container, Element, Label } from '@playcanvas/pcui';

import { Events } from '../events';
import { localize } from './localization';
import { MenuPanel } from './menu-panel';
import threeDViewSvg from './svg/3Dview.svg';
import abstractStereoPerspectiveSvg from './svg/Abstract_stereo-perspective.svg';
import backviewSvg from './svg/backview.svg';
import bottomviewSvg from './svg/bottomview.svg';
import cameraFrameSelectionSvg from './svg/camera-frame-selection.svg';
import cameraResetSvg from './svg/camera-reset.svg';
import centersSvg from './svg/centers.svg';
import colorPanelSvg from './svg/color-panel.svg';
import frontviewSvg from './svg/frontview.svg';
import leftviewSvg from './svg/leftview.svg';
import rightviewSvg from './svg/rightview.svg';
import ringsSvg from './svg/rings.svg';
import showHideSplatsSvg from './svg/show-hide-splats.svg';
import upviewSvg from './svg/upview.svg';
import { Tooltips } from './tooltips';

const createSvg = (svgString: string) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement;
};

class RightToolbar extends Container {
    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            id: 'right-toolbar'
        };

        super(args);

        this.dom.addEventListener('pointerdown', (event) => {
            event.stopPropagation();
        });

        const ringsModeToggle = new Button({
            id: 'right-toolbar-mode-toggle',
            class: 'right-toolbar-toggle'
        });

        const showHideSplats = new Button({
            id: 'right-toolbar-show-hide',
            class: ['right-toolbar-toggle', 'active']
        });

        const cameraFrameSelection = new Button({
            id: 'right-toolbar-frame-selection',
            class: 'right-toolbar-button'
        });

        const cameraReset = new Button({
            id: 'right-toolbar-camera-origin',
            class: 'right-toolbar-button'
        });

        const colorPanel = new Button({
            id: 'right-toolbar-color-panel',
            class: 'right-toolbar-toggle'
        });

        const options = new Button({
            id: 'right-toolbar-options',
            class: 'right-toolbar-toggle',
            icon: 'E283'
        });

        // 新增：视图模式下拉按钮
        const viewModeDropdown = new Button({
            id: 'right-toolbar-view-mode',
            class: 'right-toolbar-toggle'
        });

        const centersDom = createSvg(centersSvg);
        const ringsDom = createSvg(ringsSvg);
        ringsDom.style.display = 'none';

        ringsModeToggle.dom.appendChild(centersDom);
        ringsModeToggle.dom.appendChild(ringsDom);
        showHideSplats.dom.appendChild(createSvg(showHideSplatsSvg));
        cameraFrameSelection.dom.appendChild(createSvg(cameraFrameSelectionSvg));
        cameraReset.dom.appendChild(createSvg(cameraResetSvg));
        colorPanel.dom.appendChild(createSvg(colorPanelSvg));
        // 初始化视图模式按钮为透视图标
        const setViewModeIcon = (mode: string) => {
            const iconMap: Record<string, string> = {
                perspective: abstractStereoPerspectiveSvg,
                front: frontviewSvg,
                back: backviewSvg,
                left: leftviewSvg,
                right: rightviewSvg,
                top: upviewSvg,
                bottom: bottomviewSvg
            };
            const svg = iconMap[mode] || abstractStereoPerspectiveSvg;
            while (viewModeDropdown.dom.firstChild) {
                viewModeDropdown.dom.removeChild(viewModeDropdown.dom.firstChild);
            }
            viewModeDropdown.dom.appendChild(createSvg(svg));
        };
        setViewModeIcon('perspective');
        // 统一激活样式：工具栏视图模式按钮始终使用激活高亮（与子菜单一致）
        viewModeDropdown.class.add('active');

        this.append(ringsModeToggle);
        this.append(showHideSplats);
        this.append(new Element({ class: 'right-toolbar-separator' }));
        this.append(cameraFrameSelection);
        this.append(cameraReset);
        this.append(colorPanel);
        // 将视图模式下拉按钮插入在 SVG 区块下方，并在其后增加分隔
        this.append(viewModeDropdown);
        this.append(new Element({ class: 'right-toolbar-separator' }));
        this.append(options);

        tooltips.register(ringsModeToggle, localize('tooltip.splat-mode'), 'left');
        tooltips.register(showHideSplats, localize('tooltip.show-hide'), 'left');
        tooltips.register(cameraFrameSelection, localize('tooltip.frame-selection'), 'left');
        tooltips.register(cameraReset, localize('tooltip.camera-reset'), 'left');
        tooltips.register(colorPanel, localize('tooltip.color-panel'), 'left');
        tooltips.register(options, localize('tooltip.view-options'), 'left');
        tooltips.register(viewModeDropdown, '视图模式', 'left');

        // add event handlers

        ringsModeToggle.on('click', () => {
            events.fire('camera.toggleMode');
            events.fire('camera.setOverlay', true);
        });
        showHideSplats.on('click', () => events.fire('camera.toggleOverlay'));
        cameraFrameSelection.on('click', () => events.fire('camera.focus'));
        cameraReset.on('click', () => events.fire('camera.reset'));
        colorPanel.on('click', () => events.fire('colorPanel.toggleVisible'));
        options.on('click', () => events.fire('viewPanel.toggleVisible'));

        events.on('camera.mode', (mode: string) => {
            ringsModeToggle.class[mode === 'rings' ? 'add' : 'remove']('active');
            centersDom.style.display = mode === 'rings' ? 'none' : 'block';
            ringsDom.style.display = mode === 'rings' ? 'block' : 'none';
        });

        events.on('camera.overlay', (value: boolean) => {
            showHideSplats.class[value ? 'add' : 'remove']('active');
        });

        events.on('colorPanel.visible', (visible: boolean) => {
            colorPanel.class[visible ? 'add' : 'remove']('active');
        });

        events.on('viewPanel.visible', (visible: boolean) => {
            options.class[visible ? 'add' : 'remove']('active');
        });

        // 为下拉菜单准备图标元素（pcui Element）
        const iconPerspective = new Element({ class: 'menu-item-icon' });
        iconPerspective.dom.appendChild(createSvg(abstractStereoPerspectiveSvg));
        const iconFront = new Element({ class: 'menu-item-icon' });
        iconFront.dom.appendChild(createSvg(frontviewSvg));
        const iconBack = new Element({ class: 'menu-item-icon' });
        iconBack.dom.appendChild(createSvg(backviewSvg));
        const iconLeft = new Element({ class: 'menu-item-icon' });
        iconLeft.dom.appendChild(createSvg(leftviewSvg));
        const iconRight = new Element({ class: 'menu-item-icon' });
        iconRight.dom.appendChild(createSvg(rightviewSvg));
        const iconTop = new Element({ class: 'menu-item-icon' });
        iconTop.dom.appendChild(createSvg(upviewSvg));
        const iconBottom = new Element({ class: 'menu-item-icon' });
        iconBottom.dom.appendChild(createSvg(bottomviewSvg));

        // 视图模式下拉菜单
        const viewModeMenu = new MenuPanel([
            { text: '透视', icon: iconPerspective, onSelect: () => events.fire('viewMode.set', 'perspective') },
            { text: '前', icon: iconFront, onSelect: () => events.fire('viewMode.set', 'front') },
            { text: '后', icon: iconBack, onSelect: () => events.fire('viewMode.set', 'back') },
            { text: '左', icon: iconLeft, onSelect: () => events.fire('viewMode.set', 'left') },
            { text: '右', icon: iconRight, onSelect: () => events.fire('viewMode.set', 'right') },
            { text: '上', icon: iconTop, onSelect: () => events.fire('viewMode.set', 'top') },
            { text: '下', icon: iconBottom, onSelect: () => events.fire('viewMode.set', 'bottom') }
        ], {
            class: ['menu-panel', 'menu-panel--compact', 'menu-panel--flat']
        });

        this.append(viewModeMenu);

        // 当前模式高亮：使用图标颜色区分（不使用勾选）
        const modeIndex: Record<string, number> = {
            perspective: 0,
            front: 1,
            back: 2,
            left: 3,
            right: 4,
            top: 5,
            bottom: 6
        };
        const updateActiveModeRow = (mode: string) => {
            const children = viewModeMenu.dom.children;
            for (let i = 0; i < children.length; i++) {
                const child = children.item(i) as any;
                if (child && child.ui && child.ui.class) {
                    child.ui.class.remove('active');
                }
            }
            const idx = modeIndex[mode] ?? 0;
            const target = children.item(idx) as any;
            if (target && target.ui && target.ui.class) {
                target.ui.class.add('active');
            }
        };
        // 初始为透视激活
        updateActiveModeRow('perspective');
        // 监听模式变化
        events.on('viewMode.changed', (mode: string) => {
            updateActiveModeRow(mode);
            setViewModeIcon(mode);
            // 保持工具栏按钮激活态样式
            viewModeDropdown.class.add('active');
        });

        const activateViewModeMenu = () => {
            viewModeMenu.hidden = false;
            const BUTTON_GAP = 8; // 与按钮的可视间距
            viewModeMenu.position(viewModeDropdown.dom, 'left', BUTTON_GAP);

            const parent = (viewModeMenu.dom.offsetParent as HTMLElement) || document.body;
            const parentRect = parent.getBoundingClientRect();
            const menuRect = viewModeMenu.dom.getBoundingClientRect();

            // 始终使用右侧设置面板(#view-panel)与右侧工具栏(#right-toolbar)的固定右侧偏移差值进行对齐
            const toolbarEl = document.getElementById('right-toolbar');
            const settingsPanel = document.getElementById('view-panel');

            if (toolbarEl && settingsPanel) {
                const toolbarRect = toolbarEl.getBoundingClientRect();
                const toolbarComputed = window.getComputedStyle(toolbarEl);
                const settingsComputed = window.getComputedStyle(settingsPanel);

                const toolbarRightOffset = parseFloat(toolbarComputed.right || '0'); // 如 24px
                const settingsRightOffset = parseFloat(settingsComputed.right || '0'); // 如 102px
                const rightDelta = settingsRightOffset - toolbarRightOffset; // 设置面板相对工具栏的右侧偏移差

                const desiredRight = toolbarRect.right - rightDelta; // 目标右缘 = 工具栏右缘 - 差值
                const desiredLeft = desiredRight - menuRect.width - parentRect.left;
                viewModeMenu.dom.style.left = `${desiredLeft}px`;
            } else {
                // 回退：以主菜单(#right-toolbar)左边缘为参照，子菜单右侧保持固定 20px 间距
                if (toolbarEl) {
                    const toolbarRect = toolbarEl.getBoundingClientRect();
                    const GAP_TO_TOOLBAR = 20;
                    const desiredRight = toolbarRect.left - GAP_TO_TOOLBAR;
                    const desiredLeft = desiredRight - menuRect.width - parentRect.left;
                    viewModeMenu.dom.style.left = `${desiredLeft}px`;
                }
            }

            // 扁平化去阴影（确保不受全局样式影响）
            (viewModeMenu.dom.style as any).filter = 'none';
            (viewModeMenu.dom.style as any).boxShadow = 'none';
        };

        viewModeDropdown.on('click', () => {
            if (!viewModeMenu.hidden) {
                viewModeMenu.hidden = true;
            } else {
                activateViewModeMenu();
            }
        });

        // 点击外部关闭菜单
        const closeIfOutside = (event: PointerEvent) => {
            if (!this.dom.contains(event.target as Node)) {
                viewModeMenu.hidden = true;
            }
        };
        window.addEventListener('pointerdown', closeIfOutside, true);
        window.addEventListener('pointerup', closeIfOutside, true);
    }
}

export { RightToolbar };
