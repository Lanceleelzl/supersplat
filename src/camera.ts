import {
    math,
    ADDRESS_CLAMP_TO_EDGE,
    FILTER_NEAREST,
    PIXELFORMAT_RGBA8,
    PIXELFORMAT_RGBA16F,
    PIXELFORMAT_DEPTH,
    PROJECTION_ORTHOGRAPHIC,
    PROJECTION_PERSPECTIVE,
    TONEMAP_NONE,
    TONEMAP_ACES,
    TONEMAP_ACES2,
    TONEMAP_FILMIC,
    TONEMAP_HEJL,
    TONEMAP_LINEAR,
    TONEMAP_NEUTRAL,
    BoundingBox,
    Entity,
    Mat4,
    Picker,
    Plane,
    Ray,
    RenderTarget,
    Texture,
    Vec3,
    Vec4,
    WebglGraphicsDevice
} from 'playcanvas';

import { PointerController } from './controllers';
import { Element, ElementType } from './element';
import { GltfModel } from './gltf-model';
import { Serializer } from './serializer';
import { Splat } from './splat';
import { TweenValue } from './tween-value';

// 根据方位角和仰角计算前进向量
const calcForwardVec = (result: Vec3, azim: number, elev: number) => {
    const ex = elev * math.DEG_TO_RAD;
    const ey = azim * math.DEG_TO_RAD;
    const s1 = Math.sin(-ex);
    const c1 = Math.cos(-ex);
    const s2 = Math.sin(-ey);
    const c2 = Math.cos(-ey);
    result.set(-c1 * s2, s1, c1 * c2);
};

// 工作用全局变量
const forwardVec = new Vec3();
const cameraPosition = new Vec3();
const plane = new Plane();
const ray = new Ray();
const vec = new Vec3();
const vecb = new Vec3();
const va = new Vec3();
const m = new Mat4();
const v4 = new Vec4();

// 处理负数的模运算
const mod = (n: number, m: number) => ((n % m) + m) % m;

// 相机控制类，继承自Element基类
class Camera extends Element {
    static debugPick = true; // 启用拾取调试以诊断问题
    controller: PointerController;  // 指针控制器
    entity: Entity;                 // 相机实体
    focalPointTween = new TweenValue({ x: 0, y: 0.5, z: 0 });  // 焦点补间动画
    azimElevTween = new TweenValue({ azim: 30, elev: -15 });   // 方位角和仰角补间动画
    distanceTween = new TweenValue({ distance: 1 });           // 距离补间动画

    minElev = -90;  // 最小仰角
    maxElev = 90;   // 最大仰角

    sceneRadius = 1;  // 场景半径

    flySpeed = 5;     // 飞行速度

    picker: Picker;   // 拾取器

    workRenderTarget: RenderTarget;  // 工作渲染目标

    // 重写的目标尺寸
    targetSize: { width: number, height: number } = null;

    suppressFinalBlit = false;  // 抑制最终混合

    renderOverlays = true;      // 渲染覆盖层

    updateCameraUniforms: () => void;  // 更新相机制服函数

    constructor() {
        super(ElementType.camera);
        // 创建相机实体
        this.entity = new Entity('Camera');
        this.entity.addComponent('camera');

        // 注意：此调用对于折射效果正常工作是必需的，但会减慢渲染速度，
        // 应仅在需要时进行。
        // this.entity.camera.requestSceneColorMap(true);
    }

    // 正交投影设置
    set ortho(value: boolean) {
        if (value !== this.ortho) {
            this.entity.camera.projection = value ? PROJECTION_ORTHOGRAPHIC : PROJECTION_PERSPECTIVE;
            this.scene.events.fire('camera.ortho', value);
        }
    }

    get ortho() {
        return this.entity.camera.projection === PROJECTION_ORTHOGRAPHIC;
    }

    // fov
    set fov(value: number) {
        this.entity.camera.fov = value;
    }

    get fov() {
        return this.entity.camera.fov;
    }

    // tonemapping
    set tonemapping(value: string) {
        const mapping: Record<string, number> = {
            none: TONEMAP_NONE,
            linear: TONEMAP_LINEAR,
            neutral: TONEMAP_NEUTRAL,
            aces: TONEMAP_ACES,
            aces2: TONEMAP_ACES2,
            filmic: TONEMAP_FILMIC,
            hejl: TONEMAP_HEJL
        };

        const tvalue = mapping[value];

        if (tvalue !== undefined && tvalue !== this.entity.camera.toneMapping) {
            this.entity.camera.toneMapping = tvalue;
            this.scene.events.fire('camera.tonemapping', value);
        }
    }

    get tonemapping() {
        switch (this.entity.camera.toneMapping) {
            case TONEMAP_NONE: return 'none';
            case TONEMAP_LINEAR: return 'linear';
            case TONEMAP_NEUTRAL: return 'neutral';
            case TONEMAP_ACES: return 'aces';
            case TONEMAP_ACES2: return 'aces2';
            case TONEMAP_FILMIC: return 'filmic';
            case TONEMAP_HEJL: return 'hejl';
        }
        return 'none';
    }

