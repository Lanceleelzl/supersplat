import { AppBase, Asset, GSplatData, GSplatResource, Vec3 } from 'playcanvas';

import { Events } from './events';
import { GltfModel } from './gltf-model';
import { loadLcc } from './loaders/lcc';
import { ModelLoadRequest } from './loaders/model-load-request';
import { loadPly } from './loaders/ply';
import { loadSplat } from './loaders/splat';
import { Splat } from './splat';

const defaultOrientation = new Vec3(0, 0, 180);
const lccOrientation = new Vec3(90, 0, 180);

let assetId = 0;

// handles loading gltf container assets
class AssetLoader {
    app: AppBase;
    events: Events;
    defaultAnisotropy: number;
    loadAllData = true;

    constructor(app: AppBase, events: Events, defaultAnisotropy?: number) {
        this.app = app;
        this.events = events;
        this.defaultAnisotropy = defaultAnisotropy || 1;
    }

    async load(loadRequest: ModelLoadRequest) {
        const wrap = (gsplatData: GSplatData) => {
            const asset = new Asset(loadRequest.filename || loadRequest.url, 'gsplat', {
                url: loadRequest.contents ? `local-asset-${Date.now()}` : loadRequest.url ?? loadRequest.filename,
                filename: loadRequest.filename
            });
            this.app.assets.add(asset);
            asset.resource = new GSplatResource(this.app.graphicsDevice, gsplatData);
            return asset;
        };

        if (!loadRequest.animationFrame) {
            this.events.fire('startSpinner');
        }

        try {
            const filename = (loadRequest.filename || loadRequest.url).toLowerCase();

            let asset;
            let orientation = defaultOrientation;

            if (filename.endsWith('.splat')) {
                asset = wrap(await loadSplat(loadRequest));
            } else if (filename.endsWith('.lcc')) {
                asset = wrap(await loadLcc(loadRequest));
                orientation = lccOrientation;
            } else if (filename.endsWith('.gltf') || filename.endsWith('.glb')) {
                // GLB/GLTF文件应该使用loadModel方法，而不是load方法
                throw new Error('GLB/GLTF文件应该使用loadModel方法加载，而不是load方法');
            } else {
                asset = await loadPly(this.app.assets, loadRequest);
            }

            return new Splat(asset, orientation);
        } finally {
            if (!loadRequest.animationFrame) {
                this.events.fire('stopSpinner');
            }
        }
    }

    // GLB/GLTF模型加载方法
    async loadModel(loadRequest: ModelLoadRequest): Promise<GltfModel> {
        if (!loadRequest.animationFrame) {
            this.events.fire('startSpinner');
        }

        try {
            const filename = (loadRequest.filename || loadRequest.url).toLowerCase();
            
            if (!filename.endsWith('.gltf') && !filename.endsWith('.glb')) {
                throw new Error(`不支持的模型格式: ${filename}`);
            }

            // 创建资产
            const asset = new Asset(
                loadRequest.filename || 'model',
                'container',
                {
                    url: loadRequest.url || loadRequest.filename,
                    filename: loadRequest.filename
                }
            );

            // 如果有文件内容，创建blob URL
            if (loadRequest.contents) {
                const blob = loadRequest.contents instanceof File ? 
                    loadRequest.contents : 
                    new Blob([loadRequest.contents]);
                const blobUrl = URL.createObjectURL(blob);
                asset.file = {
                    url: blobUrl,
                    filename: loadRequest.filename || 'model.glb'
                };
            }

            this.app.assets.add(asset);

            return new Promise((resolve, reject) => {
                asset.ready(() => {
                    try {
                        // 获取容器资源并进行类型断言
                        const containerResource = asset.resource as any;
                        if (!containerResource) {
                            reject(new Error('模型资源加载失败'));
                            return;
                        }

                        // 创建实体并添加模型组件
                        const entity = containerResource.instantiateRenderEntity();
                        if (!entity) {
                            reject(new Error('无法创建模型实体'));
                            return;
                        }

                        // 创建GltfModel实例
                        const gltfModel = new GltfModel(asset, entity, loadRequest.filename);
                        
                        resolve(gltfModel);
                    } catch (error) {
                        reject(error);
                    }
                });

                asset.on('error', (err: any) => {
                    reject(new Error(`模型加载错误: ${err}`));
                });

                // 开始加载
                this.app.assets.load(asset);
            });

        } finally {
            if (!loadRequest.animationFrame) {
                this.events.fire('stopSpinner');
            }
        }
    }
}

export { AssetLoader };
