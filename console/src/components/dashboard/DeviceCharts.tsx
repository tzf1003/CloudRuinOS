import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Wifi, TrendingUp, WifiOff } from 'lucide-react';

interface DeviceChartsProps {
  deviceData: {
    online: number;
    offline: number;
    busy: number;
    total: number;
  };
}

const COLORS = {
  online: '#10B981',   // emerald-500
  offline: '#EF4444',  // red-500
  busy: '#F59E0B',     // amber-500
};

export function DeviceCharts({ deviceData }: DeviceChartsProps) {
  const pieData = [
    { name: '在线', value: deviceData.online, color: COLORS.online },
    { name: '离线', value: deviceData.offline, color: COLORS.offline },
    { name: '忙碌', value: deviceData.busy, color: COLORS.busy }
  ].filter(item => item.value > 0);

  const barData = [
    { status: '在线', count: deviceData.online, fill: COLORS.online },
    { status: '离线', count: deviceData.offline, fill: COLORS.offline },
    { status: '忙碌', count: deviceData.busy, fill: COLORS.busy }
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Device Status Pie Chart */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base font-medium">设备状态分布</CardTitle>
          <Wifi className="h-4 w-4 text-emerald-500" />
        </CardHeader>
        <CardContent>
          {deviceData.total > 0 ? (
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} stroke="rgba(0,0,0,0)" />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1e293b', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px', color: '#f8fafc' }}
                    itemStyle={{ color: '#f8fafc' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-4 mt-4">
                 {pieData.map((entry, i) => (
                    <div key={i} className="flex items-center text-xs text-slate-400">
                      <div className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: entry.color }} />
                      {entry.name} ({entry.value})
                    </div>
                 ))}
              </div>
            </div>
          ) : (
             <div className="h-[300px] flex flex-col items-center justify-center text-slate-500">
                <WifiOff className="h-10 w-10 mb-2 opacity-50" />
                <p>无可用设备数据</p>
             </div>
          )}
        </CardContent>
      </Card>

      {/* Device Status Bar Chart */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base font-medium">设备状态统计</CardTitle>
          <TrendingUp className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <XAxis type="number" hide />
                <YAxis dataKey="status" type="category" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                   cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                   contentStyle={{ backgroundColor: '#1e293b', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px', color: '#f8fafc' }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={32}>
                  {barData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