    // near clip
    set near(value: number) {
        this.entity.camera.nearClip = value;
    }

    get near() {
        return this.entity.camera.nearClip;
    }

    // far clip
    set far(value: number) {
        this.entity.camera.farClip = value;
    }

    get far() {
        return this.entity.camera.farClip;
    }

    // focal point
    get focalPoint() {
        const t = this.focalPointTween.target;
        return new Vec3(t.x, t.y, t.z);
    }

    // azimuth, elevation
    get azimElev() {
        return this.azimElevTween.target;
    }

    get azim() {
        return this.azimElev.azim;
    }

    get elevation() {
        return this.azimElev.elev;
    }

    get distance() {
        return this.distanceTween.target.distance;
    }

    setFocalPoint(point: Vec3, dampingFactorFactor: number = 1) {
        this.focalPointTween.goto(point, dampingFactorFactor * this.scene.config.controls.dampingFactor);
    }

    setAzimElev(azim: number, elev: number, dampingFactorFactor: number = 1) {
        // clamp
        azim = mod(azim, 360);
        elev = Math.max(this.minElev, Math.min(this.maxElev, elev));

        const t = this.azimElevTween;
        t.goto({ azim, elev }, dampingFactorFactor * this.scene.config.controls.dampingFactor);

        // handle wraparound
        if (t.source.azim - azim < -180) {
            t.source.azim += 360;
        } else if (t.source.azim - azim > 180) {
            t.source.azim -= 360;
        }

        // return to perspective mode on rotation
        this.ortho = false;
    }

    setDistance(distance: number, dampingFactorFactor: number = 1) {
        const controls = this.scene.config.controls;

        // clamp
        distance = Math.max(controls.minZoom, Math.min(controls.maxZoom, distance));

        const t = this.distanceTween;
        t.goto({ distance }, dampingFactorFactor * controls.dampingFactor);
    }

    setPose(position: Vec3, target: Vec3, dampingFactorFactor: number = 1) {
        vec.sub2(target, position);
        const l = vec.length();
        const azim = Math.atan2(-vec.x / l, -vec.z / l) * math.RAD_TO_DEG;
        const elev = Math.asin(vec.y / l) * math.RAD_TO_DEG;
        this.setFocalPoint(target, dampingFactorFactor);
        this.setAzimElev(azim, elev, dampingFactorFactor);
        this.setDistance(l / this.sceneRadius * this.fovFactor, dampingFactorFactor);
    }

    // transform the world space coordinate to normalized screen coordinate
    worldToScreen(world: Vec3, screen: Vec3) {
        const { camera } = this.entity.camera;
        m.mul2(camera.projectionMatrix, camera.viewMatrix);

        v4.set(world.x, world.y, world.z, 1);
        m.transformVec4(v4, v4);

        screen.x = v4.x / v4.w * 0.5 + 0.5;
        screen.y = 1.0 - (v4.y / v4.w * 0.5 + 0.5);
        screen.z = v4.z / v4.w;
    }

    add() {
        this.scene.cameraRoot.addChild(this.entity);
        this.entity.camera.layers = this.entity.camera.layers.concat([
            this.scene.shadowLayer.id,
            this.scene.debugLayer.id,
            this.scene.gizmoLayer.id
        ]);

        if (this.scene.config.camera.debugRender) {
            this.entity.camera.setShaderPass(`debug_${this.scene.config.camera.debugRender}`);
        }

        const target = document.getElementById('canvas-container');

        this.controller = new PointerController(this, target);

        // apply scene config
        const config = this.scene.config;
        const controls = config.controls;

        // configure background - use scene background color
        const bgClr = this.scene.events.invoke('bgClr');
        if (bgClr) {
            this.entity.camera.clearColor.copy(bgClr);
        } else {
            // fallback to default gray background
            this.entity.camera.clearColor.set(0.4, 0.4, 0.4, 1);
        }

        this.minElev = (controls.minPolarAngle * 180) / Math.PI - 90;
        this.maxElev = (controls.maxPolarAngle * 180) / Math.PI - 90;

        // tonemapping
        this.scene.camera.entity.camera.toneMapping = {
            linear: TONEMAP_LINEAR,
            filmic: TONEMAP_FILMIC,
            hejl: TONEMAP_HEJL,
            aces: TONEMAP_ACES,
            aces2: TONEMAP_ACES2,
            neutral: TONEMAP_NEUTRAL
        }[config.camera.toneMapping];

        // exposure
        this.scene.app.scene.exposure = config.camera.exposure;

        this.fov = config.camera.fov;

        // 设置近远裁剪面参数
        if (config.camera.nearClip !== undefined) {
            this.near = config.camera.nearClip;
        }
        if (config.camera.farClip !== undefined) {
            this.far = config.camera.farClip;
        }

        // initial camera position and orientation
        this.setAzimElev(controls.initialAzim, controls.initialElev, 0);
        this.setDistance(controls.initialZoom, 0);

        // picker
        const { width, height } = this.scene.targetSize;
        this.picker = new Picker(this.scene.app, width, height);

        // override buffer allocation to use our render target
        this.picker.allocateRenderTarget = () => { };
        this.picker.releaseRenderTarget = () => { };

        this.scene.events.on('scene.boundChanged', this.onBoundChanged, this);

        // prepare camera-specific uniforms
        this.updateCameraUniforms = () => {
            const device = this.scene.graphicsDevice;
            const entity = this.entity;
            const camera = entity.camera;

            const set = (name: string, vec: Vec3) => {
                device.scope.resolve(name).setValue([vec.x, vec.y, vec.z]);
            };

            // get frustum corners in world space
            const points = camera.camera.getFrustumCorners(-100);
            const worldTransform = entity.getWorldTransform();
            for (let i = 0; i < points.length; i++) {
                worldTransform.transformPoint(points[i], points[i]);
            }

            // near
            if (camera.projection === PROJECTION_PERSPECTIVE) {
                // perspective
                set('near_origin', worldTransform.getTranslation());
                set('near_x', Vec3.ZERO);
                set('near_y', Vec3.ZERO);
            } else {
                // orthographic
                set('near_origin', points[3]);
                set('near_x', va.sub2(points[0], points[3]));
                set('near_y', va.sub2(points[2], points[3]));
            }

            // far
            set('far_origin', points[7]);
            set('far_x', va.sub2(points[4], points[7]));
            set('far_y', va.sub2(points[6], points[7]));
        };

        // temp control of camera start
        const url = new URL(location.href);
        const focal = url.searchParams.get('focal');
        if (focal) {
            const parts = focal.toString().split(',');
            if (parts.length === 3) {
                this.setFocalPoint(new Vec3(parseFloat(parts[0]), parseFloat(parts[1]), parseFloat(parts[2])), 0);
            }
        }
        const angles = url.searchParams.get('angles');
        if (angles) {
            const parts = angles.toString().split(',');
            if (parts.length === 2) {
                this.setAzimElev(parseFloat(parts[0]), parseFloat(parts[1]), 0);
            }
        }
        const distance = url.searchParams.get('distance');
        if (distance) {
            this.setDistance(parseFloat(distance), 0);
        }
    }

