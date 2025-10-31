import { Button, Container, Element, Label } from '@playcanvas/pcui';
import { Events } from '../events';
import { localize } from './localization';
import { Tooltips } from './tooltips';

// 视图模式类型定义
export type ViewMode = 'perspective' | 'top' | 'bottom' | 'left' | 'right' | 'front' | 'back';

// 视图模式配置
const VIEW_MODES: { [key in ViewMode]: { name: string, icon: string, tooltip: string } } = {
    perspective: { name: '透视', icon: 'E283', tooltip: '透视视图' },
    top: { name: '上', icon: 'E111', tooltip: '正视图 - 上' },
    bottom: { name: '下', icon: 'E112', tooltip: '正视图 - 下' },
    front: { name: '前', icon: 'E115', tooltip: '正视图 - 前' },
    back: { name: '后', icon: 'E116', tooltip: '正视图 - 后' },
    left: { name: '左', icon: 'E113', tooltip: '正视图 - 左' },
    right: { name: '右', icon: 'E114', tooltip: '正视图 - 右' }
};

class ViewModePanel extends Container {
    private events: Events;
    private tooltips: Tooltips;
    private currentMode: ViewMode = 'perspective';
    private buttons: { [key in ViewMode]: Button } = {} as any;

    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            id: 'view-mode-panel',
            class: 'view-mode-panel'
        };

        super(args);

        this.events = events;
        this.tooltips = tooltips;

        // 阻止事件冒泡
        this.dom.addEventListener('pointerdown', (event) => {
            event.stopPropagation();
        });

        this.createUI();
        this.bindEvents();
    }

    private createUI() {
        // 创建标题
        const title = new Label({
            class: 'view-mode-title',
            text: '视图模式'
        });
        this.append(title);

        // 创建按钮容器
        const buttonContainer = new Container({
            class: 'view-mode-buttons'
        });

        // 创建所有视图模式按钮
        Object.entries(VIEW_MODES).forEach(([mode, config]) => {
            const buttonClasses = ['view-mode-button'];
            if (mode === 'perspective') {
                buttonClasses.push('active');
            }
            
            const button = new Button({
                id: `view-mode-${mode}`,
                class: buttonClasses,
                icon: config.icon
            });

            // 添加文本标签
            const label = new Label({
                class: 'view-mode-label',
                text: config.name
            });
            
            const buttonWrapper = new Container({
                class: 'view-mode-button-wrapper'
            });
            buttonWrapper.append(button);
            buttonWrapper.append(label);

            buttonContainer.append(buttonWrapper);

            this.buttons[mode as ViewMode] = button;
            this.tooltips.register(button, config.tooltip, 'left');

            // 绑定点击事件
            button.on('click', () => {
                this.setViewMode(mode as ViewMode);
            });
        });

        this.append(buttonContainer);
    }

    private bindEvents() {
        // 监听视图模式变化事件
        this.events.on('viewMode.changed', (mode: ViewMode) => {
            this.updateActiveButton(mode);
        });
    }

    private setViewMode(mode: ViewMode) {
        if (this.currentMode === mode) return;

        this.currentMode = mode;
        this.updateActiveButton(mode);
        
        // 触发视图模式变化事件
        this.events.fire('viewMode.set', mode);
    }

    private updateActiveButton(mode: ViewMode) {
        // 移除所有按钮的激活状态
        Object.values(this.buttons).forEach(button => {
            button.class.remove('active');
        });

        // 激活当前模式按钮
        if (this.buttons[mode]) {
            this.buttons[mode].class.add('active');
        }
    }

    public getCurrentMode(): ViewMode {
        return this.currentMode;
    }
}

export { ViewModePanel };
