import { Container, Element, Label } from '@playcanvas/pcui';

import { Events } from '../events';
import { localize } from './localization';
import { MenuPanel } from './menu-panel';
import arrowSvg from './svg/arrow.svg';
import collapseSvg from './svg/collapse.svg';
import selectDelete from './svg/delete.svg';
import sceneExport from './svg/export.svg';
import sceneImport from './svg/import.svg';
import sceneNew from './svg/new.svg';
import sceneOpen from './svg/open.svg';
import scenePublish from './svg/publish.svg';
import sceneSave from './svg/save.svg';
import selectAll from './svg/select-all.svg';
import selectDuplicate from './svg/select-duplicate.svg';
import selectInverse from './svg/select-inverse.svg';
import selectLock from './svg/select-lock.svg';
import selectNone from './svg/select-none.svg';
import selectSeparate from './svg/select-separate.svg';
import selectUnlock from './svg/select-unlock.svg';
import logoSvg from './svg/supersplat-logo.svg';
import kuaizhaoSvg from './svg/kuaizhao.svg';
import attributeSvg from './svg/attribute.svg';

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

class Menu extends Container {
    private snapshotPreviewEnabled = false;
    private snapshotMenuItem: any = null;
    private snapshotMenuLabel: Label | null = null;
    private inspectionMenuPanel: MenuPanel | null = null;
    private events: Events; // 添加events引用
    private attributePreviewEnabled = false; // 属性预览状态
    private attributeMenuItem: any = null; // 属性预览菜单项

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
            text: localize('file'),
            class: 'menu-option'
        });

        const render = new Label({
            text: localize('render'),
            class: 'menu-option'
        });

        const selection = new Label({
            text: localize('select'),
            class: 'menu-option'
        });

        const inspection = new Label({
            text: localize('inspection'),
            class: 'menu-option'
        });

        const help = new Label({
            text: localize('help'),
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
            text: localize('file.export.ply'),
            icon: createSvg(sceneExport),
            isEnabled: () => !events.invoke('scene.empty'),
            onSelect: () => events.invoke('scene.export', 'ply')
        }, {
            text: localize('file.export.splat'),
            icon: createSvg(sceneExport),
            isEnabled: () => !events.invoke('scene.empty'),
            onSelect: () => events.invoke('scene.export', 'splat')
        }, {
            // separator
        }, {
            text: localize('file.export.viewer'),
            icon: createSvg(sceneExport),
            isEnabled: () => !events.invoke('scene.empty'),
            onSelect: () => events.invoke('scene.export', 'viewer')
        }]);

        const fileMenuPanel = new MenuPanel([{
            text: localize('file.new'),
            icon: createSvg(sceneNew),
            isEnabled: () => !events.invoke('scene.empty'),
            onSelect: () => events.invoke('doc.new')
        }, {
            text: localize('file.open'),
            icon: createSvg(sceneOpen),
            onSelect: async () => {
                await events.invoke('doc.open');
            }
        }, {
            // separator
        }, {
            text: localize('file.save'),
            icon: createSvg(sceneSave),
            isEnabled: () => events.invoke('doc.name'),
            onSelect: async () => await events.invoke('doc.save')
        }, {
            text: localize('file.save-as'),
            icon: createSvg(sceneSave),
            isEnabled: () => !events.invoke('scene.empty'),
            onSelect: async () => await events.invoke('doc.saveAs')
        }, {
            // separator
        }, {
            text: localize('file.import'),
            icon: createSvg(sceneImport),
            onSelect: async () => {
                await events.invoke('scene.import');
            }
        }, {
            text: localize('file.export'),
            icon: createSvg(sceneExport),
            subMenu: exportMenuPanel
        }, {
            text: localize('file.publish'),
            icon: createSvg(scenePublish),
            isEnabled: () => !events.invoke('scene.empty'),
            onSelect: async () => await events.invoke('show.publishSettingsDialog')
        }]);

        const selectionMenuPanel = new MenuPanel([{
            text: localize('select.all'),
            icon: createSvg(selectAll),
            extra: 'Ctrl + A',
            onSelect: () => events.fire('select.all')
        }, {
            text: localize('select.none'),
            icon: createSvg(selectNone),
            extra: 'Shift + A',
            onSelect: () => events.fire('select.none')
        }, {
            text: localize('select.invert'),
            icon: createSvg(selectInverse),
            extra: 'Ctrl + I',
            onSelect: () => events.fire('select.invert')
        }, {
            // separator
        }, {
            text: localize('select.lock'),
            icon: createSvg(selectLock),
            extra: 'H',
            isEnabled: () => events.invoke('selection.splats'),
            onSelect: () => events.fire('select.hide')
        }, {
            text: localize('select.unlock'),
            icon: createSvg(selectUnlock),
            extra: 'U',
            onSelect: () => events.fire('select.unhide')
        }, {
            text: localize('select.delete'),
            icon: createSvg(selectDelete),
            extra: 'Delete',
            isEnabled: () => events.invoke('selection.splats'),
            onSelect: () => events.fire('select.delete')
        }, {
            text: localize('select.reset'),
            onSelect: () => events.fire('scene.reset')
        }, {
            // separator
        }, {
            text: localize('select.duplicate'),
            icon: createSvg(selectDuplicate),
            isEnabled: () => events.invoke('selection.splats'),
            onSelect: () => events.fire('select.duplicate')
        }, {
            text: localize('select.separate'),
            icon: createSvg(selectSeparate),
            isEnabled: () => events.invoke('selection.splats'),
            onSelect: () => events.fire('select.separate')
        }]);

        const renderMenuPanel = new MenuPanel([{
            text: localize('render.image'),
            icon: createSvg(sceneExport),
            onSelect: async () => await events.invoke('show.imageSettingsDialog')
        }, {
            text: localize('render.video'),
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

        // 创建查看属性菜单项 - 使用attribute图标，激活时在文本后添加√
        this.attributeMenuItem = {
            text: '查看属性',
            icon: createSvg(attributeSvg), // 使用attribute.svg图标
            onSelect: () => {
                // 只触发事件，不在这里修改状态，让main.ts统一处理状态变更
                events.fire('attribute.toggle');
            }
        };

        this.inspectionMenuPanel = new MenuPanel([{
            text: localize('inspection.add-point'),
            icon: createSvg(sceneImport),
            onSelect: () => events.fire('inspection.addPoint')
        },
        this.snapshotMenuItem,
        this.attributeMenuItem,
        {
            text: '导出巡检参数',
            icon: createSvg(sceneExport),
            onSelect: () => events.fire('inspection.exportParams')
        }]);

        const helpMenuPanel = new MenuPanel([{
            text: localize('help.shortcuts'),
            icon: 'E136',
            onSelect: () => events.fire('show.shortcuts')
        }, {
            text: localize('help.user-guide'),
            icon: 'E232',
            onSelect: () => window.open('https://developer.playcanvas.com/user-manual/gaussian-splatting/editing/supersplat/', '_blank').focus()
        }, {
            text: localize('help.log-issue'),
            icon: 'E336',
            onSelect: () => window.open('https://github.com/playcanvas/supersplat/issues', '_blank').focus()
        }, {
            text: localize('help.github-repo'),
            icon: 'E259',
            onSelect: () => window.open('https://github.com/playcanvas/supersplat', '_blank').focus()
        }, {
            // separator
        }, {
            text: localize('help.basics-video'),
            icon: 'E261',
            onSelect: () => window.open('https://youtu.be/MwzaEM2I55I', '_blank').focus()
        }, {
            // separator
        }, {
            text: localize('help.discord'),
            icon: 'E233',
            onSelect: () => window.open('https://discord.gg/T3pnhRTTAY', '_blank').focus()
        }, {
            text: localize('help.forum'),
            icon: 'E432',
            onSelect: () => window.open('https://forum.playcanvas.com', '_blank').focus()
        }, {
            // separator
        }, {
            text: localize('help.about'),
            icon: 'E138',
            onSelect: () => events.invoke('show.about')
        }]);

        this.append(menubar);
        this.append(fileMenuPanel);
        this.append(exportMenuPanel);
        this.append(selectionMenuPanel);
        this.append(this.inspectionMenuPanel);
        this.append(renderMenuPanel);
        this.append(helpMenuPanel);

        // 初始化快照菜单文本显示
        setTimeout(() => {
            this.updateSnapshotMenuText();
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
            };

            option.dom.addEventListener('pointerdown', (event: PointerEvent) => {
                if (!option.menuPanel.hidden) {
                    option.menuPanel.hidden = true;
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
            }
        };

        window.addEventListener('pointerdown', checkEvent, true);
        window.addEventListener('pointerup', checkEvent, true);
    }

    private updateSnapshotMenuText() {
        console.log('updateSnapshotMenuText called, snapshotPreviewEnabled:', this.snapshotPreviewEnabled);
        
        if (this.snapshotMenuItem && this.inspectionMenuPanel) {
            // 更新菜单项的文本，激活时添加√符号
            this.snapshotMenuItem.text = this.snapshotPreviewEnabled ? '快照预览 ✓' : '快照预览';
            
            // 重新构建整个菜单面板以确保正确显示
            this.rebuildInspectionMenu();
            
            console.log(this.snapshotPreviewEnabled ? 
                'Snapshot preview enabled - showing checkmark' : 
                'Snapshot preview disabled - no checkmark');
        } else {
            console.error('snapshotMenuItem or inspectionMenuPanel is null');
        }
    }

    private updateAttributeMenuText() {
        console.log('updateAttributeMenuText called, attributePreviewEnabled:', this.attributePreviewEnabled);
        
        if (this.attributeMenuItem && this.inspectionMenuPanel) {
            // 更新菜单项的文本，激活时添加√符号
            this.attributeMenuItem.text = this.attributePreviewEnabled ? '查看属性 ✓' : '查看属性';
            
            // 重新构建整个菜单面板以确保正确显示
            this.rebuildInspectionMenu();
            
            console.log(this.attributePreviewEnabled ? 
                'Attribute preview enabled - showing checkmark' : 
                'Attribute preview disabled - no checkmark');
        } else {
            console.error('attributeMenuItem or inspectionMenuPanel is null');
        }
    }

    private rebuildInspectionMenu() {
        if (this.inspectionMenuPanel && this.snapshotMenuItem && this.attributeMenuItem) {
            // 更新快照菜单项的文本，激活时添加√符号
            this.snapshotMenuItem.text = this.snapshotPreviewEnabled ? '快照预览 ✓' : '快照预览';
            // 更新属性菜单项的文本，激活时添加√符号
            this.attributeMenuItem.text = this.attributePreviewEnabled ? '查看属性 ✓' : '查看属性';
            
            // 直接更新菜单面板中对应菜单项的文本
            const menuRows = this.inspectionMenuPanel.dom.querySelectorAll('.menu-row');
            // 快照预览是第2个菜单项 (index 1)
            if (menuRows[1]) {
                const textLabel = menuRows[1].querySelector('.menu-row-text');
                if (textLabel) {
                    textLabel.textContent = this.snapshotMenuItem.text;
                }
            }
            // 查看属性是第3个菜单项 (index 2)
            if (menuRows[2]) {
                const textLabel = menuRows[2].querySelector('.menu-row-text');
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
}

export { Menu };
