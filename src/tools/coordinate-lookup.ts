import { Container, TextInput, NumericInput, Label } from '@playcanvas/pcui';
import { Vec3, Entity, StandardMaterial, BLEND_NONE, CULLFACE_NONE } from 'playcanvas';

import { Events } from '../events';
import { Scene } from '../scene';
import locationPng from '../ui/svg/location.png';

// 仅用于保留旧的 DOM 图标（现已不使用）。
// 对于 PNG，我们直接创建 <img> 元素。
const createImgEl = (src: string) => {
    const img = document.createElement('img');
    img.src = src;
    return img;
};

class CoordinateLookupTool {
    private events: Events;
    private scene: Scene;
    private selectToolbar: Container;
    private textInput: TextInput;
    private sizeInput: NumericInput | null = null;
    private active = false;
    private bottomMenuActive = false;
    private lastText = '';
    private markerWorld: Vec3 | null = null;
    // DOM 覆盖图标
    private markerDom: HTMLElement | null = null;
    private canvasContainerDom: HTMLElement | null = null;
    // 3D 球体标记（直径模式）
    private markerEntity: Entity | null = null;
    private markerMaterial: StandardMaterial | null = null;
    private markerReady = false;
    // 以“直径(px)”为输入语义，并直接按直径计算屏幕尺寸。
    // 默认直径 30px (图标模式)
    private markerDesiredPx = 30; // 目标屏幕像素直径
    private markerMode: 'icon' | 'diameter' = 'icon'; // 初始为图标模式
    private iconSize = 30;
    private sphereSize = 10;


