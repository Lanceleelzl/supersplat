import * as XLSX from 'xlsx';

import { Events } from '../events';

class ExcelExporter {
    private events: Events;

    constructor(events: Events) {
        this.events = events;
        this.setupEvents();
    }

    private setupEvents() {
        // 监听Excel导出事件
        this.events.on('inspection.exportToExcel', (data: any[]) => {
            this.exportToExcel(data);
        });
    }

    private exportToExcel(data: any[]) {
        try {
            if (!data || data.length === 0) {
                console.warn('没有可导出的巡检数据！');
                return;
            }

            // 先进行 ENU 与地理坐标扩展
            const enriched = this.enrichWithENUAndGeodetic(data);
            const safeData = this.sanitizeData(enriched);

            // 创建工作簿
            const workbook = XLSX.utils.book_new();

            // 创建工作表
            const worksheet = XLSX.utils.json_to_sheet(safeData);

            // 设置列宽
            const columnWidths = this.calculateColumnWidths(safeData);
            worksheet['!cols'] = columnWidths;

            // 设置表头样式（如果支持）
            this.styleHeaders(worksheet, safeData);

            // 添加工作表到工作簿
            XLSX.utils.book_append_sheet(workbook, worksheet, '巡检参数');

            // 生成文件名
            const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
            const filename = `巡检参数导出_${timestamp}.xlsx`;

            // 导出文件
            XLSX.writeFile(workbook, filename);

            // 显示成功消息
            this.showSuccessMessage(filename, safeData.length);

        } catch (error) {
            console.error('Excel导出失败:', error);
            console.error('Excel导出失败，请检查浏览器控制台获取详细错误信息。');
        }
    }

    private sanitizeData(data: any[]): any[] {
        if (!data || data.length === 0) return [];

        // 统一所有行的列集合，保证表头包含新增列
        const headerSet = new Set<string>();
        const orderedHeaders: string[] = [];
        const pushHeader = (key: string) => {
            if (!headerSet.has(key)) {
                headerSet.add(key);
                orderedHeaders.push(key);
            }
        };

        // 保持第一行的列顺序作为基础
        Object.keys(data[0]).forEach(pushHeader);
        // 将后续出现的列追加到末尾
        for (let i = 1; i < data.length; i++) {
            Object.keys(data[i]).forEach(pushHeader);
        }

        return data.map((row) => {
            const sanitized: Record<string, any> = {};
            for (const key of orderedHeaders) {
                sanitized[key] = this.sanitizeCellValue(row[key]);
            }
            return sanitized;
        });
    }

    private sanitizeCellValue(value: any): any {
        if (value == null) return '';
        if (typeof value === 'number') return isFinite(value) ? value : '';
        if (typeof value === 'boolean') return value;

        let str = typeof value === 'string' ? value : JSON.stringify(value);
        if (!str) return '';
        if (str[0] === '=') str = "'" + str;
        str = str.replace(/\r\n|\r|\n/g, ' ');
        if (str.length > 1000) str = str.slice(0, 1000);
        return str;
    }

    private calculateColumnWidths(data: any[]): any[] {
        if (!data || data.length === 0) return [];

        const columnWidths: any[] = [];
        const headers = Object.keys(data[0]);

        headers.forEach((header, index) => {
            let maxWidth = header.length; // 表头长度

            // 检查数据中的最大长度
            data.forEach((row) => {
                const cellValue = String(row[header] || '');
                maxWidth = Math.max(maxWidth, cellValue.length);
            });

            // 设置合理的列宽（最小10，最大30）
            columnWidths[index] = {
                wch: Math.min(Math.max(maxWidth + 2, 10), 30)
            };
        });

        return columnWidths;
    }

    private styleHeaders(worksheet: any, data: any[]) {
        if (!data || data.length === 0) return;

        const headers = Object.keys(data[0]);

        // 为表头添加样式（如果xlsx支持）
        headers.forEach((header, index) => {
            const cellAddress = XLSX.utils.encode_cell({ r: 0, c: index });
            if (worksheet[cellAddress]) {
                worksheet[cellAddress].s = {
                    font: { bold: true },
                    fill: { fgColor: { rgb: 'EEEEEE' } },
                    alignment: { horizontal: 'center' }
                };
            }
        });
    }

    private showSuccessMessage(filename: string, recordCount: number) {
        const message = `
Excel导出成功！

文件名：${filename}
导出记录数：${recordCount} 条
保存位置：浏览器默认下载目录

请检查下载文件夹中的Excel文件。
        `.trim();

        this.events.fire('toast', message);
    }