    remove() {
        this.controller.destroy();
        this.controller = null;

        this.entity.camera.layers = this.entity.camera.layers.filter(layer => layer !== this.scene.shadowLayer.id);
        this.scene.cameraRoot.removeChild(this.entity);

        // destroy doesn't exist on picker?
        // this.picker.destroy();
        this.picker = null;

        this.scene.events.off('scene.boundChanged', this.onBoundChanged, this);
    }

    // handle the scene's bound changing. the camera must be configured to render
    // the entire extents as well as possible.
    // also update the existing camera distance to maintain the current view
    onBoundChanged(bound: BoundingBox) {
        const prevDistance = this.distanceTween.value.distance * this.sceneRadius;
        this.sceneRadius = Math.max(1e-03, bound.halfExtents.length());
        this.setDistance(prevDistance / this.sceneRadius, 0);
    }

    serialize(serializer: Serializer) {
        serializer.packa(this.entity.getWorldTransform().data);
        serializer.pack(
            this.fov,
            this.tonemapping,
            this.entity.camera.renderTarget?.width,
            this.entity.camera.renderTarget?.height
        );
    }

    // handle the viewer canvas resizing
    rebuildRenderTargets() {
        const device = this.scene.graphicsDevice;
        const { width, height } = this.targetSize ?? this.scene.targetSize;
        const format = this.scene.events.invoke('camera.highPrecision') ? PIXELFORMAT_RGBA16F : PIXELFORMAT_RGBA8;

        const rt = this.entity.camera.renderTarget;
        if (rt && rt.width === width && rt.height === height && rt.colorBuffer.format === format) {
            return;
        }

        // out with the old
        if (rt) {
            rt.destroyTextureBuffers();
            rt.destroy();

            this.workRenderTarget.destroy();
            this.workRenderTarget = null;
        }

        const createTexture = (name: string, width: number, height: number, format: number) => {
            return new Texture(device, {
                name,
                width,
                height,
                format,
                mipmaps: false,
                minFilter: FILTER_NEAREST,
                magFilter: FILTER_NEAREST,
                addressU: ADDRESS_CLAMP_TO_EDGE,
                addressV: ADDRESS_CLAMP_TO_EDGE
            });
        };

        // in with the new
        const colorBuffer = createTexture('cameraColor', width, height, format);
        const depthBuffer = createTexture('cameraDepth', width, height, PIXELFORMAT_DEPTH);
        const renderTarget = new RenderTarget({
            colorBuffer,
            depthBuffer,
            flipY: false,
            autoResolve: false
        });
        this.entity.camera.renderTarget = renderTarget;
        this.entity.camera.horizontalFov = width > height;

        const workColorBuffer = createTexture('workColor', width, height, PIXELFORMAT_RGBA8);

        // create pick mode render target (reuse color buffer)
        this.workRenderTarget = new RenderTarget({
            colorBuffer: workColorBuffer,
            depth: false,
            autoResolve: false
        });

        // set picker render target
        this.picker.renderTarget = this.workRenderTarget;

        this.scene.events.fire('camera.resize', { width, height });
    }

