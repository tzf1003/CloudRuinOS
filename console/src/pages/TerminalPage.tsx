// console/src/pages/TerminalPage.tsx
// 终端管理页面

import { TerminalManager } from '../components/TerminalManager';

export function TerminalPage() {
  return (
    <div style={{ 
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 50,
    }}>
      <TerminalManager />
    </div>
  );
}