    // 检测原始字符串中的小数位数（用于保持UTM精度）
    private detectPrecision(original: any): number {
        if (original == null) return 0;
        const s = typeof original === 'string' ? original : String(original);
        const m = s.match(/\.([0-9]+)/);
        return m ? m[1].length : 0;
    }

    private formatWithPrecision(value: number, decimals: number): string | '' {
        if (!isFinite(value)) return '';
        if (decimals <= 0) return String(value);
        return value.toFixed(decimals);
    }

    // 解析 EPSG 字符串，仅支持 WGS84 UTM：326xx(北半球) / 327xx(南半球)
    private parseUtmFromEPSG(epsg?: string): { zone: number; north: boolean } | null {
        if (!epsg) return null;
        const m = epsg.match(/(\d{4,5})/);
        if (!m) return null;
        const code = parseInt(m[1], 10);
        if (code >= 32601 && code <= 32660) {
            return { zone: code - 32600, north: true };
        }
        if (code >= 32701 && code <= 32760) {
            return { zone: code - 32700, north: false };
        }
        return null;
    }

    // 解析 CGCS2000 高斯-克吕格（横轴墨卡托）EPSG：
    // 支持两类：
    // 1) 3度带“分带编号”系列：EPSG 4513..4533 -> zone = code - 4488，lon0 = zone * 3，falseEasting = zone*1e6 + 500000
    // 2) 3度带“中央经线”系列：EPSG 4535..4559 -> lon0 = 78 + 3*(code-4535)，falseEasting = 500000
    private parseCgcs2000GKFromEPSG(epsg?: string): { lon0: number; falseEasting: number; k0: number } | null {
        if (!epsg) return null;
        const m = epsg.match(/(\d{4,5})/);
        if (!m) return null;
        const code = parseInt(m[1], 10);
        // 3度带 分带编号
        if (code >= 4513 && code <= 4533) {
            const zone = code - 4488; // 25..45
            const lon0 = zone * 3; // 中央经线
            const falseEasting = zone * 1_000_000 + 500_000;
            return { lon0, falseEasting, k0: 1.0 };
        }
        // 3度带 中央经线编码
        if (code >= 4535 && code <= 4559) {
            const lon0 = 78 + 3 * (code - 4535); // 约 78..150
            if (lon0 < 75 || lon0 > 135) return null; // 仅在中国常用范围内接受
            return { lon0, falseEasting: 500_000, k0: 1.0 };
        }
        return null;
    }

    // Web Mercator 逆算：EPSG:3857 / 102100
    private parseWebMercatorFromEPSG(epsg?: string): boolean {
        if (!epsg) return false;
        const m = epsg.match(/(\d{4,6})/);
        if (!m) return false;
        const code = parseInt(m[1], 10);
        return code === 3857 || code === 102100 || code === 900913;
    }

