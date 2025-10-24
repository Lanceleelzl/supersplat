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

            // 创建工作簿
            const workbook = XLSX.utils.book_new();

            // 创建工作表
            const worksheet = XLSX.utils.json_to_sheet(data);

            // 设置列宽
            const columnWidths = this.calculateColumnWidths(data);
            worksheet['!cols'] = columnWidths;

            // 设置表头样式（如果支持）
            this.styleHeaders(worksheet, data);

            // 添加工作表到工作簿
            XLSX.utils.book_append_sheet(workbook, worksheet, '巡检参数');

            // 生成文件名
            const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
            const filename = `巡检参数导出_${timestamp}.xlsx`;

            // 导出文件
            XLSX.writeFile(workbook, filename);

            // 显示成功消息
            this.showSuccessMessage(filename, data.length);

        } catch (error) {
            console.error('Excel导出失败:', error);
            console.error('Excel导出失败，请检查浏览器控制台获取详细错误信息。');
        }
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
