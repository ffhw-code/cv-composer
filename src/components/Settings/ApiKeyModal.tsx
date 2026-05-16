import { useState, useEffect } from 'react';

interface ApiKeyModalProps {
  visible: boolean;
  onClose: () => void;
}

interface ApiConfig {
  provider: 'openai' | 'aliyun' | 'custom';
  apiKey: string;
  model: string;
  baseUrl?: string;
}

const PRESETS: Record<'openai' | 'aliyun', { baseUrl: string; model: string }> = {
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o' },
  aliyun: { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-vl-max' },
};

function ApiKeyModal({ visible, onClose }: ApiKeyModalProps) {
  const [config, setConfig] = useState<ApiConfig>({
    provider: 'aliyun',
    apiKey: '',
    model: PRESETS.aliyun.model,
    baseUrl: PRESETS.aliyun.baseUrl,
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('resume_ai_config');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setConfig(parsed);
      } catch {}
    }
  }, []);

  const handleProviderChange = (provider: 'openai' | 'aliyun' | 'custom') => {
    // 只有 openai 和 aliyun 有预设，custom 不自动覆盖
    const preset = provider !== 'custom' ? PRESETS[provider] : undefined;
    setConfig({
      ...config,
      provider,
      model: preset ? preset.model : config.model,
      baseUrl: preset ? preset.baseUrl : config.baseUrl,
    });
  };

  const handleSave = () => {
    localStorage.setItem('resume_ai_config', JSON.stringify(config));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-[400px] max-w-[90vw]">
        <h3 className="text-lg font-bold mb-4">设置 AI 解析服务</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">提供商</label>
            <select
              value={config.provider}
              onChange={(e) => handleProviderChange(e.target.value as any)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            >
              <option value="aliyun">阿里云百炼 (推荐)</option>
              <option value="openai">OpenAI</option>
              <option value="custom">自定义接口</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
            <input
              type="password"
              value={config.apiKey}
              onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
              placeholder="sk-..."
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">Key 仅保存在浏览器，不会上传</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">模型</label>
            <input
              type="text"
              value={config.model}
              onChange={(e) => setConfig({ ...config, model: e.target.value })}
              placeholder="qwen-vl-max"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Base URL {config.provider !== 'custom' && <span className="text-gray-400">(自动填写)</span>}
            </label>
            <input
              type="text"
              value={config.baseUrl || ''}
              onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
              placeholder="https://api.openai.com/v1"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              disabled={config.provider !== 'custom'}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {saved ? '已保存' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ApiKeyModal;