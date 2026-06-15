// src/components/Toolbar/Toolbar.tsx
import { useState, useRef, useCallback, useEffect } from 'react';
import { useResumeStore } from '../../store/useResumeStore';
import type { ResumeModule } from '../../store/useResumeStore';
import { useActiveEditor } from '../../hooks/useActiveEditor';
import { sanitizeLinkUrl } from '../../tiptap/editorExtensions';

// ---------- 小型输入控件 ----------
function StyleInputWithUnit({
  label,
  value,
  onChange,
  unit = 'px',
  options = [],
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  unit?: string;
  options?: string[];
}) {
  const parsedValue = value?.replace(unit, '').trim() || '';

  // 无预设选项：纯自定义输入
  if (options.length === 0) {
    return (
      <div className="flex items-center gap-1 text-xs">
        <span className="text-gray-500 w-10 truncate">{label}</span>
        <input
          type="text"
          value={parsedValue}
          onChange={(e) => {
            const raw = e.target.value;
            onChange(raw === '' ? '' : raw + unit);
          }}
          className="w-12 border border-gray-300 rounded px-1 py-0.5 text-xs"
        />
        <span className="text-gray-400 text-xs">{unit}</span>
      </div>
    );
  }

  // 有预设选项：下拉选择 + 自定义输入
  return (
    <div className="flex items-center gap-1 text-xs">
      <span className="text-gray-500 w-10 truncate">{label}</span>
      <span className="flex items-center gap-1">
        <select
          className="text-xs border border-gray-300 rounded py-0.5 px-1"
          onChange={(e) => {
            const val = e.target.value;
            if (val) onChange(val + unit);
          }}
          value=""
        >
          <option value="" disabled>{label}</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>{opt}{unit}</option>
          ))}
        </select>
        <input
          type="text"
          className="w-10 text-xs border border-gray-300 rounded py-0.5 px-1"
          placeholder="自定义"
          value={parsedValue}
          onChange={(e) => {
            const raw = e.target.value;
            onChange(raw === '' ? '' : raw + unit);
          }}
        />
      </span>
    </div>
  );
}
function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1 text-xs">
      <span className="text-gray-500 w-10 truncate">{label}</span>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="w-6 h-5 border border-gray-300 rounded cursor-pointer p-0" />
    </div>
  );
}

type SelectOption = string | { label: string; value: string };

