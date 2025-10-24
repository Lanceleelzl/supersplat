import { Container, Label, Button } from '@playcanvas/pcui';

import { Events } from '../events';

interface ExportOptions {
    pointName: boolean;
    markerName: boolean;
    coordinateX: boolean;
    coordinateY: boolean;
    coordinateZ: boolean;
    height: boolean;
    gimbalPitch: boolean;
    gimbalYaw: boolean;
}

class InspectionExportPanel extends Container {
    private events: Events;
    private exportOptions: ExportOptions;
    private isDragging: boolean = false;
    private dragOffset: { x: number; y: number } = { x: 0, y: 0 };

    constructor(events: Events, args = {}) {
        args = {
            ...args,
            class: ['panel', 'inspection-export-panel']
        };

        super(args);
        this.events = events;

        // 默认隐藏面板
        this.hidden = true;

        // 默认导出选项（全部导出）
        this.exportOptions = {
            pointName: true,
            markerName: true,
            coordinateX: true,
            coordinateY: true,
            coordinateZ: true,
            height: true,
            gimbalPitch: true,
            gimbalYaw: true
        };

        this.createUI();
        this.setupEvents();
        this.setupDragFunctionality();
    }

    private createUI() {
        // 创建标题栏 - 参照属性面板实现
        const header = new Container({
            class: 'panel-header'
        });

        const headerIcon = new Label({
            text: '\uE111',
            class: 'panel-header-icon'
        });

        const headerLabel = new Label({
            text: '导出巡检参数',
            class: 'panel-header-label'
        });

        header.append(headerIcon);
        header.append(headerLabel);

        // 创建内容容器
        const contentContainer = new Container({
            class: 'inspection-export-content'
        });

        // 说明文本
        const description = new Label({
            text: '以下分组列出将要导出的全部参数（默认全部导出）：',
            class: 'export-description'
        });
        contentContainer.append(description);

        // 分组：巡检点位信息
        const groupInspection = new Container({ class: 'export-group' });
        const groupInspectionTitle = new Label({ text: '巡检点位信息', class: 'export-group-title' });
        const groupInspectionList = new Container({ class: 'export-group-list' });
        groupInspectionList.append(new Label({ text: '巡检编号', class: 'export-item' }));
        groupInspectionList.append(new Label({ text: '点位编号', class: 'export-item' }));
        groupInspection.append(groupInspectionTitle);
        groupInspection.append(groupInspectionList);

        // 分组：位置坐标
        const groupPosition = new Container({ class: 'export-group' });
        const groupPositionTitle = new Label({ text: '位置坐标', class: 'export-group-title' });
        const groupPositionList = new Container({ class: 'export-group-list' });
        groupPositionList.append(new Label({ text: 'X坐标', class: 'export-item' }));
        groupPositionList.append(new Label({ text: 'Y坐标', class: 'export-item' }));
        groupPositionList.append(new Label({ text: 'Z坐标', class: 'export-item' }));
        groupPositionList.append(new Label({ text: '高度', class: 'export-item' }));
        groupPosition.append(groupPositionTitle);
        groupPosition.append(groupPositionList);

        // 分组：云台参数
        const groupGimbal = new Container({ class: 'export-group' });
        const groupGimbalTitle = new Label({ text: '云台参数', class: 'export-group-title' });
        const groupGimbalList = new Container({ class: 'export-group-list' });
        groupGimbalList.append(new Label({ text: '云台俯仰', class: 'export-item' }));
        groupGimbalList.append(new Label({ text: '云台偏航', class: 'export-item' }));
        groupGimbal.append(groupGimbalTitle);
        groupGimbal.append(groupGimbalList);

        // 分组：快照设置
        const groupSnapshot = new Container({ class: 'export-group' });
        const groupSnapshotTitle = new Label({ text: '快照设置', class: 'export-group-title' });
        const groupSnapshotList = new Container({ class: 'export-group-list' });
        groupSnapshotList.append(new Label({ text: '机型预设', class: 'export-item' }));
        groupSnapshotList.append(new Label({ text: '比例', class: 'export-item' }));
        groupSnapshotList.append(new Label({ text: '锁定模式', class: 'export-item' }));
        groupSnapshotList.append(new Label({ text: '水平FOV(°)', class: 'export-item' }));
        groupSnapshotList.append(new Label({ text: '对角FOV(°)', class: 'export-item' }));
        groupSnapshotList.append(new Label({ text: '传感器宽度(mm)', class: 'export-item' }));
        groupSnapshotList.append(new Label({ text: '焦距单位', class: 'export-item' }));
        groupSnapshotList.append(new Label({ text: '焦距', class: 'export-item' }));
        groupSnapshot.append(groupSnapshotTitle);
        groupSnapshot.append(groupSnapshotList);

        contentContainer.append(groupInspection);
        contentContainer.append(groupPosition);
        contentContainer.append(groupGimbal);
        contentContainer.append(groupSnapshot);

        // 创建按钮容器
        const buttonContainer = new Container({
            class: 'export-button-container'
        });

        // 导出按钮
        const exportButton = new Button({
            text: '导出Excel',
            class: 'export-confirm'
        });

        // 取消按钮
        const cancelButton = new Button({
            text: '取消',
            class: 'export-cancel'
        });

        buttonContainer.append(exportButton);
        buttonContainer.append(cancelButton);
        contentContainer.append(buttonContainer);

        // 将标题栏和内容添加到面板
        this.append(header);
        this.append(contentContainer);

        // 绑定按钮事件
        exportButton.on('click', () => this.handleExport());
        cancelButton.on('click', () => this.hide());
    }

