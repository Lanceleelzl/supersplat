import { Asset, BoundingBox, Entity, Vec3, Quat, Mat4, Color } from 'playcanvas';

import { Element, ElementType } from './element';

/**
 * glTF Model element for the scene hierarchy
 */
class GltfModel extends Element {
    entity: Entity;
    asset: Asset;
    private _cachedWorldBound: BoundingBox | null = null;
    private _cachedWorldBoundFrame = -1;
    private _customFilename: string | null = null;  // 添加自定义文件名属性

    constructor(asset: Asset, entity: Entity, customFilename?: string) {
        super(ElementType.model);
        this.asset = asset;
        this.entity = entity;
        this._customFilename = customFilename || null;

        // Ensure the model is visible by default
        this.visible = true;

        // Setup physics picking if available
        try {
            this.setupPhysicsPicking();
        } catch { /* ignore physics setup failure */ }
    }

    get filename() {
        return this._customFilename || this.asset.name;
    }

    // 设置自定义文件名的方法
    setCustomFilename(filename: string) {
        this._customFilename = filename;

        // 触发模型名称更新事件
        if (this.scene && this.scene.events) {
            this.scene.events.fire('model.name', this);
        }
    }

    // Setup physics collision detection for ray picking
    private setupPhysicsPicking() {
        if (!this.entity || !this.scene) return;
        const app: any = this.scene.app;
        if (!app?.systems?.rigidbody || !app?.systems?.collision) return;

        this.entity.tags.add('pickable');

        // Skip if collider already exists
        if (this.scene.app.root.findOne((n: Entity) => n.name === '__gltfCollider' && (n as any)._gltfModel === this)) return;

        const bound = this.worldBound;
        if (!bound) return;

        const collider = new Entity('__gltfCollider');
        const he = bound.halfExtents.clone();

        const worldCenter = bound.center.clone();
        collider.setPosition(worldCenter);

        collider.addComponent('collision', {
            type: 'box',
            halfExtents: he
        });
        collider.addComponent('rigidbody', { type: 'kinematic', mass: 0 });

        (collider as any)._gltfModel = this;
        this.scene.app.root.addChild(collider);
    }

    add() {
        // Entity is already added to the scene root in asset-loader or manually in duplication
        // This method is called when the element is added to the scene

        // 确保实体在场景根节点中（对于复制的模型很重要）
        if (this.entity && this.scene && this.scene.app && this.scene.app.root) {
            if (this.entity.parent !== this.scene.app.root) {
                this.scene.app.root.addChild(this.entity);
            }
        }

        // 让 GLB 在快照相机可见：将所有 render 组件加入 Snapshot World 图层
        // 巡检点位模型（isInspectionModel）不加入，以便在快照预览中隔离
        try {
            const isInspection = (this as any).isInspectionModel === true;
            if (!isInspection && this.scene?.snapshotLayer && this.entity) {
                const layerId = this.scene.snapshotLayer.id;
                const renders = this.entity.findComponents('render') as any[];
                for (const r of renders) {
                    const ls: number[] = Array.isArray(r.layers) ? r.layers.slice() : [];
                    if (!ls.includes(layerId)) {
                        r.layers = ls.concat([layerId]);
                    }
                }
            }
        } catch {}

        // 添加碰撞器以支持选择和交互
        this.setupPhysicsPicking();
    }

    remove() {
        // 彻底清理渲染组件
        this.cleanupRenderComponents();

        // Remove the entity from its parent
        if (this.entity && this.entity.parent) {
            this.entity.parent.removeChild(this.entity);
        }
    }

    destroy() {
        console.log('开始销毁GLB模型:', this.filename);

        // 彻底清理渲染组件
        this.cleanupRenderComponents();

        // 清理物理碰撞器
        try {
            if (this.scene && this.scene.app && this.scene.app.root) {
                const collider = this.scene.app.root.findOne((n: Entity) => n.name === '__gltfCollider' && (n as any)._gltfModel === this);
                if (collider) {
                    collider.destroy();
                }
            }
        } catch (error) {
            console.warn('清理GLB模型碰撞器时出错:', error);
        }

        // 清理缓存的边界信息
        this._cachedWorldBound = null;
        this._cachedWorldBoundFrame = -1;

        // 从父节点移除实体
        if (this.entity && this.entity.parent) {
            this.entity.parent.removeChild(this.entity);
        }

        // 销毁实体
        if (this.entity) {
            try {
                this.entity.destroy();
                console.log('GLB模型实体已销毁:', this.filename);
            } catch (error) {
                console.warn('销毁GLB模型实体时出错:', error);
            }
            this.entity = null;
        }

        // 强制场景重新渲染
        if (this.scene) {
            this.scene.forceRender = true;
        }

        super.destroy();
        console.log('GLB模型销毁完成:', this.filename);
    }

