import { Container } from '@playcanvas/pcui';
import { Vec3, Plane, Ray, Entity, TranslateGizmo, Quat } from 'playcanvas';

import { Events } from '../events';
import { Scene } from '../scene';
import inspectionPointSvg from '../ui/svg/inspectionpoint.svg';
const createImgEl = (src: string) => {
    const img = document.createElement('img');
    img.src = src;
    return img as unknown as HTMLElement;
};

type Mode = 'point' | 'line' | 'face';

class InspectionObjectTool {
    private events: Events;
    private scene: Scene;
    private canvasContainerDom: HTMLElement;
    private mode: Mode = 'point';
    private markerSize = 30;
    private points: { dom: HTMLElement; world: Vec3 }[] = [];
    private svg: SVGSVGElement | null = null;
    private active = false;
    private objects = new Map<string, { id: string; kind: Mode; groupId: string; dom?: HTMLElement }>();
    private gizmo: TranslateGizmo;
    private gizmoEntity: Entity;
    private editingId: string | null = null;

    constructor(events: Events, scene: Scene, canvasContainer: Container) {
        this.events = events;
        this.scene = scene;
        this.canvasContainerDom = canvasContainer.dom;

        // SVG overlay for lines/faces
        this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        this.svg.classList.add('tool-svg');
        this.svg.style.position = 'absolute';
        this.svg.style.left = '0';
        this.svg.style.top = '0';
        this.svg.style.width = '100%';
        this.svg.style.height = '100%';
        this.svg.style.pointerEvents = 'none';
        this.canvasContainerDom.appendChild(this.svg);

        const onDown = (e: PointerEvent) => {
            if (!this.active) return;
            const isLeft = e.button === 0;
            if (!isLeft) return;
            if (this.editingId) {
                this.gizmo.detach();
                this.editingId = null;
                this.events.fire('inspectionObjects.clearSelection');
                return;
            }
            const startX = e.clientX;
            const startY = e.clientY;
            let moved = false;

            const onMove = (ev: PointerEvent) => {
                if ((ev.buttons & 1) === 0) return;
                const dx = Math.abs(ev.clientX - startX);
                const dy = Math.abs(ev.clientY - startY);
                if (dx > 4 || dy > 4) {
                    if (!moved) {
                        moved = true;
                        this.events.fire('tool.dragging', true);
                    }
                }
            };

            const onUp = (ev: PointerEvent) => {
                window.removeEventListener('pointermove', onMove, true);
                window.removeEventListener('pointerup', onUp, true);
                if (moved) {
                    this.events.fire('tool.dragging', false);
                    return;
                }
                if (!this.active) return;
                if (ev.button !== 0) return;

                const rect = this.canvasContainerDom.getBoundingClientRect();
                const x = ev.clientX - rect.left;
                const y = ev.clientY - rect.top;
            const hit = this.scene.camera.intersect(x, y) as any;
            if (!hit || !hit.position) return;
            const world = new Vec3(hit.position.x, hit.position.y, hit.position.z);
            const groupId = (this.events.invoke('inspectionObjects.currentGroupId') as string) || 'XJDX-1';
            const id = `xjdx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`;
            if (this.mode === 'point') {
                const dom = this.placePoint(world);
                this.objects.set(id, { id, kind: 'point', groupId, dom });
                this.events.fire('inspectionObjects.addItem', { id, kind: 'point', groupId });
            } else if (this.mode === 'line') {
                this.placePoint(world);
                this.updatePolyline();
                this.objects.set(id, { id, kind: 'line', groupId });
                this.events.fire('inspectionObjects.addItem', { id, kind: 'line', groupId });
            } else {
                this.placePoint(world);
                this.updatePolygon();
                this.objects.set(id, { id, kind: 'face', groupId });
                this.events.fire('inspectionObjects.addItem', { id, kind: 'face', groupId });
            }
        };

            window.addEventListener('pointermove', onMove, true);
            window.addEventListener('pointerup', onUp, true);
        };
        this.canvasContainerDom.addEventListener('pointerdown', onDown);
        this.canvasContainerDom.addEventListener('contextmenu', (e) => e.preventDefault());
        this.wireUiEvents();

        // setup gizmo for editing points
        this.gizmo = new TranslateGizmo(scene.camera.entity.camera, scene.gizmoLayer);
        this.gizmoEntity = new Entity('inspectionGizmoPivot');

        this.gizmo.on('render:update', () => { this.scene.forceRender = true; });
        this.gizmo.on('transform:start', () => { this.events.invoke('pivot').start(); });
        this.gizmo.on('transform:move', () => {
            const pos = this.gizmoEntity.getLocalPosition();
            this.events.invoke('pivot').moveTRS(pos, this.gizmoEntity.getLocalRotation(), this.gizmoEntity.getLocalScale());
            if (this.editingId) {
                const obj = this.objects.get(this.editingId);
                if (obj && obj.kind === 'point') {
                    // update point world position
                    const point = this.points.find(p => p.dom === obj.dom);
                    if (point) {
                        point.world.copy(pos);
                        this.updateMarker(point);
                        this.updatePolyline();
                        this.updatePolygon();
                    }
                }
            }
        });
        this.gizmo.on('transform:end', () => { this.events.invoke('pivot').end(); });

        // listen edit requests from list
        this.events.on('inspectionObjects.edit', (id: string) => {
            const obj = this.objects.get(id);
            if (!obj || obj.kind !== 'point' || !obj.dom) return;
            this.editingId = id;
            // place pivot and attach gizmo
            const point = this.points.find(p => p.dom === obj.dom);
            if (!point) return;
            const t = { position: point.world, rotation: Quat.IDENTITY, scale: Vec3.ONE } as any;
            this.events.invoke('pivot').place(t);
            this.gizmoEntity.setLocalPosition(point.world);
            this.gizmo.attach(this.gizmoEntity);
            this.events.fire('transformHandler.push', {} as any);
        });
        window.addEventListener('keydown', (ev: KeyboardEvent) => {
            if (ev.key === 'Escape' && this.editingId) {
                this.gizmo.detach();
                this.editingId = null;
                this.events.fire('inspectionObjects.clearSelection');
            }
        });

        events.on('inspectionObjects.setMode', (m: Mode) => {
            this.mode = m;
        });
        events.on('inspectionObjects.active', (active: boolean) => {
            this.active = active;
        });
        events.on('inspectionObjects.setSize', (size: number) => {
            this.markerSize = Math.max(1, Math.min(256, size));
            this.points.forEach(p => {
                p.dom.style.width = `${this.markerSize}px`;
                p.dom.style.height = `${this.markerSize}px`;
            });
            this.updatePolyline();
            this.updatePolygon();
        });

        events.on('update', () => {
            this.updateAllMarkers();
            this.updatePolyline();
            this.updatePolygon();
        });
    }

