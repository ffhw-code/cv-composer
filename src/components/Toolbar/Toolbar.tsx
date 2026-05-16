// src/components/Toolbar/Toolbar.tsx
import { useState, useRef, useCallback, useEffect } from 'react';
import { useResumeStore } from '../../store/useResumeStore';
import type { ResumeModule } from '../../store/useResumeStore';
import { useActiveEditor } from '../../hooks/useActiveEditor';

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
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const parsedValue = value?.replace(unit, '').trim() || '';
  const displayValue = parsedValue;

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const handleSelect = (val: string) => {
    onChange(val + unit);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative flex items-center gap-1 text-xs">
      <span className="text-gray-500 w-10 truncate">{label}</span>
      <input
        type="text"
        value={displayValue}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') {
            onChange('');
          } else {
            onChange(raw + unit);
          }
        }}
        className="w-12 border border-gray-300 rounded px-1 py-0.5 text-xs"
      />
      <span className="text-gray-400 text-xs">{unit}</span>
      {options.length > 0 && (
        <button className="text-xs ml-1 text-gray-400 hover:text-gray-600" onClick={() => setOpen(!open)}>▼</button>
      )}
      {open && options.length > 0 && (
        <div className="absolute top-full left-0 bg-white border border-gray-200 shadow mt-1 z-10 w-24">
          {options.map((opt) => (
            <button key={opt} className="block w-full text-left px-2 py-0.5 hover:bg-gray-100 text-xs" onClick={() => handleSelect(opt)}>
              {opt}{unit}
            </button>
          ))}
        </div>
      )}
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