    // 彻底清理渲染组件的辅助方法
    private cleanupRenderComponents() {
        if (!this.entity) return;

        try {
            // 递归清理所有子实体的渲染组件
            const cleanupEntity = (entity: Entity) => {
                if (!entity) return;

                // 清理渲染组件
                const render = entity.render;
                if (render) {
                    render.enabled = false;
                    if (render.meshInstances) {
                        render.meshInstances.forEach((meshInstance: any) => {
                            if (meshInstance) {
                                meshInstance.visible = false;

                                // 从所有渲染层中移除mesh instance
                                try {
                                    if (this.scene && this.scene.app) {
                                        const app = this.scene.app;
                                        const layers = app.scene.layers;
                                        if (layers.subLayerList) {
                                            layers.subLayerList.forEach((layer: any) => {
                                                if (layer.removeMeshInstances) {
                                                    layer.removeMeshInstances([meshInstance]);
                                                }
                                            });
                                        }
                                    }
                                } catch (e) {
                                    console.warn('从渲染层移除mesh instance时出错:', e);
                                }

                                // 清理mesh instance的AABB相关属性
                                if (meshInstance.aabb) {
                                    meshInstance.aabb = null;
                                }
                                if (typeof meshInstance._aabbVer !== 'undefined') {
                                    meshInstance._aabbVer = null;
                                }
                                // 清理mesh instance的其他可能导致问题的属性
                                if (meshInstance.mesh) {
                                    meshInstance.mesh = null;
                                }
                                // 清理材质引用
                                if (meshInstance.material) {
                                    meshInstance.material = null;
                                }
                                // 清理变换矩阵
                                if (meshInstance.node) {
                                    meshInstance.node = null;
                                }
                            }
                        });
                        // 清空mesh instances数组
                        render.meshInstances.length = 0;
                    }

                    // 尝试移除渲染组件
                    try {
                        entity.removeComponent('render');
                    } catch (e) {
                        console.warn('移除渲染组件时出错:', e);
                    }
                }                // 递归处理子实体
                if (entity.children) {
                    entity.children.slice().forEach((child: Entity) => {
                        cleanupEntity(child);
                    });
                }
            };

            cleanupEntity(this.entity);
        } catch (error) {
            console.warn('清理渲染组件时出错:', error);
        }
    }

    getLocalBound(): BoundingBox | null {
        if (!this.entity) return null;

        const renderComponents = this.entity.findComponents('render');
        const meshInstances = renderComponents
        .map((render: any) => render.meshInstances)
        .flat()
        .filter((mi: any) => mi && mi.aabb);

        if (!meshInstances.length) {
            return null;
        }

        // Calculate local bound by combining all mesh instance local AABBs
        const bound = new BoundingBox();
        let first = true;
        for (const mi of meshInstances) {
            if (!mi.aabb) continue;

            if (first) {
                bound.copy(mi.aabb);
                first = false;
            } else {
                bound.add(mi.aabb);
            }
        }

        return bound;
    }

    get worldBound(): BoundingBox | null {
        if (!this.entity) return null;

        const frame = (this.scene && (this.scene.app as any).frame) || (window as any).pc?.frameworkFrame || performance.now();
        if (this._cachedWorldBound && this._cachedWorldBoundFrame === frame) {
            return this._cachedWorldBound;
        }

        const renderComponents = this.entity.findComponents('render');
        const meshInstances = renderComponents
        .map((render: any) => render.meshInstances)
        .flat()
        .filter((mi: any) => mi && mi.aabb);

        if (!meshInstances.length) {
            return null;
        }

        // For GLB models, use mesh instance local AABB directly
        // as the mesh nodes already contain correct world coordinates
        const bound = new BoundingBox();
        let first = true;
        for (const mi of meshInstances) {
            if (!mi.aabb) continue;

            if (first) {
                bound.copy(mi.aabb);
                first = false;
            } else {
                bound.add(mi.aabb);
            }
        }
        this._cachedWorldBound = bound;
        this._cachedWorldBoundFrame = frame;
        return bound;
    }

