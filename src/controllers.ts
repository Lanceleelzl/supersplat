import { Vec3 } from 'playcanvas';

import { Camera } from './camera';
// Removed unused ElementType / GltfModel imports after simplifying picking logic

const fromWorldPoint = new Vec3();
const toWorldPoint = new Vec3();
const worldDiff = new Vec3();

// calculate the distance between two 2d points
const dist = (x0: number, y0: number, x1: number, y1: number) => Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2);

class PointerController {
    update: (deltaTime: number) => void;
    destroy: () => void;

    constructor(camera: Camera, target: HTMLElement) {

        const orbit = (dx: number, dy: number) => {
            // 检查是否允许旋转操作
            const orbitData = { dx, dy };
            camera.scene.events.fire('camera.beforeOrbit', orbitData);
            
            // 如果dx/dy被修改为0，则不执行旋转
            if (orbitData.dx === 0 && orbitData.dy === 0) {
                return;
            }
            
            const azim = camera.azim - orbitData.dx * camera.scene.config.controls.orbitSensitivity;
            const elev = camera.elevation - orbitData.dy * camera.scene.config.controls.orbitSensitivity;
            camera.setAzimElev(azim, elev);
        };

        const pan = (x: number, y: number, dx: number, dy: number) => {
            // 检查是否允许平移操作
            const panData = { x, y, dx, dy, allowed: true };
            camera.scene.events.fire('camera.beforePan', panData);
            if (!panData.allowed) {
                return;
            }
            
            // For panning to work at any zoom level, we use screen point to world projection
            // to work out how far we need to pan the pivotEntity in world space
            const c = camera.entity.camera;
            const distance = camera.distanceTween.value.distance * camera.sceneRadius / camera.fovFactor;

            c.screenToWorld(x, y, distance, fromWorldPoint);
            c.screenToWorld(x - dx, y - dy, distance, toWorldPoint);

            worldDiff.sub2(toWorldPoint, fromWorldPoint);
            worldDiff.add(camera.focalPoint);

            camera.setFocalPoint(worldDiff);
        };

        const zoom = (amount: number) => {
            // 检查是否允许缩放操作
            const zoomData = { amount, allowed: true };
            camera.scene.events.fire('camera.beforeZoom', zoomData);
            if (!zoomData.allowed) {
                return;
            }
            
            camera.setDistance(camera.distance - (camera.distance * 0.999 + 0.001) * zoomData.amount * camera.scene.config.controls.zoomSensitivity, 2);
        };

        // mouse state
        let pressedButton = -1;  // no button pressed, otherwise 0, 1, or 2
        let x: number, y: number;

        // touch state
        let touches: { id: number, x: number, y: number}[] = [];
        let midx: number, midy: number, midlen: number;

        const pointerdown = (event: PointerEvent) => {
            if (event.pointerType === 'mouse') {
                // If a button is already pressed, ignore this press
                if (pressedButton !== -1) {
                    return;
                }
                target.setPointerCapture(event.pointerId);
                pressedButton = event.button;
                x = event.offsetX;
                y = event.offsetY;
            } else if (event.pointerType === 'touch') {
                if (touches.length === 0) {
                    target.setPointerCapture(event.pointerId);
                }
                touches.push({
                    x: event.offsetX,
                    y: event.offsetY,
                    id: event.pointerId
                });

                if (touches.length === 2) {
                    midx = (touches[0].x + touches[1].x) * 0.5;
                    midy = (touches[0].y + touches[1].y) * 0.5;
                    midlen = dist(touches[0].x, touches[0].y, touches[1].x, touches[1].y);
                }
            }
        };

        const pointerup = (event: PointerEvent) => {
            if (event.pointerType === 'mouse') {
                // Only release if this is the button that was initially pressed
                if (event.button === pressedButton) {
                    pressedButton = -1;
                    target.releasePointerCapture(event.pointerId);
                }
            } else {
                touches = touches.filter(touch => touch.id !== event.pointerId);
                if (touches.length === 0) {
                    target.releasePointerCapture(event.pointerId);
                }
            }
        };

        const pointermove = (event: PointerEvent) => {
            if (event.pointerType === 'mouse') {
                // Only process if we're tracking a button
                if (pressedButton === -1) {
                    return;
                }

                // Verify the button we're tracking is still pressed
                // 1 = left button, 4 = middle button, 2 = right button
                const buttonMask = [1, 4, 2][pressedButton];
                if ((event.buttons & buttonMask) === 0) {
                    // Button is no longer pressed, clean up
                    pressedButton = -1;
                    return;
                }

                const dx = event.offsetX - x;
                const dy = event.offsetY - y;
                x = event.offsetX;
                y = event.offsetY;

                // right button can be used to orbit with ctrl key and to zoom with alt | meta key
                const mod = pressedButton === 2 ?
                    (event.shiftKey || event.ctrlKey ? 'orbit' :
                        (event.altKey || event.metaKey ? 'zoom' : null)) :
                    null;

                if (mod === 'orbit' || (mod === null && pressedButton === 0)) {
                    orbit(dx, dy);
                } else if (mod === 'zoom' || (mod === null && pressedButton === 1)) {
                    zoom(dy * -0.02);
                } else if (mod === 'pan' || (mod === null && pressedButton === 2)) {
                    pan(x, y, dx, dy);
                }
            } else {
                if (touches.length === 1) {
                    const touch = touches[0];
                    const dx = event.offsetX - touch.x;
                    const dy = event.offsetY - touch.y;
                    touch.x = event.offsetX;
                    touch.y = event.offsetY;
                    orbit(dx, dy);
                } else if (touches.length === 2) {
                    const touch = touches[touches.map(t => t.id).indexOf(event.pointerId)];
                    touch.x = event.offsetX;
                    touch.y = event.offsetY;

                    const mx = (touches[0].x + touches[1].x) * 0.5;
                    const my = (touches[0].y + touches[1].y) * 0.5;
                    const ml = dist(touches[0].x, touches[0].y, touches[1].x, touches[1].y);

                    pan(mx, my, (mx - midx), (my - midy));
                    zoom((ml - midlen) * 0.01);

                    midx = mx;
                    midy = my;
                    midlen = ml;
                }
            }
        };

        // fuzzy detection of mouse wheel events vs trackpad events
        const isMouseEvent = (deltaX: number, deltaY: number) => {
            return (Math.abs(deltaX) > 50 && deltaY === 0) ||
                   (Math.abs(deltaY) > 50 && deltaX === 0) ||
                   (deltaX === 0 && deltaY !== 0) && !Number.isInteger(deltaY);
        };

        const wheel = (event: WheelEvent) => {
            const { deltaX, deltaY } = event;

            if (isMouseEvent(deltaX, deltaY)) {
                zoom(deltaY * -0.002);
            } else if (event.ctrlKey || event.metaKey) {
                zoom(deltaY * -0.02);
            } else if (event.shiftKey) {
                pan(event.offsetX, event.offsetY, deltaX, deltaY);
            } else {
                orbit(deltaX, deltaY);
            }

            event.preventDefault();
        };

        // 双击事件已禁用，只使用单击选择
        // FIXME: safari sends canvas as target of dblclick event but chrome sends the target element
        // const canvas = camera.scene.app.graphicsDevice.canvas;
        // const dblclick = (event: globalThis.MouseEvent) => {
        //     if (event.target === target || event.target === canvas) {
        //         camera.pickFocalPoint(event.offsetX, event.offsetY);
        //     }
        // };

        // 跟踪鼠标拖拽状态，区分点击和拖拽
        let mouseDownPos = { x: 0, y: 0 };
        let isDragging = false;
        const DRAG_THRESHOLD = 5; // 像素阈值，超过这个距离认为是拖拽

        const mousedown = (event: globalThis.MouseEvent) => {
            mouseDownPos = { x: event.offsetX, y: event.offsetY };
            isDragging = false;
        };

        const mousemove = (event: globalThis.MouseEvent) => {
            if (pressedButton !== -1) { // 如果有按钮被按下
                const dx = Math.abs(event.offsetX - mouseDownPos.x);
                const dy = Math.abs(event.offsetY - mouseDownPos.y);
                if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) {
                    isDragging = true;
                }
            }
        };