function SelectInput({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div className="flex items-center gap-1 text-xs">
      <span className="text-gray-500 w-10 truncate">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="border border-gray-300 rounded text-xs py-0.5">
        {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
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
  const [imageActive, setImageActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);  // 用于插入图片
  const loadFileRef = useRef<HTMLInputElement>(null);

  const selectedId = useResumeStore((s) => s.selectedId);
  const modules = useResumeStore((s) => s.modules);
  const { activeEditor } = useActiveEditor();

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
        if (Array.isArray(data) && data.every((item: any) => item && typeof item.id === 'string' && typeof item.type === 'string')) {
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
    if (!activeEditor) return;
    const { state } = activeEditor;
    const { from, to, empty } = state.selection;
    const selectedText = empty ? '' : state.doc.textBetween(from, to);
    if (selectedText) {
      chain()?.setLink({ href: url }).run();
    } else {
      const text = window.prompt('请输入链接显示文字', '链接文字');
      if (text) chain()?.insertContent(`<a href="${url}" target="_blank">${text}</a>`).run();
    }
  };

  const fontFamilyOptions = ['Arial', 'Times New Roman', 'Georgia', 'Verdana', '微软雅黑', '宋体'];
  const widthOptions = ['100%', '200', '300', '400', 'auto'];
  const heightOptions = ['auto', '100', '200', '300'];
  const marginOptions = ['0', '4', '8', '16', '24', '32'];
  const fontSizeOptions = ['12', '14', '16', '18', '20', '24', '32'];
  const textAlignOptions = ['left', 'center', 'right', 'justify'];

  // Flex 布局选项
  const flexDirectionOptions = ['row', 'column', 'row-reverse', 'column-reverse'];
  const justifyContentOptions = ['flex-start', 'center', 'space-between', 'space-around', 'space-evenly'];
  const alignItemsOptions = ['stretch', 'center', 'flex-start', 'flex-end', 'baseline'];
  const flexWrapOptions = ['nowrap', 'wrap'];
  // Grid 对齐选项
  const gridJustifyItemsOptions = ['start', 'end', 'center', 'stretch'];
  const gridAlignItemsOptions = ['start', 'end', 'center', 'stretch'];

  const isContainer = selectedModule && (selectedModule.children && selectedModule.children.length > 0);

  return (
    <div className="w-full bg-white flex items-start min-h-[64px] px-4 gap-2">
      <input type="file" ref={fileInputRef} onChange={handleImageFileChange} accept="image/*" style={{ display: 'none' }} />
      <input type="file" ref={loadFileRef} onChange={handleLoad} accept=".json" style={{ display: 'none' }} />

      {/* 左侧按钮组 */}
      <div className="flex items-center gap-2 pt-1">
        <button onClick={handleSave} className={keycapStyle} title="保存">保存</button>
        <button onClick={() => loadFileRef.current?.click()} className={keycapStyle} title="加载">加载</button>
        <button onClick={() => setActiveTool('insert')} className={activeTool === 'insert' ? keycapActiveStyle : keycapStyle}>插入</button>
        <button onClick={() => setActiveTool('edit')} className={activeTool === 'edit' ? keycapActiveStyle : keycapStyle}>编辑</button>
      </div>

      {/* 右侧工具容器 */}
      <div className="flex-1 min-h-full flex items-center bg-gray-50 border-l border-gray-200 px-3 gap-2 justify-between overflow-x-auto flex-wrap">
        {selectedId && selectedModule ? (
          <div className="flex items-center gap-2 text-xs flex-wrap py-1">
            <span className="text-gray-700 font-bold mr-1">
              {selectedModule.type === 'header' ? '简历头' : selectedModule.type === 'module' ? '模块' : selectedModule.type}
            </span>

            {/* 通用属性 */}
            <StyleInputWithUnit label="宽度" value={selectedStyle.width || ''} onChange={(v) => updateStyle('width', v)} unit="px" options={widthOptions} />
            <StyleInputWithUnit label="高度" value={selectedStyle.height || ''} onChange={(v) => updateStyle('height', v)} unit="px" options={heightOptions} />
            <StyleInputWithUnit label="外边距" value={selectedStyle.margin || ''} onChange={(v) => updateStyle('margin', v)} unit="px" options={marginOptions} />
            <StyleInputWithUnit label="内边距" value={selectedStyle.padding || ''} onChange={(v) => updateStyle('padding', v)} unit="px" options={marginOptions} />
            <ColorInput label="背景色" value={selectedStyle.backgroundColor || '#ffffff'} onChange={(v) => updateStyle('backgroundColor', v)} />
            <ColorInput label="文字色" value={selectedStyle.color || '#000000'} onChange={(v) => updateStyle('color', v)} />
            <SelectInput label="对齐" value={selectedStyle.textAlign || 'left'} onChange={(v) => updateStyle('textAlign', v)} options={textAlignOptions} />
            <SelectInput label="字体" value={selectedStyle.fontFamily || 'Arial'} onChange={(v) => updateStyle('fontFamily', v)} options={fontFamilyOptions} />
            <StyleInputWithUnit label="字号" value={selectedStyle.fontSize || ''} onChange={(v) => updateStyle('fontSize', v)} unit="px" options={fontSizeOptions} />

            {/* 图片尺寸（image 模块） */}
            {selectedModule.type === 'image' && (
              <ImageSizeInputs
                width={selectedStyle.width || ''}
                height={selectedStyle.height || ''}
                onWidthChange={(v) => updateStyle('width', v)}
                onHeightChange={(v) => updateStyle('height', v)}
              />
            )}

            {/* 容器布局属性 */}
            {isContainer && (
              <>
                <span className="text-gray-300 mx-1">|</span>
                <span className="text-gray-500 text-xs">布局</span>

                {(selectedModule.type === 'flex' || selectedModule.type === 'header' || selectedModule.type === 'module') && (
                  <>
                    <SelectInput
                      label="方向"
                      value={selectedStyle.flexDirection || 'column'}
                      onChange={(v) => updateStyle('flexDirection', v)}
                      options={flexDirectionOptions}
                    />
                    <SelectInput
                      label="主轴对齐"
                      value={selectedStyle.justifyContent || 'flex-start'}
                      onChange={(v) => updateStyle('justifyContent', v)}
                      options={justifyContentOptions}
                    />
                    <SelectInput
                      label="交叉轴对齐"
                      value={selectedStyle.alignItems || 'stretch'}
                      onChange={(v) => updateStyle('alignItems', v)}
                      options={alignItemsOptions}
                    />
                    <SelectInput
                      label="换行"
                      value={selectedStyle.flexWrap || 'nowrap'}
                      onChange={(v) => updateStyle('flexWrap', v)}
                      options={flexWrapOptions}
                    />
                    <StyleInputWithUnit
                      label="间距"
                      value={selectedStyle.gap || ''}
                      onChange={(v) => updateStyle('gap', v)}
                      unit="px"
                    />
                  </>
                )}

                {selectedModule.type === 'grid' && (
                  <>
                    <div className="flex items-center gap-1">
                      <span className="text-gray-500 text-xs">列模板</span>
                      <input
                        type="text"
                        value={selectedStyle.gridTemplateColumns || '1fr 1fr'}
                        onChange={(e) => updateStyle('gridTemplateColumns', e.target.value)}
                        className="w-24 border border-gray-300 rounded px-1 py-0.5 text-xs"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-gray-500 text-xs">行模板</span>
                      <input
                        type="text"
                        value={selectedStyle.gridTemplateRows || 'auto'}
                        onChange={(e) => updateStyle('gridTemplateRows', e.target.value)}
                        className="w-24 border border-gray-300 rounded px-1 py-0.5 text-xs"
                      />
                    </div>
                    <SelectInput
                      label="水平对齐"
                      value={selectedStyle.justifyItems || 'stretch'}
                      onChange={(v) => updateStyle('justifyItems', v)}
                      options={gridJustifyItemsOptions}
                    />
                    <SelectInput
                      label="垂直对齐"
                      value={selectedStyle.alignItems || 'stretch'}
                      onChange={(v) => updateStyle('alignItems', v)}
                      options={gridAlignItemsOptions}
                    />
                    <StyleInputWithUnit
                      label="间距"
                      value={selectedStyle.gap || ''}
                      onChange={(v) => updateStyle('gap', v)}
                      unit="px"
                    />
                  </>
                )}
              </>
            )}

            <button onClick={() => useResumeStore.getState().select(null)} className="ml-2 text-xs text-gray-400 hover:text-gray-600">✕</button>
          </div>
        ) : (
          /* ---------- TipTap 文本编辑 / 插入工具 ---------- */
          <div className="flex items-center gap-2 flex-wrap">
            {activeTool === 'edit' && (
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

            {activeTool === 'insert' && (
              <>
                <button onMouseDown={(e) => { e.preventDefault(); insertImage(); }} className="px-2 py-1 text-xs hover:bg-gray-100 rounded">图片</button>
                <button onMouseDown={(e) => { e.preventDefault(); insertLink(); }} className="px-2 py-1 text-xs hover:bg-gray-100 rounded">超链接</button>
              </>
            )}
          </div>
        )}

        <div className="flex items-center gap-1 ml-auto">
          <button onClick={() => useResumeStore.getState().undo()} className={keycapStyle} title="撤销">↩</button>
          <button onClick={() => useResumeStore.getState().redo()} className={keycapStyle} title="重做">↪</button>
        </div>
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