    serialize(serializer: any) {
        super.serialize(serializer);

        // Store basic model information for potential future use
        const position = this.entity.getPosition();
        const rotation = this.entity.getRotation();
        const scale = this.entity.getLocalScale();

        // Could be used for saving/loading scene state
        const modelData = {
            filename: this.filename,
            position: [position.x, position.y, position.z],
            rotation: [rotation.x, rotation.y, rotation.z, rotation.w],
            scale: [scale.x, scale.y, scale.z]
        };

        // Store in serializer if needed
        if (serializer && serializer.setModelData) {
            serializer.setModelData(this.uid, modelData);
        }
    }

    move(position?: Vec3, rotation?: Quat, scale?: Vec3) {
        if (this.entity && this.entity.enabled) {
            if (position) {
                this.entity.setPosition(position);
            }
            if (rotation) {
                this.entity.setRotation(rotation);
            }
            if (scale) {
                this.entity.setLocalScale(scale);
            }

            // Mark world bounds as dirty since the model moved
            // 只有在实体仍然有效时才更新边界
            if (this.entity.parent) {
                this.makeWorldBoundDirty();
            }

            // Update physics collider if it exists
            try {
                const collider = this.scene.app.root.findOne((n: Entity) => n.name === '__gltfCollider' && (n as any)._gltfModel === this);
                if (collider && (collider as any).collision) {
                    const wb = this.worldBound;
                    if (wb) {
                        collider.setPosition(wb.center);
                        const col: any = (collider as any).collision;
                        if (col?.type === 'box') {
                            const he = wb.halfExtents;
                            if (col.halfExtents?.set) {
                                col.halfExtents.set(he.x, he.y, he.z);
                            } else {
                                // Recreate collision component if needed
                                try {
                                    (collider as any).removeComponent('collision');
                                } catch {
                                    // ignore
                                }
                                (collider as any).addComponent('collision', { type: 'box', halfExtents: he.clone() });
                            }
                        }
                    }
                }
            } catch { /* ignore collider sync errors */ }

            // Force scene to re-render immediately
            if (this.scene) {
                this.scene.forceRender = true;
            }

            // Fire transform event for selection system and other listeners
            this.scene?.events.fire('model.moved', this);
        }
    }

    makeWorldBoundDirty() {
        this._cachedWorldBound = null;
        this._cachedWorldBoundFrame = -1;

        // 如果实体不存在或不可用，直接返回
        if (!this.entity || !this.entity.enabled || !this.entity.parent) return;

        try {
            const renderComponents = this.entity.findComponents('render');
            if (!renderComponents || renderComponents.length === 0) return;

            renderComponents.forEach((render: any) => {
                if (!render || !render.enabled || !render.meshInstances) return;

                // 创建meshInstances的副本以避免在迭代过程中被修改
                const meshInstances = [...render.meshInstances];
                meshInstances.forEach((meshInstance: any) => {
                    // 非常严格的安全检查
                    if (meshInstance &&
                        meshInstance.aabb !== null &&
                        meshInstance.aabb !== undefined &&
                        typeof meshInstance._aabbVer === 'number') {
                        meshInstance._aabbVer = -1;
                    }
                });
            });
        } catch (error) {
            // 如果在访问mesh实例时出错，说明模型可能正在被销毁，忽略错误
            console.warn('makeWorldBoundDirty 访问已销毁的mesh实例:', error);
        }
    }

