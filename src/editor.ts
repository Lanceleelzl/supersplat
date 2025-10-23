import { Color, Mat4, Texture, Vec3, Vec4 } from 'playcanvas';

import { EditHistory } from './edit-history';
import { SelectAllOp, SelectNoneOp, SelectInvertOp, SelectOp, HideSelectionOp, UnhideAllOp, DeleteSelectionOp, ResetOp, MultiOp, AddSplatOp } from './edit-ops';
import { Events } from './events';
import { GltfModel } from './gltf-model';
import { Scene } from './scene';
import { BufferWriter } from './serialize/writer';
import { Splat } from './splat';
import { serializePly } from './splat-serialize';

// 注册编辑器和场景事件
const registerEditorEvents = (events: Events, editHistory: EditHistory, scene: Scene) => {
    const vec = new Vec3();
    const vec2 = new Vec3();
    const vec4 = new Vec4();
    const mat = new Mat4();

    // 获取已选择的点云列表（目前限制为只能选择一个）
    const selectedSplats = () => {
        const selected = events.invoke('selection') as Splat;
        return selected?.visible ? [selected] : [];
    };

    let lastExportCursor = 0;

    // 深度克隆实体的辅助函数
    const deepCloneEntity = (originalEntity: any, namePrefix: string): any => {
        // 使用PlayCanvas的clone方法
        const cloned = originalEntity.clone();

        // 设置唯一名称
        cloned.name = `${namePrefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // 确保从父节点分离
        if (cloned.parent && cloned.parent !== originalEntity.parent) {
            cloned.parent.removeChild(cloned);
        }

        // 递归处理子实体，确保它们也有唯一的名称和独立性
        if (cloned.children && cloned.children.length > 0) {
            cloned.children.forEach((child: any, index: number) => {
                child.name = `${child.name}_clone_${index}_${Date.now()}`;
                child.enabled = true;
            });
        }

        return cloned;
    };

    // 克隆GLB模型的辅助函数
    const cloneGltfModel = (originalModel: GltfModel, newFilename: string, scene: Scene): GltfModel | null => {
        try {
            // 使用深度克隆来确保完全独立的实体
            const clonedEntity = deepCloneEntity(originalModel.entity, newFilename);
            if (!clonedEntity) {
                console.error('无法克隆实体');
                return null;
            }

            // 手动复制变换信息到克隆的实体
            const originalPos = originalModel.entity.getLocalPosition();
            const originalRot = originalModel.entity.getLocalRotation();
            const originalScale = originalModel.entity.getLocalScale();

            clonedEntity.setLocalPosition(originalPos);
            clonedEntity.setLocalRotation(originalRot);
            clonedEntity.setLocalScale(originalScale);

            // 创建一个新的GltfModel实例，传入自定义文件名
            const clonedModel = new GltfModel(originalModel.asset, clonedEntity, newFilename);

            // 复制原始模型的属性
            clonedModel.visible = originalModel.visible;

            // 确保实体被正确启用
            clonedEntity.enabled = true;

            // 递归确保所有子实体也被正确启用
            function enableAllEntities(entity: any) {
                entity.enabled = true;
                if (entity.children) {
                    entity.children.forEach((child: any) => enableAllEntities(child));
                }
            }
            enableAllEntities(clonedEntity);

            console.log('复制的模型创建成功:', newFilename, '实体名称:', clonedEntity.name);

            return clonedModel;
        } catch (error) {
            console.error('克隆GLB模型时出错:', error);
            return null;
        }
    };

    // GLB模型复制辅助函数
    const duplicateGltfModel = (originalModel: GltfModel, scene: Scene): GltfModel | null => {
        try {
            // 获取原始模型的文件信息
            const originalFilename = originalModel.filename;

            // 检查是否有可用的文件数据
            if (!originalModel.asset) {
                console.warn('无法复制模型：缺少资产引用');
                return null;
            }

            // 创建新的文件名，使用中文"_复制"
            const copyFilename = originalFilename ? `${originalFilename}_复制` : '模型_复制';

            // 使用克隆方式创建独立的模型
            const duplicatedModel = cloneGltfModel(originalModel, copyFilename, scene);

            if (duplicatedModel) {
                // 复制变换信息，保持原位（不偏移）
                const originalPos = originalModel.entity.getPosition();
                const originalRot = originalModel.entity.getRotation();
                const originalScale = originalModel.entity.getLocalScale();

                // 设置新模型的位置，保持原位复制
                duplicatedModel.entity.setPosition(originalPos.x, originalPos.y, originalPos.z);
                duplicatedModel.entity.setRotation(originalRot);
                duplicatedModel.entity.setLocalScale(originalScale);

                // **关键修复：将实体添加到PlayCanvas的根节点**
                scene.app.root.addChild(duplicatedModel.entity);

                // 将新模型添加到场景（会自动触发scene.elementAdded事件）
                scene.add(duplicatedModel);

                // 强制刷新场景显示和渲染
                scene.forceRender = true;

                // 立即触发一次渲染更新
                setTimeout(() => {
                    scene.forceRender = true;
                }, 10);

                console.log('GLB模型复制完成:', copyFilename, '实体已添加到根节点');

                return duplicatedModel;
            }

            return null;
        } catch (error) {
            console.error('复制GLB模型时出错:', error);
            return null;
        }
    };

    // 高斯泼溅模型复制辅助函数
    const duplicateSplatModel = (originalSplat: Splat, scene: Scene): Splat | null => {
        try {
            // 获取原始模型的信息
            const originalName = originalSplat.name || originalSplat.filename;

            // 检查是否有可用的资产引用
            if (!originalSplat.asset) {
                console.warn('无法复制高斯泼溅模型：缺少资产引用');
                return null;
            }

            // 创建新的名称，使用中文"_复制"
            const copyName = originalName ? `${originalName}_复制` : '高斯泼溅_复制';

            // 创建新的Splat实例，使用默认方向
            const duplicatedSplat = new Splat(originalSplat.asset, new Vec3(0, 0, 0));

            if (duplicatedSplat) {
                // 设置新名称
                duplicatedSplat.name = copyName;

                // 复制变换信息，保持原位（不偏移）
                const originalPos = originalSplat.entity.getPosition();
                const originalRot = originalSplat.entity.getRotation();
                const originalScale = originalSplat.entity.getLocalScale();

                // 设置新模型的位置，保持原位复制
                duplicatedSplat.entity.setPosition(originalPos.x, originalPos.y, originalPos.z);
                duplicatedSplat.entity.setRotation(originalRot);
                duplicatedSplat.entity.setLocalScale(originalScale);

                // 复制其他属性
                duplicatedSplat.visible = originalSplat.visible;
                duplicatedSplat._tintClr.copy(originalSplat._tintClr);
                duplicatedSplat._temperature = originalSplat._temperature;
                duplicatedSplat._saturation = originalSplat._saturation;
                duplicatedSplat._brightness = originalSplat._brightness;
                duplicatedSplat._blackPoint = originalSplat._blackPoint;
                duplicatedSplat._whitePoint = originalSplat._whitePoint;
                duplicatedSplat._transparency = originalSplat._transparency;

                // 将实体添加到PlayCanvas的根节点
                scene.app.root.addChild(duplicatedSplat.entity);

                // 将新模型添加到场景
                scene.add(duplicatedSplat);

                // 强制刷新场景显示和渲染
                scene.forceRender = true;

                // 立即触发一次渲染更新
                setTimeout(() => {
                    scene.forceRender = true;
                }, 10);

                console.log('高斯泼溅模型复制完成:', copyName, '实体已添加到根节点');

                return duplicatedSplat;
            }

            return null;
        } catch (error) {
            console.error('复制高斯泼溅模型时出错:', error);
            return null;
        }
    };

    // 添加未保存更改的警告消息
    window.addEventListener('beforeunload', (e) => {
        if (!events.invoke('scene.dirty')) {
            // 如果撤销光标匹配最后的导出状态，则没有未保存的更改
            return undefined;
        }

        const msg = '您有未保存的更改。确定要离开吗？';
        e.returnValue = msg;
        return msg;
    });

    events.function('targetSize', () => {
        return scene.targetSize;
    });

    events.on('scene.clear', () => {
        scene.clear();
        editHistory.clear();
        lastExportCursor = 0;
    });

    events.function('scene.dirty', () => {
        return editHistory.cursor !== lastExportCursor;
    });

    events.on('doc.saved', () => {
        lastExportCursor = editHistory.cursor;
    });

    events.on('camera.mode', () => {
        scene.forceRender = true;
    });

    events.on('camera.overlay', () => {
        scene.forceRender = true;
    });

    events.on('camera.splatSize', () => {
        scene.forceRender = true;
    });

    events.on('view.outlineSelection', () => {
        scene.forceRender = true;
    });

    events.on('view.bands', (bands: number) => {
        scene.forceRender = true;
    });

    events.on('camera.bound', () => {
        scene.forceRender = true;
    });

    events.on('camera.highPrecision', () => {
        scene.forceRender = true;
    });

    events.on('selection.changed', () => {
        scene.forceRender = true;
    });

    events.on('tool.coordSpace', () => {
        scene.forceRender = true;
    });

    // grid.visible

    const setGridVisible = (visible: boolean) => {
        if (visible !== scene.grid.visible) {
            scene.grid.visible = visible;
            events.fire('grid.visible', visible);
        }
    };

    events.function('grid.visible', () => {
        return scene.grid.visible;
    });

    events.on('grid.setVisible', (visible: boolean) => {
        setGridVisible(visible);
    });

    events.on('grid.toggleVisible', () => {
        setGridVisible(!scene.grid.visible);
    });

    setGridVisible(scene.config.show.grid);

    // 相机视野角度控制

    const setCameraFov = (fov: number) => {
        if (fov !== scene.camera.fov) {
            scene.camera.fov = fov;
            events.fire('camera.fov', scene.camera.fov);
        }
    };

    events.function('camera.fov', () => {
        return scene.camera.fov;
    });

    events.on('camera.setFov', (fov: number) => {
        setCameraFov(fov);
    });

    // 相机色调映射控制

    events.function('camera.tonemapping', () => {
        return scene.camera.tonemapping;
    });

    events.on('camera.setTonemapping', (value: string) => {
        scene.camera.tonemapping = value;
    });

    // 相机边界框显示控制

    let bound = scene.config.show.bound;

    const setBoundVisible = (visible: boolean) => {
        if (visible !== bound) {
            bound = visible;
            events.fire('camera.bound', bound);
        }
    };

    events.function('camera.bound', () => {
        return bound;
    });

    events.on('camera.setBound', (value: boolean) => {
        setBoundVisible(value);
    });

    events.on('camera.toggleBound', () => {
        setBoundVisible(!events.invoke('camera.bound'));
    });

    // camera.highPrecision

    let highPrecision = scene.config.camera.highPrecision;

    const sethighPrecision = (enabled: boolean) => {
        if (enabled !== highPrecision) {
            highPrecision = enabled;
            events.fire('camera.highPrecision', highPrecision);
        }
    };

    events.function('camera.highPrecision', () => {
        return highPrecision;
    });

    events.on('camera.sethighPrecision', (value: boolean) => {
        sethighPrecision(value);
    });

    // camera.focus

    events.on('camera.focus', () => {
        const splat = selectedSplats()[0];
        if (splat) {

            const bound = splat.numSelected > 0 ? splat.selectionBound : splat.localBound;
            vec.copy(bound.center);

            const worldTransform = splat.worldTransform;
            worldTransform.transformPoint(vec, vec);
            worldTransform.getScale(vec2);

            scene.camera.focus({
                focalPoint: vec,
                radius: bound.halfExtents.length() * vec2.x,
                speed: 1
            });
        }
    });

    events.on('camera.reset', () => {
        const { initialAzim, initialElev, initialZoom } = scene.config.controls;
        const x = Math.sin(initialAzim * Math.PI / 180) * Math.cos(initialElev * Math.PI / 180);
        const y = -Math.sin(initialElev * Math.PI / 180);
        const z = Math.cos(initialAzim * Math.PI / 180) * Math.cos(initialElev * Math.PI / 180);
        const zoom = initialZoom;

        scene.camera.setPose(new Vec3(x * zoom, y * zoom, z * zoom), new Vec3(0, 0, 0));
    });

    // 处理相机对齐事件
    events.on('camera.align', (axis: string) => {
        switch (axis) {
            case 'px': scene.camera.setAzimElev(90, 0); break;
            case 'py': scene.camera.setAzimElev(0, -90); break;
            case 'pz': scene.camera.setAzimElev(0, 0); break;
            case 'nx': scene.camera.setAzimElev(270, 0); break;
            case 'ny': scene.camera.setAzimElev(0, 90); break;
            case 'nz': scene.camera.setAzimElev(180, 0); break;
        }

        // 切换到正交模式
        scene.camera.ortho = true;
    });

    // 返回选中的点云是否包含已选中的高斯点
    events.function('selection.splats', () => {
        const splat = events.invoke('selection') as Splat;
        return splat?.numSelected > 0;
    });

    events.on('select.all', () => {
        selectedSplats().forEach((splat) => {
            events.fire('edit.add', new SelectAllOp(splat));
        });
    });

    events.on('select.none', () => {
        selectedSplats().forEach((splat) => {
            events.fire('edit.add', new SelectNoneOp(splat));
        });
    });

    events.on('select.invert', () => {
        selectedSplats().forEach((splat) => {
            events.fire('edit.add', new SelectInvertOp(splat));
        });
    });

    events.on('select.pred', (op, pred: (i: number) => boolean) => {
        selectedSplats().forEach((splat) => {
            events.fire('edit.add', new SelectOp(splat, op, pred));
        });
    });

    const intersectCenters = (splat: Splat, op: 'add'|'remove'|'set', options: any) => {
        const data = scene.dataProcessor.intersect(options, splat);
        const filter = (i: number) => data[i] === 255;
        events.fire('edit.add', new SelectOp(splat, op, filter));
    };

    events.on('select.bySphere', (op: 'add'|'remove'|'set', sphere: number[]) => {
        selectedSplats().forEach((splat) => {
            intersectCenters(splat, op, {
                sphere: { x: sphere[0], y: sphere[1], z: sphere[2], radius: sphere[3] }
            });
        });
    });

    events.on('select.byBox', (op: 'add'|'remove'|'set', box: number[]) => {
        selectedSplats().forEach((splat) => {
            intersectCenters(splat, op, {
                box: { x: box[0], y: box[1], z: box[2], lenx: box[3], leny: box[4], lenz: box[5] }
            });
        });
    });

    events.on('select.rect', (op: 'add'|'remove'|'set', rect: any) => {
        const mode = events.invoke('camera.mode');

        selectedSplats().forEach((splat) => {
            if (mode === 'centers') {
                intersectCenters(splat, op, {
                    rect: { x1: rect.start.x, y1: rect.start.y, x2: rect.end.x, y2: rect.end.y }
                });
            } else if (mode === 'rings') {
                const { width, height } = scene.targetSize;

                scene.camera.pickPrep(splat, op);
                const pick = scene.camera.pickRect(
                    Math.floor(rect.start.x * width),
                    Math.floor(rect.start.y * height),
                    Math.floor((rect.end.x - rect.start.x) * width),
                    Math.floor((rect.end.y - rect.start.y) * height)
                );

                const selected = new Set<number>(pick);
                const filter = (i: number) => {
                    return selected.has(i);
                };

                events.fire('edit.add', new SelectOp(splat, op, filter));
            }
        });
    });

    let maskTexture: Texture = null;

    events.on('select.byMask', (op: 'add'|'remove'|'set', canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) => {
        const mode = events.invoke('camera.mode');

        selectedSplats().forEach((splat) => {
            if (mode === 'centers') {
                // create mask texture
                if (!maskTexture || maskTexture.width !== canvas.width || maskTexture.height !== canvas.height) {
                    if (maskTexture) {
                        maskTexture.destroy();
                    }
                    maskTexture = new Texture(scene.graphicsDevice);
                }
                maskTexture.setSource(canvas);

                intersectCenters(splat, op, {
                    mask: maskTexture
                });
            } else if (mode === 'rings') {
                const mask = context.getImageData(0, 0, canvas.width, canvas.height);

                // calculate mask bound so we limit pixel operations
                let mx0 = mask.width - 1;
                let my0 = mask.height - 1;
                let mx1 = 0;
                let my1 = 0;
                for (let y = 0; y < mask.height; ++y) {
                    for (let x = 0; x < mask.width; ++x) {
                        if (mask.data[(y * mask.width + x) * 4 + 3] === 255) {
                            mx0 = Math.min(mx0, x);
                            my0 = Math.min(my0, y);
                            mx1 = Math.max(mx1, x);
                            my1 = Math.max(my1, y);
                        }
                    }
                }

                const { width, height } = scene.targetSize;
                const px0 = Math.floor(mx0 / mask.width * width);
                const py0 = Math.floor(my0 / mask.height * height);
                const px1 = Math.floor(mx1 / mask.width * width);
                const py1 = Math.floor(my1 / mask.height * height);
                const pw = px1 - px0 + 1;
                const ph = py1 - py0 + 1;

                scene.camera.pickPrep(splat, op);
                const pick = scene.camera.pickRect(px0, py0, pw, ph);

                const selected = new Set<number>();
                for (let y = 0; y < ph; ++y) {
                    for (let x = 0; x < pw; ++x) {
                        const mx = Math.floor((px0 + x) / width * mask.width);
                        const my = Math.floor((py0 + y) / height * mask.height);
                        if (mask.data[(my * mask.width + mx) * 4] === 255) {
                            selected.add(pick[(ph - y) * pw + x]);
                        }
                    }
                }

                const filter = (i: number) => {
                    return selected.has(i);
                };

                events.fire('edit.add', new SelectOp(splat, op, filter));
            }
        });
    });

    events.on('select.point', (op: 'add'|'remove'|'set', point: { x: number, y: number }) => {
        const { width, height } = scene.targetSize;
        const mode = events.invoke('camera.mode');

        selectedSplats().forEach((splat) => {
            const splatData = splat.splatData;

            if (mode === 'centers') {
                const x = splatData.getProp('x');
                const y = splatData.getProp('y');
                const z = splatData.getProp('z');

                const splatSize = events.invoke('camera.splatSize');
                const camera = scene.camera.entity.camera;
                const sx = point.x * width;
                const sy = point.y * height;

                // calculate final matrix
                mat.mul2(camera.camera._viewProjMat, splat.worldTransform);

                const filter = (i: number) => {
                    vec4.set(x[i], y[i], z[i], 1.0);
                    mat.transformVec4(vec4, vec4);
                    const px = (vec4.x / vec4.w * 0.5 + 0.5) * width;
                    const py = (-vec4.y / vec4.w * 0.5 + 0.5) * height;
                    return Math.abs(px - sx) < splatSize && Math.abs(py - sy) < splatSize;
                };

                events.fire('edit.add', new SelectOp(splat, op, filter));
            } else if (mode === 'rings') {
                scene.camera.pickPrep(splat, op);

                const pickId = scene.camera.pickRect(
                    Math.floor(point.x * width),
                    Math.floor(point.y * height),
                    1, 1
                )[0];

                const filter = (i: number) => {
                    return i === pickId;
                };

                events.fire('edit.add', new SelectOp(splat, op, filter));
            }
        });
    });

    events.on('select.hide', () => {
        selectedSplats().forEach((splat) => {
            events.fire('edit.add', new HideSelectionOp(splat));
        });
    });

    events.on('select.unhide', () => {
        selectedSplats().forEach((splat) => {
            events.fire('edit.add', new UnhideAllOp(splat));
        });
    });

    events.on('select.delete', () => {
        console.log('Delete event triggered');
        const splats = selectedSplats();
        console.log('Selected splats:', splats.length, splats);

        if (splats.length === 0) {
            console.log('No splats selected for deletion');
            return;
        }

        splats.forEach((splat) => {
            console.log('Deleting splat:', splat.name, 'numSelected:', splat.numSelected);
            editHistory.add(new DeleteSelectionOp(splat));
        });
    });

    const performSelectionFunc = async (func: 'duplicate' | 'separate') => {
        const splats = selectedSplats();

        const writer = new BufferWriter();

        await serializePly(splats, {
            maxSHBands: 3,
            selected: true
        }, writer);

        const buffers = writer.close();

        if (buffers) {
            const splat = splats[0];

            // wrap PLY in a blob and load it
            const blob = new Blob(buffers as unknown as ArrayBuffer[], { type: 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            const { filename } = splat;
            const copy = await scene.assetLoader.load({ url, filename });

            if (func === 'separate') {
                editHistory.add(new MultiOp([
                    new DeleteSelectionOp(splat),
                    new AddSplatOp(scene, copy)
                ]));
            } else {
                editHistory.add(new AddSplatOp(scene, copy));
            }

            URL.revokeObjectURL(url);
        }
    };

    // duplicate the current selection
    events.on('select.duplicate', async () => {
        await performSelectionFunc('duplicate');
    });

    events.on('select.separate', async () => {
        await performSelectionFunc('separate');
    });

    // GLB模型复制事件处理
    events.on('model.duplicate', (model) => {
        try {
            console.log('开始复制GLB模型:', model.filename);

            // 创建模型的副本
            const duplicatedModel = duplicateGltfModel(model, scene);

            if (duplicatedModel) {
                // 先清空当前选择
                events.fire('selection', null);

                // 强制刷新场景
                scene.forceRender = true;

                // 延迟选中新模型，确保清空选择后再选中
                setTimeout(() => {
                    scene.forceRender = true;

                    // 选中新复制的模型
                    events.fire('selection', duplicatedModel);
                    console.log('GLB模型复制完成，新模型名称:', duplicatedModel.filename);
                }, 150);
            }
        } catch (error) {
            console.error('GLB模型复制失败:', error);
        }
    });

    // 高斯泼溅模型复制事件处理
    events.on('splat.duplicate', (splat) => {
        try {
            console.log('开始复制高斯泼溅模型:', splat.name);

            // 创建高斯泼溅模型的副本
            const duplicatedSplat = duplicateSplatModel(splat, scene);

            if (duplicatedSplat) {
                // 先清空当前选择
                events.fire('selection', null);

                // 强制刷新场景
                scene.forceRender = true;

                // 延迟选中新模型，确保清空选择后再选中
                setTimeout(() => {
                    scene.forceRender = true;

                    // 选中新复制的高斯泼溅模型
                    events.fire('selection', duplicatedSplat);
                    console.log('高斯泼溅模型复制完成，新模型名称:', duplicatedSplat.name);
                }, 150);
            }
        } catch (error) {
            console.error('高斯泼溅模型复制失败:', error);
        }
    });

    // 监听模型移动事件，确保渲染刷新
    events.on('model.moved', (model) => {
        // 强制渲染刷新，确保原位和移动后的模型都正确显示
        scene.forceRender = true;

        // 延迟额外刷新，确保显示正确
        setTimeout(() => {
            scene.forceRender = true;
        }, 50);
    });

    events.on('scene.reset', () => {
        selectedSplats().forEach((splat) => {
            editHistory.add(new ResetOp(splat));
        });
    });

    const setAllData = (value: boolean) => {
        if (value !== scene.assetLoader.loadAllData) {
            scene.assetLoader.loadAllData = value;
            events.fire('allData', scene.assetLoader.loadAllData);
        }
    };

    events.function('allData', () => {
        return scene.assetLoader.loadAllData;
    });

    events.on('toggleAllData', (value: boolean) => {
        setAllData(!events.invoke('allData'));
    });

    // camera mode

    let activeMode = 'centers';

    const setCameraMode = (mode: string) => {
        if (mode !== activeMode) {
            activeMode = mode;
            events.fire('camera.mode', activeMode);
        }
    };

    events.function('camera.mode', () => {
        return activeMode;
    });

    events.on('camera.setMode', (mode: string) => {
        setCameraMode(mode);
    });

    events.on('camera.toggleMode', () => {
        setCameraMode(events.invoke('camera.mode') === 'centers' ? 'rings' : 'centers');
    });

    // camera overlay

    let cameraOverlay = scene.config.camera.overlay;

    const setCameraOverlay = (enabled: boolean) => {
        if (enabled !== cameraOverlay) {
            cameraOverlay = enabled;
            events.fire('camera.overlay', cameraOverlay);
        }
    };

    events.function('camera.overlay', () => {
        return cameraOverlay;
    });

    events.on('camera.setOverlay', (value: boolean) => {
        setCameraOverlay(value);
    });

    events.on('camera.toggleOverlay', () => {
        setCameraOverlay(!events.invoke('camera.overlay'));
    });

    // splat size

    let splatSize = 2;

    const setSplatSize = (value: number) => {
        if (value !== splatSize) {
            splatSize = value;
            events.fire('camera.splatSize', splatSize);
        }
    };

    events.function('camera.splatSize', () => {
        return splatSize;
    });

    events.on('camera.setSplatSize', (value: number) => {
        setSplatSize(value);
    });

    // camera fly speed

    const setFlySpeed = (value: number) => {
        if (value !== scene.camera.flySpeed) {
            scene.camera.flySpeed = value;
            events.fire('camera.flySpeed', value);
        }
    };

    events.function('camera.flySpeed', () => {
        return scene.camera.flySpeed;
    });

    events.on('camera.setFlySpeed', (value: number) => {
        setFlySpeed(value);
    });

    // outline selection

    let outlineSelection = false;

    const setOutlineSelection = (value: boolean) => {
        if (value !== outlineSelection) {
            outlineSelection = value;
            events.fire('view.outlineSelection', outlineSelection);
        }
    };

    events.function('view.outlineSelection', () => {
        return outlineSelection;
    });

    events.on('view.setOutlineSelection', (value: boolean) => {
        setOutlineSelection(value);
    });

    // view spherical harmonic bands

    let viewBands = scene.config.show.shBands;

    const setViewBands = (value: number) => {
        if (value !== viewBands) {
            viewBands = value;
            events.fire('view.bands', viewBands);
        }
    };

    events.function('view.bands', () => {
        return viewBands;
    });

    events.on('view.setBands', (value: number) => {
        setViewBands(value);
    });

    events.function('camera.getPose', () => {
        const camera = scene.camera;
        const position = camera.entity.getPosition();
        const focalPoint = camera.focalPoint;
        return {
            position: { x: position.x, y: position.y, z: position.z },
            target: { x: focalPoint.x, y: focalPoint.y, z: focalPoint.z }
        };
    });

    events.on('camera.setPose', (pose: { position: Vec3, target: Vec3 }, speed = 1) => {
        scene.camera.setPose(pose.position, pose.target, speed);
    });

    // hack: fire events to initialize UI
    events.fire('camera.fov', scene.camera.fov);
    events.fire('camera.overlay', cameraOverlay);
    events.fire('view.bands', viewBands);

    // doc serialization
    events.function('docSerialize.view', () => {
        const packC = (c: Color) => [c.r, c.g, c.b, c.a];
        return {
            bgColor: packC(events.invoke('bgClr')),
            selectedColor: packC(events.invoke('selectedClr')),
            unselectedColor: packC(events.invoke('unselectedClr')),
            lockedColor: packC(events.invoke('lockedClr')),
            shBands: events.invoke('view.bands'),
            centersSize: events.invoke('camera.splatSize'),
            outlineSelection: events.invoke('view.outlineSelection'),
            showGrid: events.invoke('grid.visible'),
            showBound: events.invoke('camera.bound'),
            flySpeed: events.invoke('camera.flySpeed')
        };
    });

    events.function('docDeserialize.view', (docView: any) => {
        events.fire('setBgClr', new Color(docView.bgColor));
        events.fire('setSelectedClr', new Color(docView.selectedColor));
        events.fire('setUnselectedClr', new Color(docView.unselectedColor));
        events.fire('setLockedClr', new Color(docView.lockedColor));
        events.fire('view.setBands', docView.shBands);
        events.fire('camera.setSplatSize', docView.centersSize);
        events.fire('view.setOutlineSelection', docView.outlineSelection);
        events.fire('grid.setVisible', docView.showGrid);
        events.fire('camera.setBound', docView.showBound);
        events.fire('camera.setFlySpeed', docView.flySpeed);
    });

    // 巡检点计数器和管理器
    let inspectionPointCounter = 1;
    const inspectionPoints = new Map<string, {
        models: GltfModel[],
        position: any,
        cameraParams?: {
            position: { x: number, y: number, z: number },
            target: { x: number, y: number, z: number },
            fov: number,
            nearClip: number,
            farClip: number,
            aperture?: number,
            sensitivity?: number,
            shutter?: number,
            toneMapping?: number,
            timestamp: number
        }
    }>();

    // 添加巡检点事件处理
    events.on('inspection.addPoint', async () => {
        try {
            console.log('开始添加巡检点...');

            // 获取当前相机位置和参数
            const cameraPosition = scene.camera.entity.getPosition();
            const cameraTarget = scene.camera.focalPoint;
            const cameraFov = scene.camera.fov;
            const cameraNear = scene.camera.near;
            const cameraFar = scene.camera.far;

            console.log('相机位置:', cameraPosition);
            console.log('相机目标:', cameraTarget);
            console.log('相机参数:', { fov: cameraFov, near: cameraNear, far: cameraFar });

            // 创建巡检点位名称 - 使用新的命名规则 XJ-1, XJ-2
            const pointName = `XJ-${inspectionPointCounter}`;

            // 加载方位标模型
            const modelPath = '/public/model/marker.glb';
            console.log('正在加载模型:', modelPath);

            let model: any;
            try {
                const response = await fetch(modelPath);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const blob = await response.blob();
                console.log('模型文件大小:', blob.size, 'bytes');

                if (blob.size === 0) {
                    throw new Error('模型文件为空');
                }

                const file = new File([blob], 'marker.glb', { type: 'model/gltf-binary' });

                // 使用AssetLoader加载模型
                console.log('开始使用AssetLoader加载模型...');
                model = await scene.assetLoader.loadModel({
                    contents: file,
                    filename: 'marker.glb',
                    url: modelPath  // 明确传递完整URL
                });
                console.log('模型加载结果:', model);

                if (!model) {
                    throw new Error('AssetLoader返回null');
                }

            } catch (loadError) {
                console.error('GLB模型加载失败，创建简单立方体作为替代:', loadError);

                // 暂时抛出错误，稍后处理备用方案
                throw new Error(`模型加载失败: ${loadError.message}`);
            }

            if (model && model.entity) {
                console.log('模型实体创建成功');

                // 不设置位置，保持默认原点位置 (0, 0, 0)，与文件拖拽加载行为一致
                // model.entity.setPosition(cameraPosition.x, cameraPosition.y, cameraPosition.z);
                console.log('保持模型在原点位置 (0, 0, 0)');

                // 确保模型可见和启用
                model.entity.enabled = true;
                model.visible = true;

                // 保持模型原始大小，不进行缩放
                model.entity.setLocalScale(1, 1, 1);
                console.log('保持模型原始大小');

                // 保持模型自身的初始朝向，不进行额外旋转
                // model.entity.setEulerAngles(0, 180, 0);
                console.log('保持巡检模型自身的初始朝向');

                // 设置模型为巡检点的子模型
                if (model instanceof GltfModel) {
                    const markerName = `XJ-${inspectionPointCounter}-1`;
                    model.setCustomFilename(markerName);
                    // 标记为巡检点的子模型
                    (model as any).isInspectionModel = true;
                    (model as any).inspectionPointName = pointName;
                    (model as any).inspectionMarkerName = markerName;
                    console.log('设置模型属性:', markerName, '属于', pointName);
                }

                // 创建巡检点位记录，包含相机参数
                inspectionPoints.set(pointName, {
                    models: [model as GltfModel],
                    position: { x: 0, y: 0, z: 0 }, // 原点位置
                    cameraParams: {
                        position: { x: cameraPosition.x, y: cameraPosition.y, z: cameraPosition.z },
                        target: { x: cameraTarget.x, y: cameraTarget.y, z: cameraTarget.z },
                        fov: cameraFov,
                        nearClip: cameraNear,
                        farClip: cameraFar,
                        aperture: scene.camera.entity.camera?.aperture || 16,
                        sensitivity: scene.camera.entity.camera?.sensitivity || 1000,
                        shutter: scene.camera.entity.camera?.shutter || 60,
                        toneMapping: scene.camera.entity.camera?.toneMapping || 0,
                        timestamp: Date.now()
                    }
                });
                console.log('创建巡检点位记录，包含相机参数');

                // 将模型添加到场景（会自动触发 scene.elementAdded 事件）
                scene.add(model);
                console.log('模型添加到场景');

                inspectionPointCounter++;

                console.log(`成功添加巡检点: ${pointName}`);
                console.log('当前场景中的元素数量:', scene.elements.length);

                // 选择新创建的模型以便查看
                setTimeout(() => {
                    events.fire('selection', model);
                    console.log('选择新创建的模型');

                    // 触发marker选择事件以更新快照窗口
                    if ((model as any).isInspectionModel) {
                        events.fire('marker.selected', model);
                    }
                }, 100);
            } else {
                throw new Error('模型加载失败');
            }
        } catch (error) {
            console.error('添加巡检点失败:', error);
            await events.invoke('showPopup', {
                type: 'error',
                header: '错误',
                message: `添加巡检点失败: ${error.message}`
            });
        }
    });

    // 巡检点位复制事件处理
    events.on('inspection.duplicatePoint', async (pointName: string) => {
        const inspectionPoint = inspectionPoints.get(pointName);
        if (inspectionPoint) {
            try {
                // 生成新的巡检点位名称，使用当前计数
                const newPointName = `XJ-${inspectionPointCounter}`;
                const newModels: GltfModel[] = [];

                // 复制所有模型
                for (let i = 0; i < inspectionPoint.models.length; i++) {
                    const originalModel = inspectionPoint.models[i];
                    const modelPath = '/public/model/marker.glb';
                    const response = await fetch(modelPath);
                    const blob = await response.blob();
                    const file = new File([blob], 'marker.glb', { type: 'model/gltf-binary' });

                    const newModel = await scene.assetLoader.loadModel({
                        contents: file,
                        filename: 'marker.glb',
                        url: modelPath  // 明确传递完整URL
                    });

                    if (newModel && newModel.entity) {
                        // 原位复制：复制原模型的位置、旋转和缩放
                        const position = originalModel.entity.getPosition();
                        const rotation = originalModel.entity.getRotation();
                        const scale = originalModel.entity.getLocalScale();

                        newModel.entity.setPosition(position.x, position.y, position.z);
                        newModel.entity.setRotation(rotation);
                        newModel.entity.setLocalScale(scale.x, scale.y, scale.z);
                        console.log('巡检点位复制，保持原位置:', position.x, position.y, position.z);

                        // 设置属性 - 作为巡检模型（子项）
                        if (newModel instanceof GltfModel) {
                            const newMarkerName = `XJ-${inspectionPointCounter}-${i + 1}`;

                            newModel.setCustomFilename(newMarkerName);
                            (newModel as any).isInspectionModel = true; // 设置为子模型，不是父级
                            (newModel as any).inspectionPointName = newPointName;
                            (newModel as any).inspectionMarkerName = newMarkerName;
                            console.log('设置新巡检模型:', newMarkerName, '属于', newPointName);
                        }

                        newModels.push(newModel as GltfModel);
                        scene.add(newModel);
                        // 不需要手动触发 scene.elementAdded，scene.add 会自动触发
                    }
                }

                // 创建新的巡检点位记录（保持原位置）
                inspectionPoints.set(newPointName, {
                    models: newModels,
                    position: inspectionPoint.position // 保持原巡检点位置
                });

                // 增加计数器
                inspectionPointCounter++;

                console.log(`复制巡检点位: ${pointName} -> ${newPointName}`);
            } catch (error) {
                console.error('复制巡检点位失败:', error);
            }
        }
    });

    // 巡检模型复制事件处理
    events.on('inspection.duplicateModel', async (pointName: string, originalModel: GltfModel) => {
        const inspectionPoint = inspectionPoints.get(pointName);
        if (inspectionPoint) {
            try {
                const modelPath = '/public/model/marker.glb';
                const response = await fetch(modelPath);
                const blob = await response.blob();
                const file = new File([blob], 'marker.glb', { type: 'model/gltf-binary' });

                const newModel = await scene.assetLoader.loadModel({
                    contents: file,
                    filename: 'marker.glb',
                    url: modelPath  // 明确传递完整URL
                });

                if (newModel && newModel.entity) {
                    // 原位复制：复制原模型的位置、旋转和缩放
                    const position = originalModel.entity.getPosition();
                    const rotation = originalModel.entity.getRotation();
                    const scale = originalModel.entity.getLocalScale();

                    newModel.entity.setPosition(position.x, position.y, position.z);
                    newModel.entity.setRotation(rotation);
                    newModel.entity.setLocalScale(scale.x, scale.y, scale.z);
                    console.log('原位复制，位置:', position.x, position.y, position.z);

                    // 设置属性 - 计算新的marker编号
                    let newMarkerName = '';
                    if (newModel instanceof GltfModel) {
                        // 获取当前巡检点下已有的marker数量
                        const existingMarkers = inspectionPoint.models.length;
                        // 从巡检点位名称中提取编号
                        const pointNumber = pointName.replace('XJ-', '');
                        newMarkerName = `XJ-${pointNumber}-${existingMarkers + 1}`;

                        newModel.setCustomFilename(newMarkerName);
                        (newModel as any).isInspectionModel = true;
                        (newModel as any).inspectionPointName = pointName;
                        (newModel as any).inspectionMarkerName = newMarkerName;
                        console.log('设置新marker名称:', newMarkerName);
                    }

                    // 添加到巡检点位
                    inspectionPoint.models.push(newModel as GltfModel);

                    // 先清空当前选择，避免相机跳转
                    events.fire('selection', null);

                    // 添加到场景（会自动触发 scene.elementAdded 事件）
                    scene.add(newModel);

                    // 强制刷新场景
                    scene.forceRender = true;

                    console.log(`在巡检点位 ${pointName} 中复制模型，新名称: ${newMarkerName}`);
                    console.log('巡检模型原位复制完成，保持当前相机视角');
                }
            } catch (error) {
                console.error('复制巡检模型失败:', error);
            }
        }
    });

    // 巡检点位删除事件处理
    events.on('inspection.deletePoint', (pointName: string) => {
        const inspectionPoint = inspectionPoints.get(pointName);
        if (inspectionPoint) {
            try {
                // 删除所有相关模型
                for (const model of inspectionPoint.models) {
                    model.destroy();
                }

                // 从记录中移除
                inspectionPoints.delete(pointName);

                console.log(`删除巡检点位: ${pointName}`);
            } catch (error) {
                console.error('删除巡检点位失败:', error);
            }
        }
    });

    // 巡检点位可见性切换事件处理
    events.on('inspection.togglePointVisibility', (pointName: string, visible: boolean) => {
        const inspectionPoint = inspectionPoints.get(pointName);
        if (inspectionPoint) {
            try {
                // 设置所有相关模型的可见性
                for (const model of inspectionPoint.models) {
                    model.visible = visible;
                    if (model.entity) {
                        model.entity.enabled = visible;
                    }
                }

                console.log(`设置巡检点位 ${pointName} 可见性: ${visible}`);
            } catch (error) {
                console.error('设置巡检点位可见性失败:', error);
            }
        }
    });

    // 监听selection事件，当选择巡检模型时触发marker.selected事件
    events.on('selection', (element) => {
        if (element && (element as any).isInspectionModel) {
            // 触发marker选择事件以更新快照窗口
            events.fire('marker.selected', element);
            console.log('触发marker选择事件:', (element as any).inspectionMarkerName);
        } else {
            // 选择其他对象时隐藏快照窗口
            events.fire('snapshot.hide');
        }
    });

    // 监听marker位置变化（当模型被移动时）
    events.on('transform.changed', (element) => {
        if (element && (element as any).isInspectionModel) {
            // 触发marker变换事件以更新快照窗口
            events.fire('marker.transform', element);
            console.log('marker位置已变化:', (element as any).inspectionMarkerName);
        }
    });

    // 导出所有巡检点位的参数 - 显示导出面板
    events.on('inspection.exportParams', () => {
        events.fire('inspection.showExportPanel');
    });

    // 执行实际的导出操作
    events.on('inspection.doExport', (exportOptions: any) => {
        const allParams: any[] = [];

        // 只处理场景列表中的巡检点位模型
        for (const [pointName, inspectionPoint] of inspectionPoints) {
            // 为每个巡检点位收集数据
            for (let i = 0; i < inspectionPoint.models.length; i++) {
                const model = inspectionPoint.models[i];

                // 检查模型是否标记为巡检模型且在场景列表中
                const isInspectionModel = (model as any).isInspectionModel;
                const inspectionPointName = (model as any).inspectionPointName;

                // 只导出标记为巡检模型且属于场景列表巡检点位的模型
                if (!isInspectionModel || !inspectionPointName) {
                    continue;
                }

                const position = model.entity?.getPosition();
                const rotation = model.entity?.getRotation();
                const scale = model.entity?.getLocalScale();

                const rowData: any = {};

                // 根据导出选项添加数据
                if (exportOptions.pointName) {
                    rowData['巡检编号'] = pointName;
                }

                if (exportOptions.markerName) {
                    rowData['点位编号'] = (model as any).inspectionMarkerName || `${pointName}-${i + 1}`;
                }

                if (position) {
                    if (exportOptions.coordinateX) {
                        rowData['X坐标'] = position.x.toFixed(3);
                    }
                    if (exportOptions.coordinateY) {
                        rowData['Y坐标'] = position.y.toFixed(3);
                    }
                    if (exportOptions.coordinateZ) {
                        rowData['Z坐标'] = position.z.toFixed(3);
                    }
                }

                if (exportOptions.height && position) {
                    rowData['高度'] = position.z.toFixed(3);
                }

                if (rotation) {
                    // 将四元数转换为欧拉角（度）
                    const euler = rotation.getEulerAngles();
                    if (exportOptions.gimbalPitch) {
                        rowData['云台俯仰'] = euler.x.toFixed(2);
                    }
                    if (exportOptions.gimbalYaw) {
                        rowData['云台方向'] = euler.y.toFixed(2);
                    }
                }

                allParams.push(rowData);
            }
        }

        // 触发Excel导出事件
        events.fire('inspection.exportToExcel', allParams);

        console.log('导出场景列表巡检点位参数:', allParams);
    });
    // 相机参数更新事件处理
    events.on('camera.params.updated', (data: { marker: any, params: any }) => {
        console.log('相机参数已更新:', data.marker.name, data.params);

        // 更新巡检点位的相机参数
        const inspectionPoints = scene.inspectionPoints;
        const markerData = inspectionPoints.get(data.marker.name);

        if (markerData) {
            // 合并新参数到现有参数中
            markerData.cameraParams = {
                ...markerData.cameraParams,
                ...data.params,
                timestamp: Date.now()
            };

            console.log('巡检点位相机参数已更新:', data.marker.name, markerData.cameraParams);
        } else {
            console.warn('未找到对应的巡检点位数据:', data.marker.name);
        }

        // 触发场景更新
        scene.forceRender = true;
    });

    // 相机FOV调整事件
    events.on('camera.fov', (fov: number) => {
        console.log('相机FOV调整功能暂未实现');
    });

    // 相机近远裁剪面调整事件
    events.on('camera.clip', (data: { near?: number, far?: number }) => {
        console.log('相机近远裁剪面调整功能暂未实现');
    });

    // 相机光圈调整事件
    events.on('camera.aperture', (aperture: number) => {
        console.log('相机光圈调整功能暂未实现');
    });

    // 相机感光度调整事件
    events.on('camera.sensitivity', (sensitivity: number) => {
        console.log('相机感光度调整功能暂未实现');
    });

    // 相机快门调整事件
    events.on('camera.shutter', (shutter: number) => {
        console.log('相机快门调整功能暂未实现');
    });

    // 相机色调映射调整事件
    events.on('camera.toneMapping', (toneMapping: number) => {
        console.log('相机色调映射调整功能暂未实现');
    });

    // 相机位置和目标调整事件
    events.on('camera.transform', (data: { position?: Vec3, target?: Vec3 }) => {
        console.log('相机位置和目标调整功能暂未实现');
    });
};

export { registerEditorEvents };
