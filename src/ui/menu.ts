import { Container, Element, Label } from '@playcanvas/pcui';

import { Events } from '../events';
import { recentFiles } from '../recent-files';
import { localize } from './localization';
import { MenuPanel, MenuItem } from './menu-panel';
import arrowSvg from './svg/arrow.svg';
import attributeSvg from './svg/attribute.svg';
import collapseSvg from './svg/collapse.svg';
import selectDelete from './svg/delete.svg';
import sceneExport from './svg/export.svg';
import sceneImport from './svg/import.svg';
import kuaizhaoSvg from './svg/kuaizhao.svg';
import sceneNew from './svg/new.svg';
import sceneOpen from './svg/open.svg';
import scenePublish from './svg/publish.svg';
import rectangularVertebraSvg from './svg/rectangularVertebra.svg';
import sceneSave from './svg/save.svg';
import selectAll from './svg/select-all.svg';
import selectDuplicate from './svg/select-duplicate.svg';
import selectInverse from './svg/select-inverse.svg';
import selectLock from './svg/select-lock.svg';
import selectNone from './svg/select-none.svg';
import selectSeparate from './svg/select-separate.svg';
import selectUnlock from './svg/select-unlock.svg';
import logoSvg from './svg/supersplat-logo.svg';
import oriSvg from './svg/ori.svg';
import createTargetSvg from './svg/createtarget.svg';

const createSvg = (svgString: string) => {
    let svgContent: string;

    // 检查是否是data URL格式
    if (svgString.startsWith('data:image/svg+xml,')) {
        svgContent = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    } else {
        // 直接使用SVG字符串内容
        svgContent = svgString;
    }

    return new Element({
        dom: new DOMParser().parseFromString(svgContent, 'image/svg+xml').documentElement
    });
};

const getOpenRecentItems = async (events: Events) => {
    const files = await recentFiles.get();
    const items: MenuItem[] = files.map((file) => {
        return {
            text: file.name,
            onSelect: () => events.invoke('doc.openRecent', file.handle)
        };
    });

    if (items.length > 0) {
        items.push({}); // separator
        items.push({
            text: localize('menu.file.open-recent.clear'),
            icon: createSvg(selectDelete),
            onSelect: () => recentFiles.clear()
        });
    }

    return items;
};

class Menu extends Container {
    private snapshotPreviewEnabled = false;
    private snapshotMenuItem: any = null;
    private snapshotMenuLabel: Label | null = null;
    private inspectionMenuPanel: MenuPanel | null = null;
    private events: Events; // 添加events引用
    private attributePreviewEnabled = false; // 属性预览状态 - 默认关闭
    private attributeMenuItem: any = null; // 属性预览菜单项
    private frustumEnabled = true; // 视椎体显示状态 - 默认开启
    private frustumMenuItem: any = null; // 视椎体菜单项

