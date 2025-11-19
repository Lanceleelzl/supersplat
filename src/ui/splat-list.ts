import { Container, Label, Element as PcuiElement, TextInput } from '@playcanvas/pcui';

import { SplatRenameOp, GltfModelRenameOp } from '../edit-ops';
import { Element, ElementType } from '../element';
import { Events } from '../events';
import { GltfModel } from '../gltf-model';
import { Splat } from '../splat';
import collapseSvg from './svg/collapse.svg';
import deleteSvg from './svg/delete.svg';
import hiddenSvg from './svg/hidden.svg';
import selectDuplicateSvg from './svg/select-duplicate.svg';
import selectedSvg from './svg/selected.svg';
import selectedNoSvg from './svg/selected_NO.svg';
import shownSvg from './svg/shown.svg';

const createSvg = (svgString: string) => {
    let svgContent: string;
    
    // 检查是否是data URL格式
    if (svgString.startsWith('data:image/svg+xml,')) {
        svgContent = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    } else {
        // 直接使用SVG字符串内容
        svgContent = svgString;
    }
    
    return new DOMParser().parseFromString(svgContent, 'image/svg+xml').documentElement;
};

class CategoryContainer extends Container {
    private _collapsed: boolean = false;
    private headerElement: Container;
    private contentContainer: Container;
    private collapseIcon: PcuiElement;
    private categoryLabel: Label;

    constructor(title: string, args = {}) {
        args = {
            ...args,
            class: ['category-container']
        };
        super(args);

        // 创建标题头部
        this.headerElement = new Container({
            class: 'category-header'
        });

        // 创建折叠图标
        this.collapseIcon = new PcuiElement({
            dom: createSvg(collapseSvg),
            class: 'category-collapse-icon'
        });

        // 创建分类标签
        this.categoryLabel = new Label({
            text: title,
            class: 'category-label'
        });

        // 组装头部
        this.headerElement.append(this.collapseIcon);
        this.headerElement.append(this.categoryLabel);

        // 创建内容容器
        this.contentContainer = new Container({
            class: 'category-content'
        });

        // 组装整体结构
        this.append(this.headerElement);
        this.append(this.contentContainer);

        // 绑定点击事件
        this.headerElement.dom.addEventListener('click', (event: MouseEvent) => {
            event.stopPropagation();
            this.toggleCollapse();
        });
    }

    toggleCollapse() {
        this._collapsed = !this._collapsed;
        if (this._collapsed) {
            this.contentContainer.hidden = true;
            this.collapseIcon.dom.style.transform = 'rotate(-90deg)';
            this.class.add('collapsed');
        } else {
            this.contentContainer.hidden = false;
            this.collapseIcon.dom.style.transform = 'rotate(0deg)';
            this.class.remove('collapsed');
        }
    }

    appendToContent(element: PcuiElement) {
        this.contentContainer.append(element);
    }

    removeFromContent(element: PcuiElement) {
        this.contentContainer.remove(element);
    }

    set collapsed(value: boolean) {
        if (this._collapsed !== value) {
            this.toggleCollapse();
        }
    }

    get collapsed() {
        return this._collapsed;
    }

    isEmpty() {
        return this.contentContainer.dom.children.length === 0;
    }
}

class InspectionPointContainer extends Container {
    private _collapsed: boolean = false;
    private headerElement: Container;
    private contentContainer: Container;
    private collapseIcon: PcuiElement;
    private pointLabel: Label;
    private pointName: string;
    private _selectable: boolean = true;
    private selectableButton: PcuiElement;
    private unselectableButton: PcuiElement;

