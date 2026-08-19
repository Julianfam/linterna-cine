export type Cue = {
  start: number;
  end: number;
  text: string;
};

export type CaptionLang = "es" | "en" | "other";

type ArchiveFile = {
  name?: string;
  format?: string;
  size?: string | number;
};

export function parseTimestamp(raw: string): number {
  const m = raw.trim().match(/(\d+):(\d{2}):(\d{2})[.,](\d{1,3})/);
  if (!m) return 0;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  const seconds = Number(m[3]);
  let ms = Number(m[4]);
  if (m[4].length === 1) ms *= 100;
  else if (m[4].length === 2) ms *= 10;
  return hours * 3600 + minutes * 60 + seconds + ms / 1000;
}

export function formatVttTime(seconds: number): string {
  const msTotal = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(msTotal / 3_600_000);
  const minutes = Math.floor((msTotal % 3_600_000) / 60_000);
  const secs = Math.floor((msTotal % 60_000) / 1000);
  const ms = msTotal % 1000;
  const pad = (n: number, w: number) => n.toString().padStart(w, "0");
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(secs, 2)}.${pad(ms, 3)}`;
}

function cleanCueText(text: string) {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/\{[^}]+\}/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, '"')
    .replace(/\s+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function parseSrt(raw: string): Cue[] {
  const body = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const cues: Cue[] = [];
  for (const block of body.split(/\n\s*\n/)) {
    const lines = block.trim().split("\n");
    if (!lines.length) continue;
    let i = 0;
    if (/^\d+$/.test(lines[0] ?? "")) i = 1;
    const stamp = lines[i] ?? "";
    const match = stamp.match(
      /(\d+:\d{2}:\d{2}[.,]\d{1,3})\s*-->\s*(\d+:\d{2}:\d{2}[.,]\d{1,3})/,
    );
    if (!match) continue;
    const text = cleanCueText(lines.slice(i + 1).join("\n"));
    if (!text) continue;
    const start = parseTimestamp(match[1]);
    const end = parseTimestamp(match[2]);
    if (!(end > start)) continue;
    cues.push({ start, end, text });
  }
  return cues;
}

export function parseVtt(raw: string): Cue[] {
  const stripped = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const start = stripped.search(/\n\d{2}:\d{2}:\d{2}/);
  const body = start >= 0 ? stripped.slice(start) : stripped.replace(/^WEBVTT[^\n]*\n+/i, "");
  return parseSrt(body);
}

export function parseCaptions(raw: string, fileName: string): Cue[] {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".vtt")) return parseVtt(raw);
  return parseSrt(raw);
}

export function cuesToVtt(cues: Cue[]): string {
  const lines = ["WEBVTT", ""];
  cues.forEach((cue, index) => {
    lines.push(String(index + 1));
    lines.push(`${formatVttTime(cue.start)} --> ${formatVttTime(cue.end)}`);
    lines.push(cue.text);
    lines.push("");
  });
  return lines.join("\n");
}

export function detectCaptionLanguage(cues: Cue[]): CaptionLang {
  const sample = cues
    .slice(0, 60)
    .map((c) => c.text)
    .join(" \n ");
  if (!sample.trim()) return "other";
  const esHits = (
    sample.match(
      /\b(qué|está|están|también|porque|después|señor|señora|usted|aquí|más|cómo|dónde|así|hay|esto|esta|pero|para|una|unos|las|los|del|con|por|muy)\b|[ñáéíóúü¿¡]/gi,
    ) ?? []
  ).length;
  const enHits = (
    sample.match(/\b(the|and|you|that|this|with|from|have|what|are|was|for|not|his|her)\b/gi) ?? []
  ).length;
  if (esHits >= 8 && esHits >= enHits) return "es";
  if (enHits >= 6 && enHits > esHits) return "en";
  if (esHits > enHits) return "es";
  if (enHits > 0) return "en";
  return "other";
}

function num(v: string | number | undefined) {
  if (v === undefined || v === null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function scoreCaptionFile(file: ArchiveFile): number {
  const name = (file.name ?? "").toLowerCase();
  const format = (file.format ?? "").toLowerCase();
  if (!name || name.includes(".thumbs/") || name.includes("__ia_thumb")) return -1;
  const isCaption =
    /\.(srt|vtt|sbv|ass|ssa)$/i.test(name) ||
    format.includes("subrip") ||
    format.includes("vtt") ||
    format.includes("web video text");
  if (!isCaption) return -1;
  if (/\.(ass|ssa)$/i.test(name)) return 8;

  let score = 20;
  if (/\.(es|spa|sp)(\.|$)/i.test(name) || /spanish|espanol|español|castellano/.test(name)) {
    score += 80;
  } else if (/\.(en|eng)(\.|$)/i.test(name) || /english|ingles|inglés/.test(name)) {
    score += 36;
  } else if (
    /german|deutsch|french|francais|français|italian|japanese|korean|chinese|dutch|portuguese|russian/.test(
      name,
    )
  ) {
    score -= 40;
  }

  if (name.includes(".asr.")) score -= 12;
  else score += 18;
  if (name.endsWith(".vtt")) score += 4;
  if (num(file.size) > 4_000 && num(file.size) < 400_000) score += 6;
  return score;
}

export function pickCaptionFile(files: ArchiveFile[]): ArchiveFile | null {
  const ranked = files
    .map((file) => ({ file, score: scoreCaptionFile(file) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.file ?? null;
}

export function wordsToCues(
  words: { text: string; start: number; end: number }[],
): Cue[] {
  const cues: Cue[] = [];
  let batch: { text: string; start: number; end: number }[] = [];

  const flush = () => {
    if (!batch.length) return;
    const text = batch
      .map((w) => w.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .replace(/\s+([,.;:!?])/g, "$1")
      .trim();
    if (text) {
      const start = batch[0].start;
      const end = Math.max(start + 0.7, batch[batch.length - 1].end);
      cues.push({ start, end, text });
    }
    batch = [];
  };

  for (const word of words) {
    const text = word.text.trim();
    if (!text) continue;
    if (!batch.length) {
      batch = [{ ...word, text }];
      continue;
    }
    const prev = batch[batch.length - 1];
    const gap = word.start - prev.end;
    const dur = word.end - batch[0].start;
    const punct = /[.!?]$/.test(prev.text);
    if (gap > 0.9 || dur > 4.5 || batch.length >= 14 || (punct && batch.length >= 5 && gap > 0.12)) {
      flush();
    }
    batch.push({ ...word, text });
  }
  flush();
  return cues;
}

export function scoreAudioFile(file: ArchiveFile): number {
  const name = (file.name ?? "").toLowerCase();
  const format = (file.format ?? "").toLowerCase();
  const size = num(file.size);
  if (!name || name.includes(".thumbs") || name.includes("__ia_thumb")) return -1;
  if (/\.(zip|ffp|flac|cue|m3u)$/i.test(name)) return -1;
  if (/(^|[-_])(lfe|ls|rs)(\.|$)|dvd-lfe|dvd-ls|dvd-rs|5\.1-dvd-[clr](\.|_)/i.test(name)) {
    if (!/st-16|stereo|_st[-_.]/.test(name)) return -1;
  }

  const isMp3 = name.endsWith(".mp3") || format.includes("mp3");
  const isOgg = name.endsWith(".ogg") || format.includes("vorbis");
  const isM4a = name.endsWith(".m4a") || name.endsWith(".aac");
  const isMp4 =
    name.endsWith(".mp4") &&
    (format.includes("mpeg4") || format.includes("h.264") || name.includes("512kb"));
  if (!isMp3 && !isOgg && !isM4a && !isMp4) return -1;

  let score = 8;
  if (isMp3) score += 42;
  if (format.includes("64kb") || name.includes("64kb")) score += 28;
  if (/stereo|st-16|_st[-_.]/.test(name)) score += 18;
  if (isOgg) score += 16;
  if (isM4a) score += 14;
  if (isMp4 && name.includes("512kb")) score += 10;
  if (size > 800_000 && size < 90_000_000) score += 10;
  if (size > 220_000_000) score -= 24;
  return score;
}

export function pickAudioFile(files: ArchiveFile[]): ArchiveFile | null {
  const ranked = files
    .map((file) => ({ file, score: scoreAudioFile(file) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.file ?? null;
}
