import { Container, Label, Element } from '@playcanvas/pcui';
import { Vec3 } from 'playcanvas';

import { ElementType } from '../element';
import { Events } from '../events';
import { GltfModel } from '../gltf-model';
import { Splat } from '../splat';
import { localize } from './localization';
import closeSvg from './svg/close_01.svg';
import lockSvg from './svg/lock_01.svg';
import unlockSvg from './svg/unlock_01.svg';
import { Tooltips } from './tooltips';

const createSvg = (svgString: string) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement;
};

// 属性面板类，显示选中GLB模型的详细信息
class PropertiesPanel extends Container {
    events: Events;
    tooltips: Tooltips;
    currentModel: GltfModel | null = null;
    currentSplat: Splat | null = null;
    private panelLocked: boolean = true; // 默认固定
    private pinButton?: Element;
    private closeButton?: Element;

    // 信息显示容器
    infoContainer: Container;
    placeholder: Label;
    nameLabel: Label;
    typeLabel: Label;

    // 几何信息标签
    boundingBoxLabel: Label;
    verticesLabel: Label;
    facesLabel: Label;

    // 变换信息标签
    positionLabel: Label;
    rotationLabel: Label;
    scaleLabel: Label;

    // 无人机飞控信息标签
    droneAltitudeLabel: Label;
    cameraGimbalPitchLabel: Label;
    cameraGimbalYawLabel: Label;

    // 可折叠容器和标题
    basicInfoHeader: Label;
    geometryHeader: Label;
    transformHeader: Label;
    droneInfoHeader: Label;
    basicInfoContainer: Container;
    geometryContainer: Container;
    transformContainer: Container;
    droneInfoContainer: Container;

