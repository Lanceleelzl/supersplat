import { AppBase, Asset, GSplatData, GSplatResource, ContainerResource, Entity, CULLFACE_NONE, Color } from 'playcanvas';

import { Events } from './events';
import { CompressInfo, deserializeFromLcc, LCC_LOD_MAX_SPLATS, LccUnitInfo, parseIndexBin, parseMeta } from './lcc';
import { GltfModel } from './gltf-model';
import { Splat } from './splat';

interface ModelLoadRequest {
    filename?: string;
    url?: string;
    contents?: File;
    animationFrame?: boolean;                   // animations disable morton re-ordering at load time for faster loading
    mapUrl?: (name: string) => string;          // function to map texture names to URLs
    mapFile?: (name: string) => {filename: string, contents: File}|undefined; // function to map names to files
}

// ideally this function would stream data directly into GSplatData buffers.
// unfortunately the .splat file format has no header specifying total number
// of splats so filesize must be known in order to allocate the correct amount
// of memory.
const deserializeFromSSplat = (data: ArrayBufferLike) => {
    const totalSplats = data.byteLength / 32;
    const dataView = new DataView(data);

    const storage_x = new Float32Array(totalSplats);
    const storage_y = new Float32Array(totalSplats);
    const storage_z = new Float32Array(totalSplats);
    const storage_opacity = new Float32Array(totalSplats);
    const storage_rot_0 = new Float32Array(totalSplats);
    const storage_rot_1 = new Float32Array(totalSplats);
    const storage_rot_2 = new Float32Array(totalSplats);
    const storage_rot_3 = new Float32Array(totalSplats);
    const storage_f_dc_0 = new Float32Array(totalSplats);
    const storage_f_dc_1 = new Float32Array(totalSplats);
    const storage_f_dc_2 = new Float32Array(totalSplats);
    const storage_scale_0 = new Float32Array(totalSplats);
    const storage_scale_1 = new Float32Array(totalSplats);
    const storage_scale_2 = new Float32Array(totalSplats);
    const storage_state = new Uint8Array(totalSplats);


    const SH_C0 = 0.28209479177387814;
    let off;

    for (let i = 0; i < totalSplats; i++) {
        off = i * 32;
        storage_x[i] = dataView.getFloat32(off + 0, true);
        storage_y[i] = dataView.getFloat32(off + 4, true);
        storage_z[i] = dataView.getFloat32(off + 8, true);

        storage_scale_0[i] = Math.log(dataView.getFloat32(off + 12, true));
        storage_scale_1[i] = Math.log(dataView.getFloat32(off + 16, true));
        storage_scale_2[i] = Math.log(dataView.getFloat32(off + 20, true));

        storage_f_dc_0[i] = (dataView.getUint8(off + 24) / 255 - 0.5) / SH_C0;
        storage_f_dc_1[i] = (dataView.getUint8(off + 25) / 255 - 0.5) / SH_C0;
        storage_f_dc_2[i] = (dataView.getUint8(off + 26) / 255 - 0.5) / SH_C0;

        storage_opacity[i] = -Math.log(255 / dataView.getUint8(off + 27) - 1);

        storage_rot_0[i] = (dataView.getUint8(off + 28) - 128) / 128;
        storage_rot_1[i] = (dataView.getUint8(off + 29) - 128) / 128;
        storage_rot_2[i] = (dataView.getUint8(off + 30) - 128) / 128;
        storage_rot_3[i] = (dataView.getUint8(off + 31) - 128) / 128;
    }

    return new GSplatData([{
        name: 'vertex',
        count: totalSplats,
        properties: [
            { type: 'float', name: 'x', storage: storage_x, byteSize: 4 },
            { type: 'float', name: 'y', storage: storage_y, byteSize: 4 },
            { type: 'float', name: 'z', storage: storage_z, byteSize: 4 },
            { type: 'float', name: 'opacity', storage: storage_opacity, byteSize: 4 },
            { type: 'float', name: 'rot_0', storage: storage_rot_0, byteSize: 4 },
            { type: 'float', name: 'rot_1', storage: storage_rot_1, byteSize: 4 },
            { type: 'float', name: 'rot_2', storage: storage_rot_2, byteSize: 4 },
            { type: 'float', name: 'rot_3', storage: storage_rot_3, byteSize: 4 },
            { type: 'float', name: 'f_dc_0', storage: storage_f_dc_0, byteSize: 4 },
            { type: 'float', name: 'f_dc_1', storage: storage_f_dc_1, byteSize: 4 },
            { type: 'float', name: 'f_dc_2', storage: storage_f_dc_2, byteSize: 4 },
            { type: 'float', name: 'scale_0', storage: storage_scale_0, byteSize: 4 },
            { type: 'float', name: 'scale_1', storage: storage_scale_1, byteSize: 4 },
            { type: 'float', name: 'scale_2', storage: storage_scale_2, byteSize: 4 },
            { type: 'float', name: 'state', storage: storage_state, byteSize: 4 }
        ]
    }]);
};

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

    loadPly(loadRequest: ModelLoadRequest) {
        if (!loadRequest.animationFrame) {
            this.events.fire('startSpinner');
        }

        let file;

        const isSog = loadRequest.filename.toLowerCase().endsWith('.sog');
        if (isSog) {
            // sog expects contents to be an arrayBuffer
            file = {
                url: URL.createObjectURL(loadRequest.contents),
                filename: loadRequest.filename
            };
        } else {
            const contents = loadRequest.contents && (loadRequest.contents instanceof Response ? loadRequest.contents : new Response(loadRequest.contents));
            file = {
                // we must construct a unique url if contents is provided
                url: contents ? `local-asset-${assetId++}` : loadRequest.url ?? loadRequest.filename,
                filename: loadRequest.filename,
                contents
            };
        }

        const data = {
            // decompress data on load
            decompress: true,
            // disable morton re-ordering when loading animation frames
            reorder: !(loadRequest.animationFrame ?? false),
            mapUrl: loadRequest.mapUrl
        };

        const options = {
            mapUrl: loadRequest.mapUrl
        };

        return new Promise<Splat>((resolve, reject) => {
            const asset = new Asset(
                loadRequest.filename || loadRequest.url,
                'gsplat',
                // @ts-ignore
                file,
                data,
                options
            );

            asset.on('load:data', (data: GSplatData) => {
                // support loading 2d splats by adding scale_2 property with almost 0 scale
                if (data instanceof GSplatData && data.getProp('scale_0') && data.getProp('scale_1') && !data.getProp('scale_2')) {
                    const scale2 = new Float32Array(data.numSplats).fill(Math.log(1e-6));
                    data.addProp('scale_2', scale2);

                    // place the new scale_2 property just after scale_1
                    const props = data.getElement('vertex').properties;
                    props.splice(props.findIndex((prop: any) => prop.name === 'scale_1') + 1, 0, props.splice(props.length - 1, 1)[0]);
                }
            });

            asset.on('load', () => {
                // check the PLY contains minimal set of we expect
                const required = [
                    'x', 'y', 'z',
                    'scale_0', 'scale_1', 'scale_2',
                    'rot_0', 'rot_1', 'rot_2', 'rot_3',
                    'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity'
                ];
                const splatData = (asset.resource as GSplatResource).gsplatData as GSplatData;
                const missing = required.filter(x => !splatData.getProp(x));
                if (missing.length > 0) {
                    reject(new Error(`This file does not contain gaussian splatting data. The following properties are missing: ${missing.join(', ')}`));
                } else {
                    resolve(new Splat(asset));
                }
            });

            asset.on('error', (err: string) => {
                reject(err);
            });

            this.app.assets.add(asset);
            this.app.assets.load(asset);
        }).finally(() => {
            if (!loadRequest.animationFrame) {
                this.events.fire('stopSpinner');
            }
        });
    }

    async loadSplat(loadRequest: ModelLoadRequest) {
        this.events.fire('startSpinner');

        try {
            const contents = loadRequest.contents && (loadRequest.contents instanceof Response ? loadRequest.contents : new Response(loadRequest.contents));
            const response = await (contents ?? fetch(loadRequest.url || loadRequest.filename)) as Response;

            if (!response || !response.ok || !response.body) {
                throw new Error('Failed to fetch splat data');
            }

            const arrayBuffer = await response.arrayBuffer();

            const gsplatData = deserializeFromSSplat(arrayBuffer);

            const asset = new Asset(loadRequest.filename || loadRequest.url, 'gsplat', {
                url: loadRequest.url,
                filename: loadRequest.filename
            });
            this.app.assets.add(asset);
            asset.resource = new GSplatResource(this.app.graphicsDevice, gsplatData);

            return new Splat(asset);
        } finally {
            this.events.fire('stopSpinner');
        }
    }

    // 保留现有的GLB加载方法
    async loadGltf(loadRequest: ModelLoadRequest): Promise<GltfModel> {
        this.events.fire('startSpinner');
    
        try {
            const getResponse = async (contents: File, filename: string | undefined, url: string | undefined) => {
                const c = contents && (contents instanceof Response ? contents : new Response(contents));
                const response = await (c ?? fetch(url || filename));
    
                if (!response || !response.ok || !response.body) {
                    throw new Error('Failed to fetch gltf data');
                }
                return response;
            };

            const response = await getResponse(loadRequest.contents, loadRequest.filename, loadRequest.url);
            const arrayBuffer = await response.arrayBuffer();
    
            // 创建Asset并使用PlayCanvas的资产加载系统
            const asset = new Asset(`gltf-${assetId++}`, 'container', {
                url: loadRequest.url
            });
            
            this.app.assets.add(asset);
            
            // 使用PlayCanvas的资产加载系统加载GLTF数据
            return new Promise<GltfModel>((resolve, reject) => {
                asset.on('load', () => {
                    try {
                        const resource = asset.resource as ContainerResource;
                        
                        // 创建实体
                        const entity = resource.instantiateRenderEntity();
                        if (!entity) {
                            throw new Error('Failed to create entity from GLTF');
                        }
    
                        // 添加到场景
                        this.app.root.addChild(entity);

                        // 确保基础光照
                        this.ensureBasicLighting();

                        // 配置材质以支持光照
                        this.configureMaterialsForLighting(entity);

                        // 设置渲染状态
                        entity.findComponents('render').forEach((render: any) => {
                            render.castShadows = false;
                            render.receiveShadows = false;
                        });
    
                        // 创建GltfModel实例
                        const model = new GltfModel(asset, entity, loadRequest.filename);
                        
                        // 触发加载完成事件
                        this.events.fire('model.loaded.gltf', model);
    
                        resolve(model);
                    } catch (error) {
                        reject(error);
                    }
                });
                
                asset.on('error', (err: string) => {
                    reject(new Error(err));
                });
                
                // 手动设置资源数据并触发加载
                asset.resource = new ContainerResource();
                asset.data = arrayBuffer;
                this.app.assets.load(asset);
            });
    
        } catch (error) {
            console.error('GLTF loading error:', error);
            throw error;
        } finally {
            this.events.fire('stopSpinner');
        }
    }
    
    // 添加官方的LCC加载方法
    async loadLcc(loadRequest: ModelLoadRequest) {
        this.events.fire('startSpinner');
    
        try {
            const getResponse = async (contents: File, filename: string | undefined, url: string | undefined) => {
                const c = contents && (contents instanceof Response ? contents : new Response(contents));
                const response = await (c ?? fetch(url || filename));
    
                if (!response || !response.ok || !response.body) {
                    throw new Error('Failed to fetch splat data');
                }
                return response;
            };
    
            // .lcc
            const response:Response = await getResponse(loadRequest.contents, loadRequest.filename, loadRequest.url);
            const text:string = await response.text();
            const meta = JSON.parse(text);
    
            const isHasSH: boolean =  meta.fileType === 'Quality' || !!(loadRequest.mapFile('shcoef.bin'));
            const compressInfo: CompressInfo = parseMeta(meta);
            const splats: number[] = meta.splats;
    
            // select a lod level
            let targetLod =  splats.findIndex(value => value < LCC_LOD_MAX_SPLATS);
            if (targetLod < 0) {
                targetLod = splats.length - 1;
            }
            const totalSplats = splats[targetLod];
    
            // check files
            const indexFile = loadRequest.mapFile('index.bin');
            const dataFile = loadRequest.mapFile('data.bin');
            const shFile = isHasSH ? loadRequest.mapFile('shcoef.bin') : null;
            if (!indexFile?.contents) {
                throw new Error('Failed to fetch index.bin!');
            }
            if (!dataFile?.contents) {
                throw new Error('Failed to fetch data.bin!');
            }
            if (isHasSH && !shFile?.contents) {
                throw new Error('Failed to fetch shcoef.bin!');
            }
    
            // index.bin
            const indexRes = await getResponse(indexFile.contents, indexFile.filename, undefined);
            const indexArrayBuffer = await indexRes.arrayBuffer();
            const unitInfos: LccUnitInfo[] = parseIndexBin(indexArrayBuffer, meta);
    
            // data.bin + shcoef.bin -> gsplatData
            const gsplatData = await deserializeFromLcc({
                totalSplats,
                unitInfos,
                targetLod,
                isHasSH,
                dataFileContent: dataFile.contents,
                shFileContent: shFile?.contents,
                compressInfo
            });
    
            const resource = new GSplatResource(this.app.graphicsDevice, gsplatData);
            const asset = new Asset(`lcc-${assetId++}`, 'gsplat', {
                url: loadRequest.url || loadRequest.filename
            });
            asset.resource = resource;
    
            const splat = new Splat(asset);
            this.events.fire('model.loaded', splat);
    
            return splat;
    
        } catch (error) {
            console.error('LCC loading error:', error);
            throw error;
        } finally {
            this.events.fire('stopSpinner');
        }
    }
    
    loadModel(loadRequest: ModelLoadRequest) {
        const filename = (loadRequest.filename || loadRequest.url).toLowerCase();
    
        if (filename.endsWith('.splat')) {
            return this.loadSplat(loadRequest);
        } else if (filename.endsWith('.lcc')) {
            return this.loadLcc(loadRequest);
        } else if (filename.endsWith('.gltf') || filename.endsWith('.glb')) {
            return this.loadGltf(loadRequest);
        }
        return this.loadPly(loadRequest);
    }

    private ensureBasicLighting() {
        // Check if there's already lighting
        const existingLights = this.app.root.findComponents('light');
        const hasLight = existingLights.length > 0;

        if (!hasLight) {
            // Create a single directional light
            const mainLight = new Entity('DirectionalLight');
            mainLight.addComponent('light', {
                type: 'directional',
                color: [1, 1, 1],
                intensity: 1.0,
                castShadows: false
            });
            mainLight.setPosition(10, 10, 10);
            mainLight.lookAt(0, 0, 0);
            this.app.root.addChild(mainLight);

            // Set scene ambient light for overall illumination
            this.app.scene.ambientLight = new Color(0.4, 0.4, 0.4);
        }
    }

    private configureMaterialsForLighting(entity: any) {
        // Find all render components and configure their materials
        const renderComponents = entity.findComponents('render');
        renderComponents.forEach((render: any) => {
            if (render.meshInstances) {
                render.meshInstances.forEach((meshInstance: any) => {
                    const material = meshInstance.material;
                    if (material) {
                        // Ensure materials can receive lighting
                        if (material.unlit === undefined) {
                            material.unlit = false;
                        }

                        // Enable double-sided rendering to fix black backfaces
                        material.twoSidedLighting = true;
                        material.cull = CULLFACE_NONE; // Disable backface culling

                        // Ensure proper lighting model
                        if (material.shadingModel === undefined) {
                            material.shadingModel = 1; // SPECULARGLOSINESS
                        }

                        // Add some ambient lighting if the material is too dark
                        if (!material.ambient) {
                            material.ambient = [0.2, 0.2, 0.2];
                        }

                        material.update();
                    }
                });
            }
        });
    }
}

export { AssetLoader };
