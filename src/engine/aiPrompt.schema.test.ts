// ==================== 请求形状冻结点（P0.2 第五节） ====================
//
// 这个文件不是普通的功能测试，而是**锁**：冻结「发给模型的请求形状」中可被代码改动的三块 ——
// ① 工具 schema（`aiTools`）、② 固定约束块（`getFixedConstraints()`）、③ 轮次上限语义（`MAX_TOOL_ROUNDS`）。
//
// 为什么必须锁：`P0.1`（改前基线）与 `P0.3`（改后对照）用的是同一套场景与工具形状，任何一处
// 悄悄改动都会让两份采集数据不可比。所以断言全部是**精确值 / 哈希**：改了就必须在这里显式更新，
// 而更新前必须先走解冻流程（说明改了什么 → 重跑 `P0.3` 同场景对照 → 旧数据标「不可比、需重采」）。
//
// 维护方式：确认「这就是新冻结形状」后，才更新下面的常量与 `TOOL_SCHEMA_VERSION`（`aiPrompt.ts`）。
import { describe, expect, it } from 'vitest';
import { aiTools, TOOL_SCHEMA_VERSION } from './aiPrompt';
import { getConstraintList, getFixedConstraints } from './ruleBase';
import { MAX_TOOL_ROUNDS } from '../utils/aiGuards';

/** FNV-1a（与采集 harness 同一算法）：把形状压成短哈希，改动一行就会变 */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

/** 冻结时的工具名单（顺序也是形状的一部分：模型看到的工具顺序与请求体逐字节相关） */
const FROZEN_TOOL_NAMES = [
  'add_text', 'add_heading', 'add_list', 'add_image', 'add_flex', 'add_grid',
  'add_flex_inline', 'add_grid_inline', 'add_header', 'add_module',
  'set_content', 'set_style', 'set_property', 'set_style_by_type', 'set_field',
  'remove_module', 'move_module', 'duplicate_module', 'copy_style', 'copy_text_style',
  'apply_template', 'delete_modules', 'clear_canvas', 'export_pdf', 'get_uploaded_file',
  'execute_skill',
] as const;

/** `P0.2` 第 7 项收敛后的字符数（收敛前 9,387；采集侧 `toolSchemaChars` 指标读的就是它） */
const FROZEN_SCHEMA_CHARS = 8776;
/** `JSON.stringify(aiTools)` 的 FNV-1a：描述、枚举、结构任何一处改动都会变 */
const FROZEN_SCHEMA_HASH = 'ced1ec06';
/** 每个工具的 { name, required, properties 键名排序 } 的 FNV-1a：只看「语义骨架」 */
const FROZEN_STRUCTURE_HASH = '31a7e0d5';
/** 固定约束块（`getFixedConstraints()`）的 FNV-1a */
const FROZEN_CONSTRAINT_HASH = 'b63c240';

function structureSnapshot(): { name: string; required: unknown; props: string[] }[] {
  return aiTools.map(tool => {
    const params = tool.function.parameters as { required?: unknown; properties?: Record<string, unknown> } | undefined;
    return {
      name: tool.function.name,
      required: params?.required ?? [],
      props: Object.keys(params?.properties ?? {}).sort(),
    };
  });
}

describe('请求形状冻结点：工具 schema', () => {
  it('版本号已冻结（改动 schema 前必须先解冻并升版）', () => {
    expect(TOOL_SCHEMA_VERSION).toBe('p0.2-frozen-1');
  });

  it('工具数量与名单冻结（26 个）', () => {
    expect(aiTools.length).toBe(26);
    expect(aiTools.map(t => t.function.name)).toEqual([...FROZEN_TOOL_NAMES]);
  });

  it('schema 字符数冻结（P0.2 第 7 项：9,387 → 8,776 字符）', () => {
    expect(JSON.stringify(aiTools).length).toBe(FROZEN_SCHEMA_CHARS);
  });

  it('schema 全量哈希冻结', () => {
    expect(fnv1a(JSON.stringify(aiTools))).toBe(FROZEN_SCHEMA_HASH);
  });

  it('结构骨架哈希冻结（name / required / properties 键名）', () => {
    expect(fnv1a(JSON.stringify(structureSnapshot()))).toBe(FROZEN_STRUCTURE_HASH);
  });
});

describe('请求形状冻结点：约束块与轮次上限', () => {
  it('固定约束块哈希冻结（8 条）', () => {
    expect(getConstraintList().length).toBe(8);
    expect(fnv1a(getFixedConstraints())).toBe(FROZEN_CONSTRAINT_HASH);
  });

  it('轮次上限语义冻结（MAX_TOOL_ROUNDS = 8）', () => {
    expect(MAX_TOOL_ROUNDS).toBe(8);
  });
});