    onUpdate(deltaTime: number) {
        // controller update
        this.controller.update(deltaTime);

        // update underlying values
        this.focalPointTween.update(deltaTime);
        this.azimElevTween.update(deltaTime);
        this.distanceTween.update(deltaTime);

        const azimElev = this.azimElevTween.value;
        const distance = this.distanceTween.value;

        calcForwardVec(forwardVec, azimElev.azim, azimElev.elev);
        cameraPosition.copy(forwardVec);
        cameraPosition.mulScalar(distance.distance * this.sceneRadius / this.fovFactor);
        cameraPosition.add(this.focalPointTween.value);

        this.entity.setLocalPosition(cameraPosition);
        this.entity.setLocalEulerAngles(azimElev.elev, azimElev.azim, 0);

        this.fitClippingPlanes(this.entity.getLocalPosition(), this.entity.forward);

        const { camera } = this.entity;
        camera.orthoHeight = this.distanceTween.value.distance * this.sceneRadius / this.fovFactor * (this.fov / 90) * (camera.horizontalFov ? this.scene.targetSize.height / this.scene.targetSize.width : 1);
        camera.camera._updateViewProjMat();
    }

    fitClippingPlanes(cameraPosition: Vec3, forwardVec: Vec3) {
        const bound = this.scene.bound;
        const boundRadius = bound.halfExtents.length();

        vec.sub2(bound.center, cameraPosition);
        const dist = vec.dot(forwardVec);

        // 计算相机到场景中心的距离
        const cameraToCenter = vec.length();

        // Use more conservative clipping planes for better compatibility with various model sizes
        if (dist > 0) {
            // 大幅扩大远裁剪面范围，支持超大规模场景和极远距离模型
            this.far = Math.max(boundRadius * 2000, dist + boundRadius * 1000);

            // 优化近裁剪面计算，减少模型被遮挡的问题
            if (dist < boundRadius) {
                // Camera is inside or very close to the bounding sphere
                // 使用更大的近裁剪面值，避免过小导致的精度问题
                this.near = Math.max(0.01, boundRadius / 1000);
            } else {
                // Camera is outside the bounding sphere
                // 根据相机距离和视角动态调整近裁剪面
                const minNear = Math.max(0.01, boundRadius / 500);
                const dynamicNear = Math.max(minNear, (dist - boundRadius) * 0.1);
                this.near = Math.min(dynamicNear, boundRadius / 10);
            }
        } else {
            // Scene is behind the camera - use generous bounds with extended far plane
            this.far = boundRadius * 3000;
            // 当场景在相机后方时，使用更合理的近裁剪面
            this.near = Math.max(0.01, Math.min(cameraToCenter * 0.01, boundRadius / 100));
        }

        // Ensure near is always smaller than far with better ratio
        if (this.near >= this.far) {
            this.near = this.far / 2000;
        }

        // 确保近裁剪面不会太小，避免深度缓冲精度问题
        this.near = Math.max(this.near, 0.001);
    }

    onPreRender() {
        this.rebuildRenderTargets();
        this.updateCameraUniforms();
    }

    onPostRender() {
        const device = this.scene.graphicsDevice as WebglGraphicsDevice;
        const renderTarget = this.entity.camera.renderTarget;

        // resolve msaa buffer
        if (renderTarget.samples > 1) {
            renderTarget.resolve(true, false);
        }

        // copy render target
        if (!this.suppressFinalBlit) {
            device.copyRenderTarget(renderTarget, null, true, false);
        }
    }

    focus(options?: { focalPoint: Vec3, radius: number, speed: number }) {
        const getSplatFocalPoint = () => {
            for (const element of this.scene.elements) {
                if (element.type === ElementType.splat) {
                    const focalPoint = (element as Splat).focalPoint?.();
                    if (focalPoint) {
                        return focalPoint;
                    }
                }
            }
        };

        const focalPoint = options ? options.focalPoint : (getSplatFocalPoint() ?? this.scene.bound.center);
        const focalRadius = options ? options.radius : this.scene.bound.halfExtents.length();

        const fdist = focalRadius / this.sceneRadius;

        this.setDistance(isFinite(fdist) ? fdist : 1, options?.speed ?? 0);
        this.setFocalPoint(focalPoint, options?.speed ?? 0);
    }

    get fovFactor() {
        // we set the fov of the longer axis. here we get the fov of the other (smaller) axis so framing
        // doesn't cut off the scene.
        const { width, height } = this.scene.targetSize;
        const aspect = (width && height) ? this.entity.camera.horizontalFov ? height / width : width / height : 1;
        const fov = 2 * Math.atan(Math.tan(this.fov * math.DEG_TO_RAD * 0.5) * aspect);
        return Math.sin(fov * 0.5);
    }

    getRay(screenX: number, screenY: number, ray: Ray) {
        const { entity, ortho, scene } = this;
        const cameraPos = this.entity.getPosition();

        // create the pick ray in world space
        if (ortho) {
            entity.camera.screenToWorld(screenX, screenY, -1.0, vec);
            entity.camera.screenToWorld(screenX, screenY, 1.0, vecb);
            vecb.sub(vec).normalize();
            ray.set(vec, vecb);
        } else {
            entity.camera.screenToWorld(screenX, screenY, 1.0, vec);
            vec.sub(cameraPos).normalize();
            ray.set(cameraPos, vec);
        }
    }