    // 通用横轴墨卡托逆算（Transverse Mercator）：用于 UTM 与 GK
    private transverseMercatorInverse(easting: number, northing: number, params: {
        lon0Deg: number;
        k0: number;
        falseEasting: number;
        falseNorthing: number;
        a: number; // 半径
        f: number; // 扁率倒数的倒数（即 f = 1/InverseFlattening）
    }): { lat: number; lon: number } {
        const a = params.a;
        const f = params.f;
        const e2 = f * (2 - f);
        const e = Math.sqrt(e2);
        const ePrime2 = e2 / (1 - e2);
        const k0 = params.k0;

        const x = easting - params.falseEasting;
        let y = northing - params.falseNorthing;

        const M = y / k0;
        const mu = M / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256));

        const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
        const J1 = (3 * e1) / 2 - (27 * Math.pow(e1, 3)) / 32;
        const J2 = (21 * e1 * e1) / 16 - (55 * Math.pow(e1, 4)) / 32;
        const J3 = (151 * Math.pow(e1, 3)) / 96;
        const J4 = (1097 * Math.pow(e1, 4)) / 512;

        const fp = mu + J1 * Math.sin(2 * mu) + J2 * Math.sin(4 * mu) + J3 * Math.sin(6 * mu) + J4 * Math.sin(8 * mu);

        const sinfp = Math.sin(fp);
        const cosfp = Math.cos(fp);
        const tanfp = Math.tan(fp);

        const C1 = ePrime2 * cosfp * cosfp;
        const T1 = tanfp * tanfp;
        const N1 = a / Math.sqrt(1 - e2 * sinfp * sinfp);
        const R1 = (a * (1 - e2)) / Math.pow(1 - e2 * sinfp * sinfp, 1.5);
        const D = x / (N1 * k0);

        const lat = fp - (N1 * tanfp / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ePrime2) * Math.pow(D, 4) / 24
            + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ePrime2 - 3 * C1 * C1) * Math.pow(D, 6) / 720);

        const lon0 = params.lon0Deg * (Math.PI / 180);
        const lon = lon0 + (D - (1 + 2 * T1 + C1) * Math.pow(D, 3) / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ePrime2 + 24 * T1 * T1) * Math.pow(D, 5) / 120) / cosfp;

        return { lat: lat * (180 / Math.PI), lon: lon * (180 / Math.PI) };
    }

    private webMercatorInverse(easting: number, northing: number, a: number): { lat: number; lon: number } {
        // Web Mercator 使用球面半径 a=6378137，与 WGS84 相同半径
        const R = a;
        const lon = (easting / R) * (180 / Math.PI);
        const lat = (Math.atan(Math.sinh(northing / R))) * (180 / Math.PI);
        return { lat, lon };
    }

    // UTM -> 经纬度（WGS84），输入米
    private utmToLatLon(easting: number, northing: number, zone: number, northHemisphere: boolean): { lat: number, lon: number } {
        const a = 6378137.0; // WGS84 半径
        const f = 1 / 298.257223563;
        const e2 = f * (2 - f);
        const e = Math.sqrt(e2);
        const ePrime2 = e2 / (1 - e2);
        const k0 = 0.9996;

        const x = easting - 500000.0;
        let y = northing;
        if (!northHemisphere) {
            y -= 10000000.0;
        }

        const M = y / k0;
        const mu = M / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256));

        const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
        const J1 = (3 * e1) / 2 - (27 * Math.pow(e1, 3)) / 32;
        const J2 = (21 * e1 * e1) / 16 - (55 * Math.pow(e1, 4)) / 32;
        const J3 = (151 * Math.pow(e1, 3)) / 96;
        const J4 = (1097 * Math.pow(e1, 4)) / 512;

        const fp = mu + J1 * Math.sin(2 * mu) + J2 * Math.sin(4 * mu) + J3 * Math.sin(6 * mu) + J4 * Math.sin(8 * mu);

        const sinfp = Math.sin(fp);
        const cosfp = Math.cos(fp);
        const tanfp = Math.tan(fp);

        const C1 = ePrime2 * cosfp * cosfp;
        const T1 = tanfp * tanfp;
        const N1 = a / Math.sqrt(1 - e2 * sinfp * sinfp);
        const R1 = (a * (1 - e2)) / Math.pow(1 - e2 * sinfp * sinfp, 1.5);
        const D = x / (N1 * k0);

        const lat = fp - (N1 * tanfp / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ePrime2) * Math.pow(D, 4) / 24
            + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ePrime2 - 3 * C1 * C1) * Math.pow(D, 6) / 720);

        const lon0 = ((zone - 1) * 6 - 180 + 3) * (Math.PI / 180);
        const lon = lon0 + (D - (1 + 2 * T1 + C1) * Math.pow(D, 3) / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ePrime2 + 24 * T1 * T1) * Math.pow(D, 5) / 120) / cosfp;

        return { lat: lat * (180 / Math.PI), lon: lon * (180 / Math.PI) };
    }

    // 将导出数据扩展为实际 ENU 与地理坐标
    private enrichWithENUAndGeodetic(data: any[]): any[] {
        const enu = (this.events.invoke('origin.enu') as { x: number, y: number, z: number }) || { x: 0, y: 0, z: 0 };
        const epsg = (this.events.invoke('origin.epsg') as string) || '';
        const utm = this.parseUtmFromEPSG(epsg);
        const gk = this.parseCgcs2000GKFromEPSG(epsg);
        const isWebMercator = this.parseWebMercatorFromEPSG(epsg);
        const target = (this.events.invoke('export.geodeticTarget') as ('wgs84' | 'cgcs2000')) || 'wgs84';
        const ellipsoid = target === 'cgcs2000'
            ? { a: 6378137.0, f: 1 / 298.257222101 }
            : { a: 6378137.0, f: 1 / 298.257223563 };
        let warnedDatumApprox = false;

        return data.map((row) => {
            const xRaw = row['X坐标'];
            const yRaw = row['Y坐标'];
            const zRaw = row['Z坐标'];
            const px = parseFloat(xRaw);
            const py = parseFloat(yRaw);
            const pz = parseFloat(zRaw);
            const hasX = isFinite(px);
            const hasY = isFinite(py);
            const hasZ = isFinite(pz);

            const E = (hasX ? px : 0) + (isFinite(enu.x) ? enu.x : 0);
            const N = (hasY ? py : 0) + (isFinite(enu.y) ? enu.y : 0);
            const U = (hasZ ? pz : 0) + (isFinite(enu.z) ? enu.z : 0);

            const enrichedRow: any = { ...row };
            const xPrec = this.detectPrecision(xRaw);
            const yPrec = this.detectPrecision(yRaw);
            const zPrec = this.detectPrecision(zRaw);
            // 同步考虑“原点 ENU 偏移”的精度，取两者的最大小数位数
            const offPrecX = this.detectPrecision(enu.x);
            const offPrecY = this.detectPrecision(enu.y);
            const offPrecZ = this.detectPrecision(enu.z);
            const eDecimals = Math.max(xPrec, offPrecX);
            const nDecimals = Math.max(yPrec, offPrecY);
            const uDecimals = Math.max(zPrec, offPrecZ);
            // 保留原有精度：E/N/U 根据“原始坐标”和“原点偏移”更高的精度输出
            enrichedRow['E坐标(m)'] = this.formatWithPrecision(E, eDecimals);
            enrichedRow['N坐标(m)'] = this.formatWithPrecision(N, nDecimals);
            enrichedRow['U坐标(m)'] = this.formatWithPrecision(U, uDecimals);
            enrichedRow['海拔(m)'] = enrichedRow['U坐标(m)'];

            if (isFinite(E) && isFinite(N)) {
                let latLon: { lat: number; lon: number } | null = null;
                if (utm) {
                    // UTM：使用通用 TM 逆算，UTM 的 falseNorthing 取决于半球
                    const falseNorthing = utm.north ? 0 : 10_000_000;
                    const lon0Deg = ((utm.zone - 1) * 6 - 180 + 3);
                    latLon = this.transverseMercatorInverse(E, N, {
                        lon0Deg,
                        k0: 0.9996,
                        falseEasting: 500_000,
                        falseNorthing,
                        a: ellipsoid.a,
                        f: ellipsoid.f
                    });
                    if (target === 'cgcs2000') warnedDatumApprox = true;
                } else if (gk) {
                    // CGCS2000 3度带 GK：falseNorthing 恒为 0
                    latLon = this.transverseMercatorInverse(E, N, {
                        lon0Deg: gk.lon0,
                        k0: gk.k0,
                        falseEasting: gk.falseEasting,
                        falseNorthing: 0,
                        a: ellipsoid.a,
                        f: ellipsoid.f
                    });
                    if (target === 'wgs84') warnedDatumApprox = true;
                } else if (isWebMercator) {
                    latLon = this.webMercatorInverse(E, N, ellipsoid.a);
                    // Web Mercator -> 选择目标椭球不改变结果（近似），无需额外警示
                }

                if (latLon) {
                    enrichedRow['经度(°)'] = isFinite(latLon.lon) ? latLon.lon.toFixed(13) : '';
                    enrichedRow['纬度(°)'] = isFinite(latLon.lat) ? latLon.lat.toFixed(13) : '';
                } else {
                    enrichedRow['经度(°)'] = '';
                    enrichedRow['纬度(°)'] = '';
                }
            } else {
                enrichedRow['经度(°)'] = '';
                enrichedRow['纬度(°)'] = '';
            }

            // 记录使用的 EPSG 编码，便于追踪
            enrichedRow['EPSG'] = epsg || '';

            return enrichedRow;
        });

        // 若进行了跨基准近似转换，给出一次性提示
        if (warnedDatumApprox) {
            this.events.fire('toast', '提示：当前地理坐标基准选择与输入投影的基准不同，已进行近似转换（未应用七参数/网格改正）。高精度需求请使用权威转换库。');
        }
    }

    // 公共方法：手动触发导出（用于测试）
    public exportData(data: any[]) {
        this.exportToExcel(data);
    }

    // 公共方法：验证数据格式
    public validateData(data: any[]): { valid: boolean; message: string } {
        if (!Array.isArray(data)) {
            return { valid: false, message: '数据必须是数组格式' };
        }

        if (data.length === 0) {
            return { valid: false, message: '没有可导出的数据' };
        }

        // 检查数据结构一致性
        const firstRowKeys = Object.keys(data[0]);
        for (let i = 1; i < data.length; i++) {
            const currentRowKeys = Object.keys(data[i]);
            if (currentRowKeys.length !== firstRowKeys.length) {
                return {
                    valid: false,
                    message: `第${i + 1}行数据结构与第1行不一致`
                };
            }
        }

        return { valid: true, message: '数据格式正确' };
    }
}

export { ExcelExporter };
