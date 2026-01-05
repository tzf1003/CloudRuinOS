import { useState } from 'react';
import { X, Copy, Check, Clock } from 'lucide-react';
import { useGenerateEnrollmentToken } from '../hooks/useApi';
import { formatTimestamp } from '../lib/utils';

interface EnrollmentTokenDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function EnrollmentTokenDialog({ isOpen, onClose }: EnrollmentTokenDialogProps) {
  const [expiresIn, setExpiresIn] = useState(3600); // 1 hour default
  const [copied, setCopied] = useState(false);
  const generateToken = useGenerateEnrollmentToken();

  const handleGenerate = () => {
    generateToken.mutate({ expiresIn: expiresIn });
  };

  const handleCopy = async () => {
    if (generateToken.data?.token) {
      await navigator.clipboard.writeText(generateToken.data.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClose = () => {
    generateToken.reset();
    setCopied(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            生成设备注册令牌
          </h3>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {!generateToken.data ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  令牌有效期（秒）
                </label>
                <select
                  value={expiresIn}
                  onChange={(e) => setExpiresIn(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={300}>5 分钟</option>
                  <option value={1800}>30 分钟</option>
                  <option value={3600}>1 小时</option>
                  <option value={7200}>2 小时</option>
                  <option value={86400}>24 小时</option>
                </select>
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  取消
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={generateToken.isPending}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {generateToken.isPending ? '生成中...' : '生成令牌'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  注册令牌
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={generateToken.data.token}
                    readOnly
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-sm font-mono"
                  />
                  <button
                    onClick={handleCopy}
                    className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 flex items-center space-x-1"
                  >
                    {copied ? (
                      <>
                        <Check className="h-4 w-4 text-green-600" />
                        <span>已复制</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        <span>复制</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                <div className="flex items-center space-x-2 text-sm text-yellow-800">
                  <Clock className="h-4 w-4" />
                  <span>
                    令牌将于 {formatTimestamp(generateToken.data.expiresAt)} 过期
                  </span>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                <p className="text-sm text-blue-800">
                  请将此令牌提供给需要注册的设备。令牌只能使用一次，过期后需要重新生成。
                </p>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                >
                  完成
                </button>
              </div>
            </>
          )}

          {generateToken.error ? (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <p className="text-sm text-red-800">
                生成令牌失败: {(generateToken.error as any)?.message || '未知错误'}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}