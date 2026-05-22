// src/engine/templates.ts
export interface TemplateModule {
  tempId: string;
  type: string;
  styleId?: string;
  style?: Record<string, string>;
  content?: string;
  name?: string;
  jobTitle?: string;
  birth?: string;
  phone?: string;
  email?: string;
  title?: string;
  children?: TemplateModule[];
}

export interface ResumeTemplate {
  meta: { name: string; version: string };
  modules: TemplateModule[];
}

const classic: ResumeTemplate = {
  meta: { name: '经典简历', version: '1.0' },
  modules: [
    {
      tempId: 'header',
      type: 'header',
      styleId: 'header-classic',
      style: {
        display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: '20px',
        padding: '28px', backgroundColor: '#f8fafc', borderRadius: '16px',
        border: '2px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
      },
      children: [
        {
          tempId: 'photo',
          type: 'image',
          styleId: 'image-default',
          style: { width: '110px', height: '140px', borderRadius: '10px', objectFit: 'cover' },
          content: '',
        },
        {
          tempId: 'info-container',
          type: 'flex',
          styleId: 'flex-default',
          style: { flexDirection: 'column', gap: '14px', flex: '1' },
          children: [
            {
              tempId: 'name-text',
              type: 'text',
              styleId: 'text-default',
              style: { fontSize: '28px', fontWeight: '800', color: '#0f172a' },
              content: '姓名',
              name: '姓名',
            },
            {
              tempId: 'info-grid',
              type: 'grid',
              styleId: 'grid-default',
              style: { gridTemplateColumns: '1fr 1fr', gap: '14px' },
              children: [
                { tempId: 'job', type: 'text', styleId: 'text-default', style: { fontSize: '16px', color: '#475569' }, content: '求职意向', jobTitle: '求职意向' },
                { tempId: 'birth', type: 'text', styleId: 'text-default', style: { fontSize: '16px', color: '#475569' }, content: '出生年月', birth: '出生年月' },
                { tempId: 'phone', type: 'text', styleId: 'text-default', style: { fontSize: '16px', color: '#475569' }, content: '📞 电话', phone: '电话' },
                { tempId: 'email', type: 'text', styleId: 'text-default', style: { fontSize: '16px', color: '#475569' }, content: '📧 邮箱', email: '邮箱' },
              ],
            },
          ],
        },
      ],
    },
    {
      tempId: 'edu',
      type: 'module',
      styleId: 'module-timeline',
      style: {
        display: 'flex', flexDirection: 'column', gap: '10px',
        padding: '16px 0 16px 24px', borderLeft: '4px solid #3b82f6',
      },
      children: [
        {
          tempId: 'edu-heading',
          type: 'heading',
          styleId: 'heading-default',
          style: { fontSize: '20px', fontWeight: '700', color: '#1e293b' },
          content: '教育背景',
        },
        {
          tempId: 'edu-text',
          type: 'text',
          styleId: 'text-default',
          style: { fontSize: '15px', color: '#334155' },
          content: '点击此处编辑教育背景...',
        },
      ],
    },
    {
      tempId: 'work',
      type: 'module',
      styleId: 'module-card',
      style: {
        display: 'flex', flexDirection: 'column', gap: '12px', padding: '20px',
        backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      },
      children: [
        {
          tempId: 'work-heading',
          type: 'heading',
          styleId: 'heading-default',
          style: { fontSize: '20px', fontWeight: '700', color: '#0f172a', paddingBottom: '8px', borderBottom: '2px solid #f1f5f9' },
          content: '工作经历',
        },
        {
          tempId: 'work-text',
          type: 'text',
          styleId: 'text-default',
          style: { fontSize: '15px', color: '#334155', lineHeight: '1.6' },
          content: '点击此处编辑工作经历...',
        },
      ],
    },
  ],
};

export const templates: Record<string, ResumeTemplate> = {
  simple: {
    meta: { name: '简约简历', version: '1.0' },
    modules: [
      {
        tempId: 'header',
        type: 'header',
        styleId: 'header-classic',
        style: {
          display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: '20px',
          padding: '24px', backgroundColor: '#ffffff', borderRadius: '12px',
          border: '1px solid #e8ecf1', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        },
        children: [
          {
            tempId: 'photo',
            type: 'image',
            styleId: 'image-default',
            style: { width: '100px', height: '130px', borderRadius: '8px', objectFit: 'cover' },
            content: '',
          },
          {
            tempId: 'info-container',
            type: 'flex',
            styleId: 'flex-default',
            style: { flexDirection: 'column', gap: '12px', flex: '1' },
            children: [
              {
                tempId: 'name-text',
                type: 'text',
                styleId: 'text-default',
                style: { fontSize: '24px', fontWeight: '700', color: '#1a202c' },
                content: '姓名',
                name: '姓名',
              },
              {
                tempId: 'info-grid',
                type: 'grid',
                styleId: 'grid-default',
                style: { gridTemplateColumns: '1fr 1fr', gap: '12px' },
                children: [
                  { tempId: 'job', type: 'text', styleId: 'text-default', content: '求职意向', jobTitle: '求职意向' },
                  { tempId: 'birth', type: 'text', styleId: 'text-default', content: '出生年月', birth: '出生年月' },
                  { tempId: 'phone', type: 'text', styleId: 'text-default', content: '📞 电话', phone: '电话' },
                  { tempId: 'email', type: 'text', styleId: 'text-default', content: '📧 邮箱', email: '邮箱' },
                ],
              },
            ],
          },
        ],
      },
      {
        tempId: 'edu',
        type: 'module',
        styleId: 'module-card',
        style: {
          display: 'flex', flexDirection: 'column', gap: '12px', padding: '20px',
          backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        },
        children: [
          {
            tempId: 'edu-heading',
            type: 'heading',
            styleId: 'heading-default',
            style: { fontSize: '20px', fontWeight: '700', color: '#0f172a', paddingBottom: '8px', borderBottom: '2px solid #f1f5f9' },
            content: '教育背景',
          },
          {
            tempId: 'edu-text',
            type: 'text',
            styleId: 'text-default',
            style: { fontSize: '15px', color: '#334155', lineHeight: '1.6' },
            content: '点击此处编辑教育背景...',
          },
        ],
      },
      {
        tempId: 'work',
        type: 'module',
        styleId: 'module-card',
        style: {
          display: 'flex', flexDirection: 'column', gap: '12px', padding: '20px',
          backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        },
        children: [
          {
            tempId: 'work-heading',
            type: 'heading',
            styleId: 'heading-default',
            style: { fontSize: '20px', fontWeight: '700', color: '#0f172a', paddingBottom: '8px', borderBottom: '2px solid #f1f5f9' },
            content: '工作经历',
          },
          {
            tempId: 'work-text',
            type: 'text',
            styleId: 'text-default',
            style: { fontSize: '15px', color: '#334155', lineHeight: '1.6' },
            content: '点击此处编辑工作经历...',
          },
        ],
      },
    ],
  },
  classic,
};

export function loadTemplate(name: string): ResumeTemplate | undefined {
  return templates[name];
}