import { pipeline, env } from '@xenova/transformers';
import { 
  decodeAudioData, 
  resampleTo16kHzMono, 
  chunkAudioByVAD, 
  formatTimestamp,
  getMediaDuration
} from './audioUtils';
import { 
  TranscriptionOptions, 
  TranscriptionResult, 
  TranscriptionSegment, 
  ProgressState 
} from '../types';

// Configure transformers: disable local server path lookup and configure remote CDN & WASM paths
env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;

const hostOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
env.remoteHost = `${hostOrigin}/api/hf-proxy/`;
env.remotePathTemplate = '{model}/resolve/{revision}/';

if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/';
  env.backends.onnx.wasm.numThreads = 1;
}

// Helper to create Whisper pipeline via local proxy
async function createWhisperPipeline(modelName: string, progressCallback: (info: any) => void) {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  env.remoteHost = `${origin}/api/hf-proxy/`;
  env.remotePathTemplate = '{model}/resolve/{revision}/';
  
  return await pipeline('automatic-speech-recognition', modelName, {
    quantized: true,
    progress_callback: progressCallback
  });
}

// Filler words list in Chinese
const CHINESE_FILLER_WORDS = [
  "那个", "就是", "然后", "嗯", "啊", "呃", "对吧", "就是说", 
  "这个", "好的", "讲真的", "实际上", "可以说", "大概就是"
];

let cachedPipe: any = null;
let cachedModelSize: string = '';

// Map language codes to Transformers.js Whisper supported language names
const WHISPER_LANG_MAP: Record<string, string | undefined> = {
  zh: 'chinese',
  yue: 'chinese',
  en: 'english',
  ja: 'japanese',
  auto: undefined
};

/**
 * Filter filler words from text
 */
export function filterFillerWords(text: string): string {
  let cleaned = text;
  for (const filler of CHINESE_FILLER_WORDS) {
    const regex = new RegExp(`(?<=^|[\\s，。！？])${filler}(?=[\\s，。！？]|$)`, 'g');
    cleaned = cleaned.replace(regex, '');
  }
  // Remove redundant punctuation like "，，" or "。。"
  cleaned = cleaned
    .replace(/，+/g, '，')
    .replace(/。+/g, '。')
    .replace(/！+/g, '！')
    .replace(/？+/g, '？')
    .replace(/^[，。！？\s]+/, '')
    .trim();
  return cleaned;
}

/**
 * Smart paragraph formatting
 */
export function formatIntoParagraphs(segments: TranscriptionSegment[]): string {
  if (segments.length === 0) return '';

  const paragraphs: string[] = [];
  let currentParagraph = '';
  let sentenceCount = 0;

  for (const seg of segments) {
    currentParagraph += seg.text + ' ';
    // Add paragraph break every 3-4 sentences or 120+ chars
    if (seg.text.endsWith('。') || seg.text.endsWith('！') || seg.text.endsWith('？')) {
      sentenceCount++;
    }
    if (sentenceCount >= 3 || currentParagraph.length >= 150) {
      paragraphs.push(currentParagraph.trim());
      currentParagraph = '';
      sentenceCount = 0;
    }
  }

  if (currentParagraph.trim()) {
    paragraphs.push(currentParagraph.trim());
  }

  return paragraphs.join('\n\n');
}

/**
 * Extract keywords and bullet summaries from transcript text
 */
export function extractSummaryAndKeywords(text: string): { summaryPoints: string[]; keywords: string[] } {
  if (!text || text.length < 10) {
    return { summaryPoints: ["文案内容过短，暂无摘要"], keywords: ["短视频", "文案"] };
  }

  // Extract non-filler noun/verb words for keywords count
  const wordFreq: Record<string, number> = {};
  const cleaned = text.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ');
  const words = cleaned.split(/\s+/).filter(w => w.length >= 2);

  for (const w of words) {
    if (!CHINESE_FILLER_WORDS.includes(w)) {
      wordFreq[w] = (wordFreq[w] || 0) + 1;
    }
  }

  const sortedKeywords = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([w]) => w);

  // Split into sentences for key takeaway points
  const sentences = text.split(/(?<=[。！？\n])/)
    .map(s => s.trim())
    .filter(s => s.length >= 12 && s.length <= 100);

  let summaryPoints: string[] = [];
  if (sentences.length > 0) {
    summaryPoints = sentences.slice(0, Math.min(4, sentences.length));
  } else {
    summaryPoints = [text.slice(0, 80) + "..."];
  }

  return {
    summaryPoints,
    keywords: sortedKeywords.length > 0 ? sortedKeywords : ["视频文案", "语音识别", "本地提取"]
  };
}

/**
 * Core transcription process handler
 */
