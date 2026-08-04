import React, { useState } from 'react';
import { 
  X, 
  Trash2, 
  Search, 
  Clock, 
  FileText, 
  ExternalLink,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import { TranscriptionResult } from '../types';
import { formatTimestamp } from '../services/audioUtils';

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  historyItems: TranscriptionResult[];
  onSelectResult: (item: TranscriptionResult) => void;
  onDeleteItem: (id: string) => void;
  onClearAll: () => void;
}

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({
  isOpen,
  onClose,
  historyItems,
  onSelectResult,
  onDeleteItem,
  onClearAll,
}) => {
  const [search, setSearch] = useState('');

  if (!isOpen) return null;

  const filtered = historyItems.filter(item => 
    item.title.toLowerCase().includes(search.toLowerCase()) ||
    item.fullText.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-sm flex justify-end animate-fade-in">
      <div className="w-full max-w-md bg-white border-l border-slate-200 h-full flex flex-col shadow-2xl text-slate-900">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Clock className="w-5 h-5 text-indigo-600" />
            <h3 className="text-base font-bold text-slate-900">历史提取记录</h3>
            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-mono font-bold">
              {historyItems.length}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar & Clear Button */}
        <div className="p-4 border-b border-slate-100 space-y-3">
          <div className="relative">
            <input
              type="text"
              placeholder="搜索历史文案关键词..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none shadow-sm"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
          </div>

          {historyItems.length > 0 && (
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400 text-[11px] font-medium">全数据存储于本地 LocalStorage</span>
              <button
                onClick={onClearAll}
                className="text-rose-600 hover:text-rose-700 text-[11px] font-semibold underline flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
                清空全部记录
              </button>
            </div>
          )}
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <FileText className="w-8 h-8 mx-auto stroke-1 text-slate-300" />
              <p className="text-xs font-medium">暂无历史提取记录</p>
            </div>
          ) : (
            filtered.map((item) => (
              <div
                key={item.id}
                className="bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl p-3.5 space-y-2 transition-all group shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <h4 
                    onClick={() => { onSelectResult(item); onClose(); }}
                    className="text-xs font-bold text-slate-800 hover:text-indigo-600 cursor-pointer truncate flex-1"
                  >
                    {item.title || '未命名音视频'}
                  </h4>
                  <button
                    onClick={() => onDeleteItem(item.id)}
                    className="text-slate-400 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="删除此记录"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <p 
                  onClick={() => { onSelectResult(item); onClose(); }}
                  className="text-[11px] text-slate-600 line-clamp-2 cursor-pointer leading-relaxed"
                >
                  {item.fullText}
                </p>

                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 font-mono font-medium">
                  <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                  <div className="flex items-center gap-2">
                    <span>{formatTimestamp(item.duration)}</span>
                    <span>•</span>
                    <span>{item.wordCount}字</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  );
};