    constructor(events: Events, args = {}) {
        args = {
            ...args,
            id: 'menu'
        };

        super(args);

        this.events = events; // 保存events引用

        const menubar = new Container({
            id: 'menu-bar'
        });

        menubar.dom.addEventListener('pointerdown', (event) => {
            event.stopPropagation();
        });

        const iconDom = document.createElement('img');
        iconDom.src = logoSvg;
        iconDom.setAttribute('id', 'app-icon');

        const aDom = document.createElement('a');
        aDom.href = new URL(window.location.href).origin;
        aDom.target = '_blank';
        aDom.appendChild(iconDom);

        const icon = new Element({
            dom: aDom
        });

        const scene = new Label({
            text: localize('menu.file'),
            class: 'menu-option'
        });

        const render = new Label({
            text: localize('menu.render'),
            class: 'menu-option'
        });

        const selection = new Label({
            text: localize('menu.select'),
            class: 'menu-option'
        });

        const inspection = new Label({
            text: localize('inspection'),
            class: 'menu-option'
        });

        const help = new Label({
            text: localize('menu.help'),
            class: 'menu-option'
        });

        const toggleCollapsed = () => {
            document.body.classList.toggle('collapsed');
        };

        // collapse menu on mobile
        if (document.body.clientWidth < 600) {
            toggleCollapsed();
        }

        const collapse = createSvg(collapseSvg);
        collapse.dom.classList.add('menu-icon');
        collapse.dom.setAttribute('id', 'menu-collapse');
        collapse.dom.addEventListener('click', toggleCollapsed);

        const arrow = createSvg(arrowSvg);
        arrow.dom.classList.add('menu-icon');
        arrow.dom.setAttribute('id', 'menu-arrow');
        arrow.dom.addEventListener('click', toggleCollapsed);

        const buttonsContainer = new Container({
            id: 'menu-bar-options'
        });
        buttonsContainer.append(scene);
        buttonsContainer.append(selection);
        buttonsContainer.append(inspection);
        buttonsContainer.append(render);
        buttonsContainer.append(help);
        buttonsContainer.append(collapse);
        buttonsContainer.append(arrow);

        menubar.append(icon);
        menubar.append(buttonsContainer);

        const exportMenuPanel = new MenuPanel([{
            text: localize('menu.file.export.ply'),
            icon: createSvg(sceneExport),
            isEnabled: () => !events.invoke('scene.empty'),
            onSelect: () => events.invoke('scene.export', 'ply')
        }, {
            text: localize('menu.file.export.splat'),
            icon: createSvg(sceneExport),
            isEnabled: () => !events.invoke('scene.empty'),
            onSelect: () => events.invoke('scene.export', 'splat')
        }, {
            // separator
        }, {
            text: localize('menu.file.export.viewer', { ellipsis: true }),
            icon: createSvg(sceneExport),
            isEnabled: () => !events.invoke('scene.empty'),
            onSelect: () => events.invoke('scene.export', 'viewer')
        }]);

        const openRecentMenuPanel = new MenuPanel([]);

        const fileMenuPanel = new MenuPanel([{
            text: localize('menu.file.new'),
            icon: createSvg(sceneNew),
            isEnabled: () => !events.invoke('scene.empty'),
            onSelect: () => events.invoke('doc.new')
        }, {
            text: localize('menu.file.open'),
            icon: createSvg(sceneOpen),
            onSelect: async () => {
                await events.invoke('doc.open');
            }
        }, {
            text: localize('menu.file.open-recent'),
            icon: createSvg(sceneOpen),
            subMenu: openRecentMenuPanel,
            isEnabled: async () => {
                // refresh open recent menu items when the parent menu is opened
                try {
                    const items = await getOpenRecentItems(events);
                    openRecentMenuPanel.setItems(items);
                    return items.length > 0;
                } catch (error) {
                    console.error('Failed to load recent files:', error);
                    return false;
                }
            }
        }, {
            // separator
        }, {
            text: localize('menu.file.save'),
            icon: createSvg(sceneSave),
            isEnabled: () => events.invoke('doc.name'),
            onSelect: async () => await events.invoke('doc.save')
        }, {
            text: localize('menu.file.save-as', { ellipsis: true }),
            icon: createSvg(sceneSave),
            isEnabled: () => !events.invoke('scene.empty'),
            onSelect: async () => await events.invoke('doc.saveAs')
        }, {
            // separator
        }, {
            text: localize('menu.file.import', { ellipsis: true }),
            icon: createSvg(sceneImport),
            onSelect: async () => {
                await events.invoke('scene.import');
            }
        }, {
            text: localize('menu.file.export'),
            icon: createSvg(sceneExport),
            subMenu: exportMenuPanel
        }, {
            text: localize('menu.file.publish', { ellipsis: true }),
            icon: createSvg(scenePublish),
            isEnabled: () => !events.invoke('scene.empty'),
            onSelect: async () => await events.invoke('show.publishSettingsDialog')
        }]);

        const selectionMenuPanel = new MenuPanel([{
            text: localize('menu.select.all'),
            icon: createSvg(selectAll),
            extra: 'Ctrl + A',
            onSelect: () => events.fire('select.all')
        }, {
            text: localize('menu.select.none'),
            icon: createSvg(selectNone),
            extra: 'Shift + A',
            onSelect: () => events.fire('select.none')
        }, {
            text: localize('menu.select.invert'),
            icon: createSvg(selectInverse),
            extra: 'Ctrl + I',
            onSelect: () => events.fire('select.invert')
        }, {
            // separator
        }, {
            text: localize('menu.select.lock'),
            icon: createSvg(selectLock),
            extra: 'H',
            isEnabled: () => events.invoke('selection.splats'),
            onSelect: () => events.fire('select.hide')
        }, {
            text: localize('menu.select.unlock'),
            icon: createSvg(selectUnlock),
            extra: 'U',
            onSelect: () => events.fire('select.unhide')
        }, {
            text: localize('menu.select.delete'),
            icon: createSvg(selectDelete),
            extra: 'Delete',
            isEnabled: () => events.invoke('selection.splats'),
            onSelect: () => events.fire('select.delete')
        }, {
            text: localize('menu.select.reset'),
            onSelect: () => events.fire('scene.reset')
        }, {
            // separator
        }, {
            text: localize('menu.select.duplicate'),
            icon: createSvg(selectDuplicate),
            isEnabled: () => events.invoke('selection.splats'),
            onSelect: () => events.fire('select.duplicate')
        }, {
            text: localize('menu.select.separate'),
            icon: createSvg(selectSeparate),
            isEnabled: () => events.invoke('selection.splats'),
            onSelect: () => events.fire('select.separate')
        }]);

        const renderMenuPanel = new MenuPanel([{
            text: localize('menu.render.image', { ellipsis: true }),
            icon: createSvg(sceneExport),
            onSelect: async () => await events.invoke('show.imageSettingsDialog')
        }, {
            text: localize('menu.render.video', { ellipsis: true }),
            icon: createSvg(sceneExport),
            onSelect: async () => await events.invoke('show.videoSettingsDialog')
        }]);

        // 创建快照预览菜单项 - 使用kuaizhao图标，激活时在文本后添加√
        this.snapshotMenuItem = {
            text: '快照预览',
            icon: createSvg(kuaizhaoSvg), // 使用kuaizhao.svg图标
            onSelect: () => {
                this.snapshotPreviewEnabled = !this.snapshotPreviewEnabled;
                this.updateSnapshotMenuText();
                events.fire('snapshot.toggle');
            }
        };

        // 创建视椎体菜单项 - 使用rectangularVertebra图标，激活时在文本后添加√
        this.frustumMenuItem = {
            text: '视椎体',
            icon: createSvg(rectangularVertebraSvg),
            onSelect: () => {
                // 只触发事件，由main.ts统一管理状态与回显
                events.fire('frustum.toggle');
            }
        };

        // 创建查看属性菜单项 - 使用attribute图标，激活时在文本后添加√
        this.attributeMenuItem = {
            text: '查看属性',
            icon: createSvg(attributeSvg), // 使用attribute.svg图标
            onSelect: () => {
                // 只触发事件，不在这里修改状态，让main.ts统一处理状态变更
                events.fire('attribute.toggle');
            }
        };

        this.inspectionMenuPanel = new MenuPanel([
        {
            text: '设置巡检对象',
            icon: createSvg(createTargetSvg),
            onSelect: () => { events.fire('inspectionObjects.toggleToolbar'); this.inspectionMenuPanel!.hidden = true; }
        },
        {
            text: localize('inspection.add-point'),
            icon: createSvg(sceneImport),
            onSelect: () => events.fire('inspection.addPoint')
        },
        this.snapshotMenuItem,
        this.frustumMenuItem,
        this.attributeMenuItem,
        {
            text: '坐标参数设置',
            icon: createSvg(oriSvg),
            onSelect: async () => await events.invoke('show.coordinateOriginDialog')
        },
        {
            text: '导出巡检参数',
            icon: createSvg(sceneExport),
            onSelect: () => events.fire('inspection.exportParams')
        }]);

        const helpMenuPanel = new MenuPanel([{
            text: localize('menu.help.shortcuts'),
            icon: 'E136',
            onSelect: () => events.fire('show.shortcuts')
        }, {
            text: localize('menu.help.user-guide'),
            icon: 'E232',
            onSelect: () => window.open('https://developer.playcanvas.com/user-manual/gaussian-splatting/editing/supersplat/', '_blank').focus()
        }, {
            text: localize('menu.help.log-issue'),
            icon: 'E336',
            onSelect: () => window.open('https://github.com/playcanvas/supersplat/issues', '_blank').focus()
        }, {
            text: localize('menu.help.github-repo'),
            icon: 'E259',
            onSelect: () => window.open('https://github.com/playcanvas/supersplat', '_blank').focus()
        }, {
            // separator
        }, {
            text: localize('menu.help.basics-video'),
            icon: 'E261',
            onSelect: () => window.open('https://youtu.be/MwzaEM2I55I', '_blank').focus()
        }, {
            // separator
        }, {
            text: localize('menu.help.discord'),
            icon: 'E233',
            onSelect: () => window.open('https://discord.gg/T3pnhRTTAY', '_blank').focus()
        }, {
            text: localize('menu.help.forum'),
            icon: 'E432',
            onSelect: () => window.open('https://forum.playcanvas.com', '_blank').focus()
        }, {
            // separator
        }, {
            text: localize('menu.help.about'),
            icon: 'E138',
            onSelect: () => events.invoke('show.about')
        }]);

        this.append(menubar);
        this.append(fileMenuPanel);
        this.append(openRecentMenuPanel);
        this.append(exportMenuPanel);
        this.append(selectionMenuPanel);
        this.append(this.inspectionMenuPanel);
        this.append(renderMenuPanel);
        this.append(helpMenuPanel);

        // 初始化：确保所有菜单面板隐藏
        fileMenuPanel.hidden = true;
        exportMenuPanel.hidden = true;
        selectionMenuPanel.hidden = true;
        this.inspectionMenuPanel.hidden = true;
        renderMenuPanel.hidden = true;
        helpMenuPanel.hidden = true;

        // 初始化快照菜单文本显示
        setTimeout(() => {
            this.updateSnapshotMenuText();
            this.updateAttributeMenuText();
            this.updateFrustumMenuText();
            this.events.on('inspectionObjects.toolbarVisible', (active: boolean) => {
                const menuRows = this.inspectionMenuPanel!.dom.querySelectorAll('.menu-row');
                const first = menuRows[0];
                if (first) {
                    const textLabel = first.querySelector('.menu-row-text');
                    if (textLabel) {
                        textLabel.textContent = active ? '设置巡检对象 ✓' : '设置巡检对象';
                    }
                }
            });
        }, 0);

        const options: { dom: HTMLElement, menuPanel: MenuPanel }[] = [{
            dom: scene.dom,
            menuPanel: fileMenuPanel
        }, {
            dom: selection.dom,
            menuPanel: selectionMenuPanel
        }, {
            dom: inspection.dom,
            menuPanel: this.inspectionMenuPanel
        }, {
            dom: render.dom,
            menuPanel: renderMenuPanel
        }, {
            dom: help.dom,
            menuPanel: helpMenuPanel
        }];

        options.forEach((option) => {
            const activate = () => {
                option.menuPanel.position(option.dom, 'bottom', 2);
                options.forEach((opt) => {
                    opt.menuPanel.hidden = opt !== option;
                });
                // 广播底部菜单打开
                this.events.fire('bottomMenu.active', true);
            };

            option.dom.addEventListener('pointerdown', (event: PointerEvent) => {
                if (!option.menuPanel.hidden) {
                    option.menuPanel.hidden = true;
                    // 若所有菜单均关闭，广播关闭事件
                    if (options.every(opt => opt.menuPanel.hidden)) {
                        this.events.fire('bottomMenu.active', false);
                    }
                } else {
                    activate();
                }
            });

            option.dom.addEventListener('pointerenter', (event: PointerEvent) => {
                if (!options.every(opt => opt.menuPanel.hidden)) {
                    activate();
                }
            });
        });

        const checkEvent = (event: PointerEvent) => {
            if (!this.dom.contains(event.target as Node)) {
                options.forEach((opt) => {
                    opt.menuPanel.hidden = true;
                });
                // 广播底部菜单关闭
                this.events.fire('bottomMenu.active', false);
            }
        };

        window.addEventListener('pointerdown', checkEvent, true);
        window.addEventListener('pointerup', checkEvent, true);
    }

