import React from 'react';
import { 
  FileText, 
  History, 
  ShieldCheck, 
  Zap, 
  Cpu, 
  HardDriveDownload,
  Sparkles
} from 'lucide-react';

interface NavbarProps {
  historyCount: number;
  onOpenHistory: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ historyCount, onOpenHistory }) => {
  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200 text-slate-900 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        
        {/* Brand / Logo */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold shadow-md shadow-indigo-100">
            <FileText className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-lg font-bold tracking-tight text-slate-900 flex items-center gap-1.5">
                离线视频语音转文案提取器
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  v1.0
                </span>
              </h1>
            </div>
            <p className="text-xs text-slate-500 hidden sm:block">
              可靠 | 快捷 | 零 Token 消耗 | 100% 本地离线处理
            </p>
          </div>
        </div>

        {/* Status Badges & History Trigger */}
        <div className="flex items-center space-x-3">
          <div className="hidden md:flex items-center space-x-2 text-xs">
            <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 border border-slate-200 gap-1 font-medium">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              隐私保护
            </span>
            <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 border border-slate-200 gap-1 font-medium">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              0 Token 消耗
            </span>
            <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 border border-slate-200 gap-1 font-medium">
              <Cpu className="w-3.5 h-3.5 text-indigo-600" />
              本地 CPU/GPU
            </span>
          </div>

          <button
            onClick={onOpenHistory}
            className="relative inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            title="查看历史提取记录"
          >
            <History className="w-4 h-4 text-indigo-600" />
            <span>历史记录</span>
            {historyCount > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-indigo-600 text-white font-bold text-[10px]">
                {historyCount}
              </span>
            )}
          </button>
        </div>

      </div>
    </header>
  );
};