        // 检查点击是否在UI面板上
        const isClickOnUI = (event: globalThis.MouseEvent): boolean => {
            const target = event.target as HTMLElement;
            if (!target) return false;

            // 排除canvas和canvas容器，这些是3D场景区域
            if (target.id === 'canvas' || target.id === 'canvas-container') {
                return false;
            }

            // 检查是否点击在属性面板上
            const propertiesPanel = document.getElementById('properties-panel');
            if (propertiesPanel && propertiesPanel.contains(target)) {
                return true;
            }

            // 检查是否点击在快照面板上
            const snapshotPanel = document.getElementById('snapshot-panel');
            if (snapshotPanel && snapshotPanel.contains(target)) {
                return true;
            }

            // 检查是否点击在其他UI面板上（通过CSS类名）
            let element = target;
            while (element && element !== document.body) {
                // 再次确保不是canvas相关元素
                if (element.id === 'canvas' || element.id === 'canvas-container') {
                    return false;
                }

                if (element.classList && (
                    element.classList.contains('panel') ||
                    element.classList.contains('pcui-container') ||
                    element.classList.contains('pcui-element') ||
                    element.classList.contains('menu-panel') ||
                    element.classList.contains('snapshot-panel') ||
                    (element.id && element.id.includes('panel') && element.id !== 'canvas-container')
                )) {
                    return true;
                }
                element = element.parentElement as HTMLElement;
            }

            return false;
        };