    private updateSnapshotMenuText() {
        if (this.snapshotMenuItem && this.inspectionMenuPanel) {
            // 更新菜单项的文本，激活时添加√符号
            this.snapshotMenuItem.text = this.snapshotPreviewEnabled ? '快照预览 ✓' : '快照预览';

            // 重新构建整个菜单面板以确保正确显示
            this.rebuildInspectionMenu();
        } else {
            console.error('snapshotMenuItem or inspectionMenuPanel is null');
        }
    }

    private updateAttributeMenuText() {
        if (this.attributeMenuItem && this.inspectionMenuPanel) {
            // 更新菜单项的文本，激活时添加√符号
            this.attributeMenuItem.text = this.attributePreviewEnabled ? '查看属性 ✓' : '查看属性';

            // 重新构建整个菜单面板以确保正确显示
            this.rebuildInspectionMenu();
        } else {
            console.error('attributeMenuItem or inspectionMenuPanel is null');
        }
    }

    private updateFrustumMenuText() {
        if (this.frustumMenuItem && this.inspectionMenuPanel) {
            // 更新菜单项的文本，激活时添加√符号
            this.frustumMenuItem.text = this.frustumEnabled ? '视椎体 ✓' : '视椎体';
            // 重新构建整个菜单面板以确保正确显示
            this.rebuildInspectionMenu();
        } else {
            console.error('frustumMenuItem or inspectionMenuPanel is null');
        }
    }