    constructor(pointName: string, args = {}) {
        args = {
            ...args,
            class: ['inspection-point-container']
        };
        super(args);

        this.pointName = pointName;

        // 创建标题头部
        this.headerElement = new Container({
            class: 'inspection-point-header'
        });

        // 创建折叠图标（L型符号）
        this.collapseIcon = new PcuiElement({
            dom: createSvg(collapseSvg),
            class: 'inspection-point-collapse-icon'
        });

        // 创建巡检点标签
        this.pointLabel = new Label({
            text: pointName,
            class: 'inspection-point-label'
        });

        // 创建操作按钮
        const visible = new PcuiElement({
            dom: createSvg(shownSvg),
            class: 'inspection-point-visible'
        });

        const invisible = new PcuiElement({
            dom: createSvg(hiddenSvg),
            class: 'inspection-point-visible',
            hidden: true
        });

        // 添加可选/不可选按钮
        this.selectableButton = new PcuiElement({
            dom: createSvg(selectedSvg),
            class: 'inspection-point-selectable'
        });
        this.selectableButton.dom.title = '可选中';

        this.unselectableButton = new PcuiElement({
            dom: createSvg(selectedNoSvg),
            class: 'inspection-point-selectable',
            hidden: true
        });
        this.unselectableButton.dom.title = '不可选中';

        const duplicate = new PcuiElement({
            dom: createSvg(selectDuplicateSvg),
            class: 'inspection-point-duplicate'
        });
        duplicate.dom.title = '原位复制巡检点位';

        const remove = new PcuiElement({
            dom: createSvg(deleteSvg),
            class: 'inspection-point-delete'
        });
        remove.dom.title = '删除巡检点位';

        // 组装头部
        this.headerElement.append(this.collapseIcon);
        this.headerElement.append(this.pointLabel);
        this.headerElement.append(visible);
        this.headerElement.append(invisible);
        this.headerElement.append(this.selectableButton);
        this.headerElement.append(this.unselectableButton);
        this.headerElement.append(duplicate);
        this.headerElement.append(remove);

        // 创建内容容器（子项容器）
        this.contentContainer = new Container({
            class: 'inspection-point-content'
        });

        // 组装整体结构
        this.append(this.headerElement);
        this.append(this.contentContainer);

        // 绑定头部点击事件（只在标签和折叠图标上触发）
        this.collapseIcon.dom.addEventListener('click', (event: MouseEvent) => {
            event.stopPropagation();
            this.toggleCollapse();
        });

        this.pointLabel.dom.addEventListener('click', (event: MouseEvent) => {
            event.stopPropagation();
            this.toggleCollapse();
        });

        // 绑定操作按钮事件
        visible.dom.addEventListener('click', (event: MouseEvent) => {
            event.stopPropagation();
            this.setVisible(false);
            visible.hidden = true;
            invisible.hidden = false;
        });

        invisible.dom.addEventListener('click', (event: MouseEvent) => {
            event.stopPropagation();
            this.setVisible(true);
            visible.hidden = false;
            invisible.hidden = true;
        });

        // 绑定可选/不可选按钮事件
        this.selectableButton.dom.addEventListener('click', (event: MouseEvent) => {
            event.stopPropagation();
            this.setSelectable(false);
            this.selectableButton.hidden = true;
            this.unselectableButton.hidden = false;
        });

        this.unselectableButton.dom.addEventListener('click', (event: MouseEvent) => {
            event.stopPropagation();
            this.setSelectable(true);
            this.selectableButton.hidden = false;
            this.unselectableButton.hidden = true;
        });

        duplicate.dom.addEventListener('click', (event: MouseEvent) => {
            event.stopPropagation();
            this.emit('duplicateClicked', this.pointName);
        });

        remove.dom.addEventListener('click', (event: MouseEvent) => {
            event.stopPropagation();
            this.emit('removeClicked', this);
        });

        // 绑定悬停事件
        this.headerElement.dom.addEventListener('mouseenter', () => {
            this.headerElement.class.add('hover');
        });

        this.headerElement.dom.addEventListener('mouseleave', () => {
            this.headerElement.class.remove('hover');
        });
    }

    toggleCollapse() {
        this._collapsed = !this._collapsed;
        if (this._collapsed) {
            this.contentContainer.hidden = true;
            this.collapseIcon.dom.style.transform = 'rotate(-90deg)';
            this.class.add('collapsed');
        } else {
            this.contentContainer.hidden = false;
            this.collapseIcon.dom.style.transform = 'rotate(0deg)';
            this.class.remove('collapsed');
        }
    }

    appendChild(element: PcuiElement) {
        this.contentContainer.append(element);
    }

    removeChild(element: PcuiElement) {
        this.contentContainer.remove(element);
    }

    getPointName() {
        return this.pointName;
    }

    set collapsed(value: boolean) {
        if (this._collapsed !== value) {
            this.toggleCollapse();
        }
    }

    get collapsed() {
        return this._collapsed;
    }

    isEmpty() {
        return this.contentContainer.dom.children.length === 0;
    }

    setVisible(visible: boolean) {
        // 设置巡检点位下所有模型的可见性
        this.emit('visibilityChanged', this.pointName, visible);
    }

    setSelectable(selectable: boolean) {
        if (this._selectable !== selectable) {
            this._selectable = selectable;

            // 更新按钮显示状态
            this.selectableButton.hidden = !selectable;
            this.unselectableButton.hidden = selectable;

            // 触发可选性变更事件，控制所有子级条目的可选状态
            this.emit('selectableChanged', this.pointName, selectable);
        }
    }

    get selectable() {
        return this._selectable;
    }