export async function transcribeAudioSource(
  audioBlob: Blob,
  sourceName: string,
  sourceType: 'file' | 'url',
  mediaUrl: string | undefined,
  options: TranscriptionOptions,
  onProgress: (state: ProgressState) => void
): Promise<TranscriptionResult> {
  const startTime = Date.now();

  // Stage 1: Decode Audio with error boundary
  onProgress({
    status: 'extracting_audio',
    progress: 10,
    stage: '正在提取并解码音视频声道...',
    details: '解析媒体波形，重采样至 16000Hz 调频'
  });

  let duration = 30;
  let pcm16k = new Float32Array(16000 * 30);

  try {
    const audioBuffer = await decodeAudioData(audioBlob, (pct) => {
      onProgress({
        status: 'extracting_audio',
        progress: Math.floor(10 + pct * 0.2),
        stage: '正在解析音频数据...',
        details: `音频解码进度 ${pct}%`
      });
    });

    duration = audioBuffer.duration || 30;
    pcm16k = resampleTo16kHzMono(audioBuffer);
  } catch (decodeErr: any) {
    console.warn("audioBuffer decode failed, proceeding with direct media blob:", decodeErr);
    // If decoding failed due to video container format or remote link, estimate duration
    duration = await getMediaDuration(audioBlob);
  }

  onProgress({
    status: 'extracting_audio',
    progress: 35,
    stage: '音频准备就绪',
    details: `总时长: ${formatTimestamp(duration)} | 16kHz 单声道`
  });

  let rawSegments: TranscriptionSegment[] = [];
  let modelUsedName = `Faster-Whisper (${options.modelSize})`;

  const selectedEngine = options.engine || 'groq';

  if (selectedEngine === 'groq') {
    // Mode A: Groq Cloud Whisper-large-v3 LPU Engine (Super fast & accurate)
    try {
      onProgress({
        status: 'loading_model',
        progress: 40,
        stage: '正在调用 Groq Cloud (Whisper-large-v3) 芯片极速识别...',
        details: '全球顶尖 LPU 算力秒级对齐转写'
      });

      const base64Audio = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
      });

      const resp = await fetch('/api/transcribe-groq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: base64Audio,
          mimeType: audioBlob.type || 'video/mp4',
          language: options.language,
          userGroqApiKey: options.groqApiKey
        })
      });

      if (resp.ok) {
        const data = await resp.json();
        if (data.success && Array.isArray(data.segments) && data.segments.length > 0) {
          rawSegments = data.segments.map((s: any, idx: number) => ({
            id: `seg_${idx + 1}`,
            start: typeof s.start === 'number' ? Math.round(s.start * 100) / 100 : idx * 5,
            end: typeof s.end === 'number' ? Math.round(s.end * 100) / 100 : (idx + 1) * 5,
            text: (s.text || '').trim()
          })).filter((s: any) => s.text.length > 0);
          modelUsedName = data.engine || "Groq Cloud (Whisper-large-v3)";
        } else {
          throw new Error(data.error || "Groq Cloud 识别未能提取到有效语音文字");
        }
      } else {
        const errJson = await resp.json().catch(() => ({ error: 'Groq Cloud 响应异常' }));
        throw new Error(errJson.message || errJson.error || "Groq Cloud 服务响应异常");
      }
    } catch (groqErr: any) {
      console.warn("Groq Cloud transcribe error:", groqErr);
      throw new Error(`Groq Cloud 识别未成功: ${groqErr.message || '请确认 Groq Key 或网络连接'}。您可随时切换为【Gemini 3.6 Flash】云端引擎进行免费识别。`);
    }
  } else if (selectedEngine === 'gemini') {
    // Mode B: Server Gemini 3.6 Flash Engine
    try {
      onProgress({
        status: 'loading_model',
        progress: 45,
        stage: '正在调用 Gemini 3.6 Flash 云端高精度引擎...',
        details: '逐字听写与精准时间轴切分'
      });

      const base64Audio = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
      });

      const resp = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: base64Audio,
          mimeType: audioBlob.type || 'video/mp4',
          language: options.language
        })
      });

      if (resp.ok) {
        const data = await resp.json();
        if (data.success && Array.isArray(data.segments) && data.segments.length > 0) {
          rawSegments = data.segments.map((s: any, idx: number) => ({
            id: `seg_${idx + 1}`,
            start: typeof s.start === 'number' ? Math.round(s.start * 100) / 100 : idx * 5,
            end: typeof s.end === 'number' ? Math.round(s.end * 100) / 100 : (idx + 1) * 5,
            text: (s.text || '').trim()
          })).filter((s: any) => s.text.length > 0);
          modelUsedName = data.engine || "Gemini 3.6 Flash 语音识别引擎";
        } else {
          throw new Error(data.error || "云端语音识别未匹配到文字内容");
        }
      } else {
        const errJson = await resp.json().catch(() => ({ error: '云端识别响应异常' }));
        throw new Error(errJson.error || "云端识别服务暂不可用");
      }
    } catch (apiErr: any) {
      console.warn("Gemini cloud transcribe error:", apiErr);
      throw new Error(`Gemini 云端识别未成功: ${apiErr.message || '请检查音轨或切换为 Groq Cloud 引擎'}`);
    }
  } else {
    // Mode C: 100% Pure Local Faster-Whisper (ONNX)
    const modelName = options.modelSize === 'tiny' 
      ? 'Xenova/whisper-tiny' 
      : options.modelSize === 'small' 
        ? 'Xenova/whisper-small' 
        : 'Xenova/whisper-base';

    try {
      onProgress({
        status: 'loading_model',
        progress: 50,
        stage: `正在初始化 Faster-Whisper 本地模型 (${options.modelSize})...`,
        details: '下载/解析 ONNX 模型权重（仅首次需载入，后续自动本地缓存）'
      });

      if (!cachedPipe || cachedModelSize !== options.modelSize) {
        cachedPipe = await createWhisperPipeline(modelName, (info: any) => {
          if (info.status === 'progress') {
            const p = Math.floor(50 + (info.progress || 0) * 0.35);
            onProgress({
              status: 'loading_model',
              progress: p,
              stage: `正在在线/缓存载入 Whisper ONNX 模型... (${Math.floor(info.progress || 0)}%)`,
              details: info.file || 'ONNX 引擎权重初始化中...'
            });
          }
        });
        cachedModelSize = options.modelSize;
      }

      onProgress({
        status: 'transcribing',
        progress: 85,
        stage: `Faster-Whisper (${options.modelSize}) 本地纯离线识别中...`,
        details: '100% 浏览器 WebAssembly/ONNX 引擎计算中'
      });

      // Prepare pipeline parameters with correct Whisper language code
      const targetLang = WHISPER_LANG_MAP[options.language];
      const pipelineOpts: any = {
        return_timestamps: true,
        chunk_length_s: 30,
        stride_length_s: 5,
        task: 'transcribe'
      };

      if (targetLang) {
        pipelineOpts.language = targetLang;
      }

      const output = await cachedPipe(pcm16k, pipelineOpts);

      if (output && output.chunks && Array.isArray(output.chunks) && output.chunks.length > 0) {
        rawSegments = output.chunks.map((chunk: any, index: number) => ({
          id: `seg_${index + 1}`,
          start: Math.round((chunk.timestamp?.[0] || 0) * 100) / 100,
          end: Math.round((chunk.timestamp?.[1] || (chunk.timestamp?.[0] || 0) + 3) * 100) / 100,
          text: (chunk.text || '').trim()
        })).filter((s: any) => s.text.length > 0);
        modelUsedName = `Faster-Whisper (${options.modelSize}) 本地纯离线引擎`;
      } else if (output && output.text && output.text.trim().length > 0) {
        rawSegments = [{
          id: 'seg_1',
          start: 0,
          end: Math.round(duration * 100) / 100,
          text: output.text.trim()
        }];
        modelUsedName = `Faster-Whisper (${options.modelSize}) 本地纯离线引擎`;
      } else {
        throw new Error("Whisper 模型未能正常还原文本，可能音量过小或缺乏对话。");
      }
    } catch (err: any) {
      console.warn("Local Whisper pipeline failed:", err);
      throw new Error(`本地 Whisper ONNX 引擎未成功识别: ${err.message || '模型载入超时或推导异常'}。推荐切换为【云端 AI 引擎 (Gemini 3.6 Flash)】获取免算力极速转写。`);
    }
  }

  // Post-processing
  let processedSegments = rawSegments.map(s => {
    let t = s.text;
    if (options.filterFillers) {
      t = filterFillerWords(t);
    }
    return { ...s, text: t };
  }).filter(s => s.text.length > 0);

  if (processedSegments.length === 0) {
    processedSegments = [{
      id: 'seg_1',
      start: 0,
      end: Math.round(duration * 100) / 100,
      text: '未能检测到清晰对话语音，请尝试更换清晰音轨或调小静音阈值。'
    }];
  }

  // Construct full text
  const fullText = processedSegments.map(s => s.text).join(' ');
  const formattedFullText = options.autoPunctuation ? formatIntoParagraphs(processedSegments) : fullText;
  const wordCount = fullText.replace(/\s+/g, '').length;

  const { summaryPoints, keywords } = extractSummaryAndKeywords(formattedFullText);

  onProgress({
    status: 'completed',
    progress: 100,
    stage: '提取完成！',
    details: `耗时: ${((Date.now() - startTime) / 1000).toFixed(1)}s | 识别字数: ${wordCount} 字`
  });

  return {
    id: `tr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    title: sourceName.replace(/\.[^/.]+$/, ""),
    sourceName,
    sourceType,
    mediaUrl,
    duration,
    fullText: formattedFullText,
    segments: processedSegments,
    createdAt: new Date().toISOString(),
    language: options.language,
    wordCount,
    modelUsed: modelUsedName,
    summaryPoints,
    keywords
  };
}
