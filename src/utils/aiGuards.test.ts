import { describe, expect, it } from 'vitest';
import {
  CORRECTION_INSTRUCTION,
  FAKE_SUCCESS_NOTICE,
  MAX_TOOL_ROUNDS,
  TurnCallGuard,
  inspectToolLessReply,
  looksLikeEditClaim,
  looksLikeToolCallJson,
  needsCorrectionRetry,
  resolveTurnOutcome,
  stripThinkLeak,
} from './aiGuards';

const ADD_ARGS = { styleId: 'module-card', title: '教育背景', content: '<p>某大学</p>' };

describe('TurnCallGuard：同轮重复调用', () => {
  it('首次不判冗余；record 之后同工具同参数第二次判 REDUNDANT_CALL 并带回上一次结果', () => {
    const guard = new TurnCallGuard();
    const first = guard.inspect('add_module', ADD_ARGS);
    expect(first.redundant).toBe(false);

    guard.record('add_module', ADD_ARGS, '{"id":"mod-1","type":"module"}');

    const second = guard.inspect('add_module', ADD_ARGS);
    expect(second.redundant).toBe(true);
    if (!second.redundant) throw new Error('unreachable');
    expect(second.code).toBe('REDUNDANT_CALL');
    expect(second.priorResult).toContain('mod-1');
  });

  it('参数键序不同视为同一指纹（等价参数也要拦）', () => {
    const guard = new TurnCallGuard();
    guard.record('set_style', { id: 'm1', style: { color: '#333', fontSize: '15px' } }, '已应用');
    const decision = guard.inspect('set_style', { style: { fontSize: '15px', color: '#333' }, id: 'm1' });
    expect(decision.redundant).toBe(true);
  });

  it('数组顺序不同视为不同指纹（不误拦）', () => {
    const guard = new TurnCallGuard();
    guard.record('delete_modules', { ids: ['a', 'b'] }, '已删除 2 个');
    expect(guard.inspect('delete_modules', { ids: ['b', 'a'] }).redundant).toBe(false);
  });

  it('不同参数不算重复（批量改同一模块的不同属性必须放行）', () => {
    const guard = new TurnCallGuard();
    guard.record('set_style', { id: 'm1', style: { color: '#333' } }, '已应用');
    expect(guard.inspect('set_style', { id: 'm1', style: { color: '#444' } }).redundant).toBe(false);
    expect(guard.inspect('set_style', { id: 'm2', style: { color: '#333' } }).redundant).toBe(false);
  });

  it('P1 优化项 4：两种拦截的回传话术都写明「用户要求多份属正常行为」并给出正路', () => {
    const guard = new TurnCallGuard();
    guard.record('add_module', ADD_ARGS, '{"id":"mod-1"}');

    const sameCall = guard.inspect('add_module', ADD_ARGS);
    const sameTitle = guard.inspect('add_module', { ...ADD_ARGS, content: '<p>换内容</p>' });
    if (!sameCall.redundant || !sameTitle.redundant) throw new Error('unreachable');
    expect(sameCall.code).toBe('REDUNDANT_CALL');
    expect(sameTitle.code).toBe('REDUNDANT_MODULE');

    for (const decision of [sameCall, sameTitle]) {
      // 被拦原因仍要说清（message），并保留原有的补救路径
      expect(decision.message.length).toBeGreaterThan(0);
      expect(decision.fix).toContain('多份');
      expect(decision.fix).toContain('多版本');
      expect(decision.fix).toContain('正常行为');
      expect(decision.fix).toContain('不同的参数');
      expect(decision.fix).toContain('复制模块');
    }
  });

  it('add_module 同名兜底：参数不同但标题相同 → REDUNDANT_MODULE', () => {
    const guard = new TurnCallGuard();
    guard.record('add_module', ADD_ARGS, '{"id":"mod-1"}');
    const decision = guard.inspect('add_module', { styleId: 'module-card', title: '教育背景', content: '<p>换了内容</p>' });
    expect(decision.redundant).toBe(true);
    if (!decision.redundant) throw new Error('unreachable');
    expect(decision.code).toBe('REDUNDANT_MODULE');
    expect(decision.priorResult).toContain('mod-1');
  });

  it('删除 / 清空 / 套模板之后记账失效：合法的「先删再建」不被误拦', () => {
    const guard = new TurnCallGuard();
    guard.record('add_module', ADD_ARGS, '{"id":"mod-1"}');
    guard.record('remove_module', { id: 'mod-1' }, '已删除 mod-1');
    expect(guard.inspect('add_module', ADD_ARGS).redundant).toBe(false);

    guard.record('clear_canvas', {}, '已清空');
    expect(guard.inspect('remove_module', { id: 'mod-1' }).redundant).toBe(false);
  });

  it('结构化失败的调用也记账：拦下「一字不差地重试」', () => {
    const guard = new TurnCallGuard();
    guard.record('set_property', { id: 'm1', property: 'fontSize', value: '15px' }, '{"error":"MODULE_NOT_FOUND"}');
    const decision = guard.inspect('set_property', { id: 'm1', property: 'fontSize', value: '15px' });
    expect(decision.redundant).toBe(true);
    if (!decision.redundant) throw new Error('unreachable');
    expect(decision.priorResult).toContain('MODULE_NOT_FOUND');
  });

  it('priorResult 超长时截断（不把请求撑大）', () => {
    const guard = new TurnCallGuard();
    guard.record('export_pdf', {}, 'x'.repeat(1000));
    const decision = guard.inspect('export_pdf', {});
    if (!decision.redundant) throw new Error('unreachable');
    expect(decision.priorResult.length).toBeLessThanOrEqual(301);
  });
});