    set visible(value: boolean) {
        if (!this.entity) return;

        try {
            if (value) {
                // Make visible: add to scene if not already there
                if (!this.entity.parent && this.scene) {
                    this.scene.app.root.addChild(this.entity);
                }
                this.entity.enabled = true;

                // Enable all render components recursively
                const enableRendering = (entity: Entity) => {
                    if (!entity) return;
                    const render = entity.render;
                    if (render) {
                        render.enabled = true;
                        if (render.meshInstances) {
                            render.meshInstances.forEach((meshInstance) => {
                                if (meshInstance && typeof meshInstance.visible !== 'undefined') {
                                    meshInstance.visible = true;
                                }
                            });
                        }
                    }

                    entity.children.forEach((child) => {
                        if (child instanceof Entity) {
                            child.enabled = true;
                            enableRendering(child);
                        }
                    });
                };
                enableRendering(this.entity);
            } else {
                // Make invisible: disable entity and rendering
                this.entity.enabled = false;

                // Disable all render components recursively
                const disableRendering = (entity: Entity) => {
                    if (!entity) return;
                    const render = entity.render;
                    if (render) {
                        render.enabled = false;
                        if (render.meshInstances) {
                            render.meshInstances.forEach((meshInstance) => {
                                if (meshInstance && typeof meshInstance.visible !== 'undefined') {
                                    meshInstance.visible = false;
                                }
                            });
                        }
                    }

                    entity.children.forEach((child) => {
                        if (child instanceof Entity) {
                            child.enabled = false;
                            disableRendering(child);
                        }
                    });
                };
                disableRendering(this.entity);
            }

            // Force scene to re-render immediately
            if (this.scene) {
                this.scene.forceRender = true;
            }

            // Fire visibility event for selection system
            this.scene?.events.fire('model.visibility', this);
        } catch (error) {
            console.warn('设置GLB模型可见性时出错:', error);
        }
    }

    get visible(): boolean {
        return this.entity?.enabled !== false;
    }

    onPreRender() {
        const events = this.scene?.events;
        if (!events || !this.entity) return;

        const selected = events.invoke('selection') === this;

        // 设置高亮效果
        if (selected) {
            // 当模型被选中时，添加到outline层进行高亮显示
            if (this.scene.outline) {
                this.scene.outline.addModelToOutlineLayer(this, this.scene.overlayLayer.id);
            }
        } else {
            // 当模型未被选中时，从outline层移除
            if (this.scene.outline) {
                this.scene.outline.removeModelFromOutlineLayer(this, this.scene.overlayLayer.id);
            }
        }

        if (this.visible && selected) {
            // render bounding box when selected
            // 注释：暂时注释掉GLB模型选中时的包围盒显示功能
            // if (events.invoke('camera.bound')) {
            //     const bound = this.worldBound;
            //     if (bound) {
            //         // Use the same boundingPoints structure as Splat for consistency
            //         const boundingPoints = [
            //             // Bottom face edges
            //             new Vec3(-1, -1, -1), new Vec3(1, -1, -1),   // bottom front edge
            //             new Vec3(1, -1, -1), new Vec3(1, 1, -1),     // bottom right edge
            //             new Vec3(1, 1, -1), new Vec3(-1, 1, -1),     // bottom back edge
            //             new Vec3(-1, 1, -1), new Vec3(-1, -1, -1),   // bottom left edge

            //             // Top face edges
            //             new Vec3(-1, -1, 1), new Vec3(1, -1, 1),     // top front edge
            //             new Vec3(1, -1, 1), new Vec3(1, 1, 1),       // top right edge
            //             new Vec3(1, 1, 1), new Vec3(-1, 1, 1),       // top back edge
            //             new Vec3(-1, 1, 1), new Vec3(-1, -1, 1),     // top left edge

            //             // Vertical edges
            //             new Vec3(-1, -1, -1), new Vec3(-1, -1, 1),   // front left vertical
            //             new Vec3(1, -1, -1), new Vec3(1, -1, 1),     // front right vertical
            //             new Vec3(1, 1, -1), new Vec3(1, 1, 1),       // back right vertical
            //             new Vec3(-1, 1, -1), new Vec3(-1, 1, 1)      // back left vertical
            //         ];

            //         // Use worldBound to draw bounding box
            //         const scale = new Mat4().setTRS(bound.center, Quat.IDENTITY, bound.halfExtents);

            //         // Draw bounding box lines
            //         const veca = new Vec3();
            //         const vecb = new Vec3();

            //         for (let i = 0; i < boundingPoints.length; i += 2) {
            //             const a = boundingPoints[i];
            //             const b = boundingPoints[i + 1];

            //             // Transform unit cube points to actual bounding box coordinates
            //             scale.transformPoint(a, veca);
            //             scale.transformPoint(b, vecb);

            //             this.scene.app.drawLine(veca, vecb, Color.WHITE, true, this.scene.debugLayer);
            //         }
            //     }
            // }
        }
    }

    // Placeholder method for compatibility with document serialization
    docDeserialize(_splatSettings: any) {
        // glTF models don't need document deserialization like Splats do
        // This is a placeholder for compatibility
    }
}

export { GltfModel };