    constructor(events: Events, scene: Scene, canvasContainer?: Container) {
        this.events = events;
        this.scene = scene;

        this.textInput = new TextInput({
            width: 460,
            placeholder: '',
            value: '',
            enabled: false
        });

        this.selectToolbar = new Container({
            class: 'select-toolbar',
            hidden: true
        });
        // 防止遮罩层拦截事件
        this.selectToolbar.dom.addEventListener('pointerdown', e => e.stopPropagation());
        // 单行：坐标文本 + 球体直径值输入（紧凑布局）
        const controlsRow = new Container({ class: 'select-toolbar-row' });
        controlsRow.dom.style.display = 'flex';
        controlsRow.dom.style.flexDirection = 'row';
        controlsRow.dom.style.alignItems = 'center';
        controlsRow.dom.style.gap = '8px';
        // 文本框放在最左，尽量占满
        controlsRow.append(this.textInput);
        (this.textInput as any).width = 380;
        // 直径数值输入（支持拖拽增减，使用NumericInput以节省空间）
        const sizeLabel = new Label({ text: '图标', class: 'select-toolbar-row-label' });
        this.sizeInput = new NumericInput({
            class: 'select-toolbar-row-number',
            width: 56,
            min: 1,
            max: 256,
            precision: 0,
            // 显示直径，默认 30
            value: 30
        });
        controlsRow.append(sizeLabel);
        controlsRow.append(this.sizeInput);
        // 标签点击切换模式：图标 <-> 直径
        try {
            sizeLabel.dom.addEventListener('click', () => {
                // 切换前保存当前尺寸
                if (this.markerMode === 'icon') {
                    this.iconSize = this.markerDesiredPx;
                } else {
                    this.sphereSize = this.markerDesiredPx;
                }

                this.markerMode = this.markerMode === 'icon' ? 'diameter' : 'icon';
                sizeLabel.text = this.markerMode === 'icon' ? '图标' : '直径(px)';

                // 切换后恢复对应尺寸
                if (this.markerMode === 'icon') {
                    this.markerDesiredPx = this.iconSize;
                } else {
                    this.markerDesiredPx = this.sphereSize;
                }

                // 更新输入框显示
                if (this.sizeInput) {
                    this.sizeInput.value = this.markerDesiredPx;
                }

                this.updateMarker();
            });
        } catch (_e) { /* ignore */ }
        // 支持在标签上左右拖拽以调整数值（仅直径模式），但鼠标样式保持默认；提供点击切换提示与轻微悬停高亮
        try {
            const el = sizeLabel.dom as HTMLElement;
            el.style.cursor = 'default';
            el.style.userSelect = 'none';
            el.title = '点击切换图标/直径';
            const onEnter = () => {
                el.style.filter = 'brightness(1.08)';
            };
            const onLeave = () => {
                el.style.filter = '';
            };
            el.addEventListener('mouseenter', onEnter);
            el.addEventListener('mouseleave', onLeave);
            const onPointerDown = (e: PointerEvent) => {
                e.preventDefault();
                if (this.markerMode !== 'diameter') return;
                const startX = e.clientX;
                // 以直径为基准进行拖拽
                const startVal = (this.sizeInput?.value as number) ?? Math.max(1, Math.round(this.markerDesiredPx));
                const onMove = (ev: PointerEvent) => {
                    const dx = ev.clientX - startX;
                    // 拖动2px增减1单位直径
                    const val = Math.max(1, Math.min(256, Math.round(startVal + dx / 2)));
                    if (this.sizeInput) this.sizeInput.value = val;
                    // 直接使用直径值
                    this.markerDesiredPx = val;
                    this.updateMarker();
                };
                const onUp = () => {
                    window.removeEventListener('pointermove', onMove);
                    window.removeEventListener('pointerup', onUp);
                };
                window.addEventListener('pointermove', onMove);
                window.addEventListener('pointerup', onUp);
            };
            sizeLabel.dom.addEventListener('pointerdown', onPointerDown);
        } catch (_e) { /* ignore */ }
        this.selectToolbar.append(controlsRow);

        if (canvasContainer) {
            canvasContainer.append(this.selectToolbar);
            this.canvasContainerDom = canvasContainer.dom;
        } else {
            // 回退：尝试使用默认的画布容器
            this.canvasContainerDom = document.getElementById('canvas-container');
            if (this.canvasContainerDom) {
                this.canvasContainerDom.appendChild(this.selectToolbar.dom);
            }
        }

        // 监听底部菜单是否激活
        events.on('bottomMenu.active', (active: boolean) => {
            this.bottomMenuActive = !!active;
            this.updateVisibility();
        });

        // 监听拾取点事件
        events.on('camera.focalPointPicked', (details: { position: Vec3 }) => {
            if (!this.active) return;
            if (this.bottomMenuActive) return;
            const pos = details?.position;
            if (!pos) return;
            const text = this.computeText(pos);
            this.lastText = text;
            this.textInput.value = text;
            // 更新并绘制位置图标（仅保留一个）
            this.placeMarker(pos);
            this.updateVisibility();
        });

        // 交互：直径调节
        this.sizeInput?.on('change', (v: number) => {
            if (typeof v === 'number' && isFinite(v)) {
                const diameter = Math.max(1, Math.min(256, Math.round(v)));
                // 直接使用直径像素
                this.markerDesiredPx = diameter;
                // 同步保存到对应模式的记录中
                if (this.markerMode === 'icon') {
                    this.iconSize = diameter;
                } else {
                    this.sphereSize = diameter;
                }
            }
        });

        // 每帧更新：根据模式刷新图标/球体
        events.on('update', () => this.updateMarker());

        // 画布尺寸变化时重新定位工具条到“测量”按钮上方
        events.on('camera.resize', () => this.repositionToolbar());
    }

    private updateVisibility() {
        const shouldShow = this.active && !this.bottomMenuActive;
        this.selectToolbar.hidden = !shouldShow;
        if (shouldShow) this.repositionToolbar();
    }

    // 将弹出控件定位到底部菜单居中上方，保持水平对称，并防止溢出
    private repositionToolbar() {
        try {
            const bar = document.getElementById('bottom-toolbar');
            const containerDom = this.canvasContainerDom ?? this.selectToolbar.dom.parentElement as HTMLElement | null;
            if (!bar || !containerDom) {
                this.selectToolbar.dom.style.left = '-9999px';
                this.selectToolbar.dom.style.top = '0';
                this.selectToolbar.dom.style.bottom = '';
                this.selectToolbar.dom.style.transform = 'translate(0, 0)';
                return;
            }
            const barRect = bar.getBoundingClientRect();
            const contRect = containerDom.getBoundingClientRect();
            // 先隐藏以准确测量尺寸
            const prevVisibility = this.selectToolbar.dom.style.visibility;
            const prevOpacity = this.selectToolbar.dom.style.opacity;
            this.selectToolbar.dom.style.visibility = 'hidden';
            this.selectToolbar.dom.style.opacity = '0';
            const height = this.selectToolbar.dom.offsetHeight || 54;
            const width = this.selectToolbar.dom.offsetWidth || 320;
            // 居中到整个底部菜单
            const centerX = barRect.left + (barRect.width / 2);
            let leftPx = centerX - contRect.left;
            // 水平边界约束：使用 translate(-50%)，因此需要考虑半宽
            const margin = 8;
            const halfW = width / 2;
            const contW = contRect.width;
            leftPx = Math.max(margin + halfW, Math.min(contW - margin - halfW, leftPx));
            const topPx = (barRect.top - contRect.top) - height - 8;
            this.selectToolbar.dom.style.left = `${leftPx}px`;
            this.selectToolbar.dom.style.top = `${Math.max(0, topPx)}px`;
            this.selectToolbar.dom.style.bottom = '';
            this.selectToolbar.dom.style.transform = 'translate(-50%, 0)';
            this.selectToolbar.dom.style.visibility = prevVisibility || '';
            this.selectToolbar.dom.style.opacity = prevOpacity || '';
        } catch (_e) {
            // 忽略定位错误
        }
    }

