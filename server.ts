import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "200mb" }));
  app.use(express.urlencoded({ limit: "200mb", extended: true }));

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", app: "离线视频语音转文案提取器 1.3", version: "1.3.0" });
  });

  // High-precision Speech-to-Text Transcription Endpoint
  app.post("/api/transcribe", async (req, res) => {
    try {
      const { audioBase64, mimeType, language = "zh", hotwords } = req.body;
      if (!audioBase64 || typeof audioBase64 !== "string") {
        return res.status(400).json({ error: "Missing audioBase64 data" });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(503).json({ 
          error: "NO_API_KEY", 
          message: "未检测到 GEMINI_API_KEY，将使用客户端引擎处理" 
        });
      }

      const ai = new GoogleGenAI({ 
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });

      const langMap: Record<string, string> = {
        zh: "中文 (Mandarin)",
        yue: "粤语 (Cantonese)",
        en: "英文 (English)",
        ja: "日语 (Japanese)",
        auto: "自动识别语言"
      };
      const langName = langMap[language] || "中文";

      let cleanMimeType = (mimeType || "audio/wav").split(";")[0].trim().toLowerCase();
      if (!cleanMimeType || cleanMimeType === "application/octet-stream") {
        cleanMimeType = "audio/wav";
      }

      const hotwordsHint = hotwords && typeof hotwords === "string" && hotwords.trim()
        ? `\n【专业领域热词/词汇表】：\n${hotwords.trim()}\n注意：语音听写时若听到同音或谐音词，请优先精确匹配并替换为上述专业词汇。`
        : "";

      const prompt = `你是一个专业的音视频语音转文字提取助手。请仔细听此音视频媒体，将其完整准确地转写为逐句文本文案。
目标语言：${langName}。${hotwordsHint}
请以 JSON 格式输出，格式必须为：
{
  "segments": [
    { "start": 0.0, "end": 4.2, "text": "第1句听写的说话文案内容..." },
    { "start": 4.2, "end": 8.5, "text": "第2句听写的说话文案内容..." }
  ]
}
要求：
1. 精准听写还原人物说话的具体字句文案，按完整标点或停顿拆分成不同句子段落。
2. 时间戳 start 和 end 为以秒为单位的浮点数字。`;

      let response: any = null;
      let lastErr: any = null;
      const candidateModels = [
        "gemini-3.6-flash",
        "gemini-2.5-flash"
      ];
      
      const rawData = audioBase64.replace(/^data:[^;]+;base64,/, "");

      for (const mName of candidateModels) {
        // Retry loop up to 2 times for transient 429 rate limit
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            response = await ai.models.generateContent({
              model: mName,
              contents: [
                {
                  inlineData: {
                    mimeType: cleanMimeType,
                    data: rawData
                  }
                },
                { text: prompt }
              ],
              config: {
                responseMimeType: "application/json"
              }
            });
            if (response && response.text) break;
          } catch (e: any) {
            lastErr = e;
            const errMsg = e?.message || String(e);
            console.warn(`[Transcribe API] Model ${mName} (attempt ${attempt + 1}) failed:`, errMsg);

            if (errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("quota")) {
              // Wait 3s before retry or fallback
              await new Promise((r) => setTimeout(r, 3000));
            } else {
              break; // non-rate-limit error, try next model immediately
            }
          }
        }
        if (response && response.text) break;
      }

      if (!response || !response.text) {
        const msg = lastErr?.message || "Gemini 语音识别云端调用无响应";
        if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("quota")) {
          throw new Error("Gemini API 免费配额已触发频率限制 (429)。建议在左侧引擎切为【Groq Cloud (Whisper-large-v3)】或【Faster-Whisper 本地离线】秒级完成转写。");
        }
        throw new Error(msg);
      }

      const responseText = (response.text || "").trim();
      let parsed: any = null;

      try {
        parsed = JSON.parse(responseText);
      } catch {
        const cleanStr = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
        const jsonMatch = cleanStr.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
        if (jsonMatch) {
          try {
            parsed = JSON.parse(jsonMatch[0]);
          } catch {}
        }
      }

      let rawSegmentsList: any[] = [];

      if (parsed) {
        if (Array.isArray(parsed)) {
          rawSegmentsList = parsed;
        } else if (Array.isArray(parsed.segments)) {
          rawSegmentsList = parsed.segments;
        } else if (Array.isArray(parsed.data)) {
          rawSegmentsList = parsed.data;
        } else if (Array.isArray(parsed.items)) {
          rawSegmentsList = parsed.items;
        } else if (Array.isArray(parsed.results)) {
          rawSegmentsList = parsed.results;
        } else if (Array.isArray(parsed.sentences)) {
          rawSegmentsList = parsed.sentences;
        } else if (typeof parsed.text === "string" && parsed.text.trim()) {
          rawSegmentsList = splitTextToSentenceSegments(parsed.text);
        } else if (typeof parsed.transcript === "string" && parsed.transcript.trim()) {
          rawSegmentsList = splitTextToSentenceSegments(parsed.transcript);
        }
      }

      if (rawSegmentsList.length === 0 && responseText) {
        const matches = [...responseText.matchAll(/"(?:text|content|sentence|statement)"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g)];
        if (matches.length > 0) {
          rawSegmentsList = matches.map(m => ({
            text: m[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
          }));
        } else {
          rawSegmentsList = splitTextToSentenceSegments(responseText);
        }
      }

      let currentTimeCounter = 0;
      const formattedSegments = rawSegmentsList.map((seg: any, idx: number) => {
        let textStr = "";
        if (typeof seg === "string") {
          textStr = seg;
        } else if (seg && typeof seg === "object") {
          textStr = String(seg.text || seg.content || seg.sentence || seg.statement || seg.transcript || "");
        }

        textStr = textStr
          .replace(/^[{\[\s"'`:;]+|[}\]\s"'`:;]+$/g, "")
          .replace(/"(?:segments|start|end|text)"\s*:\s*/gi, "")
          .replace(/^["']+|["']+$/g, "")
          .trim();

        const startVal = (seg && typeof seg.start === "number") ? seg.start : currentTimeCounter;
        const estimatedDur = Math.max(2.0, Math.min(10.0, textStr.length * 0.3));
        const endVal = (seg && typeof seg.end === "number") ? seg.end : (startVal + estimatedDur);
        currentTimeCounter = Math.max(currentTimeCounter, endVal + 0.2);

        return {
          id: `seg_${idx + 1}`,
          start: Math.round(startVal * 10) / 10,
          end: Math.round(endVal * 10) / 10,
          text: textStr
        };
      }).filter(s => s.text.length > 0 && !/^(segments|start|end|text|id|code|data|\{.*\}|\[.*\])$/i.test(s.text));

      if (formattedSegments.length === 0) {
        throw new Error("未能解析到有效的语音讲话文案，请确认输入的视频包含清晰的人声说话声");
      }

      return res.json({
        success: true,
        segments: formattedSegments,
        engine: "Gemini 3.6 Flash 语音识别引擎"
      });
    } catch (err: any) {
      console.error("[Transcribe API Error]:", err);
      return res.status(500).json({ 
        error: err.message || "语音识别引擎服务异常"
      });
    }
  });

  // Groq Cloud Whisper-large-v3 Speech-to-Text Endpoint
  app.post("/api/transcribe-groq", async (req, res) => {
    try {
      const { audioBase64, mimeType, language = "zh", userGroqApiKey, hotwords } = req.body;
      if (!audioBase64 || typeof audioBase64 !== "string") {
        return res.status(400).json({ error: "Missing audioBase64 data" });
      }

      const apiKey = userGroqApiKey || process.env.GROQ_API_KEY;
      if (!apiKey || !apiKey.trim()) {
        return res.status(400).json({ 
          error: "NO_GROQ_API_KEY", 
          message: "未配置 Groq API Key。请在转录设置中填入您的 Groq API Key（去 groq.com 可免费获取），或切换使用【Gemini 3.6 Flash】云端引擎。" 
        });
      }

      let cleanMimeType = (mimeType || "audio/mp3").split(";")[0].trim().toLowerCase();
      if (!cleanMimeType || cleanMimeType === "application/octet-stream") {
        cleanMimeType = "audio/mp3";
      }

      let ext = "mp3";
      if (cleanMimeType.includes("wav")) ext = "wav";
      else if (cleanMimeType.includes("m4a") || cleanMimeType.includes("mp4")) ext = "m4a";
      else if (cleanMimeType.includes("ogg") || cleanMimeType.includes("opus")) ext = "ogg";
      else if (cleanMimeType.includes("webm")) ext = "webm";

      const audioBuffer = Buffer.from(audioBase64.replace(/^data:[^;]+;base64,/, ""), 'base64');
      const audioBlob = new Blob([audioBuffer], { type: cleanMimeType });

      const formData = new FormData();
      formData.append("file", audioBlob, `audio.${ext}`);
      formData.append("model", "whisper-large-v3");
      formData.append("response_format", "verbose_json");
      formData.append("temperature", "0.0");

      if (language && language !== "auto") {
        const langCode = language === "yue" ? "zh" : language;
        formData.append("language", langCode);
      }

      if (hotwords && typeof hotwords === "string" && hotwords.trim()) {
        const safePrompt = hotwords.trim().slice(0, 800);
        formData.append("prompt", safePrompt);
      }

      const groqRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey.trim()}`
        },
        body: formData
      });

      if (!groqRes.ok) {
        const errJson = await groqRes.json().catch(() => ({}));
        const errDesc = errJson.error?.message || errJson.message || `HTTP ${groqRes.status}`;
        return res.status(groqRes.status).json({
          error: `Groq Cloud 接口响应失败: ${errDesc}`
        });
      }

      const groqData = await groqRes.json();
      let formattedSegments: any[] = [];

      if (Array.isArray(groqData.segments) && groqData.segments.length > 0) {
        formattedSegments = groqData.segments.map((seg: any, idx: number) => ({
          id: `seg_${idx + 1}`,
          start: Math.round((seg.start || 0) * 10) / 10,
          end: Math.round((seg.end || (seg.start || 0) + 2) * 10) / 10,
          text: (seg.text || "").trim()
        })).filter((s: any) => s.text.length > 0);
      } else if (groqData.text && typeof groqData.text === "string") {
        formattedSegments = splitTextToSentenceSegments(groqData.text);
      }

      if (formattedSegments.length === 0) {
        return res.status(422).json({
          error: "Groq Cloud 识别成功，但未解析到语音说话内容"
        });
      }

      return res.json({
        success: true,
        segments: formattedSegments,
        engine: "Groq Cloud (Whisper-large-v3 极速芯片)"
      });
    } catch (err: any) {
      console.error("[Groq Transcribe API Error]:", err);
      return res.status(500).json({
        error: err.message || "Groq Cloud 语音服务连接异常"
      });
    }
  });

  // LLM Domain Hotword Correction & Proofreading Endpoint
  app.post("/api/correct-domain-terms", async (req, res) => {
    const { segments = [], hotwords, domainName } = req.body || {};
    try {
      if (!Array.isArray(segments) || segments.length === 0) {
        return res.json({ success: true, segments: [] });
      }

      if (!hotwords || typeof hotwords !== "string" || !hotwords.trim()) {
        return res.json({ success: true, segments });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.json({ success: true, segments });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });

      const prompt = `你是一个【${domainName || '专业领域'}】文本校对专家。
下面是一段语音识别 (ASR) 生成的逐句字幕。由于语音听写存在同音/谐音导致错听的专业名词错误（例如：将"磷酸铁锂"误识别为"磷酸铁铝"、将"热失控"误识别为"热失去"、将"枝晶"误识别为"支晶"、将"库仑效率"误识别为"枯伦效率"、将"NCM811"误识别为"NCM 811"）。

【行业专业热词词库】：
${hotwords.trim()}

任务要求：
1. 仔细对比字幕内容，【仅】将因发音谐音或拼写导致的专有名词错误修改为热词表中的标准正确词汇。
2. 严禁改动说话人的口吻、标点符号或句子表达结构，严禁修改非错字的内容，严禁删减增添原句意思。
3. 请严格以 JSON 数组格式返回校对后的字幕，结构必须保持与输入完全一致：
[
  { "id": "seg_1", "start": 0.0, "end": 4.2, "text": "校对后的准确句子..." }
]`;

      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: [
          { text: `${prompt}\n\n【待校对原始字幕JSON】：\n${JSON.stringify(segments)}` }
        ],
        config: {
          responseMimeType: "application/json"
        }
      });

      const responseText = (response.text || "").trim();
      let parsed: any = null;
      try {
        parsed = JSON.parse(responseText);
      } catch {
        const cleanStr = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
        const match = cleanStr.match(/\[[\s\S]*\]/);
        if (match) {
          try { parsed = JSON.parse(match[0]); } catch {}
        }
      }

      if (Array.isArray(parsed) && parsed.length === segments.length) {
        const correctedSegments = segments.map((orig, i) => {
          const item = parsed[i];
          const newText = (item && typeof item.text === 'string' && item.text.trim()) ? item.text.trim() : orig.text;
          return {
            ...orig,
            text: newText
          };
        });
        return res.json({ success: true, segments: correctedSegments });
      }

      return res.json({ success: true, segments });
    } catch (err: any) {
      console.error("[Domain Correction Error]:", err);
      // Fallback cleanly without blocking transcription
      return res.json({ success: true, segments });
    }
  });

  function splitTextToSentenceSegments(rawText: string) {
    let cleaned = rawText
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .replace(/"(?:segments|start|end|text|id|data|code|status|message)"\s*:\s*/gi, "")
      .replace(/[\{\}\[\]"']/g, " ")
      .replace(/\\n/g, "\n")
      .trim();

    const sentences = cleaned
      .split(/(?<=[。！？!?\n])/)
      .map(s => s.trim().replace(/^[\s，,。!！?？:：;；"'-]+|[\s，,。!！?？:：;；"'-]+$/g, ""))
      .filter(s => s.length > 0 && !/^(segments|start|end|text|data|code|status|message)$/i.test(s));

    let t = 0;
    return sentences.map((st) => {
      const dur = Math.max(2.0, Math.min(10.0, st.length * 0.3));
      const segObj = {
        start: Math.round(t * 10) / 10,
        end: Math.round((t + dur) * 10) / 10,
        text: st
      };
      t += dur + 0.2;
      return segObj;
    });
  }

  // URL Parser & Proxy for video/audio links (Supports Xiaohongshu, Douyin, Bilibili, etc.)
  app.post("/api/parse-url", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url || typeof url !== "string") {
        return res.status(400).json({ error: "请输入有效的视频或音频链接" });
      }

      // Extract raw URL from potential share text (e.g., "77 复制打开小红书，https://...")
      const urlMatch = url.match(/(https?:\/\/[^\s]+)/i);
      const rawUrl = urlMatch ? urlMatch[1].trim() : url.trim();

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(rawUrl);
      } catch {
        return res.status(400).json({ error: "链接格式不正确，请确保包含 http:// 或 https://" });
      }

      const hostname = parsedUrl.hostname.toLowerCase();
      let platform = "其他网络媒体";
      if (hostname.includes("bilibili") || hostname.includes("b23.tv")) {
        platform = "哔哩哔哩 (Bilibili)";
      } else if (hostname.includes("youtube") || hostname.includes("youtu.be")) {
        platform = "YouTube";
      } else if (hostname.includes("douyin") || hostname.includes("iesdouyin")) {
        platform = "抖音";
      } else if (hostname.includes("tiktok")) {
        platform = "TikTok";
      } else if (hostname.includes("xiaohongshu") || hostname.includes("xhslink")) {
        platform = "小红书";
      } else if (hostname.includes("weibo")) {
        platform = "微博";
      }

      const pathname = parsedUrl.pathname.toLowerCase();
      const isDirectMedia = /\.(mp4|mp3|m4a|wav|aac|mov|flv|webm|ogg)$/i.test(pathname);

      let directMediaUrl = rawUrl;

      // If it's a web page URL (like Xiaohongshu / Douyin / Bilibili), resolve redirects and extract direct video stream URL
      if (!isDirectMedia) {
        try {
          const mobileUserAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";
          const pageResp = await fetch(rawUrl, {
            redirect: "follow",
            headers: {
              "User-Agent": mobileUserAgent,
              "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
            }
          });

          if (pageResp.ok) {
            const finalUrl = pageResp.url;
            const htmlText = await pageResp.text();

            // 1. Xiaohongshu (小红书) video stream extraction
            if (hostname.includes("xiaohongshu") || hostname.includes("xhslink") || finalUrl.includes("xiaohongshu")) {
              const rawStreamMatches = [
                ...htmlText.matchAll(/"originVideoKey":"([a-zA-Z0-9_-]+)"/gi),
                ...htmlText.matchAll(/"masterUrl":"([^"]+)"/gi),
                ...htmlText.matchAll(/(https?:(?:\\\/\\\/|\/\/)[^\s"'<>\\]*sns-video[^\s"'<>\\]*)/gi)
              ];

              let foundVideoUrl = "";
              for (const m of rawStreamMatches) {
                let candidate = (m[1] || m[0] || "").replace(/\\u002F/g, "/").replace(/\\u0026/g, "&").replace(/\\/g, "");
                if (/^[a-zA-Z0-9_-]+$/.test(candidate) && !candidate.startsWith("http")) {
                  candidate = `https://sns-video-bd.xhscdn.com/${candidate}`;
                }
                if (candidate.startsWith("http") && candidate.includes("sns-video") && !candidate.includes("fe-static") && !candidate.includes("avatar") && !candidate.includes("pic.")) {
                  foundVideoUrl = candidate;
                  break;
                }
              }

              if (foundVideoUrl) {
                directMediaUrl = foundVideoUrl;
              }
            }

            // 2. Douyin (抖音) video stream extraction
            if (directMediaUrl === rawUrl && (hostname.includes("douyin") || finalUrl.includes("douyin"))) {
              const douyinMatch = 
                htmlText.match(/https?:\\\/\\\/[^\s"'\\]+douyinvod\.com\/[^\s"'\\]+/i) ||
                htmlText.match(/https?:\/\/[^\s"'\\]+douyinvod\.com\/[^\s"'\\]+/i) ||
                htmlText.match(/<meta\s+property="og:video"\s+content="([^"]+)"/i);

              if (douyinMatch) {
                let foundUrl = douyinMatch[1] || douyinMatch[0];
                foundUrl = foundUrl.replace(/\\u002F/g, "/").replace(/\\/g, "");
                if (foundUrl.startsWith("http")) {
                  directMediaUrl = foundUrl;
                }
              }
            }

            // 3. Bilibili (哔哩哔哩) video stream extraction
            if (directMediaUrl === rawUrl && (hostname.includes("bilibili") || hostname.includes("b23.tv") || finalUrl.includes("bilibili"))) {
              const biliMatch = 
                htmlText.match(/"baseUrl":"(https?:\\\/\\\/[^\s"'\\]+)"/i) ||
                htmlText.match(/"url":"(https?:\\\/\\\/[^\s"'\\]+)"/i) ||
                htmlText.match(/https?:\\\/\\\/[^\s"'\\]+hdslb\.com\/[^\s"'\\]+/i) ||
                htmlText.match(/https?:\/\/[^\s"'\\]+\.m4s/i);

              if (biliMatch) {
                let foundUrl = biliMatch[1] || biliMatch[0];
                foundUrl = foundUrl.replace(/\\u002F/g, "/").replace(/\\/g, "");
                if (foundUrl.startsWith("http")) {
                  directMediaUrl = foundUrl;
                }
              }
            }

            // 3. General HTML video tag / og:video extraction fallback
            if (directMediaUrl === rawUrl) {
              const generalVideoMatch = 
                htmlText.match(/<meta\s+property="og:video(?::url)?"\s+content="([^"]+)"/i) ||
                htmlText.match(/<video[^>]+src=["']([^"']+)["']/i) ||
                htmlText.match(/<source[^>]+src=["']([^"']+)["']/i) ||
                htmlText.match(/https?:\/\/[^\s"'<>]+\.(mp4|mov|m4a|mp3)(\?[^\s"'<>]*)?/i);

              if (generalVideoMatch) {
                const foundUrl = (generalVideoMatch[1] || generalVideoMatch[0]).replace(/\\u002F/g, "/").replace(/\\/g, "");
                if (foundUrl.startsWith("http")) {
                  directMediaUrl = foundUrl;
                }
              }
            }
          }
        } catch (extractErr) {
          console.warn("Direct media extraction warning:", extractErr);
        }
      }

      // Construct proxy media URL for safe CORS playback and audio decoding
      const proxyUrl = `/api/proxy-media?url=${encodeURIComponent(directMediaUrl)}`;

      return res.json({
        success: true,
        originalUrl: rawUrl,
        directMediaUrl,
        platform,
        isDirectMedia,
        proxyUrl,
        filename: path.basename(parsedUrl.pathname) || `${platform}_media.mp4`,
        message: `成功解析来自 ${platform} 的链接，准备提取音视频。`
      });
    } catch (err: any) {
      console.error("URL parse error:", err);
      return res.status(500).json({ error: err.message || "解析视频链接失败" });
    }
  });

  // Proxy media endpoint to bypass CORS when downloading/decoding web media audio in browser
  app.get("/api/proxy-media", async (req, res) => {
    try {
      const mediaUrl = req.query.url as string;
      if (!mediaUrl) {
        return res.status(400).send("Missing url parameter");
      }

      // Guard against webpage URLs that were not resolved to direct media stream
      const isKnownMediaExt = /\.(mp4|mp3|m4a|wav|aac|mov|flv|webm|ogg)$/i.test(mediaUrl.split("?")[0]);
      const isKnownCDN = /(sns-video|douyinvod|hdslb|googlevideo|audio|stream)/i.test(mediaUrl);

      if (!isKnownMediaExt && !isKnownCDN && (mediaUrl.includes("xiaohongshu.com") || mediaUrl.includes("douyin.com") || mediaUrl.includes("bilibili.com"))) {
        return res.status(400).json({ error: "未能直接提取到该视频的公开音视频流，受平台的防盗链保护。请直接拖入或选择本地文件处理。" });
      }

      let referer = "https://www.xiaohongshu.com/";
      if (mediaUrl.includes("douyinvod") || mediaUrl.includes("douyin")) {
        referer = "https://www.douyin.com/";
      } else if (mediaUrl.includes("bilibili") || mediaUrl.includes("hdslb")) {
        referer = "https://www.bilibili.com/";
      } else if (mediaUrl.includes("xhscdn") || mediaUrl.includes("xiaohongshu")) {
        referer = "https://www.xiaohongshu.com/";
      } else {
        try {
          referer = new URL(mediaUrl).origin + "/";
        } catch {}
      }

      // Fetch source with realistic video user-agent & referer
      const response = await fetch(mediaUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
          "Referer": referer,
          "Accept": "*/*"
        }
      });

      if (!response.ok) {
        return res.status(400).json({ error: `无法访问视频音轨流资源 (${response.status})，建议上传本地文件` });
      }

      const contentType = (response.headers.get("content-type") || "video/mp4").toLowerCase();

      // If remote returned HTML/JS/image error instead of video binary
      if (contentType.includes("text/html") || contentType.includes("application/json") || contentType.includes("javascript") || contentType.includes("image")) {
        return res.status(400).json({ error: "获取到的资源链接不是有效的音视频数据流，请检查链接或上传本地文件" });
      }

      const contentLength = response.headers.get("content-length");
      res.setHeader("Content-Type", contentType);
      res.setHeader("Access-Control-Allow-Origin", "*");
      if (contentLength) {
        res.setHeader("Content-Length", contentLength);
      }

      if (!response.body) {
        return res.status(500).send("No body stream");
      }

      const reader = response.body.getReader();
      const pump = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
        res.end();
      };
      await pump();
    } catch (err: any) {
      console.error("Proxy media error:", err);
      if (!res.headersSent) {
        res.status(500).send(err.message || "Proxy media failed");
      }
    }
  });

  // Hugging Face Model Proxy to avoid browser CORS/Cloudflare blocks
  app.get("/api/hf-proxy/*", async (req, res) => {
    try {
      const relPath = req.params[0] || "";
      if (!relPath) {
        return res.status(400).json({ error: "Missing path" });
      }

      const hosts = [
        "https://hf-mirror.com/",
        "https://huggingface.co/"
      ];

      for (const host of hosts) {
        try {
          const targetUrl = `${host}${relPath}`;
          const upstreamRes = await fetch(targetUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
          });

          if (upstreamRes.ok) {
            const contentType = upstreamRes.headers.get("content-type");
            if (contentType) {
              res.setHeader("Content-Type", contentType);
            }
            res.setHeader("Cache-Control", "public, max-age=86400");
            
            const buffer = Buffer.from(await upstreamRes.arrayBuffer());
            return res.status(200).send(buffer);
          } else {
            console.warn(`[HF Proxy] ${targetUrl} returned status ${upstreamRes.status}`);
          }
        } catch (e) {
          console.warn(`[HF Proxy] Failed fetching from ${host}:`, e);
        }
      }

      return res.status(404).json({ error: "Model file not found on HF mirrors" });
    } catch (err: any) {
      console.error("[HF Proxy Error]", err);
      return res.status(500).json({ error: err.message || "Proxy failed" });
    }
  });

  // Return 404 JSON for missing model/wasm/onnx static asset requests to prevent SPA HTML fallback errors
  app.use((req, res, next) => {
    if (
      req.path.startsWith('/Xenova/') || 
      req.path.startsWith('/models/') || 
      req.path.endsWith('.wasm') || 
      req.path.endsWith('.onnx') || 
      req.path.endsWith('.bin') || 
      req.path.endsWith('.proto') ||
      (req.path.endsWith('.json') && !req.path.startsWith('/api/'))
    ) {
      return res.status(404).json({ error: "Local model asset not found" });
    }
    next();
  });

  // Vite development or production build static handler
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
