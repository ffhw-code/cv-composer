import { describe, expect, it } from 'vitest';
import { parseToolArguments } from './toolArgsParser';

/** 以下坏样本全部取自 AI 基线日志（qwen3.7-flash，metrics/ai-baseline-2026-09-11T03-30-25-191Z.json） */

describe('parseToolArguments - 合法输入', () => {
  it('标准 JSON 直接通过', () => {
    const result = parseToolArguments('{"id":"a","style":{"fontSize":"15px"}}', ['id', 'style']);
    expect(result.status).toBe('ok');
    expect(result.args).toEqual({ id: 'a', style: { fontSize: '15px' } });
  });

  it('无必填项时允许空参数', () => {
    expect(parseToolArguments('{}', [])).toEqual({ args: {}, status: 'ok' });
    expect(parseToolArguments('', []).status).toBe('ok');
  });

  it('合法 JSON 但缺必填键 → invalid', () => {
    const result = parseToolArguments('{"id":"a"}', ['id', 'style']);
    expect(result.status).toBe('invalid');
    expect(result.missing).toEqual(['style']);
  });

  it('空参数但工具要求必填 → invalid', () => {
    const result = parseToolArguments('', ['id']);
    expect(result.status).toBe('invalid');
    expect(result.missing).toEqual(['id']);
  });
});

describe('parseToolArguments - 截断修复（原有能力）', () => {
  it('补全缺失的引号与括号', () => {
    const result = parseToolArguments('{"id":"abc","content":"hello', ['id', 'content']);
    expect(result.status).toBe('repaired');
    expect(result.args).toEqual({ id: 'abc', content: 'hello' });
  });
});

describe('parseToolArguments - 嵌套对象值缺失（真实样本）', () => {
  it('execute_skill: params 为空 → 打捞 name，params 缺省可用', () => {
    const raw = '{"name": "generate-resume", "params": }';
    const result = parseToolArguments(raw, ['name']);
    expect(result.status).toBe('repaired');
    expect(result.args).toEqual({ name: 'generate-resume' });
    expect(result.detail).toContain('params');
  });

  it('params 只有空白字符时同样打捞', () => {
    const result = parseToolArguments('{"name": "generate-resume", "params":   }', ['name']);
    expect(result.status).toBe('repaired');
    expect(result.args).toEqual({ name: 'generate-resume' });
  });

  it('set_style: style 为空 → invalid，且保留打捞到的 id', () => {
    const result = parseToolArguments('{"id": "seed-text-exp", "style": }', ['id', 'style']);
    expect(result.status).toBe('invalid');
    expect(result.missing).toEqual(['style']);
    expect(result.args).toEqual({ id: 'seed-text-exp' });
  });

  it('style 为空（多空白）→ invalid', () => {
    const result = parseToolArguments('{"id": "seed-text-exp", "style":        }', ['id', 'style']);
    expect(result.status).toBe('invalid');
    expect(result.missing).toEqual(['style']);
  });

  it('style 内部值缺失 → invalid', () => {
    const result = parseToolArguments('{"id":"a","style":{"fontSize":}}', ['id', 'style']);
    expect(result.status).toBe('invalid');
    expect(result.missing).toEqual(['style']);
  });

  it('失败场景样本：NOT-EXIST-MODULE-999 + 空 style', () => {
    const result = parseToolArguments('{"id": "NOT-EXIST-MODULE-999", "style": }', ['id', 'style']);
    expect(result.status).toBe('invalid');
    expect(result.missing).toEqual(['style']);
    expect(result.detail).toContain('style');
  });

  it('顶层键的意图会被保留（polish-text 把 moduleId 写到了 params 外）', () => {
    const raw = '{"name": "polish-text", "params": , "moduleId": "e2d614d4-1c01-41ec-a207-465fe4d477b4"}';
    const result = parseToolArguments(raw, ['name']);
    expect(result.status).toBe('repaired');
    expect(result.args).toEqual({ name: 'polish-text', moduleId: 'e2d614d4-1c01-41ec-a207-465fe4d477b4' });
  });

  it('evaluate-resume: params 为空 → 可继续执行', () => {
    const result = parseToolArguments('{"name": "evaluate-resume", "params": }', ['name']);
    expect(result.status).toBe('repaired');
    expect(result.args).toEqual({ name: 'evaluate-resume' });
  });
});

describe('parseToolArguments - 原生 <parameter=...> 标记泄漏（真实样本）', () => {
  it('嵌套值写成 parameter 标记 → 打捞外层键', () => {
    const raw = '{"name": "generate-resume", "params": <parameter=template>\nsimple}';
    const result = parseToolArguments(raw, ['name']);
    expect(result.status).toBe('repaired');
    expect(result.args).toEqual({ name: 'generate-resume' });
    expect(result.detail).toContain('params');
  });

  it('set_style 的 style 被写成 parameter 标记 → invalid 且不执行', () => {
    const raw = '{"id": "seed-text-exp", "style": <parameter=fontSize>\n15px}';
    const result = parseToolArguments(raw, ['id', 'style']);
    expect(result.status).toBe('invalid');
    expect(result.missing).toEqual(['style']);
    expect(result.args).toEqual({ id: 'seed-text-exp' });
  });

  it('标记与多余闭合标签混杂 → 仍只打捞结构完好的键', () => {
    const raw = '{"id": "seed-text-exp", "style": <parameter=fontSize>15px, "color": "#334155</color>\n    </style>"}';
    const result = parseToolArguments(raw, ['id', 'style']);
    expect(result.status).toBe('invalid');
    expect(result.missing).toEqual(['style']);
    expect(result.args.id).toBe('seed-text-exp');
  });

  it('模型把整段工具调用写成标记 → invalid（不产生副作用）', () => {
    const raw = '{"id": "seed-text-exp", "style": <parameter=name>set_style, "parameters": "{\\"id\\": \\"seed-text-exp\\", \\"style\\": {\\"fontSize\\": \\"15px\\"}}"}';
    const result = parseToolArguments(raw, ['id', 'style']);
    expect(result.status).toBe('invalid');
    expect(result.missing).toEqual(['style']);
    expect(result.detail).toContain('style');
  });

  it('detail 会带上原文片段，便于回传给模型自纠正', () => {
    const result = parseToolArguments('{"id": "x", "style": <parameter=c>red}', ['id', 'style']);
    expect(result.status).toBe('invalid');
    expect(result.detail).toContain('<parameter=c>');
  });
});
