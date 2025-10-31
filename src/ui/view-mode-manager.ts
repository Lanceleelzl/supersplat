import { Events } from '../events';

// 视图模式类型
export type ViewMode = 'perspective' | 'top' | 'bottom' | 'left' | 'right' | 'front' | 'back';

// 视图模式管理器
export class ViewModeManager {
    private events: Events;
    private currentMode: ViewMode = 'perspective';

    constructor(events: Events) {
        this.events = events;
        this.setupEventListeners();
    }

    private setupEventListeners() {
        // 监听视图模式切换事件（与面板统一为 viewMode.set）
        this.events.on('viewMode.set', (mode: ViewMode) => {
            this.setViewMode(mode);
        });

        // 在正视模式下限制旋转
        this.events.on('camera.beforeOrbit', (orbitData: { dx: number; dy: number }) => {
            if (this.currentMode !== 'perspective') {
                orbitData.dx = 0;
                orbitData.dy = 0;
            }
        });
    }

    setViewMode(mode: ViewMode) {
        if (this.currentMode === mode) return;

        // 切换模式并驱动已有的核心事件
        if (mode === 'perspective') {
            // 退出正交：交由核心编辑器设置投影
            this.events.fire('camera.setPerspective');
        } else {
            // 映射轴到现有的 camera.align 事件
            const axis = this.mapModeToAxis(mode);
            if (axis) {
                this.events.fire('camera.align', axis);
            }
        }

        this.currentMode = mode;
        this.events.fire('viewMode.changed', mode);
    }

    getCurrentMode(): ViewMode {
        return this.currentMode;
    }

    private mapModeToAxis(mode: Exclude<ViewMode, 'perspective'>): string | null {
        switch (mode) {
            case 'top': return 'pz';      // 上：+Z
            case 'bottom': return 'nz';   // 下：-Z
            case 'left': return 'nx';     // 左：-X
            case 'right': return 'px';    // 右：+X
            case 'front': return 'ny';    // 前：-Y
            case 'back': return 'py';     // 后：+Y
            default: return null;
        }
    }
}
