import { Button, Container, Element, Label, TextInput } from '@playcanvas/pcui';

import { Events } from '../events';
import oriSvg from './svg/ori.svg';

// 与其它对话框保持一致的SVG创建方法
const createSvg = (svgString: string, args: Record<string, any> = {}) => {
    // 既支持 data:image/svg+xml, 也支持直接字符串
    const isData = svgString.startsWith('data:image/svg+xml,');
    const svgContent = isData ? decodeURIComponent(svgString.substring('data:image/svg+xml,'.length)) : svgString;

    return new Element({
        dom: new DOMParser().parseFromString(svgContent, 'image/svg+xml').documentElement,
        ...args
    });
};

export type OriginSettings = { x: number; y: number; z: number; epsg?: string };

class CoordinateOriginDialog extends Container {
    show: () => Promise<OriginSettings | null>;
    hide: () => void;
    destroy: () => void;

    constructor(events: Events, args: Record<string, any> = {}) {
        args = {
            ...args,
            id: 'coordinate-origin-dialog',
            class: 'settings-dialog',
            hidden: true,
            tabIndex: -1
        };

        super(args);

        const dialog = new Container({ id: 'dialog' });

        // header
        const headerIcon = createSvg(oriSvg, { id: 'icon' });
        const headerText = new Label({ id: 'text', text: '坐标原点投影坐标设置' });
        const header = new Container({ id: 'header' });
        header.append(headerIcon);
        header.append(headerText);

        // content
        const content = new Container({ id: 'content' });

        // ESPG 编码（置于最上方）
        const epsgLabel = new Label({ class: 'label', text: 'EPSG编码' });
        const epsgInput = new TextInput({ class: 'text', value: '' });
        const epsgRow = new Container({ class: 'row' });
        epsgRow.append(epsgLabel);
        epsgRow.append(epsgInput);

        // X/E
        const xLabel = new Label({ class: 'label', text: 'X / E (m)' });
        const xInput = new TextInput({ class: 'text', value: '0' });
        const xRow = new Container({ class: 'row' });
        xRow.append(xLabel);
        xRow.append(xInput);

        // Y/N
        const yLabel = new Label({ class: 'label', text: 'Y / N (m)' });
        const yInput = new TextInput({ class: 'text', value: '0' });
        const yRow = new Container({ class: 'row' });
        yRow.append(yLabel);
        yRow.append(yInput);

        // U/Z
        const zLabel = new Label({ class: 'label', text: 'U / Z (m)' });
        const zInput = new TextInput({ class: 'text', value: '0' });
        const zRow = new Container({ class: 'row' });
        zRow.append(zLabel);
        zRow.append(zInput);

        content.append(epsgRow);
        content.append(xRow);
        content.append(yRow);
        content.append(zRow);

        // 大文本提示块：单列展示，避免两列布局导致内容截断
        const hintBlockRow = new Container({ class: 'row' });
        const hintBlock = new Label({
            class: 'hint-block',
            text: [
                '提示：EPSG支持 WGS84 UTM(32601–32660/32701–32760)、CGCS2000 3°GK(4513–4533 分带、4535–4559 中央经线)、Web Mercator(3857/102100/900913)。',
                '导出经纬度将按所填EPSG与导出目标(WGS84/CGCS2000)转换；若输入与输出基准不同，则为近似结果（未做七参数/格网改正）；不在支持范围内则经纬度可能为空。'
            ].join(' ')
        });
        hintBlockRow.append(hintBlock);
        content.append(hintBlockRow);

        // buttons
        const buttons = new Container({ id: 'footer' });
        const cancelButton = new Button({ class: 'button', text: '取消' });
        const okButton = new Button({ class: 'button', text: '确定' });
        buttons.append(cancelButton);
        buttons.append(okButton);

        dialog.append(header);
        dialog.append(content);
        dialog.append(buttons);
        this.append(dialog);

        // helpers
        const parseNumber = (str: string): number => {
            const v = parseFloat(str);
            return isFinite(v) ? v : 0;
        };

        // EPSG 支持范围：WGS84 UTM、CGCS2000 3度带GK（分带/中央经线编码）、Web Mercator
        const isSupportedEPSG = (epsg?: string): boolean => {
            if (!epsg) return false;
            const m = epsg.match(/(\d{4,6})/);
            if (!m) return false;
            const code = parseInt(m[1], 10);
            // UTM WGS84
            if (code >= 32601 && code <= 32660) return true;
            if (code >= 32701 && code <= 32760) return true;
            // CGCS2000 GK 3度带（分带编号 4513..4533）
            if (code >= 4513 && code <= 4533) return true;
            // CGCS2000 GK 3度带（中央经线编码 4535..4559，但实际使用在 75..135E 内）
            if (code >= 4535 && code <= 4559) return true;
            // Web Mercator
            if (code === 3857 || code === 102100 || code === 900913) return true;
            return false;
        };

        const resetFromGlobal = () => {
            try {
                const enu = events.invoke('origin.enu') as OriginSettings | undefined;
                const epsg = (events.invoke('origin.epsg') as string | undefined) ?? '';
                const x = enu?.x ?? 0;
                const y = enu?.y ?? 0;
                const z = enu?.z ?? 0;
                epsgInput.value = String(epsg);
                xInput.value = String(x);
                yInput.value = String(y);
                zInput.value = String(z);
            } catch (e) {
                // 如果未注册 origin.enu，使用默认值
                epsgInput.value = '';
                xInput.value = '0';
                yInput.value = '0';
                zInput.value = '0';
            }
        };

        // keyboard
        const keydown = (event: KeyboardEvent) => {
            switch (event.key) {
                case 'Escape':
                    this.hide();
                    onCancel();
                    break;
                case 'Enter':
                    onOK();
                    break;
            }
        };

        // callbacks wiring
        let onCancel: () => void = () => {};
        let onOK: () => void = () => {};

        cancelButton.on('click', () => {
            this.hide();
            onCancel();
        });

        okButton.on('click', () => onOK());

        // implementations
        this.show = () => {
            resetFromGlobal();

            this.hidden = false;
            this.dom.addEventListener('keydown', keydown);
            this.dom.focus();

            return new Promise<OriginSettings | null>((resolve) => {
                onCancel = () => resolve(null);
                onOK = () => {
                    const epsgStr = (epsgInput.value ?? '').toString().trim();
                    // 若填写了 EPSG 且超出当前支持范围，给出提示但允许提交（经纬度可能为空）
                    if (epsgStr && !isSupportedEPSG(epsgStr)) {
                        events.fire('showToast', '提示：该EPSG暂不支持自动经纬度转换。当前支持 WGS84 UTM、CGCS2000 3度带GK、Web Mercator。', 3500);
                    }

                    const enu: OriginSettings = {
                        x: parseNumber(xInput.value),
                        y: parseNumber(yInput.value),
                        z: parseNumber(zInput.value),
                        epsg: epsgStr
                    };
                    this.hide();
                    resolve(enu);
                };
            });
        };

        this.hide = () => {
            this.hidden = true;
            this.dom.removeEventListener('keydown', keydown);
        };

        this.destroy = () => {
            this.hide();
            this.dom.remove();
        };
    }
}

export { CoordinateOriginDialog };