    // intersect the scene at the given screen coordinate
    intersect(screenX: number, screenY: number) {
        const { scene } = this;

        const target = scene.canvas;
        const sx = screenX / target.clientWidth * scene.targetSize.width;
        const sy = screenY / target.clientHeight * scene.targetSize.height;

        // 获取射线用于拾取
        this.getRay(screenX, screenY, ray);

        // 添加调试日志
        if (Camera.debugPick) {
            console.log('=== 拾取开始 ===');
            console.log('屏幕坐标:', screenX, screenY);
            console.log('场景中的GLB模型数量:', scene.getElementsByType(ElementType.model).length);
            console.log('场景中的高斯模型数量:', scene.getElementsByType(ElementType.splat).length);
        }

        // =============================
        // Step 0: Physics-based raycast (if physics components are present)
        // 优先使用物理系统的精确射线检测（可与复杂 mesh collider 搭配）。
        // 若失败或物理未初始化，则继续后续 AABB / fallback / splat 逻辑。
        // =============================
        try {
            const cam = this.entity.camera;
            const dpr = window.devicePixelRatio || 1;
            const scaledX = screenX * dpr;
            const scaledY = screenY * dpr;
            const nearPoint = new Vec3();
            const farPoint = new Vec3();
            cam.screenToWorld(scaledX, scaledY, cam.nearClip, nearPoint);
            cam.screenToWorld(scaledX, scaledY, cam.farClip, farPoint);
            const physicsRayDir = farPoint.clone().sub(nearPoint).normalize();
            // Construct a physics ray using pc.Ray if available (avoid shadowing existing Ray import if types differ)
            // @ts-ignore
            const pcAny: any = (window as any).pc;
            if (pcAny && pcAny.Ray) {
                const ray = new pcAny.Ray(nearPoint, physicsRayDir);
                const result: any = {};
                if (pcAny.app?.systems?.rigidbody?.raycastFirst) {
                    const hit = pcAny.app.systems.rigidbody.raycastFirst(ray, result);
                    if (!hit && (scene as any).app?.systems?.rigidbody?.raycastFirst) {
                        // fallback to scene app reference if global pc.app not set
                        const hit2 = (scene as any).app.systems.rigidbody.raycastFirst(ray, result);
                        if (hit2) {
                            if (result?.entity?.tags?.has('pickable')) {
                                const modelEnt = result.entity;
                                // ascend to find _gltfModel reference
                                let cur = modelEnt as any;
                                let foundModel: GltfModel = null;
                                while (cur && !foundModel) {
                                    if (cur._gltfModel) foundModel = cur._gltfModel as GltfModel;
                                    cur = cur.parent;
                                }
                                if (foundModel) {
                                    if (Camera.debugPick) {
                                        console.log('物理拾取成功 - GLB模型:', foundModel.filename);
                                    }

                                    return {
                                        model: foundModel,
                                        position: result.point ? result.point.clone?.() || result.point : nearPoint
                                    };
                                }
                            }
                        }
                    } else if (hit) {
                        if (result?.entity?.tags?.has('pickable')) {
                            const modelEnt = result.entity;
                            let cur = modelEnt as any;
                            let foundModel: GltfModel = null;
                            while (cur && !foundModel) {
                                if (cur._gltfModel) foundModel = cur._gltfModel as GltfModel;
                                cur = cur.parent;
                            }
                            if (foundModel) {
                                if (Camera.debugPick) {
                                    console.log('物理拾取成功 - GLB模型:', foundModel.filename);
                                }

                                return {
                                    model: foundModel,
                                    position: result.point ? result.point.clone?.() || result.point : nearPoint
                                };
                            }
                        }
                    }
                }
            }
        } catch (e) {
            // Physics raycast failed, continue with other picking methods
            if (Camera.debugPick) {
                console.log('物理拾取失败:', e);
            }
        }
        // First: GLB 模型拾取（多阶段）
        // 阶段顺序：
        // 1) meshInstance 局部 AABB -> world 转换后逐一射线测试（更精细）
        // 2) 模型整体聚合 worldBound AABB 测试（粗略）
        // 3) 中心投影 fallback
        const gltfModels = scene.getElementsByType(ElementType.model);
        let pickedModel: GltfModel = null;
        let pickedPoint: Vec3 = null;
        let pickedDistance = Number.POSITIVE_INFINITY;

        if (gltfModels.length > 0) {
            const cam = this.entity.camera;
            const cameraPos = this.entity.getPosition();
            const cameraForward = this.entity.forward;

            const nearPoint = new Vec3();
            const farPoint = new Vec3();

            // 统一使用渲染目标尺寸 (考虑 DPR) 的转换
            // PlayCanvas 的 camera.screenToWorld 期望的是相对 canvas 的屏幕坐标（像素）
            // 但我们有可能在高 DPI 下使用 clientWidth / clientHeight 逻辑，故确保一致性
            // Use the same coordinate system as splat picking for consistency
            cam.screenToWorld(screenX, screenY, cam.nearClip, nearPoint);
            cam.screenToWorld(screenX, screenY, cam.farClip, farPoint);

            const rayDir = farPoint.clone().sub(nearPoint).normalize();
            const pickRay = new Ray(nearPoint, rayDir);

            // Debug 可视化：绘制射线
            if (Camera.debugPick) {
                try {
                    const app: any = (scene as any).app;
                    const lineEnd = nearPoint.clone().add(rayDir.clone().mulScalar(1000));
                    app?.drawLine?.(nearPoint, lineEnd, new (window as any).pc.Color(1, 1, 0, 1));

                } catch { /* ignore visualization errors */ }
            }

            const modelBounds: { model: GltfModel, bound: any }[] = [];

            // --- 阶段 1: meshInstance 级 AABB 拾取 ---
            for (let i = 0; i < gltfModels.length; i++) {
                const model = gltfModels[i] as GltfModel;
                if (!model.visible || !model.entity?.enabled) continue;
                const renderComponents: any[] = model.entity.findComponents('render') as any;
                for (const render of renderComponents) {
                    const meshInstances: any[] = (render as any).meshInstances || [];
                    for (const mi of meshInstances) {
                        if (!mi?.aabb || !mi?.node) continue;
                        // world 变换
                        const worldAabb = new BoundingBox();
                        worldAabb.setFromTransformedAabb(mi.aabb, mi.node.getWorldTransform());
                        const ip = new Vec3();
                        if (Camera.debugPick) {
                            // 画出 meshInstance AABB（线框）
                            try {
                                const app: any = (scene as any).app;
                                const bbMin = worldAabb.getMin();
                                const bbMax = worldAabb.getMax();
                                const corners = [
                                    new Vec3(bbMin.x, bbMin.y, bbMin.z),
                                    new Vec3(bbMax.x, bbMin.y, bbMin.z),
                                    new Vec3(bbMax.x, bbMax.y, bbMin.z),
                                    new Vec3(bbMin.x, bbMax.y, bbMin.z),
                                    new Vec3(bbMin.x, bbMin.y, bbMax.z),
                                    new Vec3(bbMax.x, bbMin.y, bbMax.z),
                                    new Vec3(bbMax.x, bbMax.y, bbMax.z),
                                    new Vec3(bbMin.x, bbMax.y, bbMax.z)
                                ];
                                const color = new (window as any).pc.Color(0, 0.6, 1, 1);
                                const drawE = (a: number, b: number) => app?.drawLine?.(corners[a], corners[b], color);
                                drawE(0, 1); drawE(1, 2); drawE(2, 3); drawE(3, 0); // bottom
                                drawE(4, 5); drawE(5, 6); drawE(6, 7); drawE(7, 4); // top
                                drawE(0, 4); drawE(1, 5); drawE(2, 6); drawE(3, 7); // pillars
                            } catch { /* ignore aabb visualization errors */ }
                        }
                        if (worldAabb.intersectsRay(pickRay, ip)) {
                            const distance = ip.clone().sub(nearPoint).length();
                            if (distance < pickedDistance) {
                                pickedDistance = distance;
                                pickedModel = model;
                                pickedPoint = ip.clone();
                                if (Camera.debugPick) {

                                    try {
                                        const app: any = (scene as any).app;
                                        app?.drawLine?.(nearPoint, ip, new (window as any).pc.Color(1, 0, 0, 1));
                                    } catch { /* ignore */ }
                                }
                            }
                        }
                    }
                }
            }

            if (pickedModel) {
                if (Camera.debugPick) {
                    console.log('GLB模型拾取成功 - 阶段1:', pickedModel.filename);
                    console.log('是否为巡检模型:', (pickedModel as any).isInspectionModel);
                }

                return { model: pickedModel, position: pickedPoint };
            }

            // --- 阶段 2: 模型聚合 worldBound AABB 拾取 ---
            for (let i = 0; i < gltfModels.length; i++) {
                const model = gltfModels[i] as GltfModel;
                if (!model.visible || !model.entity?.enabled) continue;
                const wb = model.worldBound; // 已缓存
                if (!wb) continue;
                modelBounds.push({ model, bound: wb });
                const ip = new Vec3();
                const intersects = wb.intersectsRay(pickRay, ip);

                // Manual ray-AABB intersection test as fallback
                let manualIntersects = false;
                const manualIP = new Vec3();

                // Implement our own ray-AABB intersection
                const rayOrigin = pickRay.origin;
                const rayDirection = pickRay.direction;
                const aabbMin = wb.getMin();
                const aabbMax = wb.getMax();

                let tmin = (aabbMin.x - rayOrigin.x) / rayDirection.x;
                let tmax = (aabbMax.x - rayOrigin.x) / rayDirection.x;

                if (tmin > tmax) {
                    const temp = tmin;
                    tmin = tmax;
                    tmax = temp;
                }

                let tymin = (aabbMin.y - rayOrigin.y) / rayDirection.y;
                let tymax = (aabbMax.y - rayOrigin.y) / rayDirection.y;

                if (tymin > tymax) {
                    const temp = tymin;
                    tymin = tymax;
                    tymax = temp;
                }

                if (tmin > tymax || tymin > tmax) {
                    manualIntersects = false;
                } else {
                    tmin = Math.max(tmin, tymin);
                    tmax = Math.min(tmax, tymax);

                    let tzmin = (aabbMin.z - rayOrigin.z) / rayDirection.z;
                    let tzmax = (aabbMax.z - rayOrigin.z) / rayDirection.z;

                    if (tzmin > tzmax) {
                        const temp = tzmin;
                        tzmin = tzmax;
                        tzmax = temp;
                    }

                    if (tmin > tzmax || tzmin > tmax) {
                        manualIntersects = false;
                    } else {
                        tmin = Math.max(tmin, tzmin);
                        if (tmin >= 0) {
                            manualIntersects = true;
                            manualIP.copy(rayOrigin).add(rayDirection.clone().mulScalar(tmin));
                        }
                    }
                }

                // Additional debugging: manually test if the ray should intersect
                const rayToCenter = wb.center.clone().sub(pickRay.origin);
                const projectionOnRay = rayToCenter.dot(pickRay.direction);
                const distanceToRay = rayToCenter.clone().sub(pickRay.direction.clone().mulScalar(projectionOnRay)).length();
                const maxHalfExtent = Math.max(wb.halfExtents.x, wb.halfExtents.y, wb.halfExtents.z);

                // Use either PlayCanvas result or manual calculation
                const finalIntersects = intersects || manualIntersects;
                const finalIP = intersects ? ip : manualIP;

                if (finalIntersects) {
                    const distance = finalIP.clone().sub(nearPoint).length();
                    if (Camera.debugPick) {
                        // 画出模型聚合 AABB
                        try {
                            const app: any = (scene as any).app;
                            const bbMin = wb.getMin();
                            const bbMax = wb.getMax();
                            const corners = [
                                new Vec3(bbMin.x, bbMin.y, bbMin.z),
                                new Vec3(bbMax.x, bbMin.y, bbMin.z),
                                new Vec3(bbMax.x, bbMax.y, bbMin.z),
                                new Vec3(bbMin.x, bbMax.y, bbMin.z),
                                new Vec3(bbMin.x, bbMin.y, bbMax.z),
                                new Vec3(bbMax.x, bbMin.y, bbMax.z),
                                new Vec3(bbMax.x, bbMax.y, bbMax.z),
                                new Vec3(bbMin.x, bbMax.y, bbMax.z)
                            ];
                            const color = new (window as any).pc.Color(0.9, 0.5, 0.1, 1);
                            const drawE = (a: number, b: number) => app?.drawLine?.(corners[a], corners[b], color);
                            drawE(0, 1); drawE(1, 2); drawE(2, 3); drawE(3, 0);
                            drawE(4, 5); drawE(5, 6); drawE(6, 7); drawE(7, 4);
                            drawE(0, 4); drawE(1, 5); drawE(2, 6); drawE(3, 7);
                        } catch { /* ignore */ }
                    }
                    if (distance < pickedDistance) {
                        pickedDistance = distance;
                        pickedModel = model;
                        pickedPoint = finalIP.clone();
                    }
                }
            }

            if (pickedModel) {
                if (Camera.debugPick) {
                    console.log('GLB模型拾取成功 - 阶段2:', pickedModel.filename);
                    console.log('是否为巡检模型:', (pickedModel as any).isInspectionModel);
                }

                // 返回选中结果，不在此处更改相机或触发事件
                return { model: pickedModel, position: pickedPoint };
            }

            // =============================
            // Fallback: 如果射线未命中任何 AABB，尝试基于包围盒中心投影的屏幕距离近似选取
            // 用于模型较大 / 视线角度特殊 / AABB 射线漏判的情况
            // =============================
            const fallbackCandidates: { model: GltfModel, dist2: number }[] = [];
            for (let i = 0; i < modelBounds.length; i++) {
                const { model, bound } = modelBounds[i];
                // 计算包围盒中心的屏幕坐标
                const sp = cam.worldToScreen(bound.center, va.clone());
                if (!sp) continue; // 极端情况
                // 只考虑在前方的
                if (sp.z < 0 || sp.z > 1) continue;
                const dx = screenX - sp.x;
                const dy = screenY - sp.y;
                const d2 = dx * dx + dy * dy;
                fallbackCandidates.push({ model, dist2: d2 });

            }

            if (fallbackCandidates.length) {
                fallbackCandidates.sort((a, b) => a.dist2 - b.dist2);
                const best = fallbackCandidates[0];

                // 临时测试：大幅增加阈值，确保GLB模型能被选中
                const threshold = 10000; // 100px 半径


                if (best.dist2 < threshold) {
                    if (Camera.debugPick) {
                        console.log('GLB模型拾取成功 - 阶段3(fallback):', best.model.filename);
                        console.log('是否为巡检模型:', (best.model as any).isInspectionModel);
                    }

                    return {
                        model: best.model,
                        position: best.model.worldBound?.center.clone() || nearPoint
                    };
                }

            }
        }

        // If no GLB model was picked, continue with splat picking
        const splats = scene.getElementsByType(ElementType.splat);

        let closestD = 0;
        const closestP = new Vec3();
        let closestSplat = null;

        for (let i = 0; i < splats.length; ++i) {
            const splat = splats[i] as Splat;

            this.pickPrep(splat, 'set');
            const pickId = this.pick(sx, sy);

            if (pickId !== -1) {
                splat.calcSplatWorldPosition(pickId, vec);

                // create a plane at the world position facing perpendicular to the camera
                plane.setFromPointNormal(vec, this.entity.forward);

                // find intersection
                if (plane.intersectsRay(ray, vec)) {
                    const distance = vecb.sub2(vec, ray.origin).length();
                    if (!closestSplat || distance < closestD) {
                        closestD = distance;
                        closestP.copy(vec);
                        closestSplat = splat;
                    }
                }
            }
        }

        if (!closestSplat) {
            return null;
        }

        if (Camera.debugPick) {
            console.log('高斯模型拾取成功:', closestSplat.filename);
        }

        return {
            splat: closestSplat,
            position: closestP,
            distance: closestD
        };
    }