    // 折叠状态
    private basicInfoCollapsed: boolean = false;
    private geometryCollapsed: boolean = false;
    private transformCollapsed: boolean = false;
    private droneInfoCollapsed: boolean = false;

    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            id: 'properties-panel',
            class: 'panel'
        };

        super(args);

        this.events = events;
        this.tooltips = tooltips;

        // stop pointer events bubbling
        ['pointerdown', 'pointerup', 'pointermove', 'wheel', 'dblclick'].forEach((eventName) => {
            this.dom.addEventListener(eventName, (event: Event) => event.stopPropagation());
        });

        this.createUI();
        this.bindEvents();

        // 添加拖拽功能
        this.addDragFunctionality();
    }

    private createUI() {
        // 面板头部
        const propertiesHeader = new Container({
            class: 'panel-header'
        });

        const propertiesIcon = new Label({
            text: '\uE30A', // 属性图标
            class: 'panel-header-icon'
        });

        const propertiesLabel = new Label({
            text: '属性',
            class: 'panel-header-label'
        });

        // 关闭按钮与固定按钮
        // 在标签与按钮之间加入弹性占位，保证按钮靠右对齐
        const headerSpacer = new Element({ class: 'panel-header-spacer' });

        // 固定/取消固定按钮（默认固定）
        const pinButton = new Element({ class: 'panel-header-pin' });
        // 复用关闭按钮的样式外观
        pinButton.class.add('panel-header-close');
        pinButton.dom.setAttribute('role', 'button');
        pinButton.dom.setAttribute('tabindex', '0');
        // 图标显示“将执行的动作”：当前为固定，显示“取消固定”图标
        pinButton.dom.title = '取消固定';
        pinButton.dom.appendChild(createSvg(unlockSvg));
        this.pinButton = pinButton;

        // 关闭按钮
        const closeButton = new Element({
            class: 'panel-header-close'
        });
        closeButton.dom.appendChild(createSvg(closeSvg));
        this.closeButton = closeButton;

        // 为关闭按钮注册提示气泡：仅在固定状态时显示，提示位置在右侧
        if (this.tooltips && this.panelLocked) {
            this.tooltips.register(closeButton, '请取消固定，方可关闭', 'right');
        }

        // 关闭按钮点击事件（固定时给出提示，不执行关闭）
        closeButton.dom.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (this.panelLocked) {
                // 固定时不允许关闭：在关闭按钮上方显示提示
                // 优先使用已注册的 Tooltips，若环境不支持 PointerEvent 则回退为 Toast
                if (this.tooltips) {
                    try {
                        closeButton.dom.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
                        window.setTimeout(() => {
                            closeButton.dom.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true }));
                        }, 1500);
                    } catch (_) {
                        this.events.fire('showToast', '请取消固定，方可关闭', 2000);
                    }
                } else {
                    this.events.fire('showToast', '请取消固定，方可关闭', 2000);
                }
                return; // 固定时不允许关闭
            }
            this.closePanel();
        });

        propertiesHeader.append(propertiesIcon);
        propertiesHeader.append(propertiesLabel);
        propertiesHeader.append(headerSpacer);
        propertiesHeader.append(pinButton);
        propertiesHeader.append(closeButton);

        // 主信息容器
        this.infoContainer = new Container({
            class: 'properties-info-container'
        });

        // 基本信息section
        this.basicInfoHeader = new Label({
            text: '▼ 基本信息',
            class: 'collapsible-header'
        });

        this.basicInfoContainer = new Container({
            class: 'collapsible-content'
        });

        this.nameLabel = new Label({
            text: '',
            class: 'properties-info-label'
        });
        this.nameLabel.dom.setAttribute('data-label', '名称');
        this.nameLabel.dom.setAttribute('data-value', '-');

        this.typeLabel = new Label({
            text: '',
            class: 'properties-info-label'
        });
        this.typeLabel.dom.setAttribute('data-label', '类型');
        this.typeLabel.dom.setAttribute('data-value', '-');

        // 将基本信息标签添加到容器
        this.basicInfoContainer.append(this.nameLabel);
        this.basicInfoContainer.append(this.typeLabel);

        // 几何信息section
        this.geometryHeader = new Label({
            text: '▼ 几何信息',
            class: 'collapsible-header'
        });

        this.geometryContainer = new Container({
            class: 'collapsible-content'
        });

        this.boundingBoxLabel = new Label({
            text: '',
            class: 'properties-info-label'
        });
        this.boundingBoxLabel.dom.setAttribute('data-label', '包围盒');
        this.boundingBoxLabel.dom.setAttribute('data-value', '-');

        this.verticesLabel = new Label({
            text: '',
            class: 'properties-info-label'
        });
        this.verticesLabel.dom.setAttribute('data-label', '顶点数');
        this.verticesLabel.dom.setAttribute('data-value', '-');

        this.facesLabel = new Label({
            text: '',
            class: 'properties-info-label'
        });
        this.facesLabel.dom.setAttribute('data-label', '面数');
        this.facesLabel.dom.setAttribute('data-value', '-');

        // 将几何信息标签添加到容器
        this.geometryContainer.append(this.boundingBoxLabel);
        this.geometryContainer.append(this.verticesLabel);
        this.geometryContainer.append(this.facesLabel);

        // 变换信息section
        this.transformHeader = new Label({
            text: '▼ 变换信息',
            class: 'collapsible-header'
        });

        this.transformContainer = new Container({
            class: 'collapsible-content'
        });

        this.positionLabel = new Label({
            text: '',
            class: 'properties-info-label'
        });
        this.positionLabel.dom.setAttribute('data-label', '位置');
        this.positionLabel.dom.setAttribute('data-value', '-');

        this.rotationLabel = new Label({
            text: '',
            class: 'properties-info-label'
        });
        this.rotationLabel.dom.setAttribute('data-label', '旋转');
        this.rotationLabel.dom.setAttribute('data-value', '-');

        this.scaleLabel = new Label({
            text: '',
            class: 'properties-info-label'
        });
        this.scaleLabel.dom.setAttribute('data-label', '缩放');
        this.scaleLabel.dom.setAttribute('data-value', '-');

        // 将变换信息标签添加到容器
        this.transformContainer.append(this.positionLabel);
        this.transformContainer.append(this.rotationLabel);
        this.transformContainer.append(this.scaleLabel);

        // 扩展信息section (GLB模型显示无人机飞控信息，高斯泼溅显示GIS信息)
        this.droneInfoHeader = new Label({
            text: '▼ 扩展信息',
            class: 'collapsible-header'
        });

        this.droneInfoContainer = new Container({
            class: 'collapsible-content'
        });

        // 无人机信息
        this.droneAltitudeLabel = new Label({
            text: '',
            class: 'properties-info-label'
        });
        this.droneAltitudeLabel.dom.setAttribute('data-label', '高度(Altitude)');
        this.droneAltitudeLabel.dom.setAttribute('data-value', '-');

        // 相机云台信息
        this.cameraGimbalPitchLabel = new Label({
            text: '',
            class: 'properties-info-label'
        });
        this.cameraGimbalPitchLabel.dom.setAttribute('data-label', '云台俯仰');
        this.cameraGimbalPitchLabel.dom.setAttribute('data-value', '-');

        this.cameraGimbalYawLabel = new Label({
            text: '',
            class: 'properties-info-label'
        });
        this.cameraGimbalYawLabel.dom.setAttribute('data-label', '云台方向');
        this.cameraGimbalYawLabel.dom.setAttribute('data-value', '-');

        // 将无人机信息标签添加到容器
        this.droneInfoContainer.append(this.droneAltitudeLabel);
        this.droneInfoContainer.append(this.cameraGimbalPitchLabel);
        this.droneInfoContainer.append(this.cameraGimbalYawLabel);

        // 添加点击事件处理
        this.addCollapsibleEvents();

        // 添加所有元素到容器
        // 基本信息部分
        this.infoContainer.append(this.basicInfoHeader);
        this.infoContainer.append(this.basicInfoContainer);

        this.infoContainer.append(new Container({ class: 'properties-spacer' }));

        // 几何信息部分
        this.infoContainer.append(this.geometryHeader);
        this.infoContainer.append(this.geometryContainer);

        this.infoContainer.append(new Container({ class: 'properties-spacer' }));

        // 变换信息部分
        this.infoContainer.append(this.transformHeader);
        this.infoContainer.append(this.transformContainer);

        this.infoContainer.append(new Container({ class: 'properties-spacer' }));

        // 扩展信息部分 (GLB模型：无人机飞控信息，高斯泼溅：GIS信息)
        this.infoContainer.append(this.droneInfoHeader);
        this.infoContainer.append(this.droneInfoContainer);

        // 占位符，当没有选中模型时显示
        this.placeholder = new Label({
            text: '选择一个GLB模型或高斯泼溅模型以查看属性',
            class: 'properties-placeholder'
        });

        this.append(propertiesHeader);
        this.append(this.placeholder);
        this.append(this.infoContainer);

        // 初始状态：隐藏整个面板，只有选中GLB模型时才显示
        this.hidden = true;
        this.infoContainer.hidden = true;

        // 固定/取消固定切换事件（用原生事件，确保SVG点击也可触发）
        pinButton.dom.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.panelLocked = !this.panelLocked;
            const container = this.pinButton!.dom;
            container.innerHTML = '';
            // 图标显示“将执行的动作”
            if (this.panelLocked) {
                // 当前为固定 -> 显示“取消固定”
                container.appendChild(createSvg(unlockSvg));
                container.title = '取消固定';
                // 固定状态下注册关闭提示（右侧）
                if (this.tooltips && this.closeButton) {
                    this.tooltips.register(this.closeButton, '请取消固定，方可关闭', 'right');
                }
            } else {
                // 当前为未固定 -> 显示“固定”
                container.appendChild(createSvg(lockSvg));
                container.title = '固定';
                // 未固定状态取消关闭提示
                if (this.tooltips && this.closeButton) {
                    this.tooltips.unregister(this.closeButton);
                }
            }
        });
    }

    private bindEvents() {
        // 监听选择变化事件（当选择不同元素时）
        this.events.on('selection.changed', (element: any) => {
            // 检查属性预览是否启用
            const attributePreviewEnabled = this.events.invoke('attribute.isEnabled');

            if (!attributePreviewEnabled) {
                // 如果属性预览未启用，隐藏面板
                this.hideProperties(true); // 菜单优先级更高：强制关闭
                return;
            }

            if (element && element.type === ElementType.model) {
                const model = element as GltfModel;
                this.currentModel = model;
                this.currentSplat = null;
                this.showPanel();
                this.showModelProperties(model);
            } else if (element && element.type === ElementType.splat) {
                const splat = element as Splat;
                this.currentSplat = splat;
                this.currentModel = null;
                this.showPanel();
                this.showSplatProperties(splat);
            } else {
                // 非强制：遵守固定状态
                this.hideProperties();
            }
        });

        // 监听相机焦点拾取事件（这个事件在每次点击时都会触发，包括点击同一个模型或高斯泼溅）
        this.events.on('camera.focalPointPicked', (details: { splat?: any, model?: GltfModel }) => {
            // 仅在“查看属性”功能启用时响应拾取事件
            const attributePreviewEnabled = this.events.invoke('attribute.isEnabled');
            if (!attributePreviewEnabled) {
                return;
            }
            // 选中 GLB 模型时显示属性
            // 移除调试日志：选中GLB模型
            if (details.model && details.model.type === ElementType.model) {
                // 检查模型是否可选择，不可选择的模型不显示属性面板
                if (!details.model.selectable) {
                    console.log('模型不可选择，跳过属性面板显示:', details.model.filename);
                    return;
                }

                console.log('选中GLB模型:', details.model.filename, '是否为巡检模型:', (details.model as any).isInspectionModel);

                // 显示属性面板
                this.currentModel = details.model;
                this.currentSplat = null;
                this.showPanel();
                this.showModelProperties(details.model);
            } else if (details.splat && details.splat.type === ElementType.splat) {
                // 检查高斯泼溅是否可选择，不可选择的不显示属性面板
                if (!details.splat.selectable) {
                    return;
                }
                // 显示属性面板
                this.currentSplat = details.splat;
                this.currentModel = null;
                this.showPanel();
                this.showSplatProperties(details.splat);
            } else {
                // 点击空白区域，非强制隐藏（尊重固定）
                this.hideProperties();
            }
        });

        // 监听属性预览状态变化事件
        this.events.on('attribute.statusChanged', (attributePreviewEnabled: boolean) => {
            if (!attributePreviewEnabled) {
                // 菜单关闭时：强制关闭并重置固定状态
                this.panelLocked = true;
                if (this.pinButton) {
                    const container = this.pinButton.dom;
                    container.innerHTML = '';
                    // 重置为固定状态时，图标显示“取消固定”
                    container.appendChild(createSvg(unlockSvg));
                    container.title = '取消固定';
                }
                this.hideProperties(true);
            } else {
                const currentSelection = this.events.invoke('selection');
                if (currentSelection) {
                    // 重新显示当前选中元素的属性
                    if (currentSelection.type === ElementType.model) {
                        this.currentModel = currentSelection;
                        this.currentSplat = null;
                        this.showPanel();
                        this.showModelProperties(currentSelection);
                    } else if (currentSelection.type === ElementType.splat) {
                        this.currentSplat = currentSelection;
                        this.currentModel = null;
                        this.showPanel();
                        this.showSplatProperties(currentSelection);
                    }
                }
            }
        });

        // 监听元素删除事件，防止访问已删除的模型引用
        this.events.on('scene.elementRemoved', (element: any) => {
            if (this.currentModel && element === this.currentModel) {
                // 当前显示的模型被删除，清理引用并隐藏面板（非强制，遵守固定）
                this.hideProperties();
            }
        });
    }

    // 显示面板
    private showPanel() {
        this.hidden = false;
    }

    // 关闭面板
    private closePanel() {
        this.hidden = true;
        this.currentModel = null;
    }

    private showModelProperties(model: GltfModel) {
        // 先清除之前的属性值和标签名称
        this.clearLabels();

        this.currentModel = model;
        this.currentSplat = null;
        this.placeholder.hidden = true;
        this.infoContainer.hidden = false;
        this.updateModelInfo();
    }

    private showSplatProperties(splat: Splat) {
        // 先清除之前的属性值和标签名称
        this.clearLabels();

        this.currentSplat = splat;
        this.currentModel = null;
        this.placeholder.hidden = true;
        this.infoContainer.hidden = false;
        this.updateSplatInfo();
    }

    private hideProperties(force = false) {
        if (!force && this.panelLocked) {
            return; // 固定时忽略非强制关闭
        }

        this.currentModel = null;
        this.currentSplat = null;
        this.placeholder.hidden = false;
        this.infoContainer.hidden = true;
        this.hidden = true; // 隐藏整个面板
        this.clearLabels();
    }

    private updateModelInfo() {
        if (!this.currentModel) {
            this.clearLabels();
            return;
        }

        const model = this.currentModel;

        // 检查模型和实体是否仍然有效（防止访问已删除的对象）
        if (!model.entity || !model.entity.enabled) {
            this.hideProperties();
            return;
        }

        // 显示巡检点位模型相关标签
        this.showRelevantLabels(true);

        try {
            // 为巡检点位模型设置专用的基本信息标签名称
            this.nameLabel.dom.setAttribute('data-label', '文件名称');
            this.typeLabel.dom.setAttribute('data-label', '模型类型');

            // 基本信息
            this.nameLabel.dom.setAttribute('data-value', model.filename || '未知');

            // 检查是否为巡检点位模型
            const isInspectionModel = (model as any).isInspectionModel;

            if (isInspectionModel) {
                // 巡检点位模型显示特殊类型
                this.typeLabel.dom.setAttribute('data-value', '巡检点位模型');

                // 为巡检点位模型显示专门的信息
                this.updateInspectionModelInfo(model);
            } else {
                // 普通GLB模型显示标准信息
                this.typeLabel.dom.setAttribute('data-value', 'GLB/glTF 模型');

                // 恢复普通GLB模型的标签名称
                this.boundingBoxLabel.dom.setAttribute('data-label', '包围盒');
                this.verticesLabel.dom.setAttribute('data-label', '顶点数');
                this.facesLabel.dom.setAttribute('data-label', '面数');
                this.positionLabel.dom.setAttribute('data-label', '位置');
                this.rotationLabel.dom.setAttribute('data-label', '旋转');
                this.scaleLabel.dom.setAttribute('data-label', '缩放');
                this.droneAltitudeLabel.dom.setAttribute('data-label', '高度(Altitude)');
                this.cameraGimbalPitchLabel.dom.setAttribute('data-label', '云台俯仰');
                this.cameraGimbalYawLabel.dom.setAttribute('data-label', '云台方向');

                // 显示所有容器
                this.geometryContainer.hidden = false;
                this.transformContainer.hidden = false;
                this.droneInfoContainer.hidden = false;

                // 几何信息
                this.updateGeometryInfo(model);

                // 变换信息
                this.updateTransformInfo(model);

                // 无人机飞控信息
                this.calculateDroneFlightParameters(model);
            }
        } catch (error) {
            // 如果访问模型数据时出现错误，说明模型可能已被删除
            console.warn('属性面板更新时出错，可能模型已被删除:', error);
            this.hideProperties();
        }
    }

    private updateSplatInfo() {
        if (!this.currentSplat) {
            this.clearLabels();
            return;
        }

        const splat = this.currentSplat;

        // 检查高斯泼溅模型是否仍然有效
        if (!splat.entity || !splat.visible) {
            // 如果模型被隐藏，仍然显示属性，但标注状态
            // this.hideProperties();
            // return;
        }

        // 显示高斯模型相关标签
        this.showRelevantLabels(false);

        try {
            // 为高斯模型设置专用的基本信息标签名称
            this.nameLabel.dom.setAttribute('data-label', '模型名称');
            this.typeLabel.dom.setAttribute('data-label', '模型类型');

            // 基本信息
            this.nameLabel.dom.setAttribute('data-value', `${splat.name || splat.filename || '未知'}`);
            this.typeLabel.dom.setAttribute('data-value', '高斯泼溅模型 (PLY/SPLAT)');

            // 几何信息 - 高斯泼溅特有信息
            this.updateSplatGeometryInfo(splat);

            // 变换信息
            this.updateSplatTransformInfo(splat);

            // GIS信息 - 高斯泼溅的坐标和空间信息
            this.calculateSplatGISInfo(splat);
        } catch (error) {
            console.warn('高斯泼溅属性面板更新时出错:', error);
            this.hideProperties();
        }
    }

    private updateGeometryInfo(model: GltfModel) {
        try {
            // 包围盒信息
            const bound = model.worldBound;
            if (bound) {
                const size = new Vec3().copy(bound.halfExtents).mulScalar(2);
                this.boundingBoxLabel.dom.setAttribute('data-value', `${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}`);
            } else {
                this.boundingBoxLabel.dom.setAttribute('data-value', '无法计算');
            }

            // 统计顶点和面数
            let totalVertices = 0;
            let totalFaces = 0;

            if (model.entity && model.entity.enabled) {
                this.countMeshData(model.entity, (vertices, faces) => {
                    totalVertices += vertices;
                    totalFaces += faces;
                });
            }

            this.verticesLabel.dom.setAttribute('data-value', totalVertices.toLocaleString());
            this.facesLabel.dom.setAttribute('data-value', totalFaces.toLocaleString());
        } catch (error) {
            // 如果计算几何信息时出错，显示错误状态
            this.boundingBoxLabel.dom.setAttribute('data-value', '计算错误');
            this.verticesLabel.dom.setAttribute('data-value', '计算错误');
            this.facesLabel.dom.setAttribute('data-value', '计算错误');
        }
    }

    private updateTransformInfo(model: GltfModel) {
        if (!model.entity || !model.entity.enabled) {
            this.positionLabel.dom.setAttribute('data-value', '-');
            this.rotationLabel.dom.setAttribute('data-value', '-');
            this.scaleLabel.dom.setAttribute('data-value', '-');
            return;
        }

        try {
            const entity = model.entity;
            const pos = entity.getPosition();
            const rot = entity.getRotation();
            const scale = entity.getLocalScale();

            // 位置信息
            this.positionLabel.dom.setAttribute('data-value', `(${pos.x.toFixed(3)}, ${pos.y.toFixed(3)}, ${pos.z.toFixed(3)})`);

            // 旋转信息 (转换为欧拉角显示)
            const euler = rot.getEulerAngles();
            this.rotationLabel.dom.setAttribute('data-value', `(${euler.x.toFixed(1)}°, ${euler.y.toFixed(1)}°, ${euler.z.toFixed(1)}°)`);

            // 缩放信息
            this.scaleLabel.dom.setAttribute('data-value', `(${scale.x.toFixed(3)}, ${scale.y.toFixed(3)}, ${scale.z.toFixed(3)})`);
        } catch (error) {
            // 如果获取变换信息时出错，显示错误状态
            this.positionLabel.dom.setAttribute('data-value', '获取错误');
            this.rotationLabel.dom.setAttribute('data-value', '获取错误');
            this.scaleLabel.dom.setAttribute('data-value', '获取错误');
        }
    }

    private countMeshData(entity: any, callback: (vertices: number, faces: number) => void) {
        if (!entity || !entity.enabled) {
            return;
        }

        try {
            // 统计当前实体的mesh数据
            if (entity.render && entity.render.meshInstances) {
                entity.render.meshInstances.forEach((meshInstance: any) => {
                    // 检查meshInstance是否有效且不为null
                    if (meshInstance && meshInstance.mesh) {
                        const mesh = meshInstance.mesh;
                        const vertices = mesh.vertexBuffer ? mesh.vertexBuffer.numVertices : 0;
                        const indices = mesh.indexBuffer ? mesh.indexBuffer.numIndices : vertices;
                        const faces = Math.floor(indices / 3);
                        callback(vertices, faces);
                    }
                });
            }

            // 递归处理子实体
            if (entity.children && entity.children.length > 0) {
                entity.children.forEach((child: any) => {
                    this.countMeshData(child, callback);
                });
            }
        } catch (error) {
            // 忽略统计过程中的错误，避免阻塞UI更新
            console.warn('统计网格数据时出错:', error);
        }
    }

    private clearLabels() {
        // 清除data-value属性（用于巡检点位模型）
        this.nameLabel.dom.setAttribute('data-value', '');
        this.typeLabel.dom.setAttribute('data-value', '');
        this.boundingBoxLabel.dom.setAttribute('data-value', '');
        this.verticesLabel.dom.setAttribute('data-value', '');
        this.facesLabel.dom.setAttribute('data-value', '');
        this.positionLabel.dom.setAttribute('data-value', '');
        this.rotationLabel.dom.setAttribute('data-value', '');
        this.scaleLabel.dom.setAttribute('data-value', '');

        // 清除text属性（用于高斯模型）
        this.nameLabel.text = '';
        this.typeLabel.text = '';
        this.boundingBoxLabel.text = '';
        this.verticesLabel.text = '';
        this.facesLabel.text = '';
        this.positionLabel.text = '';
        this.rotationLabel.text = '';
        this.scaleLabel.text = '';

        // 隐藏所有标签以避免空白行
        this.hideAllLabels();

        // 重置标签名称为默认值
        this.resetLabelNames();

        // 清空无人机飞控标签
        this.clearDroneLabels();
    }

    private resetLabelNames() {
        // 重置几何信息标签名称
        this.boundingBoxLabel.dom.setAttribute('data-label', '包围盒');
        this.verticesLabel.dom.setAttribute('data-label', '顶点数');
        this.facesLabel.dom.setAttribute('data-label', '面数');

        // 重置变换信息标签名称
        this.positionLabel.dom.setAttribute('data-label', '位置');
        this.rotationLabel.dom.setAttribute('data-label', '旋转');
        this.scaleLabel.dom.setAttribute('data-label', '缩放');

        // 重置无人机飞控信息标签名称
        this.droneAltitudeLabel.dom.setAttribute('data-label', '高度(Altitude)');
        this.cameraGimbalPitchLabel.dom.setAttribute('data-label', '云台俯仰');
        this.cameraGimbalYawLabel.dom.setAttribute('data-label', '云台方向');
    }

    private hideAllLabels() {
        // 隐藏基本信息标签
        this.nameLabel.dom.style.display = 'none';
        this.typeLabel.dom.style.display = 'none';

        // 隐藏几何信息标签
        this.boundingBoxLabel.dom.style.display = 'none';
        this.verticesLabel.dom.style.display = 'none';
        this.facesLabel.dom.style.display = 'none';

        // 隐藏变换信息标签
        this.positionLabel.dom.style.display = 'none';
        this.rotationLabel.dom.style.display = 'none';
        this.scaleLabel.dom.style.display = 'none';

        // 隐藏无人机飞控信息标签
        this.droneAltitudeLabel.dom.style.display = 'none';
        this.cameraGimbalPitchLabel.dom.style.display = 'none';
        this.cameraGimbalYawLabel.dom.style.display = 'none';
    }

    private showRelevantLabels(isModel: boolean) {
        if (isModel) {
            // 显示巡检点位模型相关标签
            this.nameLabel.dom.style.display = 'grid';
            this.typeLabel.dom.style.display = 'grid';
            this.boundingBoxLabel.dom.style.display = 'grid';
            this.verticesLabel.dom.style.display = 'grid';
            this.facesLabel.dom.style.display = 'grid';
            this.positionLabel.dom.style.display = 'grid';
            this.rotationLabel.dom.style.display = 'grid';
            this.scaleLabel.dom.style.display = 'grid';
            this.droneAltitudeLabel.dom.style.display = 'grid';
            this.cameraGimbalPitchLabel.dom.style.display = 'grid';
            this.cameraGimbalYawLabel.dom.style.display = 'grid';
        } else {
            // 显示高斯模型相关标签
            this.nameLabel.dom.style.display = 'grid';
            this.typeLabel.dom.style.display = 'grid';
            this.boundingBoxLabel.dom.style.display = 'grid';
            this.verticesLabel.dom.style.display = 'grid';
            this.facesLabel.dom.style.display = 'grid';
            this.positionLabel.dom.style.display = 'grid';
            this.rotationLabel.dom.style.display = 'grid';
            this.scaleLabel.dom.style.display = 'grid';
            // 高斯模型复用无人机标签显示GIS信息
            this.droneAltitudeLabel.dom.style.display = 'grid';
            this.cameraGimbalPitchLabel.dom.style.display = 'grid';
            this.cameraGimbalYawLabel.dom.style.display = 'grid';
        }
    }

    private addDragFunctionality() {
        let isDragging = false;
        const dragOffset = { x: 0, y: 0 };
        let dragHandle: HTMLElement | null = null;

        // 找到面板头部作为拖拽句柄
        const headerElements = this.dom.querySelectorAll('.panel-header');
        if (headerElements.length > 0) {
            dragHandle = headerElements[0] as HTMLElement;
            dragHandle.style.cursor = 'move';

            const onPointerDown = (e: PointerEvent) => {
                // 只响应左键点击
                if (e.button !== 0) return;

                // 检查点击的是否是关闭或固定按钮，如果是则不进行拖拽
                const target = e.target as HTMLElement;
                if (target.closest('.panel-header-close') || target.closest('.panel-header-pin')) {
                    return;
                }

                isDragging = true;
                const rect = this.dom.getBoundingClientRect();
                dragOffset.x = e.clientX - rect.left;
                dragOffset.y = e.clientY - rect.top;

                // 设置面板为绝对定位
                this.dom.style.position = 'absolute';
                this.dom.style.zIndex = '1000';

                // 捕获指针，确保鼠标移出元素时仍能响应事件
                dragHandle!.setPointerCapture(e.pointerId);

                e.preventDefault();
                e.stopPropagation();
            };

            const onPointerMove = (e: PointerEvent) => {
                if (!isDragging) return;

                const newX = e.clientX - dragOffset.x;
                const newY = e.clientY - dragOffset.y;

                // 限制拖拽范围在窗口内
                const maxX = window.innerWidth - this.dom.offsetWidth;
                const maxY = window.innerHeight - this.dom.offsetHeight;

                const clampedX = Math.max(0, Math.min(newX, maxX));
                const clampedY = Math.max(0, Math.min(newY, maxY));

                // 只有在实际拖拽时才改变位置属性
                // 如果面板还在初始位置（使用right定位），则改为left定位
                if (this.dom.style.right && this.dom.style.right !== 'auto') {
                    this.dom.style.right = 'auto';
                }
                this.dom.style.left = `${clampedX}px`;
                this.dom.style.top = `${clampedY}px`;
                this.dom.style.bottom = 'auto';

                e.preventDefault();
            };

            const onPointerUp = (e: PointerEvent) => {
                if (isDragging) {
                    isDragging = false;
                    this.dom.style.zIndex = '100';

                    // 释放指针捕获
                    if (dragHandle!.hasPointerCapture(e.pointerId)) {
                        dragHandle!.releasePointerCapture(e.pointerId);
                    }
                }
            };

            // 绑定事件到拖拽句柄
            dragHandle.addEventListener('pointerdown', onPointerDown);
            dragHandle.addEventListener('pointermove', onPointerMove);
            dragHandle.addEventListener('pointerup', onPointerUp);

            // 处理指针取消事件（例如触摸被中断）
            dragHandle.addEventListener('pointercancel', onPointerUp);
        }
    }

    private addCollapsibleEvents() {
        // 基本信息点击事件
        this.basicInfoHeader.dom.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggleBasicInfo();
        });

        // 几何信息点击事件
        this.geometryHeader.dom.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggleGeometry();
        });

        // 变换信息点击事件
        this.transformHeader.dom.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggleTransform();
        });

        // 扩展信息点击事件
        this.droneInfoHeader.dom.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggleDroneInfo();
        });
    }

    private toggleBasicInfo() {
        this.basicInfoCollapsed = !this.basicInfoCollapsed;
        this.basicInfoContainer.hidden = this.basicInfoCollapsed;
        this.basicInfoHeader.text = this.basicInfoCollapsed ? '▶ 基本信息' : '▼ 基本信息';
    }

    private toggleGeometry() {
        this.geometryCollapsed = !this.geometryCollapsed;
        this.geometryContainer.hidden = this.geometryCollapsed;
        this.geometryHeader.text = this.geometryCollapsed ? '▶ 几何信息' : '▼ 几何信息';
    }

    private toggleTransform() {
        this.transformCollapsed = !this.transformCollapsed;
        this.transformContainer.hidden = this.transformCollapsed;
        this.transformHeader.text = this.transformCollapsed ? '▶ 变换信息' : '▼ 变换信息';
    }

    private toggleDroneInfo() {
        this.droneInfoCollapsed = !this.droneInfoCollapsed;
        this.droneInfoContainer.hidden = this.droneInfoCollapsed;
        this.droneInfoHeader.text = this.droneInfoCollapsed ? '▶ 扩展信息' : '▼ 扩展信息';
    }

    // 计算无人机飞控参数
    private calculateDroneFlightParameters(model: GltfModel) {
        if (!model.entity || !model.entity.enabled) {
            this.clearDroneLabels();
            return;
        }

        try {
            const entity = model.entity;
            const pos = entity.getPosition();
            const rot = entity.getRotation();

            // 获取欧拉角 (以度为单位)
            const euler = rot.getEulerAngles();

            // 无人机飞控标准参数转换
            // 注意：PlayCanvas使用左手坐标系，Y轴向上

            // 获取原始角度值
            const originalYaw = -euler.y; // 原偏航角
            const originalPitch = euler.x; // 原俯仰角 (修正符号，确保Z负方向为负值)
            const originalRoll = euler.z; // 原横滚角

            // 高度(Altitude) - Z坐标即为高度（修正为使用Z值）
            const altitude = pos.z;

            // 根据新的要求重新分配参数：
            // 云台俯仰角 = 原俯仰角的值，限制在-90°到90°范围内
            const gimbalPitch = this.clampPitchAngle(originalPitch);

            // 云台方向 = 原横滚角的值
            const gimbalYaw = this.clampAngle(originalRoll, -180, 180);

            // 更新标签显示
            this.droneAltitudeLabel.dom.setAttribute('data-value', `${altitude.toFixed(3)}m`);
            this.cameraGimbalPitchLabel.dom.setAttribute('data-value', `${gimbalPitch.toFixed(1)}°`);
            this.cameraGimbalYawLabel.dom.setAttribute('data-value', `${gimbalYaw.toFixed(1)}°`);

        } catch (error) {
            console.warn('计算无人机飞控参数时出错:', error);
            this.clearDroneLabels();
        }
    }

    // 角度标准化到 -180 到 180 度
    private normalizeAngle(angle: number): number {
        while (angle > 180) angle -= 360;
        while (angle < -180) angle += 360;
        return angle;
    }

    // 角度限制在指定范围内
    private clampAngle(angle: number, min: number, max: number): number {
        return Math.max(min, Math.min(max, angle));
    }

    // 俯仰角限制在-90°到90°范围内
    private clampPitchAngle(angle: number): number {
        return Math.max(-90, Math.min(90, angle));
    }

    // 清空无人机飞控标签
    private clearDroneLabels() {
        // 清除data-value属性
        this.droneAltitudeLabel.dom.setAttribute('data-value', '');
        this.cameraGimbalPitchLabel.dom.setAttribute('data-value', '');
        this.cameraGimbalYawLabel.dom.setAttribute('data-value', '');

        // 清除text属性
        this.droneAltitudeLabel.text = '';
        this.cameraGimbalPitchLabel.text = '';
        this.cameraGimbalYawLabel.text = '';
    }

    // 巡检点位模型专用信息更新
    private updateInspectionModelInfo(model: GltfModel) {
        if (!model.entity || !model.entity.enabled) {
            this.clearDroneLabels();
            return;
        }

        try {
            const entity = model.entity;
            const pos = entity.getPosition();
            const rot = entity.getRotation();

            // 获取欧拉角 (以度为单位)
            const euler = rot.getEulerAngles();

            // 巡检点位专用参数计算
            // 高度信息 - 使用Z坐标作为高度
            const height = pos.z;

            // 云台俯仰 - 使用X轴旋转角度，限制在-90°到90°范围内
            const gimbalPitch = this.clampPitchAngle(euler.x);

            // 云台朝向 - 使用Y轴旋转角度，标准化到-180°到180°范围内
            const gimbalYaw = this.normalizeAngle(-euler.y);

            // 为巡检模型动态更新标签名称
            this.droneAltitudeLabel.dom.setAttribute('data-label', '巡检高度');
            this.cameraGimbalPitchLabel.dom.setAttribute('data-label', '相机俯仰角');
            this.cameraGimbalYawLabel.dom.setAttribute('data-label', '相机方位角');

            // 更新标签显示巡检点位专用信息
            this.droneAltitudeLabel.dom.setAttribute('data-value', `${height.toFixed(3)}m`);
            this.cameraGimbalPitchLabel.dom.setAttribute('data-value', `${gimbalPitch.toFixed(1)}°`);
            this.cameraGimbalYawLabel.dom.setAttribute('data-value', `${gimbalYaw.toFixed(1)}°`);

            // 为巡检模型显示实际的几何和变换信息
            this.updateInspectionGeometryInfo(model);
            this.updateInspectionTransformInfo(model);

            // 显示所有容器
            this.basicInfoContainer.hidden = false;
            this.geometryContainer.hidden = false;
            this.transformContainer.hidden = false;
            this.droneInfoContainer.hidden = false;

        } catch (error) {
            console.warn('计算巡检点位参数时出错:', error);
            this.clearDroneLabels();
        }
    }

    // 巡检模型几何信息更新
    private updateInspectionGeometryInfo(model: GltfModel) {
        try {
            // 为巡检模型动态更新几何信息标签名称
            this.boundingBoxLabel.dom.setAttribute('data-label', '模型尺寸');
            this.verticesLabel.dom.setAttribute('data-label', '顶点数量');
            this.facesLabel.dom.setAttribute('data-label', '面片数量');

            // 获取模型的包围盒信息
            const entity = model.entity;
            if (entity && entity.render && entity.render.meshInstances.length > 0) {
                // 计算所有网格实例的聚合包围盒
                let minX = Infinity, minY = Infinity, minZ = Infinity;
                let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

                entity.render.meshInstances.forEach((meshInstance: any) => {
                    const aabb = meshInstance.aabb;
                    if (aabb && aabb.min && aabb.max) {
                        minX = Math.min(minX, aabb.min.x);
                        minY = Math.min(minY, aabb.min.y);
                        minZ = Math.min(minZ, aabb.min.z);
                        maxX = Math.max(maxX, aabb.max.x);
                        maxY = Math.max(maxY, aabb.max.y);
                        maxZ = Math.max(maxZ, aabb.max.z);
                    }
                });

                if (isFinite(minX)) {
                    const width = maxX - minX;
                    const height = maxY - minY;
                    const depth = maxZ - minZ;
                    this.boundingBoxLabel.dom.setAttribute('data-value',
                        `${width.toFixed(3)} × ${height.toFixed(3)} × ${depth.toFixed(3)}m`);
                } else {
                    this.boundingBoxLabel.dom.setAttribute('data-value', '无法计算');
                }

                // 计算顶点数和面数
                let totalVertices = 0;
                let totalFaces = 0;
                this.countMeshData(entity, (vertices: number, faces: number) => {
                    totalVertices += vertices;
                    totalFaces += faces;
                });

                this.verticesLabel.dom.setAttribute('data-value', totalVertices.toLocaleString());
                this.facesLabel.dom.setAttribute('data-value', totalFaces.toLocaleString());
            } else {
                this.boundingBoxLabel.dom.setAttribute('data-value', '无几何数据');
                this.verticesLabel.dom.setAttribute('data-value', '0');
                this.facesLabel.dom.setAttribute('data-value', '0');
            }
        } catch (error) {
            console.warn('更新巡检模型几何信息时出错:', error);
            this.boundingBoxLabel.dom.setAttribute('data-value', '计算错误');
            this.verticesLabel.dom.setAttribute('data-value', '-');
            this.facesLabel.dom.setAttribute('data-value', '-');
        }
    }

    // 巡检模型变换信息更新
    private updateInspectionTransformInfo(model: GltfModel) {
        try {
            // 为巡检模型动态更新变换信息标签名称
            this.positionLabel.dom.setAttribute('data-label', '世界坐标');
            this.rotationLabel.dom.setAttribute('data-label', '旋转角度');
            this.scaleLabel.dom.setAttribute('data-label', '缩放比例');

            const entity = model.entity;
            if (entity) {
                const pos = entity.getPosition();
                const rot = entity.getRotation();
                const scale = entity.getLocalScale();

                // 位置信息
                this.positionLabel.dom.setAttribute('data-value',
                    `X: ${pos.x.toFixed(3)}, Y: ${pos.y.toFixed(3)}, Z: ${pos.z.toFixed(3)}`);

                // 旋转信息 (转换为欧拉角)
                const euler = rot.getEulerAngles();
                this.rotationLabel.dom.setAttribute('data-value',
                    `X: ${euler.x.toFixed(1)}°, Y: ${euler.y.toFixed(1)}°, Z: ${euler.z.toFixed(1)}°`);

                // 缩放信息
                this.scaleLabel.dom.setAttribute('data-value',
                    `X: ${scale.x.toFixed(3)}, Y: ${scale.y.toFixed(3)}, Z: ${scale.z.toFixed(3)}`);
            } else {
                this.positionLabel.dom.setAttribute('data-value', '无变换数据');
                this.rotationLabel.dom.setAttribute('data-value', '无变换数据');
                this.scaleLabel.dom.setAttribute('data-value', '无变换数据');
            }
        } catch (error) {
            console.warn('更新巡检模型变换信息时出错:', error);
            this.positionLabel.dom.setAttribute('data-value', '计算错误');
            this.rotationLabel.dom.setAttribute('data-value', '计算错误');
            this.scaleLabel.dom.setAttribute('data-value', '计算错误');
        }
    }

    // 高斯泼溅模型几何信息更新
    private updateSplatGeometryInfo(splat: Splat) {
        try {
            // 为高斯模型设置专用的几何信息标签名称
            this.boundingBoxLabel.dom.setAttribute('data-label', '空间范围');
            this.verticesLabel.dom.setAttribute('data-label', '总高斯点数');
            this.facesLabel.dom.setAttribute('data-label', '有效点数');

            // 包围盒信息
            const bound = splat.worldBound;
            if (bound) {
                const size = new Vec3().copy(bound.halfExtents).mulScalar(2);
                this.boundingBoxLabel.dom.setAttribute('data-value', `${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}`);
            } else {
                this.boundingBoxLabel.dom.setAttribute('data-value', '无法计算');
            }

            // 高斯泼溅特有信息
            this.verticesLabel.dom.setAttribute('data-value', `${splat.numSplats.toLocaleString()}`);
            this.facesLabel.dom.setAttribute('data-value', `${(splat.numSplats - splat.numDeleted).toLocaleString()}`);
        } catch (error) {
            this.boundingBoxLabel.dom.setAttribute('data-value', '计算错误');
            this.verticesLabel.dom.setAttribute('data-value', '计算错误');
            this.facesLabel.dom.setAttribute('data-value', '计算错误');
        }
    }

    // 高斯泼溅模型变换信息更新
    private updateSplatTransformInfo(splat: Splat) {
        // 为高斯模型设置专用的变换信息标签名称
        this.positionLabel.dom.setAttribute('data-label', '中心位置');
        this.rotationLabel.dom.setAttribute('data-label', '旋转状态');
        this.scaleLabel.dom.setAttribute('data-label', '缩放系数');

        if (!splat.entity) {
            this.positionLabel.dom.setAttribute('data-value', '-');
            this.rotationLabel.dom.setAttribute('data-value', '-');
            this.scaleLabel.dom.setAttribute('data-value', '-');
            return;
        }

        try {
            const entity = splat.entity;
            const pos = entity.getPosition();
            const rot = entity.getRotation();
            const scale = entity.getLocalScale();

            // 位置信息
            this.positionLabel.dom.setAttribute('data-value', `(${pos.x.toFixed(3)}, ${pos.y.toFixed(3)}, ${pos.z.toFixed(3)})`);

            // 旋转信息 (转换为欧拉角显示)
            const euler = rot.getEulerAngles();
            this.rotationLabel.dom.setAttribute('data-value', `(${euler.x.toFixed(1)}°, ${euler.y.toFixed(1)}°, ${euler.z.toFixed(1)}°)`);

            // 缩放信息
            this.scaleLabel.dom.setAttribute('data-value', `(${scale.x.toFixed(3)}, ${scale.y.toFixed(3)}, ${scale.z.toFixed(3)})`);
        } catch (error) {
            this.positionLabel.dom.setAttribute('data-value', '获取失败');
            this.rotationLabel.dom.setAttribute('data-value', '获取失败');
            this.scaleLabel.dom.setAttribute('data-value', '获取失败');
        }
    }

    // 计算高斯泼溅模型的GIS信息
    private calculateSplatGISInfo(splat: Splat) {
        if (!splat.entity) {
            this.clearDroneLabels();
            return;
        }

        try {
            const entity = splat.entity;
            const pos = entity.getPosition();
            const rot = entity.getRotation();

            // 获取中心点位置作为GIS坐标参考
            const centerPoint = splat.worldBound?.center || pos;

            // 模拟GIS坐标信息 (实际应用中应从模型元数据或配置中获取)
            // 这里使用世界坐标作为示例
            const longitude = centerPoint.x; // 经度 (应转换为真实地理坐标)
            const latitude = centerPoint.z;  // 纬度 (应转换为真实地理坐标)
            const altitude = centerPoint.y;  // 高度

            // 获取模型朝向信息
            const euler = rot.getEulerAngles();
            const heading = this.normalizeAngle(-euler.y); // 航向角

            // 更新显示标签 (复用无人机信息标签)
            this.droneAltitudeLabel.dom.setAttribute('data-value', `${altitude.toFixed(3)}m`);
            this.droneAltitudeLabel.dom.setAttribute('data-label', '海拔高度');

            this.cameraGimbalPitchLabel.dom.setAttribute('data-value', `(${longitude.toFixed(6)}, ${latitude.toFixed(6)})`);
            this.cameraGimbalPitchLabel.dom.setAttribute('data-label', '地理坐标');

            this.cameraGimbalYawLabel.dom.setAttribute('data-value', `${heading.toFixed(1)}°`);
            this.cameraGimbalYawLabel.dom.setAttribute('data-label', '模型朝向');

        } catch (error) {
            console.warn('计算高斯泼溅GIS信息时出错:', error);
            this.clearDroneLabels();
        }
    }
}

export { PropertiesPanel };
