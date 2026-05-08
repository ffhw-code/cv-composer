import { registerStyle } from './store/styleRegistry';
import HeaderStyle1 from './components/Styles/HeaderStyle1';
import HeaderStyle2 from './components/Styles/HeaderStyle2';
import ModuleStyle1 from './components/Styles/ModuleStyle1';
import ModuleStyle2 from './components/Styles/ModuleStyle2';
import headerThumb1 from './assets/images/headerThumb1.png';
import moduleThumb1 from './assets/images/moduleThumb1.png';
import headerThumb2 from './assets/images/headerThumb2.png';
import moduleThumb2 from './assets/images/moduleThumb2.png';

export function initStyles() {
  registerStyle({
    type: 'header',
    style: 'header-style-1',
    label: '经典居中',
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
    label: '左右分栏',
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
    type: 'module',
    style: 'module-style-1',
    label: '默认卡片',
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
    label: '左侧列表',
    thumb: moduleThumb2,
    component: ModuleStyle2,
    defaultContent: {
      title: '模块标题',
      content: '点击此处编辑内容...',
    },
  });
}