    // intersect the scene at the screen location and focus the camera on this location
    pickFocalPoint(screenX: number, screenY: number) {
        const result = this.intersect(screenX, screenY);
        if (result && (result as any).splat) {
            const { scene } = this;
            this.setFocalPoint((result as any).position);
            this.setDistance((result as any).distance / this.sceneRadius * this.fovFactor);
            scene.events.fire('camera.focalPointPicked', {
                camera: this,
                splat: (result as any).splat,
                position: (result as any).position
            });
        } else if (result && (result as any).model) {
            // GLB 模型选中：不改变相机焦点，仅触发选中事件
            this.scene.events.fire('camera.focalPointPicked', {
                camera: this,
                model: (result as any).model,
                position: (result as any).position
            });
        } else {
            if (Camera.debugPick) {
                console.log('没有拾取到任何模型');
            }
            // 点击空白区域时也触发事件，用于清空选择
            this.scene.events.fire('camera.focalPointPicked', {
                camera: this,
                position: new Vec3() // 提供一个默认位置
            });
        }
    }

    // pick mode

    // render picker contents
    pickPrep(splat: Splat, op: 'add'|'remove'|'set') {
        const { width, height } = this.scene.targetSize;
        const worldLayer = this.scene.app.scene.layers.getLayerByName('World');

        const device = this.scene.graphicsDevice;
        const events = this.scene.events;
        const alpha = events.invoke('camera.mode') === 'rings' ? 0.0 : 0.2;

        // hide non-selected elements
        const splats = this.scene.getElementsByType(ElementType.splat);
        splats.forEach((s: Splat) => {
            s.entity.enabled = s === splat;
        });

        device.scope.resolve('pickerAlpha').setValue(alpha);
        device.scope.resolve('pickMode').setValue(['add', 'remove', 'set'].indexOf(op));
        this.picker.resize(width, height);
        this.picker.prepare(this.entity.camera, this.scene.app.scene, [worldLayer]);

        // re-enable all splats
        splats.forEach((splat: Splat) => {
            splat.entity.enabled = true;
        });
    }

