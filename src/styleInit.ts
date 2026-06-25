// src/styleInit.ts
import { registerStyle } from './store/styleRegistry';
import TextControl from './components/Styles/TextControl';
import HeadingControl from './components/Styles/HeadingControl';
import ListControl from './components/Styles/ListControl';
import FlexContainer from './components/Styles/FlexContainer';
import GridContainer from './components/Styles/GridContainer';
import ImageModule from './components/Styles/ImageModule';
import MinimalContainer from './components/Styles/MinimalContainer';  // 新增

import headerThumb1 from './assets/images/headerThumb1.png';
import headerThumb2 from './assets/images/headerThumb2.png';
import headerThumb3 from './assets/images/headerThumb3.png';
import moduleThumb1 from './assets/images/moduleThumb1.png';
import moduleThumb2 from './assets/images/moduleThumb2.png';
import moduleThumb3 from './assets/images/moduleThumb3.png';
import moduleThumb4 from './assets/images/moduleThumb4.png';

export function initStyles() {
  // ===================== 基础控件注册 =====================
  registerStyle({ type: 'text', style: 'text-default', label: '文本框', thumb: '', component: TextControl, defaultContent: { content: '请在此输入文本...' }, defaultStyle: { padding: '0', margin: '0' } });
  registerStyle({ type: 'heading', style: 'heading-default', label: '标题', thumb: '', component: HeadingControl, defaultContent: { content: '标题' }, defaultStyle: { padding: '0', margin: '0' } });
  registerStyle({ type: 'list', style: 'list-default', label: '列表', thumb: '', component: ListControl, defaultContent: { content: '<li>列表项</li>' }, defaultStyle: { padding: '0', margin: '0' } });
  registerStyle({ type: 'image', style: 'image-default', label: '图片', thumb: '', component: ImageModule, defaultContent: { content: '' }, defaultStyle: { padding: '0', margin: '0' } });
  registerStyle({ type: 'flex', style: 'flex-default', label: '弹性容器', thumb: '', component: FlexContainer, defaultStyle: { padding: '0', margin: '0', gap: '0' } });
  registerStyle({ type: 'grid', style: 'grid-default', label: '网格容器', thumb: '', component: GridContainer, defaultStyle: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', padding: '0', margin: '0' } });

  // ===================== 新版简历头模板 =====================
  registerStyle({
    type: 'header',
    style: 'header-classic',
    label: '经典分栏',
    thumb: headerThumb1,
    component: MinimalContainer,  // 新增
    defaultStyle: {
      display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: '20px',
      padding: '24px', backgroundColor: '#ffffff', borderRadius: '12px',
      border: '1px solid #e8ecf1', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    },
    defaultChildren: [
      {
        type: 'image', styleId: 'image-default',
        defaultStyle: { width: '100px', height: '130px', borderRadius: '8px', objectFit: 'cover' },
        defaultProps: { content: '' },
      },
      {
        type: 'flex', styleId: 'flex-default',
        defaultStyle: { flexDirection: 'column', gap: '12px', flex: '1' },
        children: [
          { type: 'text', styleId: 'text-default', defaultStyle: { fontSize: '24px', fontWeight: '700', color: '#1a202c' }, defaultProps: { content: '张三', name: 'name' } },
          {
            type: 'grid', styleId: 'grid-default',
            defaultStyle: { gridTemplateColumns: '1fr 1fr', gap: '12px' },
            children: [
              { type: 'text', styleId: 'text-default', defaultStyle: { fontSize: '15px', color: '#4a5568' }, defaultProps: { content: '求职意向：产品经理', jobTitle: 'jobTitle' } },
              { type: 'text', styleId: 'text-default', defaultStyle: { fontSize: '15px', color: '#4a5568' }, defaultProps: { content: '出生年月：1998.06', birth: 'birth' } },
              { type: 'text', styleId: 'text-default', defaultStyle: { fontSize: '15px', color: '#4a5568' }, defaultProps: { content: '📞 136-0000-0000', phone: 'phone' } },
              { type: 'text', styleId: 'text-default', defaultStyle: { fontSize: '15px', color: '#4a5568' }, defaultProps: { content: '📧 zhang@example.com', email: 'email' } },
            ],
          },
        ],
      },
    ],
  });

  registerStyle({
    type: 'header',
    style: 'header-gradient',
    label: '蓝色渐变',
    thumb: headerThumb2,
    component: MinimalContainer,  // 新增
    defaultStyle: {
      display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '24px',
      padding: '24px', background: 'linear-gradient(135deg, #e0f2fe 0%, #ffffff 100%)',
      borderRadius: '16px', border: '1px solid #bae6fd',
    },
    defaultChildren: [
      {
        type: 'flex', styleId: 'flex-default',
        defaultStyle: { flexDirection: 'column', gap: '12px', flex: '1' },
        children: [
          { type: 'text', styleId: 'text-default', defaultStyle: { fontSize: '26px', fontWeight: '700', color: '#0c4a6e' }, defaultProps: { content: '李四', name: 'name' } },
          { type: 'text', styleId: 'text-default', defaultStyle: { fontSize: '16px', color: '#0369a1' }, defaultProps: { content: '全栈工程师', jobTitle: 'jobTitle' } },
          {
            type: 'flex', styleId: 'flex-default',
            defaultStyle: { flexDirection: 'row', gap: '20px', flexWrap: 'wrap', marginTop: '8px' },
            children: [
              { type: 'text', styleId: 'text-default', defaultStyle: { fontSize: '14px', color: '#334155' }, defaultProps: { content: '📞 139-0000-0000', phone: 'phone' } },
              { type: 'text', styleId: 'text-default', defaultStyle: { fontSize: '14px', color: '#334155' }, defaultProps: { content: '📧 lisi@dev.com', email: 'email' } },
              { type: 'text', styleId: 'text-default', defaultStyle: { fontSize: '14px', color: '#334155' }, defaultProps: { content: '📍 杭州市', birth: 'birth' } },
            ],
          },
        ],
      },
      {
        type: 'image', styleId: 'image-default',
        defaultStyle: { width: '100px', height: '100px', borderRadius: '50%', border: '3px solid #ffffff', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' },
        defaultProps: { content: '' },
      },
    ],
  });

  registerStyle({
    type: 'header',
    style: 'header-business',
    label: '名片风格',
    thumb: headerThumb3,
    component: MinimalContainer,  // 新增
    defaultStyle: {
      display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '20px',
      padding: '24px', backgroundColor: '#f8fafc', borderRadius: '12px',
      border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)',
    },
    defaultChildren: [
      {
        type: 'flex', styleId: 'flex-default',
        defaultStyle: { flexDirection: 'column', gap: '8px', flex: '1' },
        children: [
          { type: 'text', styleId: 'text-default', defaultStyle: { fontSize: '24px', fontWeight: '700', color: '#1e293b' }, defaultProps: { content: '王五', name: 'name' } },
          { type: 'text', styleId: 'text-default', defaultStyle: { fontSize: '15px', color: '#475569' }, defaultProps: { content: '高级UI设计师 · 10年经验', jobTitle: 'jobTitle' } },
          {
            type: 'flex', styleId: 'flex-default',
            defaultStyle: { flexDirection: 'row', gap: '20px', marginTop: '8px' },
            children: [
              { type: 'text', styleId: 'text-default', defaultStyle: { fontSize: '14px', color: '#64748b' }, defaultProps: { content: '📞 137-1234-5678', phone: 'phone' } },
              { type: 'text', styleId: 'text-default', defaultStyle: { fontSize: '14px', color: '#64748b' }, defaultProps: { content: '📧 wangwu@design.com', email: 'email' } },
            ],
          },
        ],
      },
      {
        type: 'image', styleId: 'image-default',
        defaultStyle: { width: '80px', height: '80px', borderRadius: '12px', objectFit: 'cover' },
        defaultProps: { content: '' },
      },
    ],
  });

  // ===================== 新版模块模板 =====================
  registerStyle({
    type: 'module',
    style: 'module-card',
    label: '卡片样式',
    thumb: moduleThumb1,
    component: MinimalContainer,  // 新增
    defaultStyle: {
      display: 'flex', flexDirection: 'column', gap: '12px', padding: '20px',
      backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0',
      boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
    },
    defaultChildren: [
      { type: 'heading', styleId: 'heading-default', defaultStyle: { fontSize: '20px', fontWeight: '700', color: '#0f172a', paddingBottom: '8px', borderBottom: '2px solid #f1f5f9' }, defaultProps: { content: '工作经验', title: '模块标题' } },
      { type: 'text', styleId: 'text-default', defaultStyle: { fontSize: '15px', color: '#334155', lineHeight: '1.6' }, defaultProps: { content: '点击此处编辑详细内容...' } },
    ],
  });

  registerStyle({
    type: 'module',
    style: 'module-timeline',
    label: '时间线样式',
    thumb: moduleThumb2,
    component: MinimalContainer,  // 新增
    defaultStyle: {
      display: 'flex', flexDirection: 'column', gap: '8px',
      padding: '16px 0 16px 24px', borderLeft: '3px solid #3b82f6',
    },
    defaultChildren: [
      { type: 'text', styleId: 'text-default', defaultStyle: { fontSize: '14px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }, defaultProps: { content: '2020 - 至今' } },
      { type: 'heading', styleId: 'heading-default', defaultStyle: { fontSize: '18px', fontWeight: '700', color: '#1e293b' }, defaultProps: { content: '公司名称', title: '模块标题' } },
      { type: 'text', styleId: 'text-default', defaultStyle: { fontSize: '15px', color: '#475569' }, defaultProps: { content: '职位/描述' } },
    ],
  });

  registerStyle({
    type: 'module',
    style: 'module-list',
    label: '简洁列表',
    thumb: moduleThumb3,
    component: MinimalContainer,  // 新增
    defaultStyle: {
      display: 'flex', flexDirection: 'column', gap: '12px', padding: '8px 0',
    },
    defaultChildren: [
      { type: 'heading', styleId: 'heading-default', defaultStyle: { fontSize: '20px', fontWeight: '700', color: '#0f172a' }, defaultProps: { content: '技能专长', title: '模块标题' } },
      { type: 'list', styleId: 'list-default', defaultStyle: { fontSize: '15px', color: '#334155' }, defaultProps: { content: '<ul><li>技能一</li><li>技能二</li><li>技能三</li></ul>' } },
    ],
  });

  registerStyle({
    type: 'module',
    style: 'module-plain',
    label: '简约无边框',
    thumb: moduleThumb4,
    component: MinimalContainer,  // 新增
    defaultStyle: {
      display: 'flex', flexDirection: 'column', gap: '4px', padding: '4px 0',
    },
    defaultChildren: [
      { type: 'heading', styleId: 'heading-default', defaultStyle: { fontSize: '16px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }, defaultProps: { content: '教育背景', title: '模块标题' } },
      { type: 'text', styleId: 'text-default', defaultStyle: { fontSize: '15px', color: '#334155' }, defaultProps: { content: '学校名称 · 专业 · 毕业年份' } },
    ],
  });
}