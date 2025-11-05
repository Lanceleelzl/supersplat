import { Element, ElementType } from './element';
import { Events } from './events';
import { GltfModel } from './gltf-model';
import { Scene } from './scene';
import { Splat } from './splat';

// 注册选择相关的事件处理函数
const registerSelectionEvents = (events: Events, scene: Scene) => {
    let selection: Element = null;

    const setSelection = (element: Element, fromUserInteraction = false) => {
        // 检查元素是否可见（对Splat和GltfModel都适用）
        let isVisible = true;
        if (element?.type === ElementType.splat) {
            isVisible = (element as Splat).visible;
        } else if (element?.type === ElementType.model) {
            isVisible = (element as GltfModel).entity?.enabled !== false;
        }

        // 检查元素是否可选中
        let isSelectable = true;
        if (element) {
            isSelectable = element.selectable;
        }

        if (element !== selection && (!element || (isVisible && isSelectable))) {
            const prev = selection;
            selection = element;
            events.fire('selection.changed', selection, prev);

            // 强制渲染以立即更新高亮效果
            if (scene.forceRender !== undefined) {
                scene.forceRender = true;
            }

            // 注释：关闭GLB模型选择时的弹窗提示，改用右上角属性面板显示信息
            // if (element && element.type === ElementType.model && fromUserInteraction) {
            //     const model = element as GltfModel;
            //     events.invoke('showPopup', {
            //         type: 'info',
            //         header: '模型已选择',
            //         message: `选中的模型: ${model.filename || '未知'}\n类型: GLB/glTF 模型\n可见: ${model.visible ? '是' : '否'}`
            //     });
            // }
        }
    };

    events.on('selection', (element: Element) => {
        setSelection(element);
    });

    events.function('selection', () => {
        return selection;
    });

    events.on('selection.next', () => {
        const elements = [
            ...scene.getElementsByType(ElementType.splat),
            ...scene.getElementsByType(ElementType.model)
        ];
        if (elements.length > 1) {
            const idx = elements.indexOf(selection);
            setSelection(elements[(idx + 1) % elements.length]);
        }
    });

    events.on('scene.elementAdded', (element: Element) => {
        if (element.type === ElementType.splat || element.type === ElementType.model) {
            setSelection(element);
        }
    });

    events.on('scene.elementRemoved', (element: Element) => {
        if (element === selection) {
            const elements = [
                ...scene.getElementsByType(ElementType.splat),
                ...scene.getElementsByType(ElementType.model)
            ];
            setSelection(elements.length === 1 ? null : elements.find(v => v !== element));
        }
    });

    events.on('splat.visibility', (splat: Splat) => {
        if (splat === selection && !splat.visible) {
            setSelection(null);
        }
    });

    events.on('model.visibility', (model: GltfModel) => {
        if (model === selection && !model.entity?.enabled) {
            setSelection(null);
        }
    });

    events.on('camera.focalPointPicked', (details: { splat?: Splat, model?: GltfModel }) => {
        // 坐标查询等工具激活时，禁用选择更新
        const preventSelection = events.invoke('tool.preventSelectionOnClick');
        if (preventSelection) {
            return;
        }

        // 拖拽过程中或刚刚结束拖拽时，不处理点击拾取，避免误清空选择
        const ignore = events.invoke('tool.shouldIgnoreClick');
        if (ignore) {
            return;
        }

        if (details.splat) {
            setSelection(details.splat, true); // true indicates user interaction
        } else if (details.model) {
            setSelection(details.model, true); // true indicates user interaction
        } else {
            // 点击空白区域时清空选择
            setSelection(null, true);
        }
    });
};

export { registerSelectionEvents };
