import { registerStyle } from './store/styleRegistry';
import HeaderStyle1 from './components/Styles/HeaderStyle1';
import HeaderStyle2 from './components/Styles/HeaderStyle2';
import HeaderStyle3 from './components/Styles/HeaderStyle3';
import ModuleStyle1 from './components/Styles/ModuleStyle1';
import ModuleStyle2 from './components/Styles/ModuleStyle2';
import ModuleStyle3 from './components/Styles/ModuleStyle3';
import ModuleStyle4 from './components/Styles/ModuleStyle4';
import TextControl from './components/Styles/TextControl';
import HeadingControl from './components/Styles/HeadingControl';
import ListControl from './components/Styles/ListControl';

import headerThumb1 from './assets/images/headerThumb1.png';
import headerThumb2 from './assets/images/headerThumb2.png';
import headerThumb3 from './assets/images/headerThumb3.png';
import moduleThumb1 from './assets/images/moduleThumb1.png';
import moduleThumb2 from './assets/images/moduleThumb2.png';
import moduleThumb3 from './assets/images/moduleThumb3.png';
import moduleThumb4 from './assets/images/moduleThumb4.png';

export function initStyles() {
  // ========== 原有组件（保持不变） ==========
  registerStyle({
    type: 'header',
    style: 'header-style-1',
    label: '经典样式',
    thumb: headerThumb1,
    component: HeaderStyle1,
    defaultContent: {
      name: '姓名',
      jobTitle: '求职意向',
      birth: '出生年月',
      phone: '电话',
      email: '邮箱',
    },
  });

  registerStyle({
    type: 'header',
    style: 'header-style-2',
    label: '蓝色渐变背景',
    thumb: headerThumb2,
    component: HeaderStyle2,
    defaultContent: {
      name: '姓名',
      jobTitle: '求职意向',
      birth: '出生年月',
      phone: '电话',
      email: '邮箱',
    },
  });

  registerStyle({
    type: 'header',
    style: 'header-style-3',
    label: '名片式',
    thumb: headerThumb3,
    component: HeaderStyle3,
    defaultContent: {
      name: '姓名',
      jobTitle: '求职意向',
      birth: '出生年月',
      phone: '电话',
      email: '邮箱',
    },
  });

  registerStyle({
    type: 'module',
    style: 'module-style-1',
    label: '默认样式',
    thumb: moduleThumb1,
    component: ModuleStyle1,
    defaultContent: {
      title: '模块标题',
      content: '点击此处编辑内容...',
    },
  });

  registerStyle({
    type: 'module',
    style: 'module-style-2',
    label: '蓝色边界线',
    thumb: moduleThumb2,
    component: ModuleStyle2,
    defaultContent: {
      title: '模块标题',
      content: '点击此处编辑内容...',
    },
  });

  registerStyle({
    type: 'module',
    style: 'module-style-3',
    label: '色块标签',
    thumb: moduleThumb3,
    component: ModuleStyle3,
    defaultContent: {
      title: '模块标题',
      content: '点击此处编辑内容...',
    },
  });

  registerStyle({
    type: 'module',
    style: 'module-style-4',
    label: '无边框默认样式',
    thumb: moduleThumb4,
    component: ModuleStyle4,
    defaultContent: {
      title: '模块标题',
      content: '点击此处编辑内容...',
    },
  });

  // ========== 新增控件类型 ==========
  registerStyle({
    type: 'text',
    style: 'text-default',
    label: '文本框',
    thumb: '',       // 控件不会出现在样式面板，可留空
    component: TextControl,
    defaultContent: {
      content: '请在此输入文本...',
    },
  });

  registerStyle({
    type: 'heading',
    style: 'heading-default',
    label: '标题',
    thumb: '',
    component: HeadingControl,
    defaultContent: {
      content: '标题',
    },
  });

  registerStyle({
    type: 'list',
    style: 'list-default',
    label: '列表',
    thumb: '',
    component: ListControl,
    defaultContent: {
      content: '<li>列表项</li>',
    },
  });
}