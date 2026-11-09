export type SourceType = 'file' | 'url';

export type EngineType = 'groq' | 'gemini' | 'whisper';

export type ModelSize = 'tiny' | 'base' | 'small';

export type LanguageCode = 'zh' | 'yue' | 'en' | 'ja' | 'auto';

export type DomainPreset = 'battery' | 'tech' | 'finance' | 'medical' | 'general' | 'custom';

export interface TranscriptionOptions {
  engine: EngineType;
  modelSize: ModelSize;
  language: LanguageCode;
  groqApiKey?: string;
  autoPunctuation: boolean;
  filterFillers: boolean;
  includeTimestamps: boolean;
  segmentDuration: number; // in seconds
  // Domain Hotwords & LLM Post-Correction
  domainPreset: DomainPreset;
  customHotwords?: string;
  enableDomainCorrection: boolean;
}

export interface TranscriptionSegment {
  id: string;
  start: number; // seconds
  end: number;   // seconds
  text: string;
  speaker?: string;
  confidence?: number;
}

export interface TranscriptionResult {
  id: string;
  title: string;
  sourceName: string;
  sourceType: SourceType;
  mediaUrl?: string;
  duration: number; // in seconds
  fullText: string;
  segments: TranscriptionSegment[];
  createdAt: string;
  language: string;
  wordCount: number;
  modelUsed: string;
  summaryPoints?: string[];
  keywords?: string[];
  domainCorrectionApplied?: boolean;
  activeDomainName?: string;
  originalSegments?: TranscriptionSegment[];
}

export type ProcessStatus = 
  | 'idle' 
  | 'parsing' 
  | 'extracting_audio' 
  | 'loading_model' 
  | 'transcribing' 
  | 'completed' 
  | 'error';

export interface ProgressState {
  status: ProcessStatus;
  progress: number; // 0 to 100
  stage: string;
  details?: string;
  elapsedTime?: number; // seconds
}

export interface MediaInputState {
  sourceType: SourceType;
  file: File | null;
  fileUrl: string | null;
  urlInput: string;
  parsedUrlInfo: {
    platform: string;
    proxyUrl?: string;
    originalUrl?: string;
    filename?: string;
  } | null;
  mediaDuration: number;
  mediaType: 'video' | 'audio';
}
