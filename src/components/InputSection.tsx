import React, { useState, useRef } from 'react';
import { 
  Upload, 
  Link as LinkIcon, 
  FileAudio, 
  FileVideo, 
  Settings2, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  Volume2, 
  Info,
  Layers,
  Globe
} from 'lucide-react';
import { MediaInputState, SourceType, TranscriptionOptions, EngineType, ModelSize, LanguageCode } from '../types';

interface InputSectionProps {
  inputState: MediaInputState;
  setInputState: React.Dispatch<React.SetStateAction<MediaInputState>>;
  options: TranscriptionOptions;
  setOptions: React.Dispatch<React.SetStateAction<TranscriptionOptions>>;
  onParseUrl: (url: string) => Promise<void>;
  isParsingUrl: boolean;
  parseError: string | null;
}

export const InputSection: React.FC<InputSectionProps> = ({
  inputState,
  setInputState,
  options,
  setOptions,
  onParseUrl,
  isParsingUrl,
  parseError,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleSourceTypeChange = (type: SourceType) => {
    setInputState(prev => ({ ...prev, sourceType: type }));
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processSelectedFile(e.target.files[0]);
    }
  };

  const processSelectedFile = (file: File) => {
    const fileUrl = URL.createObjectURL(file);
    const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|webm|flv|mkv)$/i.test(file.name);
    
    setInputState(prev => ({
      ...prev,
      file,
      fileUrl,
      mediaType: isVideo ? 'video' : 'audio',
      parsedUrlInfo: null,
    }));
  };

  const handleUrlSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputState.urlInput.trim()) return;
    await onParseUrl(inputState.urlInput.trim());
  };

  // Quick preset test links
  const sampleLinks = [
    { label: "B站短视频示例", url: "https://www.bilibili.com/video/BV1xX4y1P7v9" },
    { label: "科技测评音轨", url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4" },
    { label: "英文演讲片段", url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4" }
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm space-y-6 text-slate-900">
      
      {/* Step Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-bold flex items-center justify-center border border-indigo-200">
              1
            </span>
            选择输入源与选项
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            支持拖入本地 MP4/MP3/MOV 或输入网络视频链接（无 Token 费用，全本地解析）
          </p>
        </div>

        {/* Source Switcher Radio */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl self-start sm:self-auto">
          <button
            type="button"
            onClick={() => handleSourceTypeChange('file')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              inputState.sourceType === 'file'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            上传本地文件
          </button>
          <button
            type="button"
            onClick={() => handleSourceTypeChange('url')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              inputState.sourceType === 'url'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <LinkIcon className="w-3.5 h-3.5" />
            粘贴视频 URL
          </button>
        </div>
      </div>

      {/* Input Area */}
      {inputState.sourceType === 'file' ? (
        <div>
          {/* File Dropzone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleFileDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-xl p-6 sm:p-8 text-center cursor-pointer transition-all ${
              dragOver
                ? 'border-indigo-500 bg-indigo-50/50'
                : inputState.file
                ? 'border-indigo-400 bg-indigo-50/30'
                : 'border-slate-200 hover:border-slate-300 bg-slate-50 hover:bg-slate-100/50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/quicktime,video/webm,audio/mp3,audio/mpeg,audio/m4a,audio/wav,audio/aac,audio/flac"
              onChange={handleFileSelect}
              className="hidden"
            />

            {inputState.file ? (
              <div className="flex flex-col items-center justify-center space-y-3">
                <div className="w-12 h-12 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center border border-indigo-200">
                  {inputState.mediaType === 'video' ? (
                    <FileVideo className="w-6 h-6" />
                  ) : (
                    <FileAudio className="w-6 h-6" />
                  )}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800 truncate max-w-md">
                    {inputState.file.name}
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    {(inputState.file.size / (1024 * 1024)).toFixed(2)} MB • {inputState.mediaType === 'video' ? '视频文件' : '音频文件'}
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold border border-indigo-200">
                  已选择文件（点击可更换）
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center space-y-3">
                <div className="w-12 h-12 rounded-xl bg-white text-slate-500 shadow-sm border border-slate-200 flex items-center justify-center">
                  <Upload className="w-6 h-6 text-indigo-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-700">
                    点击选择或拖入本地文件
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    支持 MP4, MP3, MOV, M4A, WAV, WebM 等常见短视频/音频格式 (3分钟内速度最佳)
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <form onSubmit={handleUrlSubmit} className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="粘贴视频链接 (如 B站 / YouTube / 抖音 / 网页视频...)"
                value={inputState.urlInput}
                onChange={(e) => setInputState(prev => ({ ...prev, urlInput: e.target.value }))}
                className="w-full bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none transition-all shadow-sm"
              />
              <Globe className="w-4 h-4 text-slate-400 absolute right-3.5 top-3 pointer-events-none" />
            </div>
            <button
              type="submit"
              disabled={isParsingUrl || !inputState.urlInput.trim()}
              className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 whitespace-nowrap shadow-sm"
            >
              {isParsingUrl ? (
                <>
                  <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                  <span>正在解析...</span>
                </>
              ) : (
                <>
                  <LinkIcon className="w-4 h-4 text-indigo-400" />
                  <span>解析并准备</span>
                </>
              )}
            </button>
          </form>

          {/* Quick preset samples */}
          <div className="flex items-center gap-2 pt-1 flex-wrap">
            <span className="text-[11px] text-slate-400 font-medium">示例链接快速填入:</span>
            {sampleLinks.map((s, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setInputState(prev => ({ ...prev, urlInput: s.url }));
                  onParseUrl(s.url);
                }}
                className="text-[11px] px-2.5 py-1 rounded-md bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-indigo-600 border border-slate-200 transition-colors font-medium"
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Error feedback */}
          {parseError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{parseError}</span>
            </div>
          )}

          {/* Success Info feedback */}
          {inputState.parsedUrlInfo && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <div>
                  <p className="font-bold text-emerald-900">
                    已准备就绪 ({inputState.parsedUrlInfo.platform})
                  </p>
                  <p className="text-emerald-700 text-[11px] mt-0.5 truncate max-w-sm">
                    {inputState.parsedUrlInfo.filename}
                  </p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-mono text-[10px] font-bold">
                Proxy Ready
              </span>
            </div>
          )}
        </div>
      )}

      {/* Advanced Settings Row */}
      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <Settings2 className="w-4 h-4 text-indigo-600" />
            <span>转录引擎与模式配置</span>
          </div>
          <span className="text-[11px] text-slate-500 flex items-center gap-1 font-medium">
            <Info className="w-3.5 h-3.5 text-indigo-500" />
            {options.engine === 'groq'
              ? '⚡ Groq LPU 芯片秒级极速，搭载 Whisper-large-v3 最高精模型'
              : options.engine === 'gemini' 
                ? '☁️ 云端免算力，高精度逐字转写 (推荐)' 
                : '💻 100% 浏览器本地 WebAssembly/ONNX 计算，零数据上云'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          
          {/* Engine Selection */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-600 flex items-center gap-1">
              识别引擎模式
            </label>
            <select
              value={options.engine}
              onChange={(e) => setOptions(prev => ({ ...prev, engine: e.target.value as EngineType }))}
              className="w-full bg-white border border-slate-200 focus:border-indigo-500 rounded-lg px-3 py-1.5 text-xs text-slate-800 outline-none shadow-sm font-medium"
            >
              <option value="gemini">☁️ 云端 AI 引擎 (Gemini 3.6 Flash, 免 Key 开箱即用)</option>
              <option value="groq">⚡ Groq Cloud (Whisper-large-v3, 需自备/配置 Key)</option>
              <option value="whisper">💻 纯本地离线模型 (Faster-Whisper ONNX)</option>
            </select>
          </div>

          {/* Model Size Selection (if Whisper) OR Target Language */}
          {options.engine === 'whisper' ? (
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-600">Whisper 本地模型规格</label>
              <select
                value={options.modelSize}
                onChange={(e) => setOptions(prev => ({ ...prev, modelSize: e.target.value as ModelSize }))}
                className="w-full bg-white border border-slate-200 focus:border-indigo-500 rounded-lg px-3 py-1.5 text-xs text-slate-800 outline-none shadow-sm"
              >
                <option value="base">Whisper Base (推荐, 兼顾速度与准确度)</option>
                <option value="tiny">Whisper Tiny (极速识别, 体积轻小)</option>
                <option value="small">Whisper Small (高精细识别)</option>
              </select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-600">目标语言</label>
              <select
                value={options.language}
                onChange={(e) => setOptions(prev => ({ ...prev, language: e.target.value as LanguageCode }))}
                className="w-full bg-white border border-slate-200 focus:border-indigo-500 rounded-lg px-3 py-1.5 text-xs text-slate-800 outline-none shadow-sm"
              >
                <option value="zh">中文 (Mandarin)</option>
                <option value="yue">粤语 (Cantonese)</option>
                <option value="en">English (英文)</option>
                <option value="ja">日本語 (日文)</option>
                <option value="auto">🌐 自动识别语言</option>
              </select>
            </div>
          )}

          {/* Option Toggles */}
          <div className="space-y-2 pt-2">
            <label className="flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer select-none">
              <input
                type="checkbox"
                checked={options.filterFillers}
                onChange={(e) => setOptions(prev => ({ ...prev, filterFillers: e.target.checked }))}
                className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>过滤口语语气词 (嗯/啊/那个)</span>
            </label>

            <label className="flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer select-none">
              <input
                type="checkbox"
                checked={options.autoPunctuation}
                onChange={(e) => setOptions(prev => ({ ...prev, autoPunctuation: e.target.checked }))}
                className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>智能补全标点与自适应段落</span>
            </label>
          </div>

        </div>

        {/* Optional Groq API Key input */}
        {options.engine === 'groq' && (
          <div className="mt-3 pt-3 border-t border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-slate-600">
              <span className="font-semibold text-slate-700">Groq Key (可选):</span>
              <input
                type="password"
                placeholder="gsk_... (留空使用服务器默认配置)"
                value={options.groqApiKey || ''}
                onChange={(e) => setOptions(prev => ({ ...prev, groqApiKey: e.target.value }))}
                className="bg-white border border-slate-200 rounded px-2.5 py-1 text-xs text-slate-800 outline-none focus:border-indigo-500 w-60 shadow-inner font-mono"
              />
            </div>
            <a 
              href="https://console.groq.com/keys" 
              target="_blank" 
              rel="noreferrer" 
              className="text-[11px] text-indigo-600 hover:underline flex items-center gap-1 font-medium"
            >
              🚀 免费申请 Groq API Key (console.groq.com)
            </a>
          </div>
        )}
      </div>

    </div>
  );
};