    private computeText(world: Vec3): string {
        // 原点与EPSG
        const enu = (this.events.invoke('origin.enu') as { x: number; y: number; z: number }) || { x: 0, y: 0, z: 0 };
        const epsg = (this.events.invoke('origin.epsg') as string) || '';
        const target = (this.events.invoke('export.geodeticTarget') as ('wgs84' | 'cgcs2000')) || 'wgs84';

        // ENU坐标（米）
        const E = (isFinite(world.x) ? world.x : 0) + (isFinite(enu.x) ? enu.x : 0);
        const N = (isFinite(world.y) ? world.y : 0) + (isFinite(enu.y) ? enu.y : 0);
        const U = (isFinite(world.z) ? world.z : 0) + (isFinite(enu.z) ? enu.z : 0);

        // 选择椭球（WGS84 或 CGCS2000）
        const ellipsoid = target === 'cgcs2000' ?
            { a: 6378137.0, f: 1 / 298.257222101 } :
            { a: 6378137.0, f: 1 / 298.257223563 };

        // 经纬度
        let latLon: { lat: number; lon: number } | null = null;
        const utm = this.parseUtmFromEPSG(epsg);
        const gk = this.parseCgcs2000GKFromEPSG(epsg);
        const isWebMercator = this.parseWebMercatorFromEPSG(epsg);
        if (utm) {
            const falseNorthing = utm.north ? 0 : 10_000_000;
            const lon0Deg = ((utm.zone - 1) * 6 - 180 + 3);
            latLon = this.transverseMercatorInverse(E, N, {
                lon0Deg,
                k0: 0.9996,
                falseEasting: 500_000,
                falseNorthing,
                a: ellipsoid.a,
                f: ellipsoid.f
            });
        } else if (gk) {
            latLon = this.transverseMercatorInverse(E, N, {
                lon0Deg: gk.lon0,
                k0: gk.k0,
                falseEasting: gk.falseEasting,
                falseNorthing: 0,
                a: ellipsoid.a,
                f: ellipsoid.f
            });
        } else if (isWebMercator) {
            latLon = this.webMercatorInverse(E, N, ellipsoid.a);
        }

        const lonText = latLon && isFinite(latLon.lon) ? latLon.lon.toFixed(7) : '';
        const latText = latLon && isFinite(latLon.lat) ? latLon.lat.toFixed(7) : '';
        const altText = isFinite(U) ? U.toFixed(3) : '';
        return `经度: ${lonText}  纬度: ${latText}  海拔(m): ${altText}`;
    }

    // （保留）DOM 覆盖图标创建：不再使用
    private ensureMarkerDom(): HTMLElement | null {
        if (this.markerDom) return this.markerDom;
        const el = createImgEl(locationPng) as unknown as HTMLElement;
        el.style.position = 'absolute';
        el.style.pointerEvents = 'none';
        el.style.width = '26px';
        el.style.height = '26px';
        el.style.transform = 'translate(-50%, -100%)';
        el.style.zIndex = '50';
        this.markerDom = el;
        if (this.canvasContainerDom) {
            this.canvasContainerDom.appendChild(el);
        }
        return this.markerDom;
    }

