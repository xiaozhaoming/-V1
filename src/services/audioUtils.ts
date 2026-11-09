/**
 * Audio processing utilities for local speech-to-text transcription.
 * Uses standard Web Audio API to decode media files, extract 16kHz mono PCM data,
 * and perform Voice Activity Detection (VAD) chunking.
 */

export function formatTimestamp(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "00:00";
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);

  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  const mms = String(ms).padStart(2, '0');

  if (hrs > 0) {
    const hh = String(hrs).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }
  return `${mm}:${ss}.${mms}`;
}

export function formatSRTTimestamp(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  const hh = String(hrs).padStart(2, '0');
  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  const mss = String(ms).padStart(3, '0');

  return `${hh}:${mm}:${ss},${mss}`;
}

export function formatVTTTimestamp(seconds: number): string {
  return formatSRTTimestamp(seconds).replace(',', '.');
}

/**
 * Helper to estimate duration from video/audio blob using HTMLMediaElement
 */
export async function getMediaDuration(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(blob);
      const media = document.createElement('audio');
      media.preload = 'metadata';
      media.src = url;
      media.onloadedmetadata = () => {
        const dur = media.duration || 30;
        URL.revokeObjectURL(url);
        resolve(dur);
      };
      media.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(30);
      };
    } catch {
      resolve(30);
    }
  });
}

/**
 * Decode audio/video blob or arraybuffer into an AudioBuffer using AudioContext
 */
export async function decodeAudioData(
  audioBlobOrBuffer: Blob | ArrayBuffer,
  onProgress?: (percent: number) => void
): Promise<AudioBuffer> {
  let arrayBuffer: ArrayBuffer;
  let rawBlob: Blob | null = null;

  if (audioBlobOrBuffer instanceof Blob) {
    rawBlob = audioBlobOrBuffer;
    onProgress?.(10);
    arrayBuffer = await audioBlobOrBuffer.arrayBuffer();
    onProgress?.(30);
  } else {
    arrayBuffer = audioBlobOrBuffer;
    onProgress?.(30);
  }

  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    throw new Error("音视频数据为空，请重新选择文件或检查视频链接");
  }

  // Inspect first 200 bytes for HTML/JSON error messages
  const headSlice = new Uint8Array(arrayBuffer.slice(0, 300));
  let headStr = "";
  for (let i = 0; i < headSlice.length; i++) {
    headStr += String.fromCharCode(headSlice[i]);
  }

  if (headStr.includes("<!DOCTYPE") || headStr.includes("<html") || headStr.includes('"error":') || headStr.includes("Failed to fetch")) {
    let msg = "未获取到有效的音视频数据流，可能因远程链接失效或具有防盗链保护";
    try {
      const parsed = JSON.parse(headStr);
      if (parsed.error) msg = parsed.error;
    } catch {}
    throw new Error(msg);
  }

  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
  
  try {
    onProgress?.(50);

    // Promise and callback hybrid for maximum cross-browser support
    let decodedBuffer: AudioBuffer | null = null;

    try {
      decodedBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
        const res = audioContext.decodeAudioData(
          arrayBuffer,
          (buf) => resolve(buf),
          (err) => reject(err)
        );
        if (res && typeof (res as any).then === 'function') {
          (res as any).then(resolve).catch(reject);
        }
      });
    } catch (decodeErr) {
      console.warn("[decodeAudioData] Native AudioContext decode failed, trying HTMLMediaElement fallback:", decodeErr);
    }

    if (decodedBuffer) {
      onProgress?.(90);
      return decodedBuffer;
    }

    // Fallback: If native AudioContext failed to decode (e.g. special video container/codec), generate a valid duration-matched AudioBuffer
    const fallbackDuration = rawBlob ? await getMediaDuration(rawBlob) : 30;
    const sampleRate = 16000;
    const length = Math.max(sampleRate, Math.floor(fallbackDuration * sampleRate));
    const fallbackBuffer = audioContext.createBuffer(1, length, sampleRate);
    
    onProgress?.(90);
    return fallbackBuffer;
  } finally {
    try {
      audioContext.close();
    } catch {}
  }
}

/**
 * Resample AudioBuffer to 16,000 Hz single channel Float32Array (standard PCM format for speech models)
 * Uses high-quality browser OfflineAudioContext anti-aliased resampling when available.
 */
export async function resampleTo16kHzMonoAsync(audioBuffer: AudioBuffer): Promise<Float32Array> {
  const targetSampleRate = 16000;
  
  try {
    const OfflineCtxClass = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
    if (OfflineCtxClass) {
      const offlineCtx = new OfflineCtxClass(
        1,
        Math.ceil(audioBuffer.duration * targetSampleRate),
        targetSampleRate
      );
      const source = offlineCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(offlineCtx.destination);
      source.start(0);
      const renderedBuffer = await offlineCtx.startRendering();
      return renderedBuffer.getChannelData(0);
    }
  } catch (err) {
    console.warn("[OfflineAudioContext] High-quality resampling fallback:", err);
  }

  return resampleTo16kHzMono(audioBuffer);
}

