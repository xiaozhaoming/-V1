import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { InputSection } from './components/InputSection';
import { TranscribeControl } from './components/TranscribeControl';
import { ResultDisplay } from './components/ResultDisplay';
import { HistoryDrawer } from './components/HistoryDrawer';
import { Toast } from './components/Toast';
import { 
  MediaInputState, 
  TranscriptionOptions, 
  ProgressState, 
  TranscriptionResult 
} from './types';
import { transcribeAudioSource } from './services/transcriber';
import { 
  getHistory, 
  saveToHistory, 
  deleteHistoryItem, 
  clearAllHistory 
} from './services/historyStorage';
import { Shield, Sparkles, Zap, Cpu, CheckCircle } from 'lucide-react';

export default function App() {
  const [inputState, setInputState] = useState<MediaInputState>({
    sourceType: 'file',
    file: null,
    fileUrl: null,
    urlInput: '',
    parsedUrlInfo: null,
    mediaDuration: 0,
    mediaType: 'video',
  });

  const [options, setOptions] = useState<TranscriptionOptions>(() => {
    const defaultOpts: TranscriptionOptions = {
      engine: 'gemini',
      modelSize: 'base',
      language: 'zh',
      autoPunctuation: true,
      filterFillers: true,
      includeTimestamps: true,
      segmentDuration: 5,
      domainPreset: 'battery',
      customHotwords: '',
      enableDomainCorrection: true,
    };
    try {
      const saved = localStorage.getItem('transcriber_options_v1');
      if (saved) {
        return { ...defaultOpts, ...JSON.parse(saved) };
      }
    } catch (err) {
      console.warn('Failed to load saved options:', err);
    }
    return defaultOpts;
  });

  // Save options state (including custom hotwords & domain presets) to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem('transcriber_options_v1', JSON.stringify(options));
    } catch (err) {
      console.warn('Failed to save options to localStorage:', err);
    }
  }, [options]);

  const [progressState, setProgressState] = useState<ProgressState>({
    status: 'idle',
    progress: 0,
    stage: '',
  });

  const [isProcessing, setIsProcessing] = useState(false);
  const [isParsingUrl, setIsParsingUrl] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const [currentResult, setCurrentResult] = useState<TranscriptionResult | null>(null);
  const [history, setHistory] = useState<TranscriptionResult[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Load history on initial mount
  useEffect(() => {
    setHistory(getHistory());
  }, []);

  // Parse URL link via backend Express proxy
  const handleParseUrl = async (url: string) => {
    setIsParsingUrl(true);
    setParseError(null);
    try {
      const res = await fetch('/api/parse-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '视频解析失败，请检查链接有效性');
      }

      setInputState(prev => ({
        ...prev,
        parsedUrlInfo: {
          platform: data.platform,
          proxyUrl: data.proxyUrl,
          originalUrl: data.originalUrl,
          filename: data.filename,
        },
        fileUrl: data.proxyUrl,
      }));

      setToastMessage(`成功解析 ${data.platform} 视频`);
    } catch (err: any) {
      setParseError(err.message || '网络连接或 URL 解析异常');
    } finally {
      setIsParsingUrl(false);
    }
  };

  // Execute Transcription
  const handleStartTranscribe = async () => {
    setIsProcessing(true);
    setProgressState({
      status: 'parsing',
      progress: 5,
      stage: '正在准备媒体文件...',
    });

    try {
      let audioBlob: Blob;
      let sourceName = '未命名音视频';
      let mediaUrl: string | undefined = undefined;

      if (inputState.sourceType === 'file' && inputState.file) {
        audioBlob = inputState.file;
        sourceName = inputState.file.name;
        mediaUrl = inputState.fileUrl || undefined;
      } else if (inputState.sourceType === 'url' && inputState.parsedUrlInfo?.proxyUrl) {
        sourceName = inputState.parsedUrlInfo.filename || '网络视频音轨';
        mediaUrl = inputState.parsedUrlInfo.proxyUrl;

        // Fetch proxy media
        setProgressState({
          status: 'extracting_audio',
          progress: 15,
          stage: '正在获取视频音轨流...',
          details: `从 ${inputState.parsedUrlInfo.platform} 代理流下载`
        });

        const resp = await fetch(inputState.parsedUrlInfo.proxyUrl);
        if (!resp.ok) {
          let errDetail = '无法拉取该视频流，可能链接已失效或受防盗链保护，请尝试直接上传本地文件';
          try {
            const rawTxt = await resp.text();
            try {
              const errJson = JSON.parse(rawTxt);
              if (errJson.error) errDetail = errJson.error;
              else if (errJson.message) errDetail = errJson.message;
            } catch {
              if (rawTxt && rawTxt.length < 250 && !rawTxt.startsWith('<')) {
                errDetail = rawTxt;
              }
            }
          } catch {}
          throw new Error(errDetail);
        }
        audioBlob = await resp.blob();
      } else {
        throw new Error('请先选择或拖入本地文件，或解析视频 URL 链接');
      }

      // Execute Transcriber pipeline
      const result = await transcribeAudioSource(
        audioBlob,
        sourceName,
        inputState.sourceType,
        mediaUrl,
        options,
        (progress) => setProgressState(progress)
      );

      setCurrentResult(result);
      const updatedHistory = saveToHistory(result);
      setHistory(updatedHistory);
      setToastMessage('🚀 提取完成！已保存到记录');
    } catch (err: any) {
      console.error('Transcription error:', err);
      setProgressState({
        status: 'error',
        progress: 0,
        stage: '转录失败',
        details: err.message || '请检查音频格式或尝试切换引擎',
      });
      setToastMessage(`错误: ${err.message || '转录失败'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteHistory = (id: string) => {
    const updated = deleteHistoryItem(id);
    setHistory(updated);
    if (currentResult?.id === id) {
      setCurrentResult(null);
    }
    setToastMessage('记录已删除');
  };

  const handleClearHistory = () => {
    clearAllHistory();
    setHistory([]);
    setToastMessage('已清空全部历史记录');
  };

  const hasInput = !!(
    (inputState.sourceType === 'file' && inputState.file) ||
    (inputState.sourceType === 'url' && inputState.parsedUrlInfo)
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-indigo-600 selection:text-white">
      
      {/* Navbar */}
      <Navbar
        historyCount={history.length}
        onOpenHistory={() => setIsHistoryOpen(true)}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Intro Banner */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 transform translate-x-8 -translate-y-8 w-48 h-48 bg-indigo-50 rounded-full blur-3xl pointer-events-none" />
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
            <div>
              <div className="flex items-center gap-2 text-indigo-600 text-xs font-bold uppercase tracking-wider">
                <Sparkles className="w-4 h-4" />
                <span>三引擎全能听写 v1.3 (高保真并发版)</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-1 tracking-tight">
                短视频语音转文案提取器
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl leading-relaxed">
                支持 <strong className="text-indigo-600">Groq Cloud (Whisper-large-v3 芯片极速)</strong>、<strong className="text-slate-800">Gemini 3.6 Flash 云端 API</strong> 与 <strong className="text-slate-800">Faster-Whisper 本地离线引擎</strong>。
              </p>
            </div>

            <div className="flex items-center gap-2 bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200 shrink-0 shadow-sm">
              <Zap className="w-4 h-4 text-amber-500" />
              <div className="text-[11px]">
                <p className="font-bold text-slate-800">灵活切换引擎</p>
                <p className="text-slate-400">支持免费云端/本地纯离线</p>
              </div>
            </div>
          </div>
        </div>

        {/* Step 1: Input Section */}
        <InputSection
          inputState={inputState}
          setInputState={setInputState}
          options={options}
          setOptions={setOptions}
          onParseUrl={handleParseUrl}
          isParsingUrl={isParsingUrl}
          parseError={parseError}
        />

        {/* Step 2: Transcribe Action Control */}
        <TranscribeControl
          onStartTranscribe={handleStartTranscribe}
          progressState={progressState}
          isProcessing={isProcessing}
          hasInput={hasInput}
        />

        {/* Step 3: Result Display */}
        {currentResult && (
          <ResultDisplay
            result={currentResult}
            onUpdateResult={(updated) => {
              setCurrentResult(updated);
              const updatedHistory = saveToHistory(updated);
              setHistory(updatedHistory);
            }}
            onShowToast={(msg) => setToastMessage(msg)}
          />
        )}

      </main>

      {/* History Slide-over Drawer */}
      <HistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        historyItems={history}
        onSelectResult={(item) => setCurrentResult(item)}
        onDeleteItem={handleDeleteHistory}
        onClearAll={handleClearHistory}
      />

      {/* Toast Component */}
      <Toast
        message={toastMessage}
        onClose={() => setToastMessage(null)}
      />

      {/* Footer */}
      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-500 space-y-1 bg-white">
        <p>离线视频语音转文案提取器 v1.3 • 零 Token 消耗 • 无损 10x 极速并发识别</p>
        <p className="text-[11px] text-slate-400">Faster-Whisper Engine | Client-Side AudioContext Decoding</p>
      </footer>

    </div>
  );
}
