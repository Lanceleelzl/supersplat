import { Vec3, Mat4 } from 'playcanvas';
import { Camera } from './camera';
import { Events } from './events';
import { ViewMode } from './ui/view-mode-panel';

// 正视图视角配置
const ORTHOGRAPHIC_VIEWS: { [key in Exclude<ViewMode, 'perspective'>]: { azim: number, elev: number } } = {
    top: { azim: 0, elev: -90 },      // 从上往下看
    bottom: { azim: 0, elev: 90 },    // 从下往上看
    left: { azim: -90, elev: 0 },     // 从左往右看
    right: { azim: 90, elev: 0 },     // 从右往左看
    front: { azim: 0, elev: 0 },      // 从前往后看
    back: { azim: 180, elev: 0 }      // 从后往前看
};

class ViewModeManager {
    private camera: Camera;
    private events: Events;
    private currentMode: ViewMode = 'perspective';
    private isOrthographicLocked = false;
    
    // 保存透视模式下的相机状态
    private perspectiveState = {
        azim: 30,
        elev: -15,
        distance: 1,
        focalPoint: new Vec3(0, 0.5, 0)
    };

    constructor(camera: Camera, events: Events) {
        this.camera = camera;
        this.events = events;
        
        this.bindEvents();
    }

    private bindEvents() {
        // 监听视图模式切换事件
        this.events.on('viewMode.set', (mode: ViewMode) => {
            this.setViewMode(mode);
        });

        // 监听相机控制事件，在正视模式下限制某些操作
        this.events.on('camera.beforeOrbit', (data: { dx: number, dy: number }) => {
            if (this.isOrthographicLocked) {
                // 在正视模式下阻止旋转操作
                data.dx = 0;
                data.dy = 0;
                return false;
            }
            return true;
        });

        // 允许平移操作
        this.events.on('camera.beforePan', () => {
            return true; // 所有模式都允许平移
        });

        // 允许缩放操作
        this.events.on('camera.beforeZoom', () => {
            return true; // 所有模式都允许缩放
        });
    }

    public setViewMode(mode: ViewMode) {
        if (this.currentMode === mode) return;

        // 如果从透视模式切换到正视模式，保存当前状态
        if (this.currentMode === 'perspective' && mode !== 'perspective') {
            this.savePerspectiveState();
        }

        this.currentMode = mode;

        if (mode === 'perspective') {
            this.setPerspectiveMode();
        } else {
            this.setOrthographicMode(mode);
        }

        // 触发视图模式变化事件
        this.events.fire('viewMode.changed', mode);
    }

    private savePerspectiveState() {
        this.perspectiveState.azim = this.camera.azim;
        this.perspectiveState.elev = this.camera.elevation;
        this.perspectiveState.distance = this.camera.distance;
        this.perspectiveState.focalPoint.copy(this.camera.focalPoint);
    }

    private setPerspectiveMode() {
        this.isOrthographicLocked = false;
        
        // 设置为透视投影
        this.camera.ortho = false;
        
        // 恢复透视模式下的相机状态
        this.camera.setAzimElev(this.perspectiveState.azim, this.perspectiveState.elev, 1);
        this.camera.setDistance(this.perspectiveState.distance, 1);
        this.camera.setFocalPoint(this.perspectiveState.focalPoint, 1);
    }

    private setOrthographicMode(mode: Exclude<ViewMode, 'perspective'>) {
        this.isOrthographicLocked = true;
        
        // 设置为正交投影
        this.camera.ortho = true;
        
        // 获取视角配置
        const viewConfig = ORTHOGRAPHIC_VIEWS[mode];
        
        // 设置相机角度，使用较快的过渡
        this.camera.setAzimElev(viewConfig.azim, viewConfig.elev, 2);
        
        // 保持当前的焦点和距离
        // 这样用户可以继续在当前视图中平移和缩放
    }

    public getCurrentMode(): ViewMode {
        return this.currentMode;
    }

    public isLocked(): boolean {
        return this.isOrthographicLocked;
    }

    // 获取当前视图模式的描述
    public getModeDescription(): string {
        switch (this.currentMode) {
            case 'perspective':
                return '透视视图 - 可自由旋转、平移、缩放';
            case 'top':
                return '正视图 - 上视角 - 只能平移、缩放';
            case 'bottom':
                return '正视图 - 下视角 - 只能平移、缩放';
            case 'left':
                return '正视图 - 左视角 - 只能平移、缩放';
            case 'right':
                return '正视图 - 右视角 - 只能平移、缩放';
            case 'front':
                return '正视图 - 前视角 - 只能平移、缩放';
            case 'back':
                return '正视图 - 后视角 - 只能平移、缩放';
            default:
                return '未知视图模式';
        }
    }
}

export { ViewModeManager };