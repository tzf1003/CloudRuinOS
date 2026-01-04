import React from 'react';
import { Dashboard } from '../components/Dashboard';

export function DashboardPage() {
  return (
    <div className="space-y-6">
      <Dashboard 
        refreshInterval={30000} // 30秒刷新间隔
        showMetrics={true}      // 显示系统指标
        compactMode={false}     // 非紧凑模式
      />
    </div>
  );
}