        // 检查事件是否应该被忽略（来自UI面板的事件传播）
        const shouldIgnoreEvent = (event: globalThis.MouseEvent): boolean => {
            // 如果事件已经被阻止传播，但仍然到达这里，说明是UI面板内的操作
            if (event.defaultPrevented) {
                return true;
            }

            // 检查事件路径中是否包含UI面板
            const path = event.composedPath ? event.composedPath() : [];
            for (const element of path) {
                if (element instanceof HTMLElement) {
                    if (element.classList && (
                        element.classList.contains('snapshot-panel') ||
                        element.classList.contains('snapshot-view') ||
                        element.classList.contains('panel') ||
                        element.id === 'snapshot-panel'
                    )) {
                        return true;
                    }
                }
            }

            return isClickOnUI(event);
        };

        // 单击：只有在非拖拽状态且未点击UI时才进行拾取选择
        const click = (event: globalThis.MouseEvent) => {
            // 检查是否应该忽略这个事件
            if (shouldIgnoreEvent(event)) {
                return;
            }

            // 如果正处于工具拖拽或刚刚结束拖拽，忽略这次点击以避免清空选择
            try {
                const ignore = (camera.scene?.events?.invoke && camera.scene.events.invoke('tool.shouldIgnoreClick')) as boolean;
                if (ignore) {
                    isDragging = false;
                    return;
                }
            } catch (e) {
                // ignore errors
            }

            // 只有真正的点击（非拖拽）且不在UI面板上才触发选择逻辑
            if (!isDragging && !isClickOnUI(event)) {
                camera.pickFocalPoint(event.offsetX, event.offsetY);
            }
            // 重置拖拽状态
            isDragging = false;
        };

        // key state
        const keys: any = {
            ArrowUp: 0,
            ArrowDown: 0,
            ArrowLeft: 0,
            ArrowRight: 0
        };

        const keydown = (event: KeyboardEvent) => {
            if (keys.hasOwnProperty(event.key) && event.target === document.body) {
                keys[event.key] = event.shiftKey ? 10 : (event.ctrlKey || event.metaKey || event.altKey ? 0.1 : 1);
            }
        };

        const keyup = (event: KeyboardEvent) => {
            if (keys.hasOwnProperty(event.key)) {
                keys[event.key] = 0;
            }
        };

        this.update = (deltaTime: number) => {
            const x = keys.ArrowRight - keys.ArrowLeft;
            const z = keys.ArrowDown - keys.ArrowUp;

            if (x || z) {
                const factor = deltaTime * camera.flySpeed;
                const worldTransform = camera.entity.getWorldTransform();
                const xAxis = worldTransform.getX().mulScalar(x * factor);
                const zAxis = worldTransform.getZ().mulScalar(z * factor);
                const p = camera.focalPoint.add(xAxis).add(zAxis);
                camera.setFocalPoint(p);
            }
        };

        let destroy: () => void = null;

        const wrap = (target: any, name: string, fn: any, options?: any) => {
            const callback = (event: any) => {
                camera.scene.events.fire('camera.controller', name);
                fn(event);
            };
            target.addEventListener(name, callback, options);
            destroy = () => {
                destroy?.();
                target.removeEventListener(name, callback);
            };
        };

        wrap(target, 'pointerdown', pointerdown);
        wrap(target, 'pointerup', pointerup);
        wrap(target, 'pointermove', pointermove);
        wrap(target, 'wheel', wheel, { passive: false });
        // wrap(target, 'dblclick', dblclick); // 禁用双击事件，只使用单击选择
        wrap(target, 'mousedown', mousedown); // 添加鼠标按下事件监听
        wrap(target, 'mousemove', mousemove); // 添加鼠标移动事件监听
        wrap(target, 'click', click);
        wrap(document, 'keydown', keydown);
        wrap(document, 'keyup', keyup);

        this.destroy = destroy;
    }
}

export { PointerController };
