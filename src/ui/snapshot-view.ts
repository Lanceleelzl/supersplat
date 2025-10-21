import { Container, Element } from '@playcanvas/pcui';
import { Events } from '../events';
import { Scene } from '../scene';
import { 
    Entity, 
    CameraComponent, 
    RenderTarget, 
    Texture, 
    PIXELFORMAT_RGBA8, 
    FILTER_LINEAR, 
    ADDRESS_CLAMP_TO_EDGE,
    Vec3,
    Quat
} from 'playcanvas';
import closeSvg from './svg/close_01.svg';

const createSvg = (svgString: string) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement;
};

/**
 * 快照预览窗口 - 显示巡检模型视角的相机画面
 */
class SnapshotView extends Container {
    private events: Events;
    private scene: Scene;
    private canvas: HTMLCanvasElement;
    private snapshotCamera: Entity;
    private renderTarget: RenderTarget;
    private selectedMarker: any = null;

    constructor(events: Events, scene: Scene, args = {}) {
        super({
            id: 'snapshot-panel',
            class: 'snapshot-view',
            ...args
        });

        this.events = events;
        this.scene = scene;
        
        // stop pointer events bubbling - 阻止指针事件冒泡
        ['pointerdown', 'pointerup', 'pointermove', 'wheel', 'dblclick'].forEach((eventName) => {
            this.dom.addEventListener(eventName, (event: Event) => event.stopPropagation());
        });
        
        this.createUI();
        this.setupDragFunctionality();
        this.setupCamera();
        this.setupEventListeners();
        
        // 添加clickable类
        this.dom.classList.add('clickable');
        
        // 初始隐藏
        this.hidden = true;
        
        // 添加到body
        document.body.appendChild(this.dom);
    }

    private createUI() {
        // 创建快照预览窗口的UI结构
        this.dom.innerHTML = `
            <div class="snapshot-titlebar">
                <span class="snapshot-title">快照预览</span>
                <div class="snapshot-close-container"></div>
            </div>
            <div class="snapshot-content">
                <canvas class="snapshot-viewport" width="320" height="240"></canvas>
            </div>
        `;

        // 创建关闭按钮并添加SVG图标
        const closeContainer = this.dom.querySelector('.snapshot-close-container') as HTMLElement;
        const closeButton = new Element({
            class: 'snapshot-close'
        });
        closeButton.dom.appendChild(createSvg(closeSvg));
        closeContainer.appendChild(closeButton.dom);

        // 获取canvas元素
        this.canvas = this.dom.querySelector('.snapshot-viewport') as HTMLCanvasElement;
        
        // 设置canvas样式
        this.canvas.style.display = 'block';
        this.canvas.style.width = '320px';
        this.canvas.style.height = '240px';
        this.canvas.style.border = '1px solid #555';
        this.canvas.style.borderRadius = '4px';
        this.canvas.style.background = '#1a1a1a';
    }

