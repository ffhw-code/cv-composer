import { useState } from 'react';
import { getApiConfig, saveApiConfig, PROVIDER_PRESETS } from '../../utils/aiConfig';

interface ApiKeyModalProps {
  visible: boolean;
  onClose: () => void;
}

interface ApiConfig {
  provider: string;
  apiKey: string;
  model: string;
  baseUrl: string;
  visionModel: string;
}

function ApiKeyModal({ visible, onClose }: ApiKeyModalProps) {
  const defaultPreset = PROVIDER_PRESETS.aliyun;
  const [config, setConfig] = useState<ApiConfig>(() => getApiConfig() || {
    provider: 'aliyun',
    apiKey: '',
    model: defaultPreset.model,
    baseUrl: defaultPreset.baseUrl,
    visionModel: defaultPreset.visionModel,
  });
  const [saved, setSaved] = useState(false);

  const handleProviderChange = (provider: string) => {
    const preset = PROVIDER_PRESETS[provider];
    setConfig({
      ...config,
      provider,
      model: preset?.model || config.model,
      baseUrl: preset?.baseUrl || config.baseUrl,
      visionModel: preset?.visionModel || config.visionModel,
    });
  };

  const [error, setError] = useState('');

  const handleSave = () => {
    if (config.baseUrl) {
      try {
        const url = new URL(config.baseUrl);
        if (!url.protocol.startsWith('http')) {
          setError('Base URL 必须以 http:// 或 https:// 开头');
          return;
        }
      } catch {
        setError('Base URL 格式无效，请输入完整的 URL（如 https://api.openai.com/v1）');
        return;
      }
    }
    setError('');
    saveApiConfig(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!visible) return null;

  const providerOptions = Object.entries(PROVIDER_PRESETS).map(([key, preset]) => ({
    value: key,
    label: preset.label + (key === 'aliyun' ? ' (推荐)' : ''),
  }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-[400px] max-w-[90vw]">
        <h3 className="text-lg font-bold mb-4">设置 AI 解析服务</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">提供商</label>
            <select
              value={config.provider}
              onChange={(e) => handleProviderChange(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            >
              {providerOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              FC 模型 <span className="text-gray-400 font-normal">(对话/工具调用)</span>
            </label>
            <input
              type="text"
              value={config.model}
              onChange={(e) => setConfig({ ...config, model: e.target.value })}
              placeholder="qwen-max"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">需要支持 Function Calling</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              视觉模型 <span className="text-gray-400 font-normal">(图片解析)</span>
            </label>
            <input
              type="text"
              value={config.visionModel}
              onChange={(e) => setConfig({ ...config, visionModel: e.target.value })}
              placeholder="qwen-vl-max"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">用于简历图片解析，无需支持 Function Calling</p>
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
            {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
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
