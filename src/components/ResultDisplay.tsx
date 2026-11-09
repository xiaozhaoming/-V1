import React, { useState, useRef } from 'react';
import { 
  Copy, 
  Download, 
  Check, 
  Edit3, 
  FileText, 
  Clock, 
  Volume2, 
  Wand2, 
  Scissors, 
  ListOrdered, 
  Share2, 
  Sparkles,
  Tag,
  Play,
  Pause
} from 'lucide-react';
import { TranscriptionResult, TranscriptionSegment } from '../types';
import { formatTimestamp, formatSRTTimestamp, formatVTTTimestamp } from '../services/audioUtils';
import { filterFillerWords, formatIntoParagraphs } from '../services/transcriber';

interface ResultDisplayProps {
  result: TranscriptionResult;
  onUpdateResult: (updated: TranscriptionResult) => void;
  onShowToast: (msg: string) => void;
}

export const ResultDisplay: React.FC<ResultDisplayProps> = ({
  result,
  onUpdateResult,
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<'editor' | 'segments' | 'media' | 'summary'>('editor');
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);

  // Copy full text handler
  const handleCopy = () => {
    navigator.clipboard.writeText(result.fullText);
    setCopied(true);
    onShowToast('已复制到剪贴板');
    setTimeout(() => setCopied(false), 2000);
  };

  // Export files handler
  const handleExportTxt = () => {
    downloadBlob(result.fullText, `${result.title || '文案提取'}.txt`, 'text/plain;charset=utf-8');
    onShowToast('已导出 TXT 文件');
  };

  const handleExportSrt = () => {
    let srtContent = '';
    result.segments.forEach((seg, index) => {
      srtContent += `${index + 1}\n`;
      srtContent += `${formatSRTTimestamp(seg.start)} --> ${formatSRTTimestamp(seg.end)}\n`;
      srtContent += `${seg.text}\n\n`;
    });
    downloadBlob(srtContent, `${result.title || '字幕文件'}.srt`, 'text/plain;charset=utf-8');
    onShowToast('已导出 SRT 字幕文件');
  };

  const handleExportVtt = () => {
    let vttContent = 'WEBVTT\n\n';
    result.segments.forEach((seg, index) => {
      vttContent += `${index + 1}\n`;
      vttContent += `${formatVTTTimestamp(seg.start)} --> ${formatVTTTimestamp(seg.end)}\n`;
      vttContent += `${seg.text}\n\n`;
    });
    downloadBlob(vttContent, `${result.title || '字幕文件'}.vtt`, 'text/plain;charset=utf-8');
    onShowToast('已导出 VTT 字幕文件');
  };

  const handleExportJson = () => {
    const jsonContent = JSON.stringify(result, null, 2);
    downloadBlob(jsonContent, `${result.title || '转录数据'}.json`, 'application/json');
    onShowToast('已导出 JSON 数据文件');
  };

  const downloadBlob = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Clean filler words
  const handleCleanFillers = () => {
    const cleaned = filterFillerWords(result.fullText);
    const cleanedSegments = result.segments.map(s => ({
      ...s,
      text: filterFillerWords(s.text)
    }));
    onUpdateResult({
      ...result,
      fullText: cleaned,
      segments: cleanedSegments
    });
    onShowToast('已清除口语语气词');
  };

  // Format paragraphs
  const handleFormatParagraphs = () => {
    const formatted = formatIntoParagraphs(result.segments);
    onUpdateResult({
      ...result,
      fullText: formatted
    });
    onShowToast('已重新自适应排版段落');
  };

  // Jump media player timestamp
  const jumpToTimestamp = (sec: number) => {
    if (mediaRef.current) {
      mediaRef.current.currentTime = sec;
      mediaRef.current.play();
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm space-y-6 text-slate-900 animate-fade-in">
      
      {/* Result Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              📝 文案提取结果
            </h3>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold border border-emerald-200">
              提取完成
            </span>
            {result.domainCorrectionApplied && (
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-xs font-extrabold border border-indigo-200 flex items-center gap-1 shadow-2xs">
                <Wand2 className="w-3.5 h-3.5 text-indigo-600" />
                <span>✨ {result.activeDomainName || '行业专有名词'} AI 同音校正</span>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1 flex items-center gap-3">
            <span>时长: <strong className="text-slate-700 font-mono">{formatTimestamp(result.duration)}</strong></span>
            <span>字数: <strong className="text-slate-700 font-mono">{result.wordCount}</strong> 字</span>
            <span>引擎: <strong className="text-slate-700 font-mono">{result.modelUsed}</strong></span>
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleCopy}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-md ${
              copied
                ? 'bg-emerald-600 text-white'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-100'
            }`}
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>📋 一键复制</span>
          </button>

          <div className="relative group">
            <button
              onClick={handleExportTxt}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 transition-colors flex items-center gap-2 shadow-sm"
            >
              <Download className="w-4 h-4 text-indigo-600" />
              <span>📥 导出为 TXT</span>
            </button>
          </div>
        </div>
      </div>

      {/* View Tabs */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-2 overflow-x-auto">
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setActiveTab('editor')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'editor'
                ? 'bg-slate-100 text-indigo-700 border border-slate-200 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            全文编辑
          </button>
          <button
            onClick={() => setActiveTab('segments')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'segments'
                ? 'bg-slate-100 text-indigo-700 border border-slate-200 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            时间戳分段 ({result.segments.length})
          </button>
          {result.mediaUrl && (
            <button
              onClick={() => setActiveTab('media')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'media'
                  ? 'bg-slate-100 text-indigo-700 border border-slate-200 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              音视频同步预览
            </button>
          )}
          <button
            onClick={() => setActiveTab('summary')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'summary'
                ? 'bg-slate-100 text-indigo-700 border border-slate-200 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            要点摘要
          </button>
        </div>

        {/* Quick Export Formats Menu */}
        <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
          <span>更多导出:</span>
          <button onClick={handleExportSrt} className="hover:text-indigo-600 underline">.SRT</button>
          <span>•</span>
          <button onClick={handleExportVtt} className="hover:text-indigo-600 underline">.VTT</button>
          <span>•</span>
          <button onClick={handleExportJson} className="hover:text-indigo-600 underline">.JSON</button>
        </div>
      </div>

      {/* Tab 1: Editor View */}
      {activeTab === 'editor' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">可直接在此修改调整文本内容</span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCleanFillers}
                className="px-2.5 py-1 rounded-md bg-slate-50 hover:bg-slate-100 border border-slate-200 text-[11px] text-slate-600 hover:text-indigo-600 transition-colors flex items-center gap-1 font-medium"
                title="自动去语气词"
              >
                <Wand2 className="w-3 h-3 text-indigo-600" />
                一键去语气词
              </button>
              <button
                onClick={handleFormatParagraphs}
                className="px-2.5 py-1 rounded-md bg-slate-50 hover:bg-slate-100 border border-slate-200 text-[11px] text-slate-600 hover:text-indigo-600 transition-colors flex items-center gap-1 font-medium"
                title="自适应自然分段"
              >
                <Scissors className="w-3 h-3 text-amber-500" />
                智能分段
              </button>
            </div>
          </div>

          <textarea
            value={result.fullText}
            onChange={(e) => onUpdateResult({ ...result, fullText: e.target.value })}
            rows={12}
            className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl p-4 text-sm text-slate-800 placeholder-slate-400 font-mono leading-relaxed outline-none transition-all resize-y shadow-inner"
            placeholder="文案文本展示区..."
          />
        </div>
      )}

      {/* Tab 2: Timestamps View */}
      {activeTab === 'segments' && (
        <div className="space-y-3 max-h-[480px] overflow-y-auto pr-2 custom-scrollbar">
          {result.segments.map((seg, idx) => (
            <div
              key={seg.id || idx}
              className="bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl p-3.5 transition-all flex flex-col sm:flex-row gap-3 items-start group"
            >
              <button
                onClick={() => jumpToTimestamp(seg.start)}
                className="px-2.5 py-1 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-mono font-bold border border-indigo-200 shrink-0 flex items-center gap-1 transition-colors"
                title="点击在播放器中跳转至此刻"
              >
                <Play className="w-3 h-3 fill-current" />
                <span>{formatTimestamp(seg.start)}</span>
              </button>

              <div className="flex-1 space-y-1">
                <input
                  type="text"
                  value={seg.text}
                  onChange={(e) => {
                    const newSegs = [...result.segments];
                    newSegs[idx].text = e.target.value;
                    onUpdateResult({
                      ...result,
                      segments: newSegs,
                      fullText: newSegs.map(s => s.text).join(' ')
                    });
                  }}
                  className="w-full bg-transparent border-b border-transparent focus:border-slate-300 text-xs sm:text-sm text-slate-800 outline-none"
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab 3: Media Preview View */}
      {activeTab === 'media' && result.mediaUrl && (
        <div className="space-y-4">
          <div className="aspect-video w-full max-w-2xl mx-auto rounded-xl overflow-hidden bg-slate-900 border border-slate-200 shadow-inner flex items-center justify-center">
            {result.sourceType === 'file' && result.mediaUrl.startsWith('blob:') ? (
              <video
                ref={mediaRef as React.RefObject<HTMLVideoElement>}
                src={result.mediaUrl}
                controls
                onTimeUpdate={(e) => setCurrentTime((e.target as HTMLVideoElement).currentTime)}
                className="w-full h-full object-contain"
              />
            ) : (
              <audio
                ref={mediaRef as React.RefObject<HTMLAudioElement>}
                src={result.mediaUrl}
                controls
                onTimeUpdate={(e) => setCurrentTime((e.target as HTMLAudioElement).currentTime)}
                className="w-full px-6"
              />
            )}
          </div>

          {/* Subtitle Caption Overlay */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center">
            <span className="text-[10px] text-slate-400 uppercase tracking-widest font-mono font-bold">
              REAL-TIME SUBTITLE CAPTION
            </span>
            <p className="text-sm font-semibold text-indigo-700 mt-1 font-mono">
              {result.segments.find(s => currentTime >= s.start && currentTime <= s.end)?.text || "..."}
            </p>
          </div>
        </div>
      )}

      {/* Tab 4: Summary View */}
      {activeTab === 'summary' && (
        <div className="space-y-4 bg-slate-50 p-5 rounded-xl border border-slate-200">
          <div>
            <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 mb-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              关键看点与核心要点
            </h4>
            <ul className="space-y-2 text-xs text-slate-600">
              {result.summaryPoints?.map((pt, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 mt-1.5 shrink-0" />
                  <span>{pt}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="pt-2 border-t border-slate-200">
            <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 mb-2">
              <Tag className="w-4 h-4 text-amber-500" />
              高频主题关键词
            </h4>
            <div className="flex flex-wrap gap-2">
              {result.keywords?.map((kw, i) => (
                <span key={i} className="px-2.5 py-1 rounded-md bg-white text-indigo-700 text-xs font-mono font-semibold border border-slate-200 shadow-sm">
                  #{kw}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
