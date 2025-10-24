import { Container, Element } from '@playcanvas/pcui';

import { ElementType } from '../element';
import { Events } from '../events';
import { GltfModel } from '../gltf-model';
import { Splat } from '../splat';
import { localize } from './localization';
// 导入SVG图标
import deleteSvg from './svg/delete.svg';
import hiddenSvg from './svg/hidden.svg';
import selectDuplicateSvg from './svg/select-duplicate.svg';
import shownSvg from './svg/shown.svg';

// 创建SVG元素的帮助函数
const createSvg = (svgString: string) => {
    let svgContent: string;
    
    // 检查是否是data URL格式
    if (svgString.startsWith('data:image/svg+xml,')) {
        svgContent = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    } else {
        // 直接使用SVG字符串内容
        svgContent = svgString;
    }
    
    return new DOMParser().parseFromString(svgContent, 'image/svg+xml').documentElement;
};

interface ContextMenuItem {
    text: string;
    icon?: string;
    action: () => void;
    enabled?: () => boolean;
}

class ContextMenu extends Container {
    private events: Events;
    private isVisible: boolean = false;
    private currentModel: GltfModel | null = null;
    private currentSplat: Splat | null = null;
    private menuItems: ContextMenuItem[] = [];
    private mouseDownPos: { x: number, y: number } | null = null;
    private isDragging: boolean = false;

    constructor(events: Events) {
        super({
            class: 'context-menu',
            hidden: true
        });

        this.events = events;
        this.setupMenuItems();
        this.bindEvents();
        this.createMenuDOM();

        // 添加到document.body以确保菜单可以覆盖其他元素
        document.body.appendChild(this.dom);
    }

    private setupMenuItems() {
        this.menuItems = [
            {
                text: '原位复制',
                icon: selectDuplicateSvg,
                action: () => this.duplicateInPlace(),
                enabled: () => this.currentModel !== null || this.currentSplat !== null
            },
            {
                text: '删除模型',
                icon: deleteSvg,
                action: () => this.deleteModel(),
                enabled: () => this.currentModel !== null || this.currentSplat !== null
            },
            {
                text: '隐藏模型',
                icon: hiddenSvg,
                action: () => this.hideModel(),
                enabled: () => (this.currentModel !== null && this.currentModel.entity?.enabled) ||
                              (this.currentSplat !== null && this.currentSplat.visible)
            },
            {
                text: '显示模型',
                icon: shownSvg,
                action: () => this.showModel(),
                enabled: () => (this.currentModel !== null && !this.currentModel.entity?.enabled) ||
                              (this.currentSplat !== null && !this.currentSplat.visible)
            }
        ];
    }

