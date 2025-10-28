import {
    CULLFACE_NONE,
    CULLFACE_BACK,
    SEMANTIC_POSITION,
    BlendState,
    DepthState,
    Color,
    Entity,
    Layer,
    Shader,
    ShaderUtils,
    QuadRender,
    WebglGraphicsDevice
} from 'playcanvas';

import { Element, ElementType } from './element';
import { GltfModel } from './gltf-model';
import { vertexShader, fragmentShader } from './shaders/outline-shader';
import { Splat } from './splat';

class Outline extends Element {
    entity: Entity;
    shader: Shader;
    quadRender: QuadRender;
    enabled = true;
    clr = new Color(1, 1, 1, 0.5);

    constructor() {
        super(ElementType.other);

        this.entity = new Entity('outlineCamera');
        this.entity.addComponent('camera');
        this.entity.camera.setShaderPass('OUTLINE');
        this.entity.camera.clearColor = new Color(0, 0, 0, 0);
    }

    add() {
        const device = this.scene.app.graphicsDevice;
        const layerId = this.scene.overlayLayer.id;

        // add selected splat to outline layer
        this.scene.events.on('selection.changed', (element: Splat | GltfModel, prev: Splat | GltfModel) => {
            // Remove previous selection from outline layer
            if (prev && prev.type === ElementType.splat) {
                const prevSplat = prev as Splat;
                prevSplat.entity.gsplat.layers = prevSplat.entity.gsplat.layers.filter(id => id !== layerId);
            } else if (prev && prev.type === ElementType.model) {
                const prevModel = prev as GltfModel;
                this.removeModelFromOutlineLayer(prevModel, layerId);
            }

            // Add current selection to outline layer
            if (element && element.type === ElementType.splat) {
                const splat = element as Splat;
                splat.entity.gsplat.layers = splat.entity.gsplat.layers.concat([layerId]);
            } else if (element && element.type === ElementType.model) {
                const model = element as GltfModel;
                this.addModelToOutlineLayer(model, layerId);
            }

            // 强制渲染以立即更新高亮效果
            if (this.scene.forceRender !== undefined) {
                this.scene.forceRender = true;
            }
        });

        // render overlay layer only
        this.entity.camera.layers = [layerId];
        this.scene.camera.entity.addChild(this.entity);

        this.shader = ShaderUtils.createShader(device, {
            uniqueName: 'apply-outline',
            attributes: {
                vertex_position: SEMANTIC_POSITION
            },
            vertexGLSL: vertexShader,
            fragmentGLSL: fragmentShader
        });

        this.quadRender = new QuadRender(this.shader);

        const outlineTextureId = device.scope.resolve('outlineTexture');
        const alphaCutoffId = device.scope.resolve('alphaCutoff');
        const clrId = device.scope.resolve('clr');
        const clrStorage = [1, 1, 1, 1];
        const events = this.scene.events;

        // apply the outline texture to the display before gizmos render
        this.entity.camera.on('postRenderLayer', (layer: Layer, transparent: boolean) => {
            if (!this.entity.enabled || layer !== this.scene.overlayLayer || !transparent) {
                return;
            }

            device.setBlendState(BlendState.ALPHABLEND);
            device.setCullMode(CULLFACE_NONE);
            device.setDepthState(DepthState.NODEPTH);
            device.setStencilState(null, null);

            const selectedClr = events.invoke('selectedClr');
            clrStorage[0] = selectedClr.r;
            clrStorage[1] = selectedClr.g;
            clrStorage[2] = selectedClr.b;
            clrStorage[3] = selectedClr.a;

            outlineTextureId.setValue(this.entity.camera.renderTarget.colorBuffer);
            alphaCutoffId.setValue(events.invoke('camera.mode') === 'rings' ? 0.0 : 0.4);
            clrId.setValue(clrStorage);

            const glDevice = device as WebglGraphicsDevice;
            glDevice.setRenderTarget(this.scene.camera.entity.camera.renderTarget);
            glDevice.updateBegin();
            this.quadRender.render();
            glDevice.updateEnd();

            // restore render states to safe defaults to avoid leaking to main scene
            device.setBlendState(BlendState.NOBLEND);
            device.setCullMode(CULLFACE_BACK);
            device.setDepthState(DepthState.WRITEDEPTH);
            device.setStencilState(null, null);
        });
    }

    remove() {
        this.scene.camera.entity.removeChild(this.entity);
    }

    // Add GLB model to outline layer for highlighting
    addModelToOutlineLayer(model: GltfModel, layerId: number) {
        if (model.entity) {
            this.setEntityOutlineLayer(model.entity, layerId, true);
        }
    }

    // Remove GLB model from outline layer
    removeModelFromOutlineLayer(model: GltfModel, layerId: number) {
        if (model.entity) {
            this.setEntityOutlineLayer(model.entity, layerId, false);
        }
    }

    // Add entity to a specific layer
    private addEntityToLayer(entity: Entity, layer: Layer) {
        if (entity.render && entity.render.meshInstances) {
            entity.render.meshInstances.forEach((meshInstance: any) => {
                layer.addMeshInstances([meshInstance]);
            });
        }

        // Recursively handle children
        entity.children.forEach((child: Entity) => {
            this.addEntityToLayer(child, layer);
        });
    }

    // Remove entity from a specific layer
    private removeEntityFromLayer(entity: Entity, layer: Layer) {
        if (entity.render && entity.render.meshInstances) {
            entity.render.meshInstances.forEach((meshInstance: any) => {
                layer.removeMeshInstances([meshInstance]);
            });
        }

        // Recursively handle children
        entity.children.forEach((child: Entity) => {
            this.removeEntityFromLayer(child, layer);
        });
    }

    // Recursively set outline layer for entity and its children
    private setEntityOutlineLayer(entity: Entity, layerId: number, add: boolean) {
        // Handle render components
        if (entity.render && entity.render.meshInstances) {
            const layer = this.scene.app.scene.layers.getLayerById(layerId);
            if (layer) {
                entity.render.meshInstances.forEach((meshInstance: any) => {
                    if (add) {
                        // Add mesh instance to outline layer
                        layer.addMeshInstances([meshInstance]);
                    } else {
                        // Remove mesh instance from outline layer
                        layer.removeMeshInstances([meshInstance]);
                    }
                });
            }
        }

        // Recursively handle children
        entity.children.forEach((child: Entity) => {
            this.setEntityOutlineLayer(child, layerId, add);
        });
    }

    onPreRender() {
        // copy camera properties
        const src = this.scene.camera.entity.camera;
        const dst = this.entity.camera;

        dst.projection = src.projection;
        dst.horizontalFov = src.horizontalFov;
        dst.fov = src.fov;
        dst.nearClip = src.nearClip;
        dst.farClip = src.farClip;
        dst.orthoHeight = src.orthoHeight;

        this.entity.enabled = this.enabled && this.scene.events.invoke('view.outlineSelection');
        this.entity.camera.renderTarget = this.scene.camera.workRenderTarget;
    }
}

export { Outline };