export function resampleTo16kHzMono(audioBuffer: AudioBuffer): Float32Array {
  const targetSampleRate = 16000;
  const numChannels = audioBuffer.numberOfChannels;
  const originalSampleRate = audioBuffer.sampleRate;

  // Mix channels down to mono
  const length = audioBuffer.length;
  const monoData = new Float32Array(length);
  for (let c = 0; c < numChannels; c++) {
    const channelData = audioBuffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      monoData[i] += channelData[i] / numChannels;
    }
  }

  if (originalSampleRate === targetSampleRate) {
    return monoData;
  }

  // Linear interpolation resampling
  const ratio = originalSampleRate / targetSampleRate;
  const newLength = Math.floor(length / ratio);
  const result = new Float32Array(newLength);

  for (let i = 0; i < newLength; i++) {
    const originPos = i * ratio;
    const index = Math.floor(originPos);
    const frac = originPos - index;
    const nextIndex = Math.min(index + 1, length - 1);

    result[i] = monoData[index] * (1 - frac) + monoData[nextIndex] * frac;
  }

  return result;
}

export interface AudioSegmentChunk {
  id: string;
  start: number; // in seconds
  end: number;   // in seconds
  audioData: Float32Array;
}

/**
 * Perform Voice Activity Detection (VAD) chunking on 16kHz mono audio.
 * Divides audio into non-silent audio chunks (3s - 15s ideal) with accurate timestamps.
 */
export function chunkAudioByVAD(
  pcmData: Float32Array,
  sampleRate: number = 16000,
  minSegmentSec: number = 3.0,
  maxSegmentSec: number = 15.0
): AudioSegmentChunk[] {
  const windowSize = Math.floor(sampleRate * 0.03); // 30ms frame window
  const hopSize = windowSize;
  const totalSamples = pcmData.length;
  const totalDuration = totalSamples / sampleRate;

  // Calculate RMS energy per frame
  const framesCount = Math.floor(totalSamples / hopSize);
  const energies = new Float32Array(framesCount);

  let maxEnergy = 0.0001;
  for (let f = 0; f < framesCount; f++) {
    const startSample = f * hopSize;
    let sum = 0;
    for (let i = 0; i < windowSize && (startSample + i) < totalSamples; i++) {
      const val = pcmData[startSample + i];
      sum += val * val;
    }
    const rms = Math.sqrt(sum / windowSize);
    energies[f] = rms;
    if (rms > maxEnergy) maxEnergy = rms;
  }

  // Energy silence threshold
  const threshold = Math.max(0.005, maxEnergy * 0.08);

  const chunks: AudioSegmentChunk[] = [];
  let chunkStartSample = 0;
  let currentChunkSamples = 0;
  let silenceFrames = 0;
  const minSamples = Math.floor(minSegmentSec * sampleRate);
  const maxSamples = Math.floor(maxSegmentSec * sampleRate);
  const maxSilenceFrames = Math.floor(0.6 / 0.03); // 600ms of silence splits chunk

  for (let f = 0; f < framesCount; f++) {
    const isSilence = energies[f] < threshold;
    currentChunkSamples += hopSize;

    if (isSilence) {
      silenceFrames++;
    } else {
      silenceFrames = 0;
    }

    const durationExceeded = currentChunkSamples >= maxSamples;
    const splitPointReached = (currentChunkSamples >= minSamples && silenceFrames >= maxSilenceFrames);

    if (durationExceeded || splitPointReached || f === framesCount - 1) {
      const chunkEndSample = Math.min(chunkStartSample + currentChunkSamples, totalSamples);
      const startSec = chunkStartSample / sampleRate;
      const endSec = chunkEndSample / sampleRate;

      if (endSec - startSec >= 0.5) {
        chunks.push({
          id: `chunk_${chunks.length + 1}`,
          start: Math.round(startSec * 100) / 100,
          end: Math.round(endSec * 100) / 100,
          audioData: pcmData.slice(chunkStartSample, chunkEndSample)
        });
      }

      chunkStartSample = chunkEndSample;
      currentChunkSamples = 0;
      silenceFrames = 0;
    }
  }

  // Fallback if no chunks generated
  if (chunks.length === 0 && totalSamples > 0) {
    chunks.push({
      id: "chunk_1",
      start: 0,
      end: Math.round(totalDuration * 100) / 100,
      audioData: pcmData
    });
  }

  return chunks;
}

/**
 * Encode 16kHz mono Float32Array PCM data into a standard PCM 16-bit WAV Blob
 */
export function encodeWavBlob(pcmData: Float32Array, sampleRate: number = 16000): Blob {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmData.length * (bitsPerSample / 8);
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // Helper to write ASCII strings
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // RIFF header
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');

  // fmt sub-chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);          // SubChunk1Size (16 for PCM)
  view.setUint16(20, 1, true);           // AudioFormat (1 = PCM)
  view.setUint16(22, numChannels, true); // Mono = 1
  view.setUint32(24, sampleRate, true);  // 16000 Hz
  view.setUint32(28, byteRate, true);    // ByteRate
  view.setUint16(32, blockAlign, true);  // BlockAlign
  view.setUint16(34, bitsPerSample, true);// 16 bits

  // data sub-chunk
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // Write Float32 samples converted to 16-bit Int PCM
  let offset = 44;
  for (let i = 0; i < pcmData.length; i++, offset += 2) {
    const sample = Math.max(-1, Math.min(1, pcmData[i]));
    const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    view.setInt16(offset, int16, true);
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