    private createMenuDOM() {
        // 样式由CSS控制，只设置必要的定位相关样式
        this.dom.style.position = 'fixed';

        this.menuItems.forEach((item, index) => {
            const menuItem = new Element({
                class: 'context-menu-item'
            });

            // 样式由CSS控制
            const iconContainer = document.createElement('span');
            iconContainer.style.display = 'flex';
            iconContainer.style.alignItems = 'center';
            iconContainer.style.width = '16px';
            iconContainer.style.height = '16px';

            if (item.icon) {
                const svgElement = createSvg(item.icon);
                svgElement.style.width = '16px';
                svgElement.style.height = '16px';
                svgElement.style.fill = 'currentColor';
                iconContainer.appendChild(svgElement);
            }

            const text = document.createElement('span');
            text.textContent = item.text;

            menuItem.dom.appendChild(iconContainer);
            menuItem.dom.appendChild(text);

            // 鼠标悬停效果由CSS控制，这里不需要JavaScript处理

            // 点击事件
            menuItem.dom.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                if (item.enabled ? item.enabled() : true) {
                    item.action();
                    this.hide();
                }
            });

            this.append(menuItem);
        });
    }

    private bindEvents() {
        // 监听鼠标按下事件，记录位置
        document.addEventListener('mousedown', (e) => {
            if (e.button === 2) { // 右键按下
                this.mouseDownPos = { x: e.clientX, y: e.clientY };
                this.isDragging = false;
            }
        });

        // 监听鼠标移动事件，检测拖拽
        document.addEventListener('mousemove', (e) => {
            if (this.mouseDownPos && e.buttons === 2) { // 右键拖拽中
                const deltaX = Math.abs(e.clientX - this.mouseDownPos.x);
                const deltaY = Math.abs(e.clientY - this.mouseDownPos.y);
                // 如果移动距离超过5像素，认为是拖拽
                if (deltaX > 5 || deltaY > 5) {
                    this.isDragging = true;
                }
            }
        });

        // 监听鼠标右键事件
        document.addEventListener('contextmenu', (e) => {
            // 检查是否在画布区域右键
            const canvas = document.querySelector('canvas');
            if (canvas && canvas.contains(e.target as Node)) {
                e.preventDefault();

                // 如果刚刚进行了拖拽，不显示菜单
                if (this.isDragging) {
                    this.isDragging = false;
                    this.mouseDownPos = null;
                    return;
                }

                // 获取当前选中的模型或高斯泼溅
                const selection = this.events.invoke('selection');
                if (selection && (selection.type === ElementType.model || selection.type === ElementType.splat)) {
                    if (selection.type === ElementType.model) {
                        this.currentModel = selection as GltfModel;
                        this.currentSplat = null;
                    } else {
                        this.currentSplat = selection as Splat;
                        this.currentModel = null;
                    }
                    this.show(e.clientX, e.clientY);
                } else {
                    this.hide();
                }
            } else {
                this.hide();
            }

            // 重置拖拽状态
            this.isDragging = false;
            this.mouseDownPos = null;
        });

        // 点击其他地方隐藏菜单
        document.addEventListener('click', (e) => {
            if (!this.dom.contains(e.target as Node)) {
                this.hide();
            }
        });

        // ESC键隐藏菜单
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hide();
            }
        });

        // 监听选择变化，如果没有选中模型或高斯泼溅则隐藏菜单
        this.events.on('selection.changed', (element: any) => {
            if (!element || (element.type !== ElementType.model && element.type !== ElementType.splat)) {
                this.currentModel = null;
                this.currentSplat = null;
                this.hide();
            } else {
                if (element.type === ElementType.model) {
                    this.currentModel = element as GltfModel;
                    this.currentSplat = null;
                } else {
                    this.currentSplat = element as Splat;
                    this.currentModel = null;
                }
            }
        });
    }

    private show(x: number, y: number) {
        if (this.isVisible) return;

        this.isVisible = true;
        this.hidden = false;

        // 更新菜单项状态
        this.updateMenuItemStates();

        // 设置位置，确保菜单不会超出屏幕边界
        const rect = this.dom.getBoundingClientRect();
        const maxX = window.innerWidth - rect.width - 10;
        const maxY = window.innerHeight - rect.height - 10;

        const finalX = Math.min(x, maxX);
        const finalY = Math.min(y, maxY);

        this.dom.style.left = `${finalX}px`;
        this.dom.style.top = `${finalY}px`;
    }

    private hide() {
        if (!this.isVisible) return;

        this.isVisible = false;
        this.hidden = true;
    }

    private updateMenuItemStates() {
        const items = this.dom.querySelectorAll('.context-menu-item');
        items.forEach((item, index) => {
            const menuItem = this.menuItems[index];
            const isEnabled = menuItem.enabled ? menuItem.enabled() : true;

            if (isEnabled) {
                item.classList.remove('disabled');
            } else {
                item.classList.add('disabled');
            }
        });
    }

    private duplicateInPlace() {
        try {
            if (this.currentModel) {
                console.log('开始原位复制GLB模型:', this.currentModel.filename);
                this.duplicateGltfModel(this.currentModel);
                console.log('GLB模型原位复制请求已发送');
            } else if (this.currentSplat) {
                // Splat 不支持复制：提示并不执行复制
                this.events.fire('showToast', 'Splat 不支持复制');
            }
        } catch (error) {
            console.error('原位复制失败:', error);
        }
    }

    private duplicateGltfModel(model: GltfModel) {
        // 触发GLB模型复制事件
        try {
            console.log('触发GLB模型复制事件:', model.filename);

            // 检查是否是巡检模型
            const isInspectionModel = (model as any).isInspectionModel;
            const inspectionPointName = (model as any).inspectionPointName;

            if (isInspectionModel && inspectionPointName) {
                // 巡检模型复制 - 使用与场景列表一致的事件
                console.log('巡检模型右键复制，点位:', inspectionPointName);
                this.events.fire('inspection.duplicateModel', inspectionPointName, model);
            } else {
                // 普通GLB模型复制
                this.events.fire('model.duplicate', model);
            }

        } catch (error) {
            console.error('复制GLB模型失败:', error);
            throw error;
        }
    }

    private duplicateSplatModel(splat: Splat) {
        // 触发高斯泼溅模型复制事件
        try {
            console.log('触发高斯泼溅模型复制事件:', splat.name);

            // 触发复制事件，编辑器会处理具体的复制逻辑
            this.events.fire('splat.duplicate', splat);

        } catch (error) {
            console.error('复制高斯泼溅模型失败:', error);
            throw error;
        }
    }

    private async deleteModel() {
        try {
            let elementName = '';
            let elementType = '';

            if (this.currentModel) {
                elementName = this.currentModel.filename;
                elementType = 'GLB模型';
            } else if (this.currentSplat) {
                elementName = this.currentSplat.name;
                elementType = '高斯泼溅模型';
            } else {
                return;
            }

            // 显示确认对话框
            const result = await this.events.invoke('showPopup', {
                type: 'yesno',
                header: '删除模型',
                message: `确定要从场景中删除 '${elementName}' 吗？此操作无法撤销。`
            });

            if (result?.action === 'yes') {
                if (this.currentModel) {
                    this.currentModel.destroy();
                    console.log('GLB模型删除成功:', elementName);
                    this.currentModel = null;
                } else if (this.currentSplat) {
                    this.currentSplat.destroy();
                    console.log('高斯泼溅模型删除成功:', elementName);
                    this.currentSplat = null;
                }

                // 隐藏菜单
                this.hide();
            }
        } catch (error) {
            console.error('删除模型失败:', error);
        }
    }

    private hideModel() {
        try {
            if (this.currentModel && this.currentModel.entity) {
                this.currentModel.entity.enabled = false;
                this.events.fire('model.visibility', this.currentModel);
                console.log('GLB模型已隐藏');
            } else if (this.currentSplat) {
                this.currentSplat.visible = false;
                this.events.fire('splat.visibility', this.currentSplat);
                console.log('高斯泼溅模型已隐藏');
            }
        } catch (error) {
            console.error('隐藏模型失败:', error);
        }
    }

    private showModel() {
        try {
            if (this.currentModel && this.currentModel.entity) {
                this.currentModel.entity.enabled = true;
                this.events.fire('model.visibility', this.currentModel);
                console.log('GLB模型已显示');
            } else if (this.currentSplat) {
                this.currentSplat.visible = true;
                this.events.fire('splat.visibility', this.currentSplat);
                console.log('高斯泼溅模型已显示');
            }
        } catch (error) {
            console.error('显示模型失败:', error);
        }
    }
}

export { ContextMenu };