    private setupDragFunctionality() {
        let isDragging = false;
        const dragOffset = { x: 0, y: 0 };
        let dragHandle: HTMLElement | null = null;

        // 找到标题栏作为拖拽句柄
        const titlebar = this.dom.querySelector('.snapshot-titlebar') as HTMLElement;
        if (titlebar) {
            dragHandle = titlebar;
            dragHandle.style.cursor = 'move';
            dragHandle.style.userSelect = 'none';
            dragHandle.style.webkitUserSelect = 'none';

            const onPointerDown = (e: PointerEvent) => {
                // 只响应左键点击
                if (e.button !== 0) return;

                // 检查点击的是否是关闭按钮，如果是则不进行拖拽
                const target = e.target as HTMLElement;
                if (target.closest('.snapshot-close')) {
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
                dragHandle!.setPointerCapture(e.pointerId);

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
                if (!isDragging) return;

                isDragging = false;
                dragHandle!.releasePointerCapture(e.pointerId);

                e.preventDefault();
            };

            // 绑定事件到拖拽句柄
            dragHandle.addEventListener('pointerdown', onPointerDown);
            dragHandle.addEventListener('pointermove', onPointerMove);
            dragHandle.addEventListener('pointerup', onPointerUp);

            // 处理指针取消事件（例如触摸被中断）
            dragHandle.addEventListener('pointercancel', onPointerUp);
        }

        // 关闭按钮事件
        const closeBtn = this.dom.querySelector('.snapshot-close') as HTMLButtonElement;
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.hide();
            });
        }
    }

    private setupCamera() {
        // 创建独立的相机实体用于快照预览
        this.snapshotCamera = new Entity('SnapshotCamera');
        
        // 添加相机组件，使用与主相机相同的配置
        this.snapshotCamera.addComponent('camera', {
            fov: 90,                    // 90度视野角
            nearClip: 0.5,             // 近裁剪面0.5
            farClip: 5000,             // 远裁剪面5000
            clearColor: [0.4, 0.4, 0.4, 1.0],  // 与主场景相同的背景色
            projection: 0,              // 透视投影
            horizontalFov: true         // 水平视野角
        });

        // 设置相机的渲染层，包含所有主要层
        this.snapshotCamera.camera.layers = [
            this.scene.app.scene.layers.getLayerByName('World').id,
            this.scene.backgroundLayer.id,
            this.scene.shadowLayer.id,
            this.scene.debugLayer.id
        ];

        // 应用与主相机相同的色调映射和曝光设置
        const mainCamera = this.scene.camera.entity.camera;
        this.snapshotCamera.camera.toneMapping = mainCamera.toneMapping;
        this.snapshotCamera.camera.exposure = mainCamera.exposure;

        // 创建渲染目标
        const colorBuffer = new Texture(this.scene.app.graphicsDevice, {
            width: 320,
            height: 240,
            format: PIXELFORMAT_RGBA8,
            minFilter: FILTER_LINEAR,
            magFilter: FILTER_LINEAR,
            addressU: ADDRESS_CLAMP_TO_EDGE,
            addressV: ADDRESS_CLAMP_TO_EDGE
        });

        this.renderTarget = new RenderTarget({
            colorBuffer: colorBuffer,
            depth: true,
            flipY: false,
            autoResolve: false
        });

        // 设置相机的渲染目标
        this.snapshotCamera.camera.renderTarget = this.renderTarget;
        
        // 将相机添加到场景
        this.scene.app.root.addChild(this.snapshotCamera);
        
        console.log('快照预览：独立相机创建完成，已配置渲染层和光照');
    }

    private setupEventListeners() {
        // 监听巡检模型选择事件
        this.events.on('marker.selected', (marker: any) => {
            console.log('快照预览：接收到marker选择事件', marker);
            
            // 检查快照预览是否启用
            const isEnabled = this.events.invoke('snapshot.isEnabled');
            if (!isEnabled) {
                console.log('快照预览功能未启用，忽略marker选择事件');
                return;
            }

            this.selectedMarker = marker;
            this.updateCameraFromMarker();
            this.show();
            this.renderSnapshot();
        });

        // 监听巡检模型变换事件（位置、旋转变化）
        this.events.on('marker.transform', (marker: any) => {
            if (this.selectedMarker === marker && this.hidden === false) {
                console.log('快照预览：marker位置变化，更新相机');
                this.updateCameraFromMarker();
                this.renderSnapshot();
            }
        });

        // 监听快照预览隐藏事件
        this.events.on('snapshot.hide', () => {
            console.log('快照预览：接收到隐藏事件');
            this.hide();
            this.selectedMarker = null;
        });

        // 监听快照预览开关切换
        this.events.on('snapshot.toggle', () => {
            const isEnabled = this.events.invoke('snapshot.isEnabled');
            if (!isEnabled) {
                // 如果关闭了快照预览，隐藏窗口
                this.hide();
                this.selectedMarker = null;
            }
        });
    }

    private updateCameraFromMarker() {
        if (!this.selectedMarker || !this.snapshotCamera) {
            return;
        }

        try {
            // 获取巡检模型的位置和旋转
            const markerEntity = this.selectedMarker.entity;
            if (!markerEntity) {
                console.warn('快照预览：巡检模型没有entity');
                return;
            }

            const position = markerEntity.getPosition();
            const rotation = markerEntity.getRotation();

            // 设置快照相机的位置和旋转与巡检模型一致
            this.snapshotCamera.setPosition(position);
            this.snapshotCamera.setRotation(rotation);

            console.log('快照预览：相机位置更新为', position);
            console.log('快照预览：相机旋转更新为', rotation);
        } catch (error) {
            console.error('快照预览：更新相机位置失败', error);
        }
    }

    private renderSnapshot() {
        if (!this.snapshotCamera || !this.renderTarget || !this.canvas) {
            console.warn('快照预览：相机或渲染目标未初始化');
            return;
        }

        try {
            // 临时保存主相机的渲染目标
            const mainCamera = this.scene.camera.entity.camera;
            const originalRenderTarget = mainCamera.renderTarget;
            
            // 设置快照相机的渲染目标
            this.snapshotCamera.camera.renderTarget = this.renderTarget;
            
            // 使用PlayCanvas的正确渲染方式
            const app = this.scene.app;
            
            // 临时设置快照相机为主相机进行渲染
            const originalCamera = app.scene.defaultCamera;
            app.scene.defaultCamera = this.snapshotCamera.camera;
            
            // 执行渲染
            app.render();
            
            // 恢复原始相机
            app.scene.defaultCamera = originalCamera;
            
            // 恢复主相机的渲染目标
            this.snapshotCamera.camera.renderTarget = null;
            
            // 将渲染结果复制到canvas
            this.copyRenderTargetToCanvas();
            
            console.log('快照预览：渲染完成');
        } catch (error) {
            console.error('快照预览：渲染失败', error);
        }
    }

    private copyRenderTargetToCanvas() {
        try {
            const gl = this.scene.app.graphicsDevice.gl;
            const ctx = this.canvas.getContext('2d');
            
            if (ctx && gl) {
                // 绑定渲染目标的帧缓冲区
                gl.bindFramebuffer(gl.FRAMEBUFFER, this.renderTarget.impl._glFrameBuffer);
                
                // 读取像素数据
                const pixels = new Uint8Array(320 * 240 * 4);
                gl.readPixels(0, 0, 320, 240, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                
                // 创建ImageData
                const imageData = new ImageData(new Uint8ClampedArray(pixels), 320, 240);
                
                // 清除canvas
                ctx.clearRect(0, 0, 320, 240);
                
                // 翻转Y轴并绘制到canvas
                ctx.save();
                ctx.scale(1, -1);
                ctx.translate(0, -240);
                ctx.putImageData(imageData, 0, 0);
                ctx.restore();
                
                // 恢复默认帧缓冲区
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            }
        } catch (error) {
            console.error('快照预览：复制渲染目标到canvas失败', error);
        }
    }



    show() {
        this.hidden = false;
        console.log('快照预览：窗口显示');
    }

    hide() {
        this.hidden = true;
        this.selectedMarker = null;
        console.log('快照预览：窗口隐藏');
    }

    destroy() {
        // 清理资源
        if (this.snapshotCamera) {
            this.snapshotCamera.destroy();
        }
        if (this.renderTarget) {
            this.renderTarget.destroy();
        }
        
        // 移除DOM元素
        if (this.dom && this.dom.parentNode) {
            this.dom.parentNode.removeChild(this.dom);
        }
        
        super.destroy();
    }
}

export { SnapshotView };