    // 重写emit方法保持兼容性
    emit(name: string, arg0?: any, arg1?: any, arg2?: any, arg3?: any, arg4?: any, arg5?: any, arg6?: any, arg7?: any): this {
        // 调用父类的emit方法
        super.emit(name, arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7);

        // 处理自定义事件
        if (name === 'duplicateClicked') {
            console.log('巡检点位复制:', arg0);
        } else if (name === 'removeClicked') {
            console.log('巡检点位删除:', arg0);
        } else if (name === 'visibilityChanged') {
            console.log('巡检点位可见性变更:', arg0, arg1);
        }

        return this;
    }
}

class InspectionObjectGroupContainer extends Container {
    private headerElement: Container;
    private contentContainer: Container;
    private collapseIcon: PcuiElement;
    private groupLabel: Label;
    private _collapsed = false;
    private _selectable = true;
    private events: Events;
    private groupId: string;

    constructor(groupId: string, events: Events, args = {}) {
        args = {
            ...args,
            class: ['inspection-point-container']
        };
        super(args);
        this.events = events;
        this.groupId = groupId;

        this.headerElement = new Container({ class: 'inspection-point-header' });
        this.collapseIcon = new PcuiElement({ dom: createSvg(collapseSvg), class: 'inspection-point-collapse-icon' });
        this.groupLabel = new Label({ text: groupId, class: 'inspection-point-label' });

        const visible = new PcuiElement({ dom: createSvg(shownSvg), class: 'inspection-point-visible' });
        const invisible = new PcuiElement({ dom: createSvg(hiddenSvg), class: 'inspection-point-visible', hidden: true });
        const selectable = new PcuiElement({ dom: createSvg(selectedSvg), class: 'inspection-point-selectable' });
        const unselectable = new PcuiElement({ dom: createSvg(selectedNoSvg), class: 'inspection-point-selectable', hidden: true });
        const duplicate = new PcuiElement({ dom: createSvg(selectDuplicateSvg), class: 'inspection-point-duplicate' });
        duplicate.dom.title = '新增空组';
        const remove = new PcuiElement({ dom: createSvg(deleteSvg), class: 'inspection-point-delete' });
        remove.dom.title = '删除分组';

        this.headerElement.append(this.collapseIcon);
        this.headerElement.append(this.groupLabel);
        this.headerElement.append(visible);
        this.headerElement.append(invisible);
        this.headerElement.append(selectable);
        this.headerElement.append(unselectable);
        this.headerElement.append(duplicate);
        this.headerElement.append(remove);

        this.contentContainer = new Container({ class: 'inspection-point-content' });
        this.append(this.headerElement);
        this.append(this.contentContainer);

        // collapse
        this.collapseIcon.dom.addEventListener('click', (e: MouseEvent) => { e.stopPropagation(); this.toggleCollapse(); });
        this.groupLabel.dom.addEventListener('click', (e: MouseEvent) => { e.stopPropagation(); this.toggleCollapse(); });

        // visibility toggle affects children items
        const setVisible = (v: boolean) => {
            Array.from(this.contentContainer.dom.children).forEach((child: HTMLElement) => {
                const id = (child.dataset && (child.dataset as any).inspectionId) as string | undefined;
                const ui = (child as any).__ui as SplatItem | undefined;
                if (ui && typeof ui.visible !== 'undefined') ui.visible = v;
                if (id) this.events.fire('inspectionObjects.setVisible', id, v);
            });
            this.events.fire('inspectionObjects.groupSetVisible', this.groupId, v);
        };
        visible.dom.addEventListener('click', (e: MouseEvent) => { e.stopPropagation(); setVisible(false); visible.hidden = true; invisible.hidden = false; });
        invisible.dom.addEventListener('click', (e: MouseEvent) => { e.stopPropagation(); setVisible(true); visible.hidden = false; invisible.hidden = true; });

        // selectable toggle affects children items
        const setSelectable = (v: boolean) => {
            this._selectable = v;
            Array.from(this.contentContainer.dom.children).forEach((child: HTMLElement) => {
                const id = (child.dataset && (child.dataset as any).inspectionId) as string | undefined;
                const ui = (child as any).__ui as SplatItem | undefined;
                if (ui && typeof ui.selectable !== 'undefined') ui.selectable = v;
                if (id) this.events.fire('inspectionObjects.setSelectable', id, v);
            });
        };
        selectable.dom.addEventListener('click', (e: MouseEvent) => { e.stopPropagation(); setSelectable(false); selectable.hidden = true; unselectable.hidden = false; });
        unselectable.dom.addEventListener('click', (e: MouseEvent) => { e.stopPropagation(); setSelectable(true); selectable.hidden = false; unselectable.hidden = true; });

        // duplicate -> add empty group (handled outside via event)
        duplicate.dom.addEventListener('click', (e: MouseEvent) => { e.stopPropagation(); this.emit('duplicateClicked', this.groupId); });
        remove.dom.addEventListener('click', (e: MouseEvent) => {
            e.stopPropagation();
            // 删除所有子项对应的场景对象
            Array.from(this.contentContainer.dom.children).forEach((child: HTMLElement) => {
                const id = (child.dataset && (child.dataset as any).inspectionId) as string | undefined;
                if (id) this.events.fire('inspectionObjects.removeItem', id);
            });
            this.emit('removeClicked', this);
        });

        // hover effect
        this.headerElement.dom.addEventListener('mouseenter', () => this.headerElement.class.add('hover'));
        this.headerElement.dom.addEventListener('mouseleave', () => this.headerElement.class.remove('hover'));
    }