    activate() {
        this.active = true;
    }

    deactivate() {
        this.active = false;
    }

    private allocId(kind: 'point'|'line'|'face') {
        // 简易编号：XJDX-<group>-<index>
        const group = (window as any).__xjdx_group__ = ((window as any).__xjdx_group__ || 0) + 1;
        const idx = (window as any).__xjdx_index__ = ((window as any).__xjdx_index__ || 0) + 1;
        return `${'XJDX'}-${group}-${idx} (${kind})`;
    }

    private placePoint(world: Vec3) {
        const el = createImgEl(inspectionPointSvg);
        el.style.position = 'absolute';
        el.style.pointerEvents = 'none';
        el.style.transform = 'translate(-50%, -100%)';
        el.style.zIndex = '100';
        el.style.width = `${this.markerSize}px`;
        el.style.height = `${this.markerSize}px`;
        this.canvasContainerDom.appendChild(el);
        const item = { dom: el, world: world.clone() };
        this.points.push(item);
        this.updateMarker(item);
        return el;
    }

    private updateMarker(p: { dom: HTMLElement; world: Vec3 }) {
        if ((p.dom.dataset && p.dom.dataset.hidden === '1')) {
            p.dom.style.display = 'none';
            return;
        }
        const sp = this.scene.camera.entity.camera.worldToScreen(p.world, new Vec3());
        if (!sp || !isFinite(sp.x) || !isFinite(sp.y) || sp.z < 0) {
            p.dom.style.display = 'none';
        } else {
            p.dom.style.display = 'block';
            p.dom.style.left = `${sp.x}px`;
            p.dom.style.top = `${sp.y}px`;
        }
    }

