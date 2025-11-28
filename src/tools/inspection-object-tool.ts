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
    private svg: SVGSVGElement | null = null;
    private currentDrawing: { id: string; kind: Mode; groupId: string } | null = null;
    private active = false;
    private currentGroupId: string = 'XJDX-1';
    private objects = new Map<string, { id: string; kind: Mode; groupId: string; dom?: HTMLElement; parentId?: string; world?: Vec3; worldRef?: Vec3 }>();
    private lineFaceObjects = new Map<string, { id: string; kind: 'line'|'face'; groupId: string; points: { world: Vec3 }[]; svgEl: SVGPolylineElement | SVGPolygonElement; vertexCircles: SVGCircleElement[] }>();
    private gizmoEntity: Entity;
    private editingId: string | null = null;
    private editingVertexIndex: number | null = null;
    private isDragging = false;
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
        this.svg.style.zIndex = '50';
        this.canvasContainerDom.appendChild(this.svg);

        const onDown = (e: PointerEvent) => {
            if (e.target !== this.scene.canvas) return;

            if (!this.active) return;

            const activeTool = this.events.invoke('tool.active');
            if (activeTool === 'move') return;

            const isLeft = e.button === 0;
            const isRight = e.button === 2;
            if (!isLeft && !isRight) return;
            if (activeTool !== 'inspectionObjects') {
                this.events.fire('inspectionObjects.active', true);
                this.events.fire('tool.inspectionObjects');
            }
            const wasEditing = !!this.editingId;
            const startX = e.clientX;
            const startY = e.clientY;
            let moved = false;

            const onMove = (ev: PointerEvent) => {
                // 同时检测左/右键拖拽（1|2）以避免右键平移视口被误判为点击
                if ((ev.buttons & 3) === 0) return;
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
                if (ev.button === 2) {
                    if (!moved) {
                        this.finishCurrentSegment();
                        if (this.editingId) {
                            this.setOverlayPointerEvents(true);
                            this.editingId = null;
                            this.editingVertexIndex = null;
                            this.events.fire('inspectionObjects.clearSelection');
                        }
                    }
                    return;
                }

                const rect = this.canvasContainerDom.getBoundingClientRect();
                const x = ev.clientX - rect.left;
                const y = ev.clientY - rect.top;
                const hit = this.scene.camera.intersect(x, y) as any;
                if (!hit || !hit.position) return;
                const world = new Vec3(hit.position.x, hit.position.y, hit.position.z);
                const groupId = this.currentGroupId;
                if (this.mode === 'point') {
                    const dom = this.placePoint(world);
                    const id = `xjdx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
                    this.objects.set(id, { id, kind: 'point', groupId, dom, world: world.clone() });
                    this.events.fire('inspectionObjects.addItem', { id, kind: 'point', groupId });
                    ev.preventDefault();
                    ev.stopPropagation();
                } else if (this.mode === 'line') {
                    this.addPointToCurrent('line', groupId, world);
                    ev.preventDefault();
                    ev.stopPropagation();
                } else {
                    this.addPointToCurrent('face', groupId, world);
                    ev.preventDefault();
                    ev.stopPropagation();
                }
            };

            window.addEventListener('pointermove', onMove, true);
            window.addEventListener('pointerup', onUp, true);
        };
        this.scene.canvas.addEventListener('pointerdown', onDown, true);
        // 不在 SVG 上直接接收事件，保持 pointer-events: none 以避免遮挡相机拖拽
        // 不拦截 pointerup，确保 Gizmo 能正确收到抬起事件完成一次移动
        this.canvasContainerDom.addEventListener('contextmenu', (e) => {
            // 阻止右键菜单，但不结束绘制，结束逻辑由右键抬起且未拖拽时触发
            e.preventDefault();
        });

        // Prevent click-through to model when finishing a move
        this.canvasContainerDom.addEventListener('click', (e) => {
            if (this.events.invoke('tool.shouldIgnoreClick')) {
                e.preventDefault();
                e.stopPropagation();
            }
        }, true);

        // SVG 层保持透明，无需额外拦截 contextmenu
        this.wireUiEvents();

        // 采用原生移动工具：不再自行创建TranslateGizmo，改用Pivot事件驱动更新
        this.gizmoEntity = new Entity('inspectionGizmoPivot');

        this.events.on('inspectionObjects.edit', (id: string) => {
            const sid = (id || '').trim();
            if (!sid) return;

            // 1. Prioritize exact match in objects map (Child Point or Standalone Point)
            const obj = this.objects.get(sid);
            if (obj) {
                // If it has a parentId, it's a vertex of a Line/Face
                if ((obj as any).parentId) {
                    const parentId = (obj as any).parentId as string;
                    // Extract index from the ID string (assuming format parentId#index)
                    // We use the last part after # to be robust
                    const parts = sid.split(/[#＃]/);
                    const lastPart = parts[parts.length - 1];
                    const idx = parseInt(lastPart, 10) - 1;

                    if (!isNaN(idx) && idx >= 0) {
                        this.startEditingVertex(parentId, idx);
                        return;
                    }
                    console.warn(`[InspectionTool] Child object found but index parsing failed: "${sid}"`);

                } else if (obj.kind === 'point') {
                    this.startEditingVertex(sid, -1);
                    return;
                }
            }

            // 2. Regex fallback for IDs that might not be in objects map yet (unlikely but safe)
            const m = sid.match(/^(.+?)[#＃]\s*(\d+)\s*$/);
            if (m) {
                const parentId = m[1].trim();
                const idx = Math.max(0, Number(m[2]) - 1);
                this.startEditingVertex(parentId, idx);
                return;
            }

            // 3. Parent Object Match (Line/Face)
            // If the ID matches a Line/Face, we select its first vertex (index 0)
            const lf = this.lineFaceObjects.get(sid);
            if (lf && lf.points.length > 0) {
                this.startEditingVertex(sid, 0);
                return;
            }

            console.warn(`[InspectionTool] Edit request could not be resolved: "${sid}"`);
        });

        // Re-trigger editing if move tool is activated while an item is selected
        this.events.on('tool.activated', (toolName: string) => {
            if (toolName === 'move' && this.editingId) {
                if (this.editingVertexIndex !== null) {
                    this.startEditingVertex(this.editingId, this.editingVertexIndex);
                } else {
                    this.startEditingVertex(this.editingId, -1);
                }
            }
        });

        // 底部移动工具激活时，若有当前编辑目标则附着 Gizmo；切换到非移动则拆除 Gizmo
        // 监听Pivot事件以更新巡检对象位置（使用原生移动工具的轴与拖拽逻辑）
        this.events.on('pivot.moved', (pivot: any) => {
            if (!this.editingId) return;

            // Handle Line/Face Vertex
            if (this.editingVertexIndex !== null && this.editingVertexIndex >= 0) {
                const lf = this.lineFaceObjects.get(this.editingId);
                if (lf && lf.points[this.editingVertexIndex]) {
                    lf.points[this.editingVertexIndex].world.copy(pivot.transform.position);
                    this.updateAllLineFaceSvgs();
                }
                return;
            }

            // Handle Point
            const obj = this.objects.get(this.editingId);
            if (!obj || obj.kind !== 'point') return;
            const target = obj.worldRef || obj.world || (obj.dom ? this.findPointByDom(obj.dom)?.world : null);
            if (!target) return;
            target.copy(pivot.transform.position);
            if (obj.dom && obj.world) {
                this.updateMarker({ dom: obj.dom, world: obj.world });
            }
            this.updateAllLineFaceSvgs();
        });
        this.events.on('pivot.started', () => {
            if (this.editingId) {
                this.isDragging = true;
                this.events.fire('tool.dragging', true);
            }
        });
        this.events.on('pivot.ended', () => {
            // Always fire transformed if we were editing, to prevent click-through
            if (this.editingId) {
                this.isDragging = false;
                this.events.fire('tool.dragging', false);
                this.events.fire('tool.transformed');
            }
        });

        // 额外兜底：在全局鼠标抬起时强制结束一次移动编辑，避免轴线跟随不止
        // 使用原生工具，无需兜底拦截pointerup
        const escHandler = (ev: KeyboardEvent) => {
            if (ev.key === 'Escape') {
                if (this.editingId) {
                    this.editingId = null;
                    this.editingVertexIndex = null;
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
                this.setOverlayPointerEvents(true);
                this.editingId = null;
                this.editingVertexIndex = null;
            }
        });

        events.on('inspectionObjects.setMode', (m: Mode) => {
            if (this.currentDrawing) {
                this.finishCurrentSegment();
            }
            this.mode = m;
            this.active = true;
            this.events.fire('inspectionObjects.active', true);
            this.events.fire('tool.inspectionObjects');
        });
        events.on('inspectionObjects.active', (active: boolean) => {
            this.active = active;
            if (!active) {
                if (this.editingId) {
                    this.editingId = null;
                    this.editingVertexIndex = null;
                }
                this.events.fire('inspectionObjects.clearSelection');
                this.events.fire('tool.deactivate');
                if (this.svg) this.svg.style.pointerEvents = 'none';
            }
        });
        events.on('inspectionObjects.groupSelected', (gid: string) => {
            if (gid) this.currentGroupId = gid;
        });
        events.on('inspectionObjects.setSize', (size: number) => {
            this.markerSize = Math.max(1, Math.min(256, size));
            const r = Math.max(2, Math.min(12, this.markerSize / 6));
            this.lineFaceObjects.forEach((lf) => {
                lf.vertexCircles.forEach(c => c.setAttribute('r', `${r}`));
            });
            this.objects.forEach((o) => {
                if (o.kind === 'point' && o.dom) {
                    o.dom.style.width = `${this.markerSize}px`;
                    o.dom.style.height = `${this.markerSize}px`;
                }
            });
            this.updateAllLineFaceSvgs();
        });

        events.on('update', () => {
            this.updateAllMarkers();
            this.updateAllLineFaceSvgs();
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
                case 'Enter':
                    this.finishCurrentSegment();
                    e.preventDefault();
                    e.stopPropagation();
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
        el.style.pointerEvents = 'auto';
        el.style.cursor = 'grab';
        el.style.transform = 'translate(-50%, -100%)';
        el.style.zIndex = '50';
        el.style.width = `${this.markerSize}px`;
        el.style.height = `${this.markerSize}px`;

        el.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const p = this.findPointByDom(el);
            if (p && p.id) {
                this.startEditingVertex(p.id, -1);
            }
        });

        this.canvasContainerDom.appendChild(el);
        const item = { dom: el, world: world.clone() };
        this.updateMarker(item);
        return el;
    }

    private updateMarker(p: { dom: HTMLElement; world: Vec3 }) {
        if ((p.dom.dataset && p.dom.dataset.hidden === '1')) {
            p.dom.style.display = 'none';
            return;
        }

        // 确保点对象可被点击选择以进行移动
        if (p.dom.dataset && p.dom.dataset.xjdxPointerReady !== '1') {
            p.dom.style.pointerEvents = 'auto';
            p.dom.style.cursor = 'grab';
            p.dom.addEventListener('pointerdown', (e) => {
                e.stopPropagation();
                e.preventDefault();
                const info = this.findPointByDom(p.dom);
                if (info && (info as any).id) {
                    this.startEditingVertex((info as any).id, -1);
                }
            });
            p.dom.dataset.xjdxPointerReady = '1';
        }

        // Logic for pointer events based on editing/dragging state
        const info = this.findPointByDom(p.dom);
        const isEditing = (info && info.id === this.editingId);

        if (this.isDragging) {
            p.dom.style.pointerEvents = 'none';
            p.dom.style.cursor = 'default';
        } else if (isEditing) {
            p.dom.style.pointerEvents = 'none';
            p.dom.style.cursor = 'default';
        } else {
            p.dom.style.pointerEvents = 'auto';
            p.dom.style.cursor = 'grab';
        }

        const sp = this.scene.camera.entity.camera.worldToScreen(p.world, new Vec3());
        const isOrtho = this.scene.camera.ortho;
        if (!sp || !isFinite(sp.x) || !isFinite(sp.y) || (!isOrtho && sp.z < 0)) {
            p.dom.style.display = 'none';
        } else {
            p.dom.style.display = 'block';
            p.dom.style.left = `${sp.x}px`;
            p.dom.style.top = `${sp.y}px`;
        }
    }

    private updateAllLineFaceSvgs() {
        if (!this.svg) return;
        this.lineFaceObjects.forEach((obj) => {
            const pts = obj.points.map((p) => {
                const sp = this.scene.camera.entity.camera.worldToScreen(p.world, new Vec3());
                return `${sp.x},${sp.y}`;
            }).join(' ');
            obj.svgEl.setAttribute('points', pts);
            const ns = this.svg!.namespaceURI;
            // Remove extra circles
            while (obj.vertexCircles.length > obj.points.length) {
                const c = obj.vertexCircles.pop();
                if (c) c.remove();
            }
            while (obj.vertexCircles.length < obj.points.length) {
                const c = document.createElementNS(ns, 'circle') as SVGCircleElement;
                c.setAttribute('r', '4');
                c.setAttribute('fill', '#ffcc00');
                c.setAttribute('stroke', '#333');
                c.setAttribute('stroke-width', '1');
                c.style.pointerEvents = 'auto';
                c.style.cursor = 'grab';
                c.onpointerdown = (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (!this.svg) return;
                    // 从dataset读取ID和Index
                    const id = c.dataset.id;
                    const idx = parseInt(c.dataset.index || '-1', 10);
                    if (id && idx >= 0) {
                        this.startEditingVertex(id, idx);
                    }
                };
                this.svg!.appendChild(c);
                obj.vertexCircles.push(c);
            }
            for (let i = 0; i < obj.vertexCircles.length; i++) {
                const circ = obj.vertexCircles[i];
                // 更新dataset
                circ.dataset.id = obj.id;
                circ.dataset.index = i.toString();

                const isEditing = (obj.id === this.editingId && i === this.editingVertexIndex);
                if (this.isDragging) {
                    circ.style.pointerEvents = 'none';
                    circ.style.cursor = 'default';
                } else if (isEditing) {
                    circ.style.pointerEvents = 'none';
                    circ.style.cursor = 'default';
                } else {
                    circ.style.pointerEvents = 'auto';
                    circ.style.cursor = 'grab';
                }

                const sp = this.scene.camera.entity.camera.worldToScreen(obj.points[i].world, new Vec3());
                circ.setAttribute('cx', `${sp.x}`);
                circ.setAttribute('cy', `${sp.y}`);
                circ.setAttribute('visibility', 'visible');
            }
        });
    }

    private setOverlayPointerEvents(enabled: boolean) {
        // 点对象图标
        this.objects.forEach((o) => {
            if (o.kind === 'point' && o.dom) {
                o.dom.style.pointerEvents = enabled ? 'auto' : 'none';
                o.dom.style.cursor = enabled ? 'grab' : 'default';
            }
        });
        // 线/面顶点圆点
        this.lineFaceObjects.forEach((lf) => {
            lf.vertexCircles.forEach((c) => {
                c.style.pointerEvents = enabled ? 'auto' : 'none';
                c.style.cursor = enabled ? 'grab' : 'default';
            });
        });
    }

    private setContainerPointerEvents(enabled: boolean) {
        if (this.canvasContainerDom) {
            (this.canvasContainerDom as HTMLElement).style.pointerEvents = enabled ? 'auto' : 'none';
        }
    }

    private setSelectedOverlayInteractive(enabled: boolean) {
        if (!this.editingId) return;
        if (this.editingVertexIndex !== null && this.editingVertexIndex >= 0) {
            const lf = this.lineFaceObjects.get(this.editingId);
            const c = lf && lf.vertexCircles[this.editingVertexIndex];
            if (c) {
                c.style.pointerEvents = enabled ? 'auto' : 'none';
                c.style.cursor = enabled ? 'grab' : 'default';
            }
        } else {
            const obj = this.objects.get(this.editingId);
            if (obj && obj.dom) {
                obj.dom.style.pointerEvents = enabled ? 'auto' : 'none';
                obj.dom.style.cursor = enabled ? 'grab' : 'default';
            }
        }
    }

    private reindexChildren(lf: any, oldLength: number) {
        const parentId = lf.id;
        // 1. Remove old entries
        for (let k = 1; k <= oldLength; k++) {
            this.objects.delete(`${parentId}#${k}`);
        }

        // 2. Create new entries
        const newChildrenPayloads = [];
        for (let i = 0; i < lf.points.length; i++) {
            const newId = `${parentId}#${i + 1}`;
            this.objects.set(newId, {
                id: newId,
                kind: 'point',
                groupId: lf.groupId,
                parentId: parentId,
                worldRef: lf.points[i].world
            });
            newChildrenPayloads.push({
                id: newId,
                kind: 'point',
                groupId: lf.groupId,
                parentId: parentId
            });
        }

        // 3. Notify UI
        this.events.fire('inspectionObjects.replaceChildren', parentId, newChildrenPayloads);
    }

    private addPointToCurrent(kind: 'line'|'face', groupId: string, world: Vec3) {
        if (!this.svg) return;

        // Check if we are editing an existing line/face and should insert a point
        if (!this.currentDrawing && this.editingId) {
            const lf = this.lineFaceObjects.get(this.editingId);
            // Ensure object exists and matches the current tool mode
            if (lf && lf.kind === kind) {
                const oldLength = lf.points.length;
                let insertIndex = oldLength;

                // If a vertex is selected, insert after it
                if (this.editingVertexIndex !== null && this.editingVertexIndex >= 0) {
                    insertIndex = this.editingVertexIndex + 1;
                }

                // Insert the point
                lf.points.splice(insertIndex, 0, { world: world.clone() });

                // Update visualization
                this.updateAllLineFaceSvgs();

                // Re-index children
                this.reindexChildren(lf, oldLength);

                // Update selection to the new point
                this.editingVertexIndex = insertIndex;
                const newId = `${lf.id}#${insertIndex + 1}`;
                this.events.fire('inspectionObjects.selected', newId);

                return;
            }
        }

        if (!this.currentDrawing || this.currentDrawing.kind !== kind || this.currentDrawing.groupId !== groupId) {
            const id = `xjdx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
            this.currentDrawing = { id, kind, groupId };
            const ns = this.svg.namespaceURI;
            const svgEl = document.createElementNS(ns, kind === 'line' ? 'polyline' : 'polygon') as any;
            svgEl.setAttribute('fill', kind === 'line' ? 'none' : 'rgba(255,204,0,0.2)');
            svgEl.setAttribute('stroke', '#ffcc00');
            svgEl.setAttribute('stroke-width', '2');
            this.svg.appendChild(svgEl);
            this.lineFaceObjects.set(id, { id, kind, groupId, points: [], svgEl, vertexCircles: [] });
            this.objects.set(id, { id, kind, groupId });
            this.events.fire('inspectionObjects.addItem', { id, kind, groupId });
        }
        const obj = this.lineFaceObjects.get(this.currentDrawing.id)!;
        obj.points.push({ world: world.clone() });
        this.updateAllLineFaceSvgs();
    }

    private clearTemp() {
    }

    private startEditingVertex(id: string, index: number) {
        this.editingId = id;
        this.editingVertexIndex = index;

        // Notify list to highlight
        const childId = index >= 0 ? `${id}#${index + 1}` : id;
        this.events.fire('inspectionObjects.selected', childId);

        const pivot = this.events.invoke('pivot');
        if (!pivot) return;

        let worldTarget: any = null;

        if (index >= 0) {
            const lf = this.lineFaceObjects.get(id);
            if (lf && lf.points[index]) {
                worldTarget = lf.points[index].world;
            } else {
                console.warn(`[InspectionTool] Vertex not found: id="${id}" index=${index}`);
            }
        } else {
            const obj = this.objects.get(id);
            if (obj && obj.kind === 'point') {
                worldTarget = obj.worldRef || obj.world;
            }
        }

        if (worldTarget) {
            const t = new Transform();
            t.position.copy(worldTarget);
            t.rotation.setFromEulerAngles(0, 0, 0);
            t.scale.set(1, 1, 1);
            pivot.place(t);
            this.setSelectedOverlayInteractive(false);
        }
    }

    private updateAllMarkers() {
        this.objects.forEach((o) => {
            if (o.kind === 'point' && o.dom && o.world) {
                this.updateMarker({ dom: o.dom, world: o.world });
            }
        });
    }

    // UI → 场景联动
    private setVisible(id: string, visible: boolean) {
        const obj = this.objects.get(id);
        if (!obj) return;
        if (obj.kind === 'point' && obj.dom) {
            obj.dom.dataset.hidden = visible ? '0' : '1';
            obj.dom.style.display = visible ? 'block' : 'none';
        } else if (obj.kind === 'line' || obj.kind === 'face') {
            const lf = this.lineFaceObjects.get(id);
            if (lf) {
                lf.svgEl.style.display = visible ? 'block' : 'none';
                lf.vertexCircles.forEach((c) => {
                    c.style.display = visible ? 'block' : 'none';
                });
            }
        }
    }

    private removeItem(id: string) {
        // 优先处理子顶点删除（格式：parentId#index 或使用全角＃）
        const hashParts = id.split(/[#＃]/);
        if (hashParts.length > 1) {
            const parentId = hashParts[0];
            const idxStr = hashParts[hashParts.length - 1];
            const idx = parseInt(idxStr, 10) - 1;

            const lf = this.lineFaceObjects.get(parentId);
            if (lf && idx >= 0 && idx < lf.points.length) {
                lf.points.splice(idx, 1);

                const circle = lf.vertexCircles[idx];
                if (circle) {
                    circle.remove();
                    lf.vertexCircles.splice(idx, 1);
                }

                this.updateAllLineFaceSvgs();

                const oldLen = lf.points.length + 1;
                for (let k = 1; k <= oldLen; k++) {
                    this.objects.delete(`${parentId}#${k}`);
                }

                const newChildrenPayloads = [];
                for (let i = 0; i < lf.points.length; i++) {
                    const newId = `${parentId}#${i + 1}`;
                    this.objects.set(newId, {
                        id: newId,
                        kind: 'point',
                        groupId: lf.groupId,
                        parentId: parentId,
                        worldRef: lf.points[i].world
                    });
                    newChildrenPayloads.push({
                        id: newId,
                        kind: 'point',
                        groupId: lf.groupId,
                        parentId: parentId
                    });
                }

                this.events.fire('inspectionObjects.replaceChildren', parentId, newChildrenPayloads);
                return;
            }
        }

        // 删除顶层对象（点/线/面）
        const obj = this.objects.get(id);
        if (obj) {
            if (obj.kind === 'point' && obj.dom) {
                obj.dom.remove();
            } else if (obj.kind === 'line' || obj.kind === 'face') {
                const lf = this.lineFaceObjects.get(id);
                if (lf) {
                    lf.vertexCircles.forEach(c => c.remove());
                    lf.svgEl.remove();
                    this.lineFaceObjects.delete(id);
                    // 同步清理其所有子顶点对象映射
                    const childCount = lf.points.length;
                    for (let k = 1; k <= childCount; k++) {
                        this.objects.delete(`${id}#${k}`);
                    }
                }
            }
            this.objects.delete(id);

        }
    }

    private setSelectable(id: string, selectable: boolean) {
        const obj = this.objects.get(id);
        if (!obj) return;
        // DOM 图标本身不接收事件，selectable 作为占位状态
        (obj as any).selectable = selectable;
    }

    // events wiring
    private wireUiEvents() {
        this.events.function('inspectionObjects.isEditing', () => !!this.editingId);

        this.events.on('camera.focalPointPicked', (details: any) => {
            const ignore = this.events.invoke('tool.justTransformed');
            if (ignore) return;
            if (details && (details.splat || details.model)) return;
            if (this.editingId) {
                this.setOverlayPointerEvents(true);
                this.editingId = null;
                this.editingVertexIndex = null;
                this.events.fire('inspectionObjects.clearSelection');
            }
        });

        this.events.on('selection.changed', (selection: any) => {
            const activeTool = this.events.invoke('tool.active');
            if (activeTool === 'move') {
                return;
            }
            if (selection) {
                this.editingId = null;
                this.editingVertexIndex = null;
                this.events.fire('inspectionObjects.clearSelection');
            }
        });

        this.events.on('inspectionObjects.setVisible', (id: string, visible: boolean) => this.setVisible(id, visible));
        this.events.on('inspectionObjects.removeItem', (id: string) => this.removeItem(id));
        this.events.on('inspectionObjects.setSelectable', (id: string, selectable: boolean) => this.setSelectable(id, selectable));
        this.events.on('inspectionObjects.groupSetVisible', (groupId: string, visible: boolean) => {
            this.objects.forEach((obj) => {
                if (obj.groupId === groupId) this.setVisible(obj.id, visible);
            });
        });
    }

    private finishCurrentSegment() {
        if (!this.currentDrawing) return;
        const lf = this.lineFaceObjects.get(this.currentDrawing.id);
        if (!lf) {
            this.currentDrawing = null; return;
        }
        const minCount = lf.kind === 'line' ? 2 : 3;
        if (lf.points.length < minCount) {
            lf.vertexCircles.forEach(c => c.remove());
            lf.svgEl.remove();
            this.lineFaceObjects.delete(lf.id);
            this.objects.delete(lf.id);
            this.currentDrawing = null;
            return;
        }
        for (let i = 0; i < lf.points.length; i++) {
            const childId = `${lf.id}#${i + 1}`;
            this.objects.set(childId, { id: childId, kind: 'point', groupId: lf.groupId, parentId: lf.id, worldRef: lf.points[i].world });
            this.events.fire('inspectionObjects.addItem', { id: childId, kind: 'point', groupId: lf.groupId, parentId: lf.id });
        }
        this.updateAllLineFaceSvgs();
        this.currentDrawing = null;
    }

    private findPointByDom(dom: HTMLElement) {
        for (const o of this.objects.values()) {
            if (o.kind === 'point' && o.dom === dom && o.world) {
                return { dom: o.dom, world: o.world, id: o.id };
            }
        }
        return null;
    }
}

export { InspectionObjectTool };
