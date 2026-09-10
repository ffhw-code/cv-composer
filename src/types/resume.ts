/**
 * 领域模型：简历模块树。
 *
 * 独立成层的原因：模块类型被 store（状态）、utils（纯工具）、engine（核心逻辑）
 * 共同引用。若把类型定义在 store 内，会迫使上层模块为「类型」反向依赖状态容器；
 * 独立出来之后，store/utils/engine 都只依赖本层。
 */
export interface ResumeModule {
  id: string;
  type: 'header' | 'module' | 'text' | 'heading' | 'list' | 'image' | 'flex' | 'grid';
  styleId?: string;
  style?: Record<string, string>;
  name?: string;
  jobTitle?: string;
  birth?: string;
  phone?: string;
  email?: string;
  photo?: string;
  title?: string;
  content?: string;
  children: ResumeModule[];
  parentId?: string;
  width?: number;
  height?: number;
}