    private rebuildInspectionMenu() {
        if (this.inspectionMenuPanel && this.snapshotMenuItem && this.attributeMenuItem && this.frustumMenuItem) {
            // 更新三个菜单项的文本
            this.snapshotMenuItem.text = this.snapshotPreviewEnabled ? '快照预览 ✓' : '快照预览';
            this.frustumMenuItem.text = this.frustumEnabled ? '视椎体 ✓' : '视椎体';
            this.attributeMenuItem.text = this.attributePreviewEnabled ? '查看属性 ✓' : '查看属性';

            // 直接更新菜单面板中对应菜单项的文本
            const menuRows = this.inspectionMenuPanel.dom.querySelectorAll('.menu-row');
            // 由于在顶部插入了“设置巡检对象”和“添加巡检点”，索引整体后移2位
            // 快照预览是第3个菜单项 (index 2)
            if (menuRows[2]) {
                const textLabel = menuRows[2].querySelector('.menu-row-text');
                if (textLabel) {
                    textLabel.textContent = this.snapshotMenuItem.text;
                }
            }
            // 视椎体是第4个菜单项 (index 3)
            if (menuRows[3]) {
                const textLabel = menuRows[3].querySelector('.menu-row-text');
                if (textLabel) {
                    textLabel.textContent = this.frustumMenuItem.text;
                }
            }
            // 查看属性是第5个菜单项 (index 4)
            if (menuRows[4]) {
                const textLabel = menuRows[4].querySelector('.menu-row-text');
                if (textLabel) {
                    textLabel.textContent = this.attributeMenuItem.text;
                }
            }
        }
    }

    // 更新菜单项的DOM显示
    private updateMenuItemDisplay() {
        // 更新快照菜单项的图标
        this.updateSnapshotMenuText();
        // 更新视椎体菜单项的图标
        this.updateFrustumMenuText();
        // 更新属性菜单项的图标
        this.updateAttributeMenuText();
    }

    // 公开方法供外部调用
    public updateSnapshotPreviewStatus(enabled: boolean) {
        this.snapshotPreviewEnabled = enabled;
        this.updateSnapshotMenuText();
    }

    // 公开方法供外部调用
    public updateAttributePreviewStatus(enabled: boolean) {
        this.attributePreviewEnabled = enabled;
        this.updateAttributeMenuText();
    }

    // 公开方法供外部调用
    public updateFrustumStatus(enabled: boolean) {
        this.frustumEnabled = enabled;
        this.updateFrustumMenuText();
    }
}

export { Menu };
