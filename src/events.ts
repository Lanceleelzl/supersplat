import { EventHandler, Color } from 'playcanvas';

type FunctionCallback = (...args: any[]) => any;

// 事件管理类，继承自PlayCanvas的EventHandler，提供函数注册和调用功能
class Events extends EventHandler {
    functions = new Map<string, FunctionCallback>();  // 函数映射表

    // 注册编辑器函数
    function(name: string, fn: FunctionCallback) {
        if (this.functions.has(name)) {
            throw new Error(`错误：函数 ${name} 已存在`);
        }
        this.functions.set(name, fn);
    }

    // 调用编辑器函数
    invoke(name: string, ...args: any[]) {
        const fn = this.functions.get(name);
        if (!fn) {
            // 为常用查询提供安全缺省值，避免初始化阶段的报错；并对部分常规查询静默处理
            const silentNames = new Set(['bgClr', 'frustum.isEnabled']);
            if (!silentNames.has(name) && !name.endsWith('.isEnabled')) {
                console.warn(`警告：未找到函数 '${name}'`);
            }
            // 针对常用函数提供缺省返回，避免调用方崩溃
            if (name === 'bgClr') {
                return new Color(1, 1, 1, 1);
            }
            if (name.endsWith('.isEnabled')) {
                return false;
            }
            return undefined;
        }
        return fn(...args);
    }
}

export { Events };