describe('resolveTurnOutcome：轮次收尾判定', () => {
  const clean = { failed: false, hitRoundLimit: false, toolErrors: 0, fakeSuccess: false };

  it('无异常信号 → success', () => {
    expect(resolveTurnOutcome(clean)).toBe('success');
  });

  it.each([
    ['打满轮次', { ...clean, hitRoundLimit: true }],
    ['工具错误', { ...clean, toolErrors: 1 }],
    ['静默假成功', { ...clean, fakeSuccess: true }],
  ])('%s → partial（改前这些情况仍记 success）', (_label, signals) => {
    expect(resolveTurnOutcome(signals)).toBe('partial');
  });

  it('失败优先于一切', () => {
    expect(resolveTurnOutcome({ failed: true, hitRoundLimit: true, toolErrors: 3, fakeSuccess: true })).toBe('failed');
  });

  it('轮次上限常量被冻结（P0.2 冻结点）', () => {
    expect(MAX_TOOL_ROUNDS).toBe(8);
  });
});

describe('三类静默假成功', () => {
  it('stripThinkLeak 只保留最后一个闭合标签之后的正文', () => {
    expect(stripThinkLeak('思考中…</think>好的。')).toEqual({ text: '好的。', leaked: true });
    expect(stripThinkLeak('随便说说</think>结论甲</think>结论乙')).toEqual({ text: '结论乙', leaked: true });
    expect(stripThinkLeak('没有泄漏')).toEqual({ text: '没有泄漏', leaked: false });
  });

  it('looksLikeEditClaim 认「声称已改」，但排除回述历史的措辞', () => {
    expect(looksLikeEditClaim('已完成修改，把字号改成 15px。')).toBe(true);
    expect(looksLikeEditClaim('已删除工作经历模块。')).toBe(true);
    expect(looksLikeEditClaim('我建议把字号调小一些。')).toBe(false);
    expect(looksLikeEditClaim('我刚才已经添加了教育背景模块。')).toBe(false);
    expect(looksLikeEditClaim('')).toBe(false);
  });

  it('looksLikeToolCallJson 认工具调用 JSON 文本', () => {
    expect(looksLikeToolCallJson('{"name": "add_module", "arguments": {"title":"x"}}')).toBe(true);
    expect(looksLikeToolCallJson('{"action":"addModule","params":{}}')).toBe(true);
    expect(looksLikeToolCallJson('{"tool":"add_text"}')).toBe(true);
    expect(looksLikeToolCallJson('你的简历写得不错。')).toBe(false);
    expect(looksLikeToolCallJson('{"suggestions":[]}')).toBe(false);
  });

  it('inspectToolLessReply：本轮零工具调用 + 声称已改 → FAKE_EDIT_CLAIM', () => {
    const result = inspectToolLessReply('已完成修改。', { toolCallsInTurn: 0 });
    expect(result.findings).toEqual(['FAKE_EDIT_CLAIM']);
    expect(needsCorrectionRetry(result.findings)).toBe(true);
  });

  it('inspectToolLessReply：本轮已有工具调用 → 文本里的「已完成」不再算假成功', () => {
    expect(inspectToolLessReply('已完成修改。', { toolCallsInTurn: 2 }).findings).toEqual([]);
  });

  it('inspectToolLessReply：工具 JSON 当文本输出（任何轮次都算）', () => {
    const result = inspectToolLessReply('{"name": "add_module", "arguments": {}}', { toolCallsInTurn: 1 });
    expect(result.findings).toEqual(['TOOL_JSON_AS_TEXT']);
  });

  it('inspectToolLessReply：</think> 泄漏清洗并单独记为 THINK_LEAK（不需要重试）', () => {
    const result = inspectToolLessReply('思维链</think>这是我给的结论。', { toolCallsInTurn: 0 });
    expect(result.findings).toEqual(['THINK_LEAK']);
    expect(result.text).toBe('这是我给的结论。');
    expect(needsCorrectionRetry(result.findings)).toBe(false);
  });

  it('提示文案与纠正指令都是显式的（不静默）', () => {
    expect(FAKE_SUCCESS_NOTICE).toContain('没有实际执行');
    expect(CORRECTION_INSTRUCTION).toContain('没有调用任何工具');
  });
});