    toggleCollapse() {
        this._collapsed = !this._collapsed;
        if (this._collapsed) {
            this.contentContainer.hidden = true;
            this.collapseIcon.dom.style.transform = 'rotate(-90deg)';
            this.class.add('collapsed');
        } else {
            this.contentContainer.hidden = false;
            this.collapseIcon.dom.style.transform = 'rotate(0deg)';
            this.class.remove('collapsed');
        }
    }

    appendToContent(el: PcuiElement) { this.contentContainer.append(el); }
    removeFromContent(el: PcuiElement) { this.contentContainer.remove(el); }
    isEmpty() { return this.contentContainer.dom.children.length === 0; }
}

class SplatItem extends Container {
    getName: () => string;
    setName: (value: string) => void;
    getSelected: () => boolean;
    setSelected: (value: boolean) => void;
    getVisible: () => boolean;
    setVisible: (value: boolean) => void;
    getSelectable: () => boolean;
    setSelectable: (value: boolean) => void;
    destroy: () => void;

    constructor(name: string, edit: TextInput, args = {}) {
        args = {
            ...args,
            class: ['splat-item', 'visible', 'selectable']
        };

        super(args);

        const text = new Label({
            class: 'splat-item-text',
            text: name
        });

        const visible = new PcuiElement({
            dom: createSvg(shownSvg),
            class: 'splat-item-visible'
        });

        const invisible = new PcuiElement({
            dom: createSvg(hiddenSvg),
            class: 'splat-item-visible',
            hidden: true
        });

        const duplicate = new PcuiElement({
            dom: createSvg(selectDuplicateSvg),
            class: 'splat-item-duplicate'
        });
        duplicate.dom.title = '原位复制';

        const remove = new PcuiElement({
            dom: createSvg(deleteSvg),
            class: 'splat-item-delete'
        });

        const selectable = new PcuiElement({
            dom: createSvg(selectedSvg),
            class: 'splat-item-selectable'
        });
        selectable.dom.title = '可选中';

        const unselectable = new PcuiElement({
            dom: createSvg(selectedNoSvg),
            class: 'splat-item-selectable',
            hidden: true
        });
        unselectable.dom.title = '不可选中';

        this.append(text);
        this.append(visible);
        this.append(invisible);
        this.append(selectable);
        this.append(unselectable);
        this.append(duplicate);
        this.append(remove);

        this.getName = () => {
            return text.value;
        };

        this.setName = (value: string) => {
            text.value = value;
        };

        this.getSelected = () => {
            return this.class.contains('selected');
        };

        this.setSelected = (value: boolean) => {
            if (value !== this.selected) {
                if (value) {
                    this.class.add('selected');
                    this.emit('select', this);
                } else {
                    this.class.remove('selected');
                    this.emit('unselect', this);
                }
            }
        };

        this.getVisible = () => {
            return this.class.contains('visible');
        };

        this.setVisible = (value: boolean) => {
            if (value !== this.visible) {
                visible.hidden = !value;
                invisible.hidden = value;
                if (value) {
                    this.class.add('visible');
                    this.emit('visible', this);
                } else {
                    this.class.remove('visible');
                    this.emit('invisible', this);
                }
            }
        };

        this.getSelectable = () => {
            return this.class.contains('selectable');
        };

        this.setSelectable = (value: boolean) => {
            if (value !== this.selectable) {
                selectable.hidden = !value;
                unselectable.hidden = value;
                if (value) {
                    this.class.add('selectable');
                    this.emit('selectableChanged', this, true);
                } else {
                    this.class.remove('selectable');
                    this.emit('selectableChanged', this, false);
                }
            }
        };

        const toggleVisible = (event: MouseEvent) => {
            event.stopPropagation();
            event.preventDefault();
            this.visible = !this.visible;
        };

        const toggleSelectable = (event: MouseEvent) => {
            event.stopPropagation();
            event.preventDefault();
            this.selectable = !this.selectable;
        };

        const handleDuplicate = (event: MouseEvent) => {
            event.stopPropagation();
            event.preventDefault();
            this.emit('duplicateClicked', this);
        };

        const handleRemove = (event: MouseEvent) => {
            console.log('删除按钮被点击 - SplatItem:', this.name);
            event.stopPropagation();
            event.preventDefault();
            this.emit('removeClicked', this);
        };

        // rename on double click
        text.dom.addEventListener('dblclick', (event: MouseEvent) => {
            event.stopPropagation();

            const onblur = () => {
                this.remove(edit);
                this.emit('rename', edit.value);
                edit.input.removeEventListener('blur', onblur);
                text.hidden = false;
            };

            text.hidden = true;

            this.appendAfter(edit, text);
            edit.value = text.value;
            edit.input.addEventListener('blur', onblur);
            edit.focus();
        });

        // handle clicks
        visible.dom.addEventListener('click', toggleVisible);
        invisible.dom.addEventListener('click', toggleVisible);
        selectable.dom.addEventListener('click', toggleSelectable);
        unselectable.dom.addEventListener('click', toggleSelectable);
        duplicate.dom.addEventListener('click', handleDuplicate);
        remove.dom.addEventListener('click', handleRemove);

        // 保存事件处理器引用以便后续移除
        const handleItemClick = (event: MouseEvent) => {
            // 如果点击的是按钮，就不处理选择
            const target = event.target as HTMLElement;
            if (target.closest('.splat-item-visible') ||
                target.closest('.splat-item-selectable') ||
                target.closest('.splat-item-duplicate') ||
                target.closest('.splat-item-delete')) {
                return;
            }
            // 否则触发选择事件
            this.emit('click', this);
        };

        // 绑定点击事件
        this.dom.addEventListener('click', handleItemClick);

        this.destroy = () => {
            visible.dom.removeEventListener('click', toggleVisible);
            invisible.dom.removeEventListener('click', toggleVisible);
            selectable.dom.removeEventListener('click', toggleSelectable);
            unselectable.dom.removeEventListener('click', toggleSelectable);
            duplicate.dom.removeEventListener('click', handleDuplicate);
            remove.dom.removeEventListener('click', handleRemove);
            this.dom.removeEventListener('click', handleItemClick);
        };
    }

