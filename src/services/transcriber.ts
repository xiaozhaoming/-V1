import { pipeline, env } from '@xenova/transformers';
import { 
  decodeAudioData, 
  resampleTo16kHzMono, 
  resampleTo16kHzMonoAsync,
  chunkAudioByVAD, 
  formatTimestamp,
  getMediaDuration,
  encodeWavBlob
} from './audioUtils';
import { 
  TranscriptionOptions, 
  TranscriptionResult, 
  TranscriptionSegment, 
  ProgressState 
} from '../types';
import { DOMAIN_PRESETS, getEffectiveHotwords } from '../constants/domains';

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
 * Helper to convert Blob to Base64 string
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string) || '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Cloud transcription with automatic 15-minute chunking and concurrency pool to maximize speed while keeping rate limits & memory safe
 */
async function transcribeCloudInChunks(
  pcm16k: Float32Array | null,
  fallbackBlob: Blob,
  endpoint: '/api/transcribe' | '/api/transcribe-groq',
  options: TranscriptionOptions,
  effectiveHotwords: string,
  onProgress: (pct: number, stageText: string) => void
): Promise<{ segments: TranscriptionSegment[]; engineName: string }> {
  // 15 minutes (900s) per chunk = ~28.8MB WAV = ~38MB Base64, reduces API request count by 33%
  const CHUNK_SEC = 900; 
  const sampleRate = 16000;
  const chunkSamples = CHUNK_SEC * sampleRate;

  let allSegments: TranscriptionSegment[] = [];
  let engineName = endpoint === '/api/transcribe' ? 'Gemini 3.6 Flash' : 'Groq Cloud (Whisper-large-v3)';

  if (pcm16k && pcm16k.length > 0) {
    const totalSamples = pcm16k.length;
    const totalChunks = Math.max(1, Math.ceil(totalSamples / chunkSamples));

    // Prepare chunk tasks
    const tasks = Array.from({ length: totalChunks }).map((_, c) => {
      const startSample = c * chunkSamples;
      const endSample = Math.min(totalSamples, (c + 1) * chunkSamples);
      const subPcm = pcm16k.subarray(startSample, endSample);
      const chunkWavBlob = encodeWavBlob(subPcm, sampleRate);
      const chunkStartTimeSec = c * CHUNK_SEC;
      return { index: c, blob: chunkWavBlob, startTime: chunkStartTimeSec };
    });

    let completedCount = 0;
    const chunkResults: { index: number; segments: TranscriptionSegment[]; engine?: string }[] = [];

    // Helper worker for a single chunk task with retry capability for rate limits
    const processChunkWithRetry = async (task: { index: number; blob: Blob; startTime: number }) => {
      const base64Audio = await blobToBase64(task.blob);
      const payload: any = {
        audioBase64: base64Audio,
        mimeType: 'audio/wav',
        language: options.language,
        hotwords: effectiveHotwords
      };
      if (endpoint === '/api/transcribe-groq') {
        payload.userGroqApiKey = options.groqApiKey;
      }

      let lastErrorDesc = '云端识别响应异常';
      const maxRetries = 3;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            onProgress(
              Math.floor(40 + (completedCount / totalChunks) * 45),
              `检测到 AI API 配额限制，正在等待重试第 ${task.index + 1}/${totalChunks} 段 (${attempt}/${maxRetries - 1})...`
            );
            await new Promise(r => setTimeout(r, attempt * 4000)); // 4s, 8s backoff
          }

          const resp = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          if (!resp.ok) {
            let errDesc = '云端识别响应异常';
            try {
              const errJson = await resp.json();
              errDesc = errJson.message || errJson.error || errDesc;
            } catch {
              const text = await resp.text().catch(() => '');
              if (text) errDesc = text.slice(0, 120);
            }
            lastErrorDesc = errDesc;
            if (resp.status === 429 || errDesc.includes('429') || errDesc.includes('quota') || errDesc.includes('RESOURCE_EXHAUSTED')) {
              continue; // retry
            }
            throw new Error(errDesc);
          }

          const data = await resp.json();
          if (!data.success || !Array.isArray(data.segments)) {
            throw new Error(data.error || '未能解析出有效听写文字');
          }

          const chunkSegs = data.segments.map((s: any, idx: number) => {
            const segStart = typeof s.start === 'number' ? s.start + task.startTime : task.startTime + idx * 5;
            const segEnd = typeof s.end === 'number' ? s.end + task.startTime : task.startTime + (idx + 1) * 5;
            return {
              id: `seg_${task.index}_${idx + 1}`,
              start: Math.round(segStart * 100) / 100,
              end: Math.round(segEnd * 100) / 100,
              text: (s.text || '').trim()
            };
          }).filter((s: any) => s.text.length > 0);

          completedCount++;
          const progressPct = Math.floor(40 + (completedCount / totalChunks) * 45);
          onProgress(
            progressPct,
            totalChunks === 1
              ? 'AI 听写识别完成，正在整合文本...'
              : `正在听写分段 (已完成 ${completedCount}/${totalChunks} 段)...`
          );

          return { index: task.index, segments: chunkSegs, engine: data.engine };
        } catch (err: any) {
          lastErrorDesc = err.message || String(err);
          if (attempt === maxRetries - 1) throw new Error(lastErrorDesc);
        }
      }
      throw new Error(lastErrorDesc);
    };

    // Parallel concurrency worker queue (Concurrency = 2)
    const CONCURRENCY = 2;
    let taskQueue = [...tasks];
    
    const worker = async () => {
      while (taskQueue.length > 0) {
        const task = taskQueue.shift();
        if (!task) break;
        const res = await processChunkWithRetry(task);
        chunkResults.push(res);
      }
    };

    const workers = Array.from({ length: Math.min(CONCURRENCY, tasks.length) }).map(() => worker());
    await Promise.all(workers);

    // Sort chunk results back in chronological order
    chunkResults.sort((a, b) => a.index - b.index);
    for (const res of chunkResults) {
      allSegments.push(...res.segments);
      if (res.engine) engineName = res.engine;
    }
  } else {
    // Fallback if pcm16k is unavailable
    const base64Audio = await blobToBase64(fallbackBlob);
    onProgress(50, '正在云端极速识别中...');

    const payload: any = {
      audioBase64: base64Audio,
      mimeType: fallbackBlob.type || 'audio/wav',
      language: options.language,
      hotwords: effectiveHotwords
    };
    if (endpoint === '/api/transcribe-groq') {
      payload.userGroqApiKey = options.groqApiKey;
    }

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      let errDesc = '云端识别响应异常';
      try {
        const errJson = await resp.json();
        errDesc = errJson.message || errJson.error || errDesc;
      } catch {
        const text = await resp.text().catch(() => '');
        if (text) errDesc = text.slice(0, 120);
      }
      throw new Error(errDesc);
    }

    const data = await resp.json();
    if (!data.success || !Array.isArray(data.segments)) {
      throw new Error(data.error || '未能解析出有效听写文字');
    }

    if (data.engine) engineName = data.engine;

    allSegments = data.segments.map((s: any, idx: number) => ({
      id: `seg_${idx + 1}`,
      start: typeof s.start === 'number' ? Math.round(s.start * 100) / 100 : idx * 5,
      end: typeof s.end === 'number' ? Math.round(s.end * 100) / 100 : (idx + 1) * 5,
      text: (s.text || '').trim()
    })).filter((s: any) => s.text.length > 0);
  }

  return { segments: allSegments, engineName };
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
  let pcm16k: Float32Array | null = null;
  let transmitBlob: Blob = audioBlob;

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
    pcm16k = await resampleTo16kHzMonoAsync(audioBuffer);
    if (pcm16k && pcm16k.length > 0) {
      transmitBlob = encodeWavBlob(pcm16k, 16000);
    }
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
  const effectiveHotwords = getEffectiveHotwords(options.domainPreset || 'battery', options.customHotwords);
  const activeDomainInfo = DOMAIN_PRESETS[options.domainPreset || 'battery'];

  if (selectedEngine === 'groq') {
    // Mode A: Groq Cloud Whisper-large-v3 LPU Engine
    try {
      const { segments, engineName } = await transcribeCloudInChunks(
        pcm16k,
        transmitBlob,
        '/api/transcribe-groq',
        options,
        effectiveHotwords,
        (pct, stageText) => {
          onProgress({
            status: 'loading_model',
            progress: pct,
            stage: stageText,
            details: effectiveHotwords ? `已注入 ${activeDomainInfo?.name || '行业'} 200+ 专有名词热词库` : 'Groq LPU 极速转写'
          });
        }
      );
      rawSegments = segments;
      modelUsedName = engineName || "Groq Cloud (Whisper-large-v3)";
    } catch (groqErr: any) {
      console.warn("Groq Cloud transcribe error:", groqErr);
      throw new Error(`Groq Cloud 识别未成功: ${groqErr.message || '请确认 Groq Key 或网络连接'}。您可随时切换为【Gemini 3.6 Flash】云端引擎进行免费识别。`);
    }
  } else if (selectedEngine === 'gemini') {
    // Mode B: Server Gemini 3.6 Flash Engine
    try {
      const { segments, engineName } = await transcribeCloudInChunks(
        pcm16k,
        transmitBlob,
        '/api/transcribe',
        options,
        effectiveHotwords,
        (pct, stageText) => {
          onProgress({
            status: 'loading_model',
            progress: pct,
            stage: stageText,
            details: 'Gemini 3.6 Flash 云端高精度听写与逐句对齐'
          });
        }
      );
      rawSegments = segments;
      modelUsedName = engineName || "Gemini 3.6 Flash 语音识别引擎";
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

  // Post-processing: Filter filler words
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

  const originalSegmentsBeforeCorrection = [...processedSegments];
  let domainCorrectionApplied = false;

  // Stage 2: LLM Domain Correction & Proofreading for specialized terminology
  if (options.enableDomainCorrection && effectiveHotwords && processedSegments.length > 0) {
    try {
      onProgress({
        status: 'transcribing',
        progress: 92,
        stage: `正在对齐【${activeDomainInfo?.name || '行业专有名词'}】精准同音校对...`,
        details: '利用 Gemini 3.6 Flash 对 ASR 谐音进行热词库精准修正'
      });

      const correctResp = await fetch('/api/correct-domain-terms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          segments: processedSegments,
          hotwords: effectiveHotwords,
          domainName: activeDomainInfo?.name || '新能源与电池化学'
        })
      });

      if (correctResp.ok) {
        const cData = await correctResp.json();
        if (cData.success && Array.isArray(cData.segments) && cData.segments.length === processedSegments.length) {
          processedSegments = cData.segments;
          domainCorrectionApplied = true;
        }
      }
    } catch (err) {
      console.warn("Domain correction failed gracefully:", err);
    }
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
    details: `耗时: ${((Date.now() - startTime) / 1000).toFixed(1)}s | 识别字数: ${wordCount} 字${domainCorrectionApplied ? ' | ✨ 已完成专业词汇 AI 校正' : ''}`
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
    keywords,
    domainCorrectionApplied,
    activeDomainName: activeDomainInfo?.name,
    originalSegments: domainCorrectionApplied ? originalSegmentsBeforeCorrection : undefined
  };
}
