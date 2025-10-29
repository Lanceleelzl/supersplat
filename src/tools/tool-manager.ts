import { Events } from '../events';

// 工具接口定义
interface Tool {
    activate: () => void;    // 激活工具
    deactivate: () => void;  // 停用工具
}

// 工具管理器类，负责管理各种编辑工具
class ToolManager {
    tools = new Map<string, Tool>();  // 工具映射表
    events: Events;                   // 事件系统
    active: string | null = null;     // 当前激活的工具

    constructor(events: Events) {
        this.events = events;

        this.events.on('tool.deactivate', () => {
            this.activate(null);
        });

        this.events.function('tool.active', () => {
            return this.active;
        });

        let coordSpace: 'local' | 'world' = 'world';  // 坐标空间：本地或世界

        const setCoordSpace = (space: 'local' | 'world') => {
            if (space !== coordSpace) {
                coordSpace = space;
                events.fire('tool.coordSpace', coordSpace);
            }
        };

        events.function('tool.coordSpace', () => {
            return coordSpace;
        });

        events.on('tool.setCoordSpace', (value: 'local' | 'world') => {
            setCoordSpace(value);
        });

        events.on('tool.toggleCoordSpace', () => {
            setCoordSpace(coordSpace === 'local' ? 'world' : 'local');
        });

        // 共享的拖拽与变换时间状态，用于避免拖拽结束后的误点击清空选择
        let toolDragging = false;
        let lastTransformEventTime = 0;

        events.function('tool.isDragging', () => {
            return toolDragging;
        });
        events.function('tool.justTransformed', () => {
            return (Date.now() - lastTransformEventTime) < 250;
        });
        events.function('tool.shouldIgnoreClick', () => {
            return toolDragging || (Date.now() - lastTransformEventTime) < 250;
        });

        events.on('tool.dragging', (value: boolean) => {
            toolDragging = !!value;
            if (toolDragging) {
                lastTransformEventTime = Date.now();
            }
        });
        events.on('tool.transformed', () => {
            lastTransformEventTime = Date.now();
        });
    }

    // 注册工具到管理器
    register(name: string, tool: Tool) {
        this.tools.set(name, tool);

        this.events.on(`tool.${name}`, () => {
            this.activate(name);
        });
    }

    get(toolName: string) {
        return (toolName && this.tools.get(toolName)) ?? null;
    }

    activate(toolName: string | null) {
        if (toolName === this.active) {
            // re-activating the currently active tool deactivates it
            if (toolName) {
                this.activate(null);
            }
        } else {
            // deactive old tool
            if (this.active) {
                const tool = this.tools.get(this.active);
                tool.deactivate();
                this.events.fire(`tool.${this.active}.deactivated`);
                this.events.fire('tool.deactivated', this.active);
            }

            this.active = toolName;

            // activate the new
            if (this.active) {
                const tool = this.tools.get(this.active);
                tool.activate();
            }

            this.events.fire(`tool.${toolName}.activated`);
            this.events.fire('tool.activated', toolName);
        }
    }
}

export { ToolManager };
