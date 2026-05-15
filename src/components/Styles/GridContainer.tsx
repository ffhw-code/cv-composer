import { useContext } from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ModuleRenderContext } from '../Canvas/ModuleRenderContext';
import type { ResumeModule } from '../../store/useResumeStore';

function GridContainer({ module }: { module: ResumeModule }) {
  const renderModule = useContext(ModuleRenderContext);
  const childIds = module.children?.map(c => c.id) || [];
  const columns = module.style?.gridTemplateColumns || '1fr 1fr';
  const rows = module.style?.gridTemplateRows || 'auto';
  const gap = module.style?.gap || '16px';

  const containerStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: columns,
    gridTemplateRows: rows,
    gap,
    ...module.style,
  };

  return (
    <div
      className="border border-dashed border-gray-300 min-h-[60px] p-2"
      style={containerStyle}
      data-id={module.id}
    >
      {childIds.length > 0 ? (
        <SortableContext items={childIds} strategy={verticalListSortingStrategy}>
          {module.children?.map(child => renderModule(child))}
        </SortableContext>
      ) : (
        <p className="text-gray-400 text-sm">拖入模块或控件到网格</p>
      )}
    </div>
  );
}

export default GridContainer;