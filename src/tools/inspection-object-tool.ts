import { Container } from '@playcanvas/pcui';
import { Vec3, Plane, Ray, Entity, Quat } from 'playcanvas';


import { Events } from '../events';
import { Scene } from '../scene';
import { Transform } from '../transform';
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
    private step = 0.1;
    private points: { dom: HTMLElement; world: Vec3 }[] = [];
    private svg: SVGSVGElement | null = null;
    private active = false;
    private objects = new Map<string, { id: string; kind: Mode; groupId: string; dom?: HTMLElement }>();
    private gizmoEntity: Entity;
    private editingId: string | null = null;
    private suppressUntil = 0;

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
            const wasEditing = !!this.editingId;
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
                    this.suppressUntil = Date.now() + 250;
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
                const id = `xjdx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
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
        // 不拦截 pointerup，确保 Gizmo 能正确收到抬起事件完成一次移动
        this.canvasContainerDom.addEventListener('contextmenu', e => e.preventDefault());
        this.wireUiEvents();
        this.events.function('inspectionObjects.isEditing', () => !!this.editingId);
        this.events.on('camera.focalPointPicked', (details: any) => {
            const ignore = this.events.invoke('tool.justTransformed');
            if (ignore) return;
            if (details && (details.splat || details.model)) return;
            if (this.editingId) {
                this.editingId = null;
                this.events.fire('inspectionObjects.clearSelection');
                this.events.fire('tool.deactivate');
            }
        });

        // 采用原生移动工具：不再自行创建TranslateGizmo，改用Pivot事件驱动更新
        this.gizmoEntity = new Entity('inspectionGizmoPivot');

        // listen edit requests from list
        this.events.on('inspectionObjects.edit', (id: string) => {
            const obj = this.objects.get(id);
            if (!obj || obj.kind !== 'point' || !obj.dom) return;
            this.editingId = id;
            const point = this.points.find(p => p.dom === obj.dom);
            if (point) {
                const pivot = this.events.invoke('pivot');
                const t = new Transform();
                t.position.copy(point.world);
                t.rotation.setFromEulerAngles(0, 0, 0);
                t.scale.set(1, 1, 1);
                pivot.place(t);
                this.events.fire('tool.move');
            }
        });
        // 底部移动工具激活时，若有当前编辑目标则附着 Gizmo；切换到非移动则拆除 Gizmo
        // 监听Pivot事件以更新巡检对象位置（使用原生移动工具的轴与拖拽逻辑）
        this.events.on('pivot.moved', (pivot: any) => {
            if (!this.editingId) return;
            const obj = this.objects.get(this.editingId);
            if (!obj || obj.kind !== 'point' || !obj.dom) return;
            const point = this.points.find(p => p.dom === obj.dom);
            if (!point) return;
            point.world.copy(pivot.transform.position);
            this.updateMarker(point);
            this.updatePolyline();
            this.updatePolygon();
        });
        this.events.on('pivot.started', () => {
            if (this.editingId) this.events.fire('tool.dragging', true);
        });
        this.events.on('pivot.ended', () => {
            if (this.editingId) {
                this.events.fire('tool.dragging', false);
                this.events.fire('tool.transformed');
            }
        });

        // 当全局选择发生变化（例如选择了巡检点位或其他模型）时，停止巡检对象的编辑响应
        this.events.on('selection.changed', () => {
            if (this.editingId) {
                this.editingId = null;
            }
        });

        // 额外兜底：在全局鼠标抬起时强制结束一次移动编辑，避免轴线跟随不止
        // 使用原生工具，无需兜底拦截pointerup
        const escHandler = (ev: KeyboardEvent) => {
            if (ev.key === 'Escape') {
                if (this.editingId) {
                    this.editingId = null;
                }
                this.events.fire('inspectionObjects.clearSelection');
                this.events.fire('tool.deactivate');
                this.events.fire('inspectionObjects.active', false);
                this.events.fire('tool.deactivate');
                this.suppressUntil = 0;
            }
        };
        window.addEventListener('keydown', escHandler, true);
        document.addEventListener('keydown', escHandler, true);

        this.events.on('inspectionObjects.clearSelection', () => {
            if (this.editingId) {
                this.editingId = null;
                this.events.fire('tool.deactivate');
            }
        });

        events.on('inspectionObjects.setMode', (m: Mode) => {
            this.mode = m;
        });
        events.on('inspectionObjects.active', (active: boolean) => {
            this.active = active;
            if (!active) {
                if (this.editingId) {
                    this.editingId = null;
                }
                this.events.fire('inspectionObjects.clearSelection');
                this.events.fire('tool.deactivate');
            }
        });
        events.on('inspectionObjects.setSize', (size: number) => {
            this.markerSize = Math.max(1, Math.min(256, size));
            this.points.forEach((p) => {
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

        const onArrow = (dir: 'up' | 'down' | 'left' | 'right', e: KeyboardEvent) => {
            if (!this.active || !this.editingId) return;
            const obj = this.objects.get(this.editingId);
            if (!obj || obj.kind !== 'point' || !obj.dom) return;
            const pivot = this.events.invoke('pivot');
            if (!pivot) return;
            const camEntity = this.scene.camera.entity;
            const mul = e.shiftKey ? 10 : ((e.ctrlKey || e.metaKey || e.altKey) ? 0.1 : 1);
            const s = this.step * mul;
            const worldDelta = new Vec3(0, 0, 0);
            switch (dir) {
                case 'up':
                    worldDelta.add(camEntity.up.clone().mulScalar(s));
                    break;
                case 'down':
                    worldDelta.add(camEntity.up.clone().mulScalar(-s));
                    break;
                case 'left':
                    worldDelta.add(camEntity.right.clone().mulScalar(-s));
                    break;
                case 'right':
                    worldDelta.add(camEntity.right.clone().mulScalar(s));
                    break;
            }
            const newPos = new Vec3();
            newPos.copy(pivot.transform.position).add(worldDelta);
            pivot.start();
            pivot.moveTRS(newPos, pivot.transform.rotation as Quat, pivot.transform.scale);
            pivot.end();
            e.preventDefault();
            e.stopPropagation();
        };

        const keydown = (e: KeyboardEvent) => {
            if (!this.active) return;
            switch (e.key) {
                case 'ArrowUp':
                    onArrow('up', e);
                    break;
                case 'ArrowDown':
                    onArrow('down', e);
                    break;
                case 'ArrowLeft':
                    onArrow('left', e);
                    break;
                case 'ArrowRight':
                    onArrow('right', e);
                    break;
            }
        };
        const keyup = (e: KeyboardEvent) => {
            if (!this.active) return;
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                e.stopPropagation();
            }
        };
        (this as any)._keydownHandler = keydown;
        (this as any)._keyupHandler = keyup;
    }

    activate() {
        this.active = true;
        const handler = (this as any)._keydownHandler as (e: KeyboardEvent) => void;
        const upHandler = (this as any)._keyupHandler as (e: KeyboardEvent) => void;
        if (handler) {
            document.addEventListener('keydown', handler, true);
        }
        if (upHandler) {
            document.addEventListener('keyup', upHandler, true);
        }
    }

    deactivate() {
        this.active = false;
        const handler = (this as any)._keydownHandler as (e: KeyboardEvent) => void;
        const upHandler = (this as any)._keyupHandler as (e: KeyboardEvent) => void;
        if (handler) {
            document.removeEventListener('keydown', handler, true);
        }
        if (upHandler) {
            document.removeEventListener('keyup', upHandler, true);
        }
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
        const pts = this.points.map((p) => {
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
        const pts = this.points.map((p) => {
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