    set name(value: string) {
        this.setName(value);
    }

    get name() {
        return this.getName();
    }

    set selected(value) {
        this.setSelected(value);
    }

    get selected() {
        return this.getSelected();
    }

    set visible(value) {
        this.setVisible(value);
    }

    get visible() {
        return this.getVisible();
    }

    set selectable(value) {
        this.setSelectable(value);
    }

    get selectable() {
        return this.getSelectable();
    }
}

class SplatList extends Container {
    private splatCategory: CategoryContainer;
    private gltfCategory: CategoryContainer;
    private inspectionCategory: CategoryContainer;
    private inspectionPoints: Map<string, InspectionPointContainer>;
    private inspectionObjectsCategory: CategoryContainer;
    private inspectionObjectsGroups: Map<string, CategoryContainer>;
    private currentGroupId: string | null = null;
    private groupCounter = 0;
    private itemCounters: Map<string, number> = new Map();
    private inspectionObjectItems: Map<string, { item: SplatItem; groupId: string }> = new Map();

    constructor(events: Events, args = {}) {
        args = {
            ...args,
            class: 'splat-list'
        };

        super(args);

        const items = new Map<Element, SplatItem>();

        // 创建分类容器
        this.splatCategory = new CategoryContainer('Splat Models (PLY/SPLAT/SOG)');
        this.gltfCategory = new CategoryContainer('GLTF Models');
        this.inspectionCategory = new CategoryContainer('巡检点位');
        this.inspectionPoints = new Map<string, InspectionPointContainer>();
        this.inspectionObjectsCategory = new CategoryContainer('巡检对象', { class: ['category-container', 'inspection-objects-category'] });
        this.inspectionObjectsGroups = new Map();

        // 添加分类容器到主容器
        this.append(this.splatCategory);
        this.append(this.gltfCategory);
        this.append(this.inspectionCategory);
        this.append(this.inspectionObjectsCategory);

        // 组与对象添加逻辑（巡检对象）
        const nextGroupId = () => `XJDX-${++this.groupCounter}`;
        const ensureGroup = (groupId?: string) => {
            if (!groupId) {
                groupId = this.currentGroupId || nextGroupId();
            }
            let group = this.inspectionObjectsGroups.get(groupId);
            if (!group) {
                const groupContainer = new InspectionObjectGroupContainer(groupId, events);
                // duplicate adds empty group
                groupContainer.on('duplicateClicked', () => {
                    const newId = nextGroupId();
                    ensureGroup(newId);
                    this.currentGroupId = newId;
                });
                // delete group
                groupContainer.on('removeClicked', () => {
                    this.inspectionObjectsCategory.removeFromContent(groupContainer);
                    this.inspectionObjectsGroups.delete(groupId as string);
                    if (this.currentGroupId === groupId) this.currentGroupId = null;
                });
                group = groupContainer as unknown as CategoryContainer;
                this.inspectionObjectsGroups.set(groupId, group);
                this.inspectionObjectsCategory.appendToContent(groupContainer as any);
                // 组名双击重命名
                const editGroup = new TextInput({ id: 'inspection-group-edit' });
                const labelEl = (groupContainer as any).pointLabel as Label;
                labelEl?.dom.addEventListener('dblclick', (event: MouseEvent) => {
                    event.stopPropagation();
                    const onblur = () => {
                        (groupContainer as any).remove(editGroup);
                        labelEl.text = editGroup.value;
                        editGroup.input.removeEventListener('blur', onblur);
                        labelEl.hidden = false;
                    };
                    labelEl.hidden = true;
                    (groupContainer as any).appendAfter(editGroup, labelEl);
                    editGroup.value = labelEl.text;
                    editGroup.input.addEventListener('blur', onblur);
                    (editGroup as any).focus?.();
                });
                // 设置当前选中组
                (groupContainer as any).dom.addEventListener('click', (e: MouseEvent) => {
                    e.stopPropagation();
                    this.currentGroupId = groupId as string;
                });
            }
            this.currentGroupId = groupId as string;
            return group;
        };

        const addInspectionObject = (payload: { id: string; kind: 'point'|'line'|'face'; groupId?: string }) => {
            const kind = payload.kind;
            const group = ensureGroup(payload.groupId);
            const gid = this.currentGroupId as string;
            const idx = (this.itemCounters.get(gid) || 0) + 1;
            this.itemCounters.set(gid, idx);
            const prefix = kind === 'point' ? '点' : kind === 'line' ? '线' : '面';
            const name = `${prefix}-${gid}-${idx}`;
            const edit2 = new TextInput({ id: 'inspection-obj-edit' });
            const item = new SplatItem(name, edit2);
            item.class.add('inspection-model');
            item.class.add('no-duplicate');
            (group as any).appendToContent(item);
            (item.dom as HTMLElement).dataset.inspectionId = payload.id;
            this.inspectionObjectItems.set(payload.id, { item, groupId: gid });
            item.on('click', () => {
                this.currentGroupId = gid;
                // 选中高亮：同组其他子项取消选中
                const content = (group as any).dom.querySelector('.inspection-point-content') as HTMLElement;
                if (content) {
                    Array.from(content.children).forEach((child: any) => {
                        const ui = child.__ui as SplatItem | undefined;
                        if (ui && typeof ui.selected !== 'undefined') ui.selected = false;
                    });
                }
                item.selected = true;
                events.fire('inspectionObjects.edit', payload.id);
            });
            item.on('removeClicked', () => {
                (group as any).removeFromContent(item);
                events.fire('inspectionObjects.removeItem', payload.id);
            });
            item.on('rename', (value: string) => {
                item.name = value;
                // 可根据需要将名称同步到工具
            });
            item.on('visible', () => { events.fire('inspectionObjects.setVisible', payload.id, true); });
            item.on('invisible', () => { events.fire('inspectionObjects.setVisible', payload.id, false); });
            item.on('selectableChanged', (_it: SplatItem, selectable: boolean) => { events.fire('inspectionObjects.setSelectable', payload.id, selectable); });
        };

        // 监听工具添加对象事件
        events.on('inspectionObjects.addItem', (payload: any) => {
            addInspectionObject(payload);
        });
        // 清除子项选中高亮
        events.on('inspectionObjects.clearSelection', () => {
            this.inspectionObjectsGroups.forEach((group) => {
                const content = (group as any).dom.querySelector('.inspection-point-content') as HTMLElement;
                if (content) {
                    Array.from(content.children).forEach((child: any) => {
                        const ui = child.__ui as SplatItem | undefined;
                        if (ui && typeof ui.selected !== 'undefined') ui.selected = false;
                    });
                }
            });
        });
        // 初始化默认组
        ensureGroup();
        // 提供当前选中组查询
        events.function('inspectionObjects.currentGroupId', () => this.currentGroupId || nextGroupId());

        // 父级显隐时同步更新子项的图标显隐状态
        events.on('inspectionObjects.groupSetVisible', (groupId: string, visible: boolean) => {
            const group = this.inspectionObjectsGroups.get(groupId);
            if (!group) return;
            const content = (group as any).dom.querySelector('.inspection-point-content') as HTMLElement;
            if (!content) return;
            Array.from(content.children).forEach((child: any) => {
                const ui = child.__ui as SplatItem | undefined;
                if (ui && typeof ui.visible !== 'undefined') ui.visible = visible;
                const visEl = child.querySelector('.splat-item-visible') as HTMLElement | null;
                const invisEl = child.querySelector('.splat-item-invisible') as HTMLElement | null;
                if (visEl && invisEl) {
                    visEl.hidden = !visible;
                    invisEl.hidden = visible;
                }
            });
            // 同步通过映射确保 setter 生效
            this.inspectionObjectItems.forEach(({ item, groupId: gid }) => {
                if (gid === groupId) item.visible = visible;
            });
        });

        // edit input used during renames
        const edit = new TextInput({
            id: 'splat-edit'
        });

        events.on('scene.elementAdded', (element: Element) => {
            if (element.type === ElementType.splat) {
                const splat = element as Splat;
                const item = new SplatItem(splat.name, edit);
                this.splatCategory.appendToContent(item);
                items.set(splat, item);

                // 绑定选择事件
                item.on('click', () => {
                    events.fire('selection', splat);
                });

                item.on('visible', () => {
                    splat.visible = true;

                    // also select it if there is no other selection
                    if (!events.invoke('selection')) {
                        events.fire('selection', splat);
                    }
                });
                item.on('invisible', () => {
                    splat.visible = false;
                });
                item.on('selectableChanged', (item: SplatItem, selectable: boolean) => {
                    splat.selectable = selectable;
                });
                item.on('duplicateClicked', () => {
                    // Splat模型暂不支持复制功能，可在后续版本中实现
                    console.log('Splat模型复制功能暂未实现');
+                   events.fire('showToast', 'Splat 不支持复制');
                });
                item.on('removeClicked', () => {
                    console.log('SplatItem removeClicked 事件被触发，转发到 SplatList');
                    this.emit('removeClicked', item);
                });
                item.on('rename', (value: string) => {
                    events.fire('edit.add', new SplatRenameOp(splat, value));
                });
            } else if (element.type === ElementType.model) {
                const model = element as GltfModel;

                // 检查是否是巡检相关模型
                const isInspectionModel = (model as any).isInspectionModel;
                const inspectionPointName = (model as any).inspectionPointName;
                const inspectionMarkerName = (model as any).inspectionMarkerName;

                if (isInspectionModel && inspectionPointName) {
                    // 这是巡检点的子模型，只显示在巡检点位分类中
                    let pointContainer = this.inspectionPoints.get(inspectionPointName);

                    if (!pointContainer) {
                        // 创建新的巡检点容器
                        pointContainer = new InspectionPointContainer(inspectionPointName);
                        this.inspectionPoints.set(inspectionPointName, pointContainer);
                        this.inspectionCategory.appendToContent(pointContainer);

                        // 绑定巡检点位级别的事件
                        pointContainer.on('duplicateClicked', (pointName: string) => {
                            events.fire('inspection.duplicatePoint', pointName);
                        });

                        pointContainer.on('removeClicked', (pointName: string) => {
                            events.fire('inspection.deletePoint', pointName);
                        });

                        pointContainer.on('visibilityChanged', (pointName: string, visible: boolean) => {
                            events.fire('inspection.togglePointVisibility', pointName, visible);
                        });

                        pointContainer.on('selectableChanged', (pointName: string, selectable: boolean) => {
                            // 设置该巡检点位下所有子模型的可选状态
                            const pointItems = Array.from(items.entries()).filter(([element, item]) => {
                                const model = element as GltfModel;
                                return (model as any).isInspectionModel && (model as any).inspectionPointName === pointName;
                            });

                            pointItems.forEach(([element, item]) => {
                                const model = element as GltfModel;
                                model.selectable = selectable;
                                item.setSelectable(selectable);
                            });
                        });
                    }

                    // 创建子模型项
                    const displayName = inspectionMarkerName || model.filename;
                    const item = new SplatItem(displayName, edit);
                    item.class.add('inspection-model');

                    // 添加到巡检点容器
                    pointContainer.appendChild(item);
                    items.set(model, item);
                } else {
                    // 普通GLTF模型
                    const item = new SplatItem(model.filename, edit);
                    this.gltfCategory.appendToContent(item);
                    items.set(model, item);
                }

                // 绑定事件（对所有模型统一处理）
                const currentItem = items.get(model);
                if (currentItem) {
                    // 绑定选择事件
                    currentItem.on('click', () => {
                        events.fire('selection', model);
                    });

                    currentItem.on('visible', () => {
                        if (model.entity) {
                            model.visible = true;
                        }

                        // also select it if there is no other selection
                        if (!events.invoke('selection')) {
                            events.fire('selection', model);
                        }
                    });

                    currentItem.on('invisible', () => {
                        if (model.entity) {
                            model.visible = false;
                        }
                    });

                    currentItem.on('selectableChanged', (item: SplatItem, selectable: boolean) => {
                        model.selectable = selectable;
                    });

                    currentItem.on('duplicateClicked', () => {
                        if (isInspectionModel) {
                            // 巡检模型复制
                            events.fire('inspection.duplicateModel', inspectionPointName, model);
                            console.log('巡检模型原位复制');
                        } else {
                            // 普通GLB模型复制
                            events.fire('model.duplicate', model);
                            console.log('GLB模型原位复制:', model.filename);
                        }
                    });

                    currentItem.on('removeClicked', () => {
                        model.destroy();
                    });

                    // 添加GLB模型重命名事件处理
                    currentItem.on('rename', (value: string) => {
                        events.fire('edit.add', new GltfModelRenameOp(model, value));
                    });
                }
            }
        });

        events.on('scene.elementRemoved', (element: Element) => {
            if (element.type === ElementType.splat || element.type === ElementType.model) {
                const item = items.get(element);
                if (item) {
                    if (element.type === ElementType.splat) {
                        this.splatCategory.removeFromContent(item);
                    } else if (element.type === ElementType.model) {
                        const model = element as GltfModel;
                        const isInspectionModel = (model as any).isInspectionModel;
                        const inspectionPointName = (model as any).inspectionPointName;

                        if (isInspectionModel && inspectionPointName) {
                            // 从巡检点容器中移除
                            const pointContainer = this.inspectionPoints.get(inspectionPointName);
                            if (pointContainer) {
                                pointContainer.removeChild(item);

                                // 如果巡检点容器为空，移除整个容器
                                if (pointContainer.isEmpty()) {
                                    this.inspectionCategory.removeFromContent(pointContainer);
                                    this.inspectionPoints.delete(inspectionPointName);
                                }
                            }
                        } else {
                            // 普通GLTF模型
                            this.gltfCategory.removeFromContent(item);
                        }
                    }
                    items.delete(element);
                }
            }
        });

        events.on('selection.changed', (selection: Splat | GltfModel) => {
            items.forEach((value, key) => {
                value.selected = key === selection;
            });
        });

        events.on('splat.name', (splat: Splat) => {
            const item = items.get(splat);
            if (item) {
                item.name = splat.name;
            }
        });

        // 添加GLB模型名称更新事件处理
        events.on('model.name', (model: GltfModel) => {
            const item = items.get(model);
            if (item) {
                item.name = model.filename;
            }
        });

        events.on('splat.visibility', (splat: Splat) => {
            const item = items.get(splat);
            if (item) {
                item.visible = splat.visible;
            }
        });

        events.on('model.visibility', (model: GltfModel) => {
            const item = items.get(model);
            if (item) {
                item.visible = model.visible;
            }
        });

        // 选择事件现在直接在SplatItem创建时绑定，不再需要在SplatList级别处理

        this.on('removeClicked', async (item: SplatItem) => {
            console.log('SplatList收到removeClicked事件:', item);
            let element;
            for (const [key, value] of items) {
                if (item === value) {
                    element = key;
                    break;
                }
            }

            console.log('找到对应的element:', element);
            if (!element) {
                console.log('未找到对应的element，退出');
                return;
            }

            const elementName = element.type === ElementType.splat ?
                (element as Splat).name :
                (element as GltfModel).filename;

            console.log('准备显示删除确认对话框:', elementName);
            const result = await events.invoke('showPopup', {
                type: 'yesno',
                header: `Remove ${element.type === ElementType.splat ? 'Splat' : 'Model'}`,
                message: `Are you sure you want to remove '${elementName}' from the scene? This operation can not be undone.`
            });

            console.log('用户选择结果:', result);
            if (result?.action === 'yes') {
                console.log('执行删除操作');
                element.destroy();
            }
        });
    }

    // 不再需要_onAppendChild和_onRemoveChild方法，因为事件绑定现在在SplatItem创建时直接处理
}

export { SplatList, SplatItem, CategoryContainer };