    pick(x: number, y: number) {
        return this.pickRect(x, y, 1, 1)[0];
    }

    pickRect(x: number, y: number, width: number, height: number) {
        const device = this.scene.graphicsDevice as WebglGraphicsDevice;
        const pixels = new Uint8Array(width * height * 4);

        // read pixels
        device.setRenderTarget(this.picker.renderTarget);
        device.updateBegin();
        device.readPixels(x, this.picker.renderTarget.height - y - height, width, height, pixels);
        device.updateEnd();

        const result: number[] = [];
        for (let i = 0; i < width * height; i++) {
            result.push(
                pixels[i * 4] |
                (pixels[i * 4 + 1] << 8) |
                (pixels[i * 4 + 2] << 16) |
                (pixels[i * 4 + 3] << 24)
            );
        }

        return result;
    }

    docSerialize() {
        const pack3 = (v: Vec3) => [v.x, v.y, v.z];

        return {
            focalPoint: pack3(this.focalPointTween.target),
            azim: this.azim,
            elev: this.elevation,
            distance: this.distance,
            fov: this.fov,
            tonemapping: this.tonemapping
        };
    }

    docDeserialize(settings: any) {
        this.setFocalPoint(new Vec3(settings.focalPoint), 0);
        this.setAzimElev(settings.azim, settings.elev, 0);
        this.setDistance(settings.distance, 0);
        this.fov = settings.fov;
        this.tonemapping = settings.tonemapping;
    }

    // offscreen render mode

    startOffscreenMode(width: number, height: number) {
        this.targetSize = { width, height };
        this.suppressFinalBlit = true;
    }

    endOffscreenMode() {
        this.targetSize = null;
        this.suppressFinalBlit = false;
    }

    // Pick GLB models without focusing camera (for selection only)
    pickModel(screenX: number, screenY: number) {
        // Deprecated: 现在统一使用 pickFocalPoint 完成 GLB + splat 拾取

        this.pickFocalPoint(screenX, screenY);
    }
}

export { Camera };