    // 创建或获取 3D 球体图标实体（直径模式）
    private async ensureMarkerEntity(): Promise<Entity> {
        if (this.markerEntity) return this.markerEntity;
        const entity = new Entity('coordinateMarker');
        // 主体材质：不受光照、不写深度、不测试深度；橙色发光
        const headMat = new StandardMaterial();
        headMat.blendType = BLEND_NONE;
        (headMat as any).cull = CULLFACE_NONE;
        (headMat as any).useLighting = false;
        (headMat as any).depthTest = false;
        (headMat as any).depthWrite = false;
        (headMat as any).emissive = { r: 0.913, g: 0.561, b: 0.212 };
        headMat.update();
        this.markerMaterial = headMat;

        entity.addComponent('render', { type: 'sphere' });
        const gizmoId = this.scene.gizmoLayer.id;
        (entity.render as any).material = this.markerMaterial;
        (entity.render as any).layers = [gizmoId];
        entity.setLocalScale(1, 1, 1);

        this.scene.app.root.addChild(entity);
        entity.enabled = false;

        this.markerEntity = entity;
        this.markerReady = true;
        return entity;
    }

    private async placeMarker(world: Vec3) {
        // 设置新位置
        this.markerWorld = world.clone?.() || new Vec3(world.x, world.y, world.z);
        // 预备两种模式的资源
        this.ensureMarkerDom();
        if (this.markerMode === 'diameter') {
            await this.ensureMarkerEntity();
        }
        this.updateMarker();
    }

    // 使用 DOM 覆盖图标，避免 3D 实体
    private updateMarker2D() {
        const el = this.markerDom;
        if (!el) return;
        if (!this.active || !this.markerWorld) {
            el.style.display = 'none';
            return;
        }

        const camEntity = this.scene.camera.entity;
        const camComp = camEntity.camera;
        const sp = camComp.worldToScreen(this.markerWorld, new Vec3());
        const isOrtho = this.scene.camera.ortho;
        if (!sp || !isFinite(sp.x) || !isFinite(sp.y) || (!isOrtho && sp.z < 0)) {
            el.style.display = 'none';
            return;
        }

        // 显示并定位到屏幕坐标
        el.style.display = 'block';
        el.style.left = `${sp.x}px`;
        el.style.top = `${sp.y}px`;
        // 根据设置的像素直径调整大小
        const px = Math.max(1, this.markerDesiredPx);
        el.style.width = `${px}px`;
        el.style.height = `${px}px`;
    }

    // 使用 3D 球体（直径模式）
    private updateMarker3D() {
        const entity = this.markerEntity;
        if (!entity) return;
        if (!this.active || !this.markerWorld) {
            entity.enabled = false;
            return;
        }

        const camEntity = this.scene.camera.entity;
        const camComp = camEntity.camera;
        const camPos = camEntity.getPosition().clone();
        const dist = camPos.distance(this.markerWorld);
        if (dist > camComp.farClip * 0.9) {
            (camComp as any).farClip = Math.min(dist * 1.5, 1e6);
        }

        const sp = camComp.worldToScreen(this.markerWorld, new Vec3());
        const isOrtho = this.scene.camera.ortho;
        if (!sp || !isFinite(sp.x) || !isFinite(sp.y) || (!isOrtho && sp.z < 0)) {
            entity.enabled = false;
            return;
        }

        entity.setPosition(this.markerWorld);
        entity.enabled = true;

        const canvas = this.scene.canvas;
        const targetH = Math.max(1, this.scene.targetSize?.height || canvas.clientHeight);
        const desiredPx = this.markerDesiredPx;
        let worldH = 0.05;
        if (this.scene.camera.ortho) {
            const orthoHalfH = (camComp as any).orthoHeight ?? 1;
            worldH = desiredPx * (2 * orthoHalfH) / targetH;
        } else {
            const fovRad = (camComp.fov ?? 60) * Math.PI / 180;
            worldH = desiredPx * (2 * dist * Math.tan(fovRad / 2)) / targetH;
        }
        entity.setLocalScale(worldH / 2, worldH / 2, worldH / 2);
    }

    // 根据模式更新对应标记
    private updateMarker() {
        if (this.markerMode === 'icon') {
            if (this.markerEntity) this.markerEntity.enabled = false;
            this.updateMarker2D();
        } else {
            if (this.markerDom) this.markerDom.style.display = 'none';
            this.updateMarker3D();
        }
    }

