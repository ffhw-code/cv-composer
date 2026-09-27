import { describe, expect, it } from 'vitest';
import { stableStringify, toolCallFingerprint } from './stableStringify';

describe('stableStringify：规范化序列化', () => {
  it('对象键序不影响结果（模型两次只差键序时必须等价）', () => {
    expect(stableStringify({ id: 'm1', style: { fontSize: '15px', color: '#333' } }))
      .toBe(stableStringify({ style: { color: '#333', fontSize: '15px' }, id: 'm1' }));
  });

  it('剔除值为 undefined 的键，但保留 null / false / 0 / 空串', () => {
    expect(stableStringify({ a: 1, b: undefined })).toBe('{"a":1}');
    expect(stableStringify({ a: null, b: false, c: 0, d: '' })).toBe('{"a":null,"b":false,"c":0,"d":""}');
  });

  it('数组保序（children / ids 的顺序有语义）', () => {
    expect(stableStringify(['a', 'b'])).toBe('["a","b"]');
    expect(stableStringify(['b', 'a'])).toBe('["b","a"]');
    expect(stableStringify(['a', 'b'])).not.toBe(stableStringify(['b', 'a']));
  });

  it('数组元素里的 undefined 归一为 null（与 JSON.stringify 一致，不缩短数组）', () => {
    expect(stableStringify([1, undefined, 2])).toBe('[1,null,2]');
  });

  it('嵌套结构与原始值', () => {
    expect(stableStringify({ children: [{ type: 'text', content: 'x' }], columns: 2 }))
      .toBe('{"children":[{"content":"x","type":"text"}],"columns":2}');
    expect(stableStringify('text')).toBe('"text"');
    expect(stableStringify(undefined)).toBe('null');
    expect(stableStringify(3)).toBe('3');
  });

  it('toolCallFingerprint：工具名参与指纹，参数等价即同指纹', () => {
    expect(toolCallFingerprint('add_module', { title: 'a', content: 'b' }))
      .toBe(toolCallFingerprint('add_module', { content: 'b', title: 'a' }));
    expect(toolCallFingerprint('add_module', { title: 'a' }))
      .not.toBe(toolCallFingerprint('remove_module', { title: 'a' }));
    expect(toolCallFingerprint('delete_modules', { ids: ['a', 'b'] }))
      .not.toBe(toolCallFingerprint('delete_modules', { ids: ['b', 'a'] }));
  });
});
