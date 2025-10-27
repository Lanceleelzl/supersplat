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

        this.getRay(screenX, screenY, ray);

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

        return {
            splat: closestSplat,
            position: closestP,
            distance: closestD
        };
    }

    // intersect the scene at the screen location and focus the camera on this location
    pickFocalPoint(screenX: number, screenY: number) {
        const result = this.intersect(screenX, screenY);
        if (result) {
            const { scene } = this;

            this.setFocalPoint(result.position);
            this.setDistance(result.distance / this.sceneRadius * this.fovFactor);
            scene.events.fire('camera.focalPointPicked', {
                camera: this,
                splat: result.splat,
                position: result.position
            });
        } else {
            if (Camera.debugPick) {
                console.log('没有拾取到任何模型');
            }

            // 点击空白区域时也触发事件，用于清空选择
            scene.events.fire('camera.focalPointPicked', {
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