    // EPSG解析与逆算实现（参考Excel导出器逻辑）
    private parseUtmFromEPSG(epsg?: string): { zone: number; north: boolean } | null {
        if (!epsg) return null;
        const m = epsg.match(/(\d{4,5})/);
        if (!m) return null;
        const code = parseInt(m[1], 10);
        if (code >= 32601 && code <= 32660) return { zone: code - 32600, north: true };
        if (code >= 32701 && code <= 32760) return { zone: code - 32700, north: false };
        return null;
    }

    private parseCgcs2000GKFromEPSG(epsg?: string): { lon0: number; falseEasting: number; k0: number } | null {
        if (!epsg) return null;
        const m = epsg.match(/(\d{4,5})/);
        if (!m) return null;
        const code = parseInt(m[1], 10);
        if (code >= 4513 && code <= 4533) {
            const zone = code - 4488; // 25..45
            const lon0 = zone * 3;
            const falseEasting = zone * 1_000_000 + 500_000;
            return { lon0, falseEasting, k0: 1.0 };
        }
        if (code >= 4535 && code <= 4559) {
            const lon0 = 78 + 3 * (code - 4535);
            if (lon0 < 75 || lon0 > 135) return null;
            return { lon0, falseEasting: 500_000, k0: 1.0 };
        }
        return null;
    }

    private parseWebMercatorFromEPSG(epsg?: string): boolean {
        if (!epsg) return false;
        const m = epsg.match(/(\d{4,6})/);
        if (!m) return false;
        const code = parseInt(m[1], 10);
        return code === 3857 || code === 102100 || code === 900913;
    }

    private transverseMercatorInverse(easting: number, northing: number, params: {
        lon0Deg: number;
        k0: number;
        falseEasting: number;
        falseNorthing: number;
        a: number;
        f: number;
    }): { lat: number; lon: number } {
        const a = params.a;
        const f = params.f;
        const e2 = f * (2 - f);
        const e = Math.sqrt(e2);
        const ePrime2 = e2 / (1 - e2);
        const k0 = params.k0;

        const x = easting - params.falseEasting;
        const y = northing - params.falseNorthing;

        const M = y / k0;
        const mu = M / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256));

        const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
        const J1 = (3 * e1) / 2 - (27 * Math.pow(e1, 3)) / 32;
        const J2 = (21 * e1 * e1) / 16 - (55 * Math.pow(e1, 4)) / 32;
        const J3 = (151 * Math.pow(e1, 3)) / 96;
        const J4 = (1097 * Math.pow(e1, 4)) / 512;

        const fp = mu + J1 * Math.sin(2 * mu) + J2 * Math.sin(4 * mu) + J3 * Math.sin(6 * mu) + J4 * Math.sin(8 * mu);

        const sinfp = Math.sin(fp);
        const cosfp = Math.cos(fp);
        const tanfp = Math.tan(fp);

        const C1 = ePrime2 * cosfp * cosfp;
        const T1 = tanfp * tanfp;
        const N1 = a / Math.sqrt(1 - e2 * sinfp * sinfp);
        const R1 = (a * (1 - e2)) / Math.pow(1 - e2 * sinfp * sinfp, 1.5);
        const D = x / (N1 * k0);

        const lat = fp - (N1 * tanfp / R1) * (Math.pow(D, 2) / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ePrime2) * Math.pow(D, 4) / 24 +
            (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ePrime2 - 3 * C1 * C1) * Math.pow(D, 6) / 720);

        const lon0 = params.lon0Deg * (Math.PI / 180);
        const lon = lon0 + (D - (1 + 2 * T1 + C1) * Math.pow(D, 3) / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ePrime2 + 24 * T1 * T1) * Math.pow(D, 5) / 120) / cosfp;

        return { lat: lat * (180 / Math.PI), lon: lon * (180 / Math.PI) };
    }

    private webMercatorInverse(easting: number, northing: number, a: number): { lat: number; lon: number } {
        const R = a;
        const lon = (easting / R) * (180 / Math.PI);
        const lat = Math.atan(Math.sinh(northing / R)) * (180 / Math.PI);
        return { lat, lon };
    }

    activate() {
        this.active = true;
        this.lastText = '';
        this.textInput.value = '';
        this.ensureMarkerDom();
        if (this.markerDom) this.markerDom.style.display = 'none';
        this.markerWorld = null;
        this.updateVisibility();
    }

    deactivate() {
        this.active = false;
        if (this.markerDom) this.markerDom.style.display = 'none';
        this.updateVisibility();
    }
}

export { CoordinateLookupTool };
