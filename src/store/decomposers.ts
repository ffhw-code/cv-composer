// src/store/decomposers.ts
import type { ResumeModule } from './useResumeStore';

export function decomposerHeader1(parentId: string): ResumeModule[] {
  return [
    {
      id: '', type: 'image', styleId: 'image-default',
      style: { width: '96px', height: '128px', borderRadius: '4px' },
      content: '',
      children: [],
      parentId,
    } as ResumeModule,
    {
      id: '', type: 'grid', styleId: 'grid-default',
      style: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '16px',
        flex: '1',
      },
      children: [
        {
          id: '', type: 'text', styleId: 'text-default',
          style: { fontSize: '18px', fontWeight: 'bold' },
          content: '<p>姓名</p>', // 使用默认内容
          name: '姓名',
          children: [],
          parentId: '__placeholder__', // 将在构建时替换为实际父ID
        },
        {
          id: '', type: 'text', styleId: 'text-default',
          style: {},
          content: '<p>求职意向</p>',
          jobTitle: '求职意向',
          children: [],
        },
        {
          id: '', type: 'text', styleId: 'text-default',
          style: {},
          content: '<p>出生年月</p>',
          birth: '出生年月',
          children: [],
        },
        {
          id: '', type: 'text', styleId: 'text-default',
          style: {},
          content: '<p>电话</p>',
          phone: '电话',
          children: [],
        },
        {
          id: '', type: 'text', styleId: 'text-default',
          style: { gridColumn: '1 / -1' },
          content: '<p>邮箱</p>',
          email: '邮箱',
          children: [],
        },
      ],
      parentId,
    } as ResumeModule,
  ];
}

// 类似地为 Header2、Header3、Module1-4 编写分解器，此处省略重复（参见下文完整文件）