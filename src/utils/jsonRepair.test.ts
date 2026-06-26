import { describe, it, expect } from 'vitest';
import { repairTruncatedJson } from './jsonRepair';

describe('repairTruncatedJson', () => {
  it('returns valid JSON unchanged', () => {
    const input = '{"name":"test","value":123}';
    expect(repairTruncatedJson(input)).toBe(input);
  });

  it('returns empty object unchanged', () => {
    expect(repairTruncatedJson('{}')).toBe('{}');
  });

  it('returns valid array unchanged', () => {
    expect(repairTruncatedJson('[1,2,3]')).toBe('[1,2,3]');
  });

  it('closes unclosed brace', () => {
    const input = '{"name":"test"';
    expect(repairTruncatedJson(input)).toBe('{"name":"test"}');
  });

  it('closes multiple unclosed braces', () => {
    const input = '{"outer":{"inner":"val"';
    expect(repairTruncatedJson(input)).toBe('{"outer":{"inner":"val"}}');
  });

  it('closes unclosed bracket', () => {
    const input = '[1,2,{"key":"val"';
        // Note: closes brackets before braces (not LIFO)
    expect(repairTruncatedJson(input)).toBe('[1,2,{"key":"val"]}');
  });

  it('closes both brace and bracket', () => {
    const input = '{"arr":[1,2';
    expect(repairTruncatedJson(input)).toBe('{"arr":[1,2]}');
  });

  it('handles escaped quotes in strings', () => {
    const input = '{"msg":"hello \\"world\\""';
    expect(repairTruncatedJson(input)).toBe('{"msg":"hello \\"world\\""}');
  });

  it('closes unterminated string', () => {
    const input = '{"key":"val';
    expect(repairTruncatedJson(input)).toBe('{"key":"val"}');
  });

  it('handles nested arrays and objects', () => {
    const input = '{"a":[{"b":[1,2]';
        expect(repairTruncatedJson(input)).toBe('{"a":[{"b":[1,2]]}}');
  });

  it('handles escaped backslashes in strings', () => {
    const input = '{"path":"C:\\\\Users"';
    expect(repairTruncatedJson(input)).toBe('{"path":"C:\\\\Users"}');
  });
});