function SelectInput({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: SelectOption[] }) {
  const normalized = options.map((o) => (typeof o === 'string' ? { label: o, value: o } : o));
  return (
    <div className="flex items-center gap-1 text-xs">
      <span className="text-gray-500 w-10 truncate">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="border border-gray-300 rounded text-xs py-0.5">
        {normalized.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>
    </div>
  );
}

function ImageSizeInputs({
  width,
  height,
  onWidthChange,
  onHeightChange,
}: {
  width: string;
  height: string;
  onWidthChange: (v: string) => void;
  onHeightChange: (v: string) => void;
}) {
  return (
    <>
      <StyleInputWithUnit label="图片宽" value={width} onChange={onWidthChange} unit="px" />
      <StyleInputWithUnit label="图片高" value={height} onChange={onHeightChange} unit="px" />
    </>
  );
}

const FONT_SIZE_PRESETS = ['12', '14', '16', '18', '20', '24', '32', '48'];

function Toolbar() {
  const [activeTool, setActiveTool] = useState<'edit' | 'insert'>('edit');
  const [textColor, setTextColor] = useState('#000000');
  const [highlightColor, setHighlightColor] = useState('#ffff00');
  const [customFontSize, setCustomFontSize] = useState('16');
  const [customFontWeight, setCustomFontWeight] = useState('');
  const [customLetterSpacing, setCustomLetterSpacing] = useState('');
  const [imageActive, setImageActive] = useState(false);
  const [activeGroup, setActiveGroup] = useState<string>('基本');
  const [editorGroup, setEditorGroup] = useState<string>('文本');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadFileRef = useRef<HTMLInputElement>(null);

  const selectedId = useResumeStore((s) => s.selectedId);
  const modules = useResumeStore((s) => s.modules);
  const { activeEditor } = useActiveEditor();

  // 页面设置
  const pagePadding = useResumeStore((s) => s.pagePadding);
  const pageGap = useResumeStore((s) => s.pageGap);
  const setPagePadding = useResumeStore((s) => s.setPagePadding);
  const setPageGap = useResumeStore((s) => s.setPageGap);
  const pagePaddingTop = useResumeStore((s) => s.pagePaddingTop);
  const setPagePaddingTop = useResumeStore((s) => s.setPagePaddingTop);

  const selectedModule = selectedId ? findModuleById(modules, selectedId) : null;

  const keycapStyle =
    'px-3 py-1.5 text-sm font-medium text-gray-700 bg-gradient-to-b from-white to-gray-100 border border-gray-300 rounded-lg shadow-[inset_0_1px_0_#fff,0_2px_0_#d1d5db,0_3px_6px_rgba(0,0,0,0.1)] active:shadow-[inset_0_1px_3px_rgba(0,0,0,0.1)] active:translate-y-[2px] transition-all duration-75';
  const keycapActiveStyle =
    'px-3 py-1.5 text-sm font-medium text-gray-700 bg-gradient-to-b from-blue-50 to-blue-100 border border-blue-300 rounded-lg shadow-[inset_0_1px_3px_rgba(0,0,0,0.1)] translate-y-[2px] transition-all duration-75';

  // 监听 TipTap 图片选中
  useEffect(() => {
    if (!activeEditor) return;
    const checkImage = () => {
      const { selection } = activeEditor.state;
      if (selection.empty) {
        setImageActive(false);
        return;
      }
      let found = false;
      activeEditor.state.doc.nodesBetween(selection.from, selection.to, (node) => {
        if (node.type.name === 'resizableImage') found = true;
      });
      setImageActive(found);
    };
    activeEditor.on('selectionUpdate', checkImage);
    activeEditor.on('transaction', checkImage);
    return () => {
      activeEditor.off('selectionUpdate', checkImage);
      activeEditor.off('transaction', checkImage);
    };
  }, [activeEditor]);

  const handleSave = () => {
    const currentModules = useResumeStore.getState().modules;
    const json = JSON.stringify(currentModules, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '简历.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        if (Array.isArray(data) && data.every((item: { id?: string; type?: string }) => item && typeof item.id === 'string' && typeof item.type === 'string')) {
          useResumeStore.getState().importModules(data);
        } else {
          alert('JSON 格式错误');
        }
      } catch {
        alert('文件解析失败');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  const updateStyle = useCallback(
    (prop: string, value: string) => {
      if (!selectedId || !selectedModule) return;
      const currentModule = findModuleById(useResumeStore.getState().modules, selectedId);
      if (!currentModule) return;
      const newStyle = { ...currentModule.style };
      if (value.trim() === '' || value === (prop.endsWith('px') ? 'px' : '')) {
        delete newStyle[prop];
      } else {
        newStyle[prop] = value;
      }
      useResumeStore.getState().updateModule(selectedId, { style: newStyle });
    },
    [selectedId, selectedModule]
  );

  const selectedStyle = selectedModule?.style || {};

  const exec = (fn: () => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    if (activeEditor) fn();
  };

  const chain = () => activeEditor?.chain().focus();

  const insertImage = () => fileInputRef.current?.click();

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('请选择图片文件'); e.target.value = ''; return; }
    if (file.size > 5 * 1024 * 1024) { alert('图片大小不能超过5MB'); e.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      if (dataUrl) chain()?.setImage({ src: dataUrl }).run();
      e.target.value = '';
    };
    reader.readAsDataURL(file);
  };

  const insertLink = () => {
    const url = window.prompt('请输入链接地址');
    if (!url) return;
    const safeUrl = sanitizeLinkUrl(url);
    if (!safeUrl) {
      alert('链接无效，仅支持 http、https 或 mailto 协议。');
      return;
    }
    if (!activeEditor) return;
    const { state } = activeEditor;
    const { from, to, empty } = state.selection;
    const selectedText = empty ? '' : state.doc.textBetween(from, to);
    if (selectedText) {
      chain()?.setLink({ href: safeUrl }).run();
    } else {
      const text = window.prompt('请输入链接显示文字', '链接文字');
      if (text) chain()?.insertContent(`<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${text}</a>`).run();
    }
  };

  const fontFamilyOptions = ['Arial', 'Times New Roman', 'Georgia', 'Verdana', '微软雅黑', '宋体'];
  const widthOptions = ['100%', '200', '300', '400', 'auto'];
  const heightOptions = ['auto', '100', '200', '300'];
  const marginOptions = ['0', '4', '8', '16', '24', '32'];

  // Flex 布局选项
  const flexDirectionOptions: SelectOption[] = [{ label: '水平', value: 'row' }, { label: '垂直', value: 'column' }, { label: '水平(反)', value: 'row-reverse' }, { label: '垂直(反)', value: 'column-reverse' }];
  const justifyContentOptions: SelectOption[] = [{ label: '起始', value: 'flex-start' }, { label: '居中', value: 'center' }, { label: '两端对齐', value: 'space-between' }, { label: '均匀分布', value: 'space-around' }, { label: '等距分布', value: 'space-evenly' }];
  const alignItemsOptions: SelectOption[] = [{ label: '拉伸', value: 'stretch' }, { label: '居中', value: 'center' }, { label: '起始', value: 'flex-start' }, { label: '末尾', value: 'flex-end' }, { label: '基线', value: 'baseline' }];
  const flexWrapOptions: SelectOption[] = [{ label: '不换行', value: 'nowrap' }, { label: '换行', value: 'wrap' }];
  const fontWeightOptions = ['400', '500', '600', '700', '800'];
  const letterSpacingOptions = ['0', '1', '2', '4', '6'];
  // Grid 对齐选项
  const gridJustifyItemsOptions: SelectOption[] = [{ label: '起始', value: 'start' }, { label: '末尾', value: 'end' }, { label: '居中', value: 'center' }, { label: '拉伸', value: 'stretch' }];
  const gridAlignItemsOptions: SelectOption[] = [{ label: '起始', value: 'start' }, { label: '末尾', value: 'end' }, { label: '居中', value: 'center' }, { label: '拉伸', value: 'stretch' }];
  const isContainer = selectedModule && (selectedModule.children && selectedModule.children.length > 0);

  return (
    <div className="w-full bg-white flex items-start min-h-[86px] px-4 gap-2">
      <input type="file" ref={fileInputRef} onChange={handleImageFileChange} accept="image/*" style={{ display: 'none' }} />
      <input type="file" ref={loadFileRef} onChange={handleLoad} accept=".json" style={{ display: 'none' }} />

      {/* 左侧按钮组：两行排列 */}
      <div className="flex flex-col gap-1.5 pt-1">
        <div className="flex items-center gap-2">
          <button onClick={handleSave} className={keycapStyle} title="保存">保存</button>
          <button onClick={() => loadFileRef.current?.click()} className={keycapStyle} title="加载">加载</button>
          <button onClick={() => setActiveTool('insert')} className={activeTool === 'insert' ? keycapActiveStyle : keycapStyle}>插入</button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setActiveTool('edit')} className={activeTool === 'edit' ? keycapActiveStyle : keycapStyle}>编辑</button>
          <button onClick={() => useResumeStore.getState().undo()} className={keycapStyle} title="撤销">撤销</button>
          <button onClick={() => useResumeStore.getState().redo()} className={keycapStyle} title="重做">重做</button>
        </div>
      </div>

      {/* 右侧工具容器 */}
      <div className="flex-1 min-h-full flex items-center bg-gray-50 border-l border-gray-200 px-3 gap-2 justify-between overflow-x-auto flex-wrap">
        {selectedId && selectedModule ? (
          /* ---------- 属性编辑模式 ---------- */
          <div className="flex flex-col gap-1 text-xs py-1 w-full">
            {/* 第一行：类型标签 + 常用内联属性 + 分组标签 */}
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-gray-700 font-bold mr-1">
                {selectedModule.type === 'header' ? '简历头' : selectedModule.type === 'module' ? '模块' : selectedModule.type}
              </span>
              {/* 常用属性始终可见 */}
              <StyleInputWithUnit label="内边距" value={selectedStyle.padding || ''} onChange={(v) => updateStyle('padding', v)} unit="px" options={marginOptions} />
              <StyleInputWithUnit label="外边距" value={selectedStyle.margin || ''} onChange={(v) => updateStyle('margin', v)} unit="px" options={marginOptions} />
              <ColorInput label="背景" value={selectedStyle.backgroundColor || ''} onChange={(v) => updateStyle('backgroundColor', v)} />
              <span className="text-gray-300 text-xs">|</span>
              {(['基本', '背景', '边框', '效果', ...(isContainer ? ['布局'] : [])] as string[]).map((g) => (
                <button
                  key={g}
                  onClick={() => setActiveGroup(g)}
                  className={`px-2 py-0.5 rounded text-xs transition-colors ${
                    activeGroup === g
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                  }`}
                >
                  {g}
                </button>
              ))}
              <button onClick={() => useResumeStore.getState().select(null)} className="ml-auto text-xs text-gray-400 hover:text-gray-600">✕</button>
            </div>

            {/* 第二行：当前组的控件 */}
            <div className="flex items-center gap-2 flex-wrap">
              {activeGroup === '基本' && (
                <>
                  <StyleInputWithUnit label="宽度" value={selectedStyle.width || ''} onChange={(v) => updateStyle('width', v)} unit="px" options={widthOptions} />
                  <StyleInputWithUnit label="高度" value={selectedStyle.height || ''} onChange={(v) => updateStyle('height', v)} unit="px" options={heightOptions} />
                  <StyleInputWithUnit label="外边距" value={selectedStyle.margin || ''} onChange={(v) => updateStyle('margin', v)} unit="px" options={marginOptions} />
                  <StyleInputWithUnit label="内边距" value={selectedStyle.padding || ''} onChange={(v) => updateStyle('padding', v)} unit="px" options={marginOptions} />
                  {selectedModule.type === 'image' && (
                    <ImageSizeInputs
                      width={selectedStyle.width || ''}
                      height={selectedStyle.height || ''}
                      onWidthChange={(v) => updateStyle('width', v)}
                      onHeightChange={(v) => updateStyle('height', v)}
                    />
                  )}
                </>
              )}

              {activeGroup === '背景' && (
                <>
                  <ColorInput label="背景色" value={selectedStyle.backgroundColor || ''} onChange={(v) => updateStyle('backgroundColor', v)} />
                  <SelectInput label="渐变" value={selectedStyle.gradientDirection || 'none'} onChange={(v) => updateStyle('gradientDirection', v)} options={[
                    { label: '无', value: 'none' },
                    { label: '上→下', value: 'to bottom' },
                    { label: '左→右', value: 'to right' },
                    { label: '左上→右下', value: 'to bottom right' },
                    { label: '右上→左下', value: 'to bottom left' },
                  ]} />
                  {selectedStyle.gradientDirection && selectedStyle.gradientDirection !== 'none' && (
                    <>
                      <ColorInput label="渐变起" value={selectedStyle.gradientFrom || '#ffffff'} onChange={(v) => updateStyle('gradientFrom', v)} />
                      <ColorInput label="渐变止" value={selectedStyle.gradientTo || '#e2e8f0'} onChange={(v) => updateStyle('gradientTo', v)} />
                    </>
                  )}
                </>
              )}

              {activeGroup === '边框' && (
                <>
                  <SelectInput label="方位" value={selectedStyle.borderScope || '全部'} onChange={(v) => updateStyle('borderScope', v)} options={[
                    { label: '全部', value: '全部' },
                    { label: '上', value: '上' },
                    { label: '下', value: '下' },
                    { label: '左', value: '左' },
                    { label: '右', value: '右' },
                  ]} />
                  <SelectInput label="样式" value={selectedStyle.borderStyle || 'none'} onChange={(v) => updateStyle('borderStyle', v)} options={[
                    { label: '无', value: 'none' },
                    { label: '实线', value: 'solid' },
                    { label: '虚线', value: 'dashed' },
                    { label: '点线', value: 'dotted' },
                  ]} />
                  <ColorInput label="边框色" value={selectedStyle.borderColor || ''} onChange={(v) => updateStyle('borderColor', v)} />
                  <StyleInputWithUnit label="边框宽" value={selectedStyle.borderWidth || ''} onChange={(v) => updateStyle('borderWidth', v)} unit="px" options={['0', '1', '2', '3', '4']} />
                  <StyleInputWithUnit label="圆角" value={selectedStyle.borderRadius || ''} onChange={(v) => updateStyle('borderRadius', v)} unit="px" options={['0', '4', '8', '16', '24']} />
                </>
              )}

              {activeGroup === '效果' && (
                <>
                  <SelectInput label="阴影" value={selectedStyle.boxShadow || 'none'} onChange={(v) => updateStyle('boxShadow', v)} options={[
                    { label: '无', value: 'none' },
                    { label: '轻', value: '0 1px 3px rgba(0,0,0,0.1)' },
                    { label: '中', value: '0 4px 6px rgba(0,0,0,0.1)' },
                    { label: '重', value: '0 8px 16px rgba(0,0,0,0.15)' },
                  ]} />
                  <StyleInputWithUnit label="透明度" value={selectedStyle.opacity || ''} onChange={(v) => updateStyle('opacity', v)} unit="" options={['1', '0.9', '0.8', '0.6', '0.4']} />
                </>
              )}

              {activeGroup === '布局' && isContainer && (
                <>
                  {(selectedModule.type === 'flex' || selectedModule.type === 'header' || selectedModule.type === 'module') && (
                    <>
                      <SelectInput label="方向" value={selectedStyle.flexDirection || 'column'} onChange={(v) => updateStyle('flexDirection', v)} options={flexDirectionOptions} />
                      <SelectInput label="主轴对齐" value={selectedStyle.justifyContent || 'flex-start'} onChange={(v) => updateStyle('justifyContent', v)} options={justifyContentOptions} />
                      <SelectInput label="交叉轴对齐" value={selectedStyle.alignItems || 'stretch'} onChange={(v) => updateStyle('alignItems', v)} options={alignItemsOptions} />
                      <SelectInput label="换行" value={selectedStyle.flexWrap || 'nowrap'} onChange={(v) => updateStyle('flexWrap', v)} options={flexWrapOptions} />
                      <StyleInputWithUnit label="间距" value={selectedStyle.gap || ''} onChange={(v) => updateStyle('gap', v)} unit="px" />
                    </>
                  )}

                  {selectedModule.type === 'grid' && (
                    <>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-500 text-xs">列模板</span>
                        <input type="text" value={selectedStyle.gridTemplateColumns || '1fr 1fr'} onChange={(e) => updateStyle('gridTemplateColumns', e.target.value)} className="w-24 border border-gray-300 rounded px-1 py-0.5 text-xs" />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-500 text-xs">行模板</span>
                        <input type="text" value={selectedStyle.gridTemplateRows || 'auto'} onChange={(e) => updateStyle('gridTemplateRows', e.target.value)} className="w-24 border border-gray-300 rounded px-1 py-0.5 text-xs" />
                      </div>
                      <SelectInput label="水平对齐" value={selectedStyle.justifyItems || 'stretch'} onChange={(v) => updateStyle('justifyItems', v)} options={gridJustifyItemsOptions} />
                      <SelectInput label="垂直对齐" value={selectedStyle.alignItems || 'stretch'} onChange={(v) => updateStyle('alignItems', v)} options={gridAlignItemsOptions} />
                      <StyleInputWithUnit label="间距" value={selectedStyle.gap || ''} onChange={(v) => updateStyle('gap', v)} unit="px" />
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        ) : (
          /* ---------- TipTap 文本编辑 / 插入工具 ---------- */
          <>{activeTool === 'edit' ? (
            <div className="flex flex-col gap-1 w-full">
              {/* 分组标签 */}
              <div className="flex items-center gap-1 flex-wrap">
                {['文本', '页面设置'].map((g) => (
                  <button
                    key={g}
                    onClick={() => setEditorGroup(g)}
                    className={`px-2 py-0.5 rounded text-xs transition-colors ${
                      editorGroup === g
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>

              {/* 组内容 */}
              <div className="flex items-center gap-2 flex-wrap">
                {editorGroup === '文本' && (
                  <>
                    <button onMouseDown={exec(() => chain()?.toggleBold().run())} className="px-2 py-1 text-xs font-bold hover:bg-gray-200 rounded" title="加粗">B</button>
                    <button onMouseDown={exec(() => chain()?.toggleItalic().run())} className="px-2 py-1 text-xs italic hover:bg-gray-200 rounded" title="斜体">I</button>
                    <button onMouseDown={exec(() => chain()?.toggleUnderline().run())} className="px-2 py-1 text-xs underline hover:bg-gray-200 rounded" title="下划线">U</button>
                    <button onMouseDown={exec(() => chain()?.toggleStrike().run())} className="px-2 py-1 text-xs line-through hover:bg-gray-200 rounded" title="删除线">S</button>

                    <span className="text-gray-300 text-xs">|</span>

                    <select className="text-xs border border-gray-300 rounded py-0.5 px-1"
                      onChange={(e) => activeEditor?.chain().focus().setFontFamily(e.target.value).run()}
                      value={activeEditor?.getAttributes('textStyle').fontFamily || ''}
                    >
                      <option value="" disabled>字体</option>
                      {fontFamilyOptions.map((font) => <option key={font} value={font}>{font}</option>)}
                    </select>

                    <span className="flex items-center gap-1">
                      <select className="text-xs border border-gray-300 rounded py-0.5 px-1"
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val) {
                            setCustomFontSize(val);
                            activeEditor?.chain().focus().setFontSize(val + 'px').run();
                          }
                        }}
                        value=""
                      >
                        <option value="" disabled>字号</option>
                        {FONT_SIZE_PRESETS.map((size) => <option key={size} value={size}>{size}</option>)}
                      </select>
                      <input type="number" min="1" className="w-12 text-xs border border-gray-300 rounded py-0.5 px-1" placeholder="自定义"
                        value={customFontSize}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCustomFontSize(val);
                          const num = parseInt(val, 10);
                          if (!isNaN(num) && num > 0) activeEditor?.chain().focus().setFontSize(num + 'px').run();
                        }}
                      />
                    </span>

                    <span className="text-gray-300 text-xs">|</span>

                    <div className="flex items-center gap-1">
                      <span className="flex items-center gap-1">
                        <select className="text-xs border border-gray-300 rounded py-0.5 px-1"
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val) { setCustomFontWeight(val); activeEditor?.chain().focus().setMark('textStyle', { fontWeight: val }).run(); }
                          }}
                          value=""
                        >
                          <option value="" disabled>字重</option>
                          {fontWeightOptions.map((w) => <option key={w} value={w}>{w}</option>)}
                        </select>
                        <input type="text" inputMode="numeric" className="w-10 text-xs border border-gray-300 rounded py-0.5 px-1" placeholder="自定义"
                          value={customFontWeight}
                          onInput={(e) => {
                            const val = (e.target as HTMLInputElement).value;
                            setCustomFontWeight(val);
                            if (val) activeEditor?.chain().focus().setMark('textStyle', { fontWeight: val }).run();
                          }}
                        />
                      </span>
                      <span className="flex items-center gap-1">
                        <select className="text-xs border border-gray-300 rounded py-0.5 px-1"
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val) { setCustomLetterSpacing(val); activeEditor?.chain().focus().setMark('textStyle', { letterSpacing: val + 'px' }).run(); }
                          }}
                          value=""
                        >
                          <option value="" disabled>字距</option>
                          {letterSpacingOptions.map((s) => <option key={s} value={s}>{s}px</option>)}
                        </select>
                        <input type="text" inputMode="numeric" className="w-10 text-xs border border-gray-300 rounded py-0.5 px-1" placeholder="自定义"
                          value={customLetterSpacing}
                          onInput={(e) => {
                            const val = (e.target as HTMLInputElement).value;
                            setCustomLetterSpacing(val);
                            if (val) activeEditor?.chain().focus().setMark('textStyle', { letterSpacing: val + 'px' }).run();
                          }}
                        />
                      </span>
                      <input type="color" value={textColor} onChange={(e) => { setTextColor(e.target.value); activeEditor?.chain().focus().setColor(e.target.value).run(); }} className="w-5 h-5 border border-gray-300 rounded cursor-pointer p-0" title="文字颜色" />
                      <input type="color" value={highlightColor} onChange={(e) => { setHighlightColor(e.target.value); activeEditor?.chain().focus().toggleHighlight({ color: e.target.value }).run(); }} className="w-5 h-5 border border-gray-300 rounded cursor-pointer p-0" title="背景高亮" />
                    </div>

                    <span className="text-gray-300 text-xs">|</span>

                    <button onMouseDown={exec(() => chain()?.setTextAlign('left').run())} className="px-1.5 py-0.5 text-xs hover:bg-gray-200 rounded" title="左对齐">⫷</button>
                    <button onMouseDown={exec(() => chain()?.setTextAlign('center').run())} className="px-1.5 py-0.5 text-xs hover:bg-gray-200 rounded" title="居中">⫸</button>
                    <button onMouseDown={exec(() => chain()?.setTextAlign('right').run())} className="px-1.5 py-0.5 text-xs hover:bg-gray-200 rounded" title="右对齐">⫹</button>
                    <button onMouseDown={exec(() => chain()?.setTextAlign('justify').run())} className="px-1.5 py-0.5 text-xs hover:bg-gray-200 rounded" title="两端对齐">☰</button>

                    <span className="text-gray-300 text-xs">|</span>

                    <button onMouseDown={exec(() => chain()?.toggleBulletList().run())} className="px-1.5 py-0.5 text-xs hover:bg-gray-200 rounded" title="无序列表">•</button>
                    <button onMouseDown={exec(() => chain()?.toggleOrderedList().run())} className="px-1.5 py-0.5 text-xs hover:bg-gray-200 rounded" title="有序列表">1.</button>

                    {imageActive && (
                      <>
                        <span className="text-gray-300 text-xs">|</span>
                        <ImageSizeInputs
                          width={activeEditor?.getAttributes('resizableImage').width || ''}
                          height={activeEditor?.getAttributes('resizableImage').height || ''}
                          onWidthChange={(val) => {
                            if (val === '') activeEditor?.chain().focus().updateAttributes('resizableImage', { width: null }).run();
                            else activeEditor?.chain().focus().updateAttributes('resizableImage', { width: val }).run();
                          }}
                          onHeightChange={(val) => {
                            if (val === '') activeEditor?.chain().focus().updateAttributes('resizableImage', { height: null }).run();
                            else activeEditor?.chain().focus().updateAttributes('resizableImage', { height: val }).run();
                          }}
                        />
                      </>
                    )}
                  </>
                )}

                {editorGroup === '页面设置' && (
                  <>
                    <span className="text-gray-500 text-xs">页面设置</span>
                    <StyleInputWithUnit label="边距" value={pagePadding} onChange={setPagePadding} unit="px" options={['20', '30', '40', '50', '60']} />
                    <StyleInputWithUnit label="间距" value={pageGap} onChange={setPageGap} unit="px" options={['8', '12', '16', '20', '24']} />
                    <StyleInputWithUnit label="上边距" value={pagePaddingTop} onChange={setPagePaddingTop} unit="px" options={['20', '30', '40', '50', '60', '80']} />
                  </>
                )}
              </div>
            </div>
          ) : (
            /* ---------- 插入工具 ---------- */
            <div className="flex items-center gap-2 flex-wrap">
              <button onMouseDown={(e) => { e.preventDefault(); insertImage(); }} className="px-2 py-1 text-xs hover:bg-gray-100 rounded">图片</button>
              <button onMouseDown={(e) => { e.preventDefault(); insertLink(); }} className="px-2 py-1 text-xs hover:bg-gray-100 rounded">超链接</button>
            </div>
          )}
          </>
        )}

      </div>
    </div>
  );
}

function findModuleById(modules: ResumeModule[], id: string): ResumeModule | null {
  for (const mod of modules) {
    if (mod.id === id) return mod;
    if (mod.children) {
      const found = findModuleById(mod.children, id);
      if (found) return found;
    }
  }
  return null;
}

export default Toolbar;