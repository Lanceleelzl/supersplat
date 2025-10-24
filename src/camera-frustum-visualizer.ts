import {
    Entity,
    CameraComponent,
    Vec3,
    Color,
    PROJECTION_PERSPECTIVE
} from 'playcanvas';

import { Element, ElementType } from './element';
import { Scene } from './scene';

/**
 * 相机视椎体可视化器
 * 在主场景中绘制指定相机的视椎体线框，用于显示巡检相机的视野范围
 */
class CameraFrustumVisualizer extends Element {
    private targetCamera: Entity | null = null;
    private visible = false;
    private frustumColor = new Color(0, 1, 0, 1); // 绿色线框
    private frustumLines: Array<{ start: Vec3, end: Vec3 }> = [];

    constructor() {
        super(ElementType.other);
    }

    add() {
        // 视椎体可视化器不需要添加实体到场景，使用drawLine方法绘制
    }

    remove() {
        this.hide();
    }

    destroy() {
        this.hide();
    }

    /**
     * 设置要可视化的目标相机
     * @param camera - 目标相机实体
     */
    setTargetCamera(camera: Entity | null) {
        this.targetCamera = camera;
        if (this.visible && this.targetCamera) {
            this.updateFrustumLines();
        }
    }

    /**
     * 显示视椎体
     */
    show() {
        this.visible = true;
        if (this.targetCamera) {
            this.updateFrustumLines();
        }
    }

    /**
     * 隐藏视椎体
     */
    hide() {
        this.visible = false;
        this.frustumLines = [];
    }

    /**
     * 更新视椎体显示
     */
    update() {
        if (this.visible && this.targetCamera) {
            this.updateFrustumLines();
        }
    }

    /**
     * 设置视椎体颜色
     * @param color - 颜色
     */
    setColor(color: Color) {
        this.frustumColor.copy(color);
    }

    /**
     * 更新视椎体线条
     */
    private updateFrustumLines() {
        this.frustumLines = [];

        if (!this.targetCamera || !this.targetCamera.camera) {
            return;
        }

        const camera = this.targetCamera.camera;

        // 获取视椎体的8个角点
        // PlayCanvas的getFrustumCorners返回近平面和远平面的4个角点
        const nearCorners = camera.camera.getFrustumCorners(camera.nearClip);
        const farCorners = camera.camera.getFrustumCorners(camera.farClip);

        // 将角点从相机空间转换到世界空间
        const worldTransform = this.targetCamera.getWorldTransform();

        const nearWorldCorners: Vec3[] = [];
        const farWorldCorners: Vec3[] = [];

        for (let i = 0; i < 4; i++) {
            const nearWorld = new Vec3();
            const farWorld = new Vec3();
            worldTransform.transformPoint(nearCorners[i], nearWorld);
            worldTransform.transformPoint(farCorners[i], farWorld);
            nearWorldCorners.push(nearWorld);
            farWorldCorners.push(farWorld);
        }

        // 构建视椎体线框
        // 近平面的4条边
        for (let i = 0; i < 4; i++) {
            const next = (i + 1) % 4;
            this.frustumLines.push({
                start: nearWorldCorners[i].clone(),
                end: nearWorldCorners[next].clone()
            });
        }

        // 远平面的4条边
        for (let i = 0; i < 4; i++) {
            const next = (i + 1) % 4;
            this.frustumLines.push({
                start: farWorldCorners[i].clone(),
                end: farWorldCorners[next].clone()
            });
        }

        // 连接近平面和远平面的4条边
        for (let i = 0; i < 4; i++) {
            this.frustumLines.push({
                start: nearWorldCorners[i].clone(),
                end: farWorldCorners[i].clone()
            });
        }

        // 添加视点到远裁剪面四个角的连线
        // 获取相机在世界空间中的位置（视点）
        const cameraPosition = this.targetCamera.getPosition();

        // 连接视点到远平面的4个角
        for (let i = 0; i < 4; i++) {
            this.frustumLines.push({
                start: cameraPosition.clone(),
                end: farWorldCorners[i].clone()
            });
        }

        // 注释掉调试打印，避免污染控制台
        // console.log(`相机视椎体：已更新 ${this.frustumLines.length} 条线段`);
        // console.log('近平面角点:', nearWorldCorners.map(v => `(${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`));
        // console.log('远平面角点:', farWorldCorners.map(v => `(${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`));
    }

    /**
     * 在渲染前绘制视椎体线条
     */
    onPreRender() {
        if (!this.visible || !this.targetCamera || this.frustumLines.length === 0) {
            return;
        }

        // 更新视椎体线条（相机可能已移动）
        this.updateFrustumLines();

        // 绘制所有线条
        const app = (this.scene as any).app;
        if (app && app.drawLine) {
            for (const line of this.frustumLines) {
                app.drawLine(line.start, line.end, this.frustumColor, false);
            }
        }
    }

    /**
     * 检查是否可见
     */
    get isVisible(): boolean {
        return this.visible;
    }

    /**
     * 获取目标相机
     */
    get camera(): Entity | null {
        return this.targetCamera;
    }
}

export { CameraFrustumVisualizer };