    private updatePolyline() {
        if (!this.svg) return;
        this.svg.innerHTML = '';
        if (this.mode !== 'line' || this.points.length < 2) return;
        const ns = this.svg.namespaceURI;
        const pl = document.createElementNS(ns, 'polyline');
        pl.setAttribute('fill', 'none');
        pl.setAttribute('stroke', '#ffcc00');
        pl.setAttribute('stroke-width', '2');
        const pts = this.points.map(p => {
            const sp = this.scene.camera.entity.camera.worldToScreen(p.world, new Vec3());
            return `${sp.x},${sp.y}`;
        }).join(' ');
        pl.setAttribute('points', pts);
        this.svg.appendChild(pl);
    }

    private updatePolygon() {
        if (!this.svg) return;
        if (this.mode !== 'face' || this.points.length < 3) return;
        this.svg.innerHTML = '';
        const ns = this.svg.namespaceURI;
        const pg = document.createElementNS(ns, 'polygon');
        pg.setAttribute('fill', 'rgba(255,204,0,0.2)');
        pg.setAttribute('stroke', '#ffcc00');
        pg.setAttribute('stroke-width', '2');
        const pts = this.points.map(p => {
            const sp = this.scene.camera.entity.camera.worldToScreen(p.world, new Vec3());
            return `${sp.x},${sp.y}`;
        }).join(' ');
        pg.setAttribute('points', pts);
        this.svg.appendChild(pg);
    }

    private clearTemp() {
        this.points.forEach(p => p.dom.remove());
        this.points = [];
        if (this.svg) this.svg.innerHTML = '';
    }

    private updateAllMarkers() {
        for (let i = 0; i < this.points.length; i++) {
            this.updateMarker(this.points[i]);
        }
    }

    // UI → 场景联动
    private setVisible(id: string, visible: boolean) {
        const obj = this.objects.get(id);
        if (!obj) return;
        if (obj.kind === 'point' && obj.dom) {
            obj.dom.dataset.hidden = visible ? '0' : '1';
            obj.dom.style.display = visible ? 'block' : 'none';
        } else if (obj.kind === 'line' || obj.kind === 'face') {
            if (this.svg) this.svg.style.display = visible ? 'block' : 'none';
        }
    }

    private removeItem(id: string) {
        const obj = this.objects.get(id);
        if (!obj) return;
        if (obj.kind === 'point' && obj.dom) {
            obj.dom.remove();
            // also remove from points array
            this.points = this.points.filter(p => p.dom !== obj.dom);
        } else if (obj.kind === 'line' || obj.kind === 'face') {
            this.points = [];
            if (this.svg) {
                this.svg.innerHTML = '';
                this.svg.style.display = 'none';
            }
        }
        this.objects.delete(id);
    }

    private setSelectable(id: string, selectable: boolean) {
        const obj = this.objects.get(id);
        if (!obj) return;
        // DOM 图标本身不接收事件，selectable 作为占位状态
        (obj as any).selectable = selectable;
    }

    // events wiring
    private wireUiEvents() {
        this.events.on('inspectionObjects.setVisible', (id: string, visible: boolean) => this.setVisible(id, visible));
        this.events.on('inspectionObjects.removeItem', (id: string) => this.removeItem(id));
        this.events.on('inspectionObjects.setSelectable', (id: string, selectable: boolean) => this.setSelectable(id, selectable));
        this.events.on('inspectionObjects.groupSetVisible', (groupId: string, visible: boolean) => {
            this.objects.forEach((obj) => {
                if (obj.groupId === groupId) this.setVisible(obj.id, visible);
            });
        });
    }
}

export { InspectionObjectTool };