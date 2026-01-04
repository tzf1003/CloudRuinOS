import { useState } from 'react';
import { X, Save } from 'lucide-react';
import { useUpdateEnrollmentToken } from '../hooks/useApi';
import { EnrollmentToken } from '../types/api';

interface EditTokenDialogProps {
  token: EnrollmentToken;
  onClose: () => void;
  onSuccess: () => void;
}

export function EditTokenDialog({ token, onClose, onSuccess }: EditTokenDialogProps) {
  const [description, setDescription] = useState(token.description || '');
  const [isActive, setIsActive] = useState(token.isActive);

  const updateTokenMutation = useUpdateEnrollmentToken();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      await updateTokenMutation.mutateAsync({
        id: token.id,
        data: {
          description: description.trim() || undefined,
          isActive,
        },
      });
      onSuccess();
    } catch (error) {
      console.error('更新令牌失败:', error);
      alert('更新令牌失败，请重试');
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN');
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active':
        return '有效';
      case 'expired':
        return '已过期';
      case 'used':
        return '已使用';
      case 'disabled':
        return '已禁用';
      default:
        return '未知';
    }
  };

  const canToggleActive = token.status !== 'used' && token.status !== 'expired';

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">编辑令牌</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="mb-4 p-3 bg-gray-50 rounded-md">
          <div className="text-xs text-gray-500 space-y-1">
            <div>令牌: {token.token.substring(0, 16)}...</div>
            <div>状态: {getStatusText(token.status)}</div>
            <div>创建时间: {formatDate(token.createdAt)}</div>
            <div>创建者: {token.createdBy}</div>
            {token.expiresAt && (
              <div>过期时间: {formatDate(token.expiresAt)}</div>
            )}
            {token.isPermanent && (
              <div className="text-blue-600">永不过期</div>
            )}
            {token.usedAt && (
              <div>使用时间: {formatDate(token.usedAt)}</div>
            )}
            {token.usedByDevice && (
              <div>使用设备: {token.usedByDevice}</div>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700">
              描述
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

          {canToggleActive && (
            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm font-medium text-gray-700">启用令牌</span>
              </label>
              <p className="mt-1 text-xs text-gray-500">
                禁用后，此令牌将无法用于设备注册
              </p>
            </div>
          )}

          {!canToggleActive && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <p className="text-sm text-yellow-800">
                {token.status === 'used' && '已使用的令牌无法修改状态'}
                {token.status === 'expired' && '已过期的令牌无法修改状态'}
              </p>
            </div>
          )}

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
              disabled={updateTokenMutation.isPending}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              <Save className="h-4 w-4 mr-2" />
              {updateTokenMutation.isPending ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}