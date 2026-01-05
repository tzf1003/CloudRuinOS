import { useState } from 'react';
import { X, Clock, Infinity } from 'lucide-react';
import { useGenerateEnrollmentToken } from '../hooks/useApi';

interface CreateTokenDialogProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateTokenDialog({ onClose, onSuccess }: CreateTokenDialogProps) {
  const [description, setDescription] = useState('');
  const [expiresIn, setExpiresIn] = useState<number | 'never' | 'custom'>(3600);
  const [customExpiry, setCustomExpiry] = useState('');
  const [maxUsage, setMaxUsage] = useState(1);
  const [createdBy, setCreatedBy] = useState('console');

  const generateTokenMutation = useGenerateEnrollmentToken();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    let finalExpiresIn: number | 'never' | 'custom' = expiresIn;
    
    if (expiresIn === 'custom' && customExpiry) {
      const customValue = parseInt(customExpiry);
      if (isNaN(customValue) || customValue < 60) {
        alert('自定义过期时间必须至少为60秒');
        return;
      }
      finalExpiresIn = customValue;
    } else if (expiresIn === 'custom') {
      alert('请输入自定义过期时间');
      return;
    }

    // Convert 'custom' to a number if still present (shouldn't happen due to above checks)
    const expiresInValue: number | 'never' = typeof finalExpiresIn === 'number' || finalExpiresIn === 'never' 
      ? finalExpiresIn 
      : 3600; // fallback

    try {
      await generateTokenMutation.mutateAsync({
        description: description.trim() || undefined,
        expiresIn: expiresInValue,
        maxUsage,
        createdBy: createdBy.trim() || 'console',
      });
      onSuccess();
    } catch (error) {
      console.error('生成令牌失败:', error);
      alert('生成令牌失败，请重试');
    }
  };

  const expiryOptions = [
    { value: 3600, label: '1小时', icon: Clock },
    { value: 86400, label: '1天', icon: Clock },
    { value: 604800, label: '1周', icon: Clock },
    { value: 2592000, label: '1个月', icon: Clock },
    { value: 'never', label: '永不过期', icon: Infinity },
    { value: 'custom', label: '自定义', icon: Clock },
  ];

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">生成注册令牌</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700">
              描述 (可选)
            </label>
            <input
              type="text"
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder="令牌用途描述..."
              maxLength={200}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              有效期
            </label>
            <div className="space-y-2">
              {expiryOptions.map((option) => {
                const IconComponent = option.icon;
                return (
                  <label key={option.value} className="flex items-center">
                    <input
                      type="radio"
                      name="expiresIn"
                      value={option.value}
                      checked={expiresIn === option.value}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === 'never') {
                          setExpiresIn('never');
                        } else if (value === 'custom') {
                          setExpiresIn('custom');
                        } else {
                          setExpiresIn(parseInt(value));
                        }
                      }}
                      className="mr-2"
                    />
                    <IconComponent className="h-4 w-4 mr-2 text-gray-500" />
                    <span className="text-sm text-gray-700">{option.label}</span>
                  </label>
                );
              })}
            </div>
            
            {expiresIn === 'custom' && (
              <div className="mt-2">
                <input
                  type="number"
                  value={customExpiry}
                  onChange={(e) => setCustomExpiry(e.target.value)}
                  className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="秒数 (最少60秒)"
                  min="60"
                />
              </div>
            )}
          </div>

          <div>
            <label htmlFor="maxUsage" className="block text-sm font-medium text-gray-700">
              最大使用次数
            </label>
            <input
              type="number"
              id="maxUsage"
              value={maxUsage}
              onChange={(e) => setMaxUsage(parseInt(e.target.value) || 1)}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              min="1"
              max="1000"
            />
          </div>

          <div>
            <label htmlFor="createdBy" className="block text-sm font-medium text-gray-700">
              创建者
            </label>
            <input
              type="text"
              id="createdBy"
              value={createdBy}
              onChange={(e) => setCreatedBy(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder="创建者标识"
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={generateTokenMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {generateTokenMutation.isPending ? '生成中...' : '生成令牌'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}