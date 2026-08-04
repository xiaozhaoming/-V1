import React from 'react';
import { Rocket, Sparkles, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { ProgressState } from '../types';

interface TranscribeControlProps {
  onStartTranscribe: () => void;
  progressState: ProgressState;
  isProcessing: boolean;
  hasInput: boolean;
}

export const TranscribeControl: React.FC<TranscribeControlProps> = ({
  onStartTranscribe,
  progressState,
  isProcessing,
  hasInput,
}) => {
  return (
    <div className="space-y-4 my-6">
      <div className="relative">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <div className="w-full border-t border-slate-200" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-slate-50 px-3 text-xs text-slate-400 font-mono font-medium">
            ENGINE READY
          </span>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center space-y-4">
        {/* Main Trigger Button */}
        <button
          type="button"
          onClick={onStartTranscribe}
          disabled={isProcessing || !hasInput}
          className={`w-full sm:w-auto min-w-[280px] px-8 py-3.5 rounded-xl font-bold text-sm sm:text-base transition-all flex items-center justify-center gap-2.5 shadow-md ${
            isProcessing
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
              : !hasInput
              ? 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-70'
              : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-100 active:scale-[0.99]'
          }`}
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
              <span>{progressState.stage || '正在处理中...'}</span>
            </>
          ) : (
            <>
              <Rocket className="w-5 h-5 stroke-[2.5]" />
              <span>🚀 立即提取文案</span>
            </>
          )}
        </button>

        {!hasInput && !isProcessing && (
          <p className="text-xs text-slate-500 flex items-center gap-1 font-medium">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            请先上传本地音视频文件，或解析视频 URL 链接
          </p>
        )}
      </div>

      {/* Live Processing Card */}
      {isProcessing && (
        <div className="bg-white border border-indigo-200 rounded-2xl p-5 shadow-sm space-y-3 animate-fade-in text-slate-900">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-indigo-700 font-bold">
              <Sparkles className="w-4 h-4 animate-pulse text-indigo-600" />
              <span>{progressState.stage}</span>
            </div>
            <span className="font-mono text-indigo-600 font-bold text-sm">
              {progressState.progress}%
            </span>
          </div>

          {/* Progress bar container */}
          <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200 p-0.5">
            <div
              className="h-full bg-indigo-600 rounded-full transition-all duration-300"
              style={{ width: `${Math.max(4, progressState.progress)}%` }}
            />
          </div>

          {progressState.details && (
            <p className="text-[11px] text-slate-500 font-mono text-center pt-1">
              {progressState.details}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