    private setupEvents() {
        // 监听导出事件
        this.events.on('inspection.showExportPanel', () => {
            this.show();
        });

        // 阻止事件冒泡
        ['pointerdown', 'pointerup', 'pointermove', 'wheel', 'dblclick'].forEach((eventName) => {
            this.dom.addEventListener(eventName, (event: Event) => event.stopPropagation());
        });
    }

    private setupDragFunctionality() {
        const header = this.dom.querySelector('.panel-header') as HTMLElement;
        if (!header) return;

        // 添加拖动样式
        header.style.cursor = 'move';
        header.style.userSelect = 'none';

        let isDragging = false;
        const dragOffset = { x: 0, y: 0 };

        const onPointerDown = (e: PointerEvent) => {
            isDragging = true;
            header.setPointerCapture(e.pointerId);

            const rect = this.dom.getBoundingClientRect();
            dragOffset.x = e.clientX - rect.left;
            dragOffset.y = e.clientY - rect.top;

            e.preventDefault();
        };

        const onPointerMove = (e: PointerEvent) => {
            if (!isDragging) return;

            const x = e.clientX - dragOffset.x;
            const y = e.clientY - dragOffset.y;

            this.dom.style.position = 'fixed';
            this.dom.style.left = `${x}px`;
            this.dom.style.top = `${y}px`;

            e.preventDefault();
        };

        const onPointerUp = (e: PointerEvent) => {
            if (!isDragging) return;

            isDragging = false;
            header.releasePointerCapture(e.pointerId);

            e.preventDefault();
        };

        // 绑定事件到拖拽句柄
        header.addEventListener('pointerdown', onPointerDown);
        header.addEventListener('pointermove', onPointerMove);
        header.addEventListener('pointerup', onPointerUp);

        // 处理指针取消事件（例如触摸被中断）
        header.addEventListener('pointercancel', onPointerUp);
    }

    private handleExport() {
        // 无需选择，直接导出全部参数
        this.events.fire('inspection.doExport', this.exportOptions);
        this.hide();
    }

    show() {
        this.hidden = false;
        this.dom.classList.add('visible');

        // 强制设置样式确保浮动定位
        this.dom.style.position = 'fixed';
        this.dom.style.top = '50%';
        this.dom.style.left = '50%';
        this.dom.style.transform = 'translate(-50%, -50%)';
        this.dom.style.zIndex = '10000';
        this.dom.style.margin = '0';
        this.dom.style.padding = '0';

        // 阻止背景滚动
        document.body.style.overflow = 'hidden';
    }

    hide() {
        this.hidden = true;
        this.dom.classList.remove('visible');

        // 恢复背景滚动
        document.body.style.overflow = '';
    }
}

export { InspectionExportPanel, ExportOptions };