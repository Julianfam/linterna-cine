import { createServerFn } from "@tanstack/react-start";
import { archiveFileUrl, knownArchiveStream } from "@/lib/archive";
import { audioByteRange, firstMp3FrameOffset } from "@/lib/mp3-slice";
import {
  cuesToVtt,
  detectCaptionLanguage,
  pickAudioFile,
  wordsToCues,
  type Cue,
} from "@/lib/subs-parse";

export type { CaptionLang, Cue } from "@/lib/subs-parse";
export {
  cuesToVtt,
  detectCaptionLanguage,
  formatVttTime,
  parseCaptions,
  parseSrt,
  parseTimestamp,
  parseVtt,
  pickAudioFile,
  pickCaptionFile,
  scoreAudioFile,
  scoreCaptionFile,
  wordsToCues,
} from "@/lib/subs-parse";

export type GenerateProgress = {
  phase: "audio" | "transcribe" | "translate" | "done";
  done: number;
  total: number;
};

export type GeneratedSubs = {
  filmId: string;
  vtt: string;
  source: "audio";
  fileName: string;
  cues: number;
  createdAt: number;
};

type SttWord = { text: string; start: number; end: number };
type SttResult = { text: string; language?: string; duration?: number; words?: SttWord[] };

type PreparedAudio = {
  archiveId: string;
  url: string;
  fileName: string;
  kind: "mp3" | "other";
  duration: number;
  size: number;
  mode: "oneshot" | "slices";
  sliceCount: number;
};

type ArchiveFile = { name?: string; format?: string; size?: string | number };

const SEP = "\n¶\n";
const DB_NAME = "linterna-subs-audio";
const STORE = "vtt";
const SLICE_SEC = 45;

function assertArchiveId(id: string) {
  const archiveId = id.trim();
  if (!archiveId || archiveId.includes("/") || archiveId.includes("\\") || archiveId.includes("://")) {
    throw new Error("Archivo no válido");
  }
  return archiveId;
}

function assertArchiveAudioUrl(raw: string) {
  const url = String(raw ?? "").trim();
  if (
    !/^https:\/\/([a-z0-9.-]+\.)?archive\.org\//i.test(url) &&
    !/^https:\/\/ia[0-9]+\.us\.archive\.org\//i.test(url) &&
    !/^https:\/\/dn[0-9]+\.us\.archive\.org\//i.test(url)
  ) {
    throw new Error("Solo transcribimos copias de Internet Archive.");
  }
  return url;
}

async function xaiKey() {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error("La transcripción no está disponible ahora.");
  return apiKey;
}

function sttErrorMessage(status: number, detail: string) {
  if (status === 401) return "No hay clave para transcribir el audio.";
  if (status === 413) return "El audio es demasiado pesado para transcribirlo de un tirón.";
  if (status === 429) return "Demasiadas transcripciones a la vez. Espera un momento.";
  if (status === 502) return "No se pudo leer la pista de audio en Internet Archive.";
  return `No se pudo transcribir el audio (${status})${detail ? `: ${detail.slice(0, 140)}` : ""}`;
}

async function sttForm(fields: Record<string, string>, file?: { name: string; bytes: Uint8Array }) {
  const apiKey = await xaiKey();
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  if (file) {
    const copy = new Uint8Array(file.bytes.byteLength);
    copy.set(file.bytes);
    form.append("file", new Blob([copy], { type: "audio/mpeg" }), file.name);
  }
  const res = await fetch("https://api.x.ai/v1/stt", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(50_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(sttErrorMessage(res.status, detail));
  }
  return (await res.json()) as SttResult;
}

function offsetWords(words: SttWord[] | undefined, offset: number): SttWord[] {
  return (words ?? [])
    .map((w) => ({
      text: String(w.text ?? "").trim(),
      start: Number(w.start) + offset,
      end: Number(w.end) + offset,
    }))
    .filter((w) => w.text && Number.isFinite(w.start) && Number.isFinite(w.end) && w.end >= w.start);
}

function wordsFromPlainText(text: string, start: number, duration: number): SttWord[] {
  const tokens = text.split(/\s+/).map((t) => t.trim()).filter(Boolean);
  if (!tokens.length) return [];
  const step = Math.max(duration, 0.8) / tokens.length;
  return tokens.map((token, index) => ({
    text: token,
    start: start + index * step,
    end: start + (index + 1) * step,
  }));
}

function normalizeStt(result: SttResult, offset: number, fallbackDuration: number): {
  language: string;
  duration: number;
  words: SttWord[];
} {
  const duration = Number(result.duration) || fallbackDuration;
  const timed = offsetWords(result.words, offset);
  const words = timed.length
    ? timed
    : wordsFromPlainText(String(result.text ?? ""), offset, duration || SLICE_SEC);
  return {
    language: result.language ?? "",
    duration,
    words,
  };
}

async function findAudioSource(archiveId: string) {
  const metaRes = await fetch(`https://archive.org/metadata/${encodeURIComponent(archiveId)}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!metaRes.ok) throw new Error("Internet Archive no respondió.");
  const meta = (await metaRes.json()) as { files?: ArchiveFile[] };
  const picked = pickAudioFile(meta.files ?? []);
  if (picked?.name) {
    const size = Number(picked.size) || 0;
    return {
      url: archiveFileUrl(archiveId, picked.name),
      fileName: picked.name,
      kind: (/\.mp3$/i.test(picked.name) ? "mp3" : "other") as "mp3" | "other",
      size: Number.isFinite(size) ? size : 0,
    };
  }
  const known = knownArchiveStream(archiveId);
  if (known) {
    return { url: known.url, fileName: known.fileName, kind: "other" as const, size: 0 };
  }
  throw new Error("Esta copia no tiene una pista de audio que se pueda transcribir.");
}

async function probeSize(url: string): Promise<number> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(8_000),
    });
    const len = Number(res.headers.get("content-length") ?? 0);
    return Number.isFinite(len) ? len : 0;
  } catch {
    return 0;
  }
}

async function fetchAudioRange(url: string, from: number, to: number): Promise<Uint8Array> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: {
          Range: `bytes=${from}-${to}`,
          "User-Agent": "CineLinterna/1.0 (public-domain cinema)",
        },
        signal: AbortSignal.timeout(22_000),
      });
      if (!res.ok && res.status !== 206) {
        throw new Error("No se pudo leer un tramo de audio.");
      }
      const buf = new Uint8Array(await res.arrayBuffer());
      const start = firstMp3FrameOffset(buf);
      return start > 0 ? buf.subarray(start) : buf;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error("No se pudo leer un tramo de audio.");
    }
  }
  throw lastError ?? new Error("No se pudo leer un tramo de audio.");
}

async function loadStoredRow(filmId: string) {
  try {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{ vtt: string; source: string; cues: number }>`
      select vtt, source, cues from generated_subs where film_id = ${filmId} limit 1
    `;
    const row = rows[0];
    if (!row?.vtt) return null;
    return { vtt: row.vtt, source: "audio" as const, fileName: "audio", cues: Number(row.cues) || 0 };
  } catch {
    return null;
  }
}

async function saveStoredRow(entry: { filmId: string; archiveId: string; vtt: string; cues: number }) {
  try {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql`
      insert into generated_subs (film_id, archive_id, vtt, source, cues)
      values (${entry.filmId}, ${entry.archiveId}, ${entry.vtt}, ${"audio"}, ${entry.cues})
      on conflict (film_id) do update set
        archive_id = excluded.archive_id,
        vtt = excluded.vtt,
        source = excluded.source,
        cues = excluded.cues,
        created_at = now()
    `;
  } catch {
    /* preview without migrations, or read-only */
  }
}

export const loadStoredSubs = createServerFn({ method: "GET" })
  .validator((data: { filmId: string }) => ({ filmId: String(data.filmId ?? "").trim() }))
  .handler(async ({ data }) => {
    if (!data.filmId) return null;
    return loadStoredRow(data.filmId);
  });

export const storeGeneratedSubs = createServerFn({ method: "POST" })
  .validator((data: { filmId: string; archiveId: string; vtt: string; cues: number }) => ({
    filmId: String(data.filmId ?? "").trim(),
    archiveId: assertArchiveId(String(data.archiveId ?? "")),
    vtt: String(data.vtt ?? ""),
    cues: Number(data.cues) || 0,
  }))
  .handler(async ({ data }) => {
    if (!data.filmId || !data.vtt) return { ok: false as const };
    await saveStoredRow(data);
    return { ok: true as const };
  });

export const prepareAudioSource = createServerFn({ method: "POST" })
  .validator((data: { archiveId: string; filmId?: string; runtimeMin?: number }) => ({
    archiveId: assertArchiveId(String(data.archiveId ?? "")),
    filmId: String(data.filmId ?? "").trim(),
    runtimeMin: Number(data.runtimeMin) || 0,
  }))
  .handler(async ({ data }): Promise<PreparedAudio> => {
    await xaiKey();
    const source = await findAudioSource(data.archiveId);
    const guessed = data.runtimeMin > 0 ? data.runtimeMin * 60 : 0;
    let size = source.size;
    if (!size && source.kind === "mp3") size = await probeSize(source.url);
    const duration = guessed || (size > 0 ? size / 8000 : 0);
    const canSlice = source.kind === "mp3" && size > 80_000 && duration >= 50;
    if (!canSlice) {
      return {
        archiveId: data.archiveId,
        url: source.url,
        fileName: source.fileName,
        kind: source.kind,
        duration,
        size,
        mode: "oneshot",
        sliceCount: 1,
      };
    }
    return {
      archiveId: data.archiveId,
      url: source.url,
      fileName: source.fileName,
      kind: "mp3",
      duration,
      size,
      mode: "slices",
      sliceCount: Math.max(1, Math.ceil(duration / SLICE_SEC)),
    };
  });

export const transcribeAudioOneshot = createServerFn({ method: "POST" })
  .validator((data: { url: string; language?: string }) => ({
    url: assertArchiveAudioUrl(data.url),
    language: String(data.language ?? "en").slice(0, 8) || "en",
  }))
  .handler(async ({ data }) => {
    const result = await sttForm({ format: "true", language: data.language, url: data.url });
    return normalizeStt(result, 0, 0);
  });

export const transcribeAudioSlice = createServerFn({ method: "POST" })
  .validator((data: { url: string; index: number; size: number; duration: number; language?: string }) => ({
    url: assertArchiveAudioUrl(data.url),
    index: Math.max(0, Math.floor(Number(data.index) || 0)),
    size: Math.max(0, Math.floor(Number(data.size) || 0)),
    duration: Math.max(1, Number(data.duration) || 1),
    language: String(data.language ?? "en").slice(0, 8) || "en",
  }))
  .handler(async ({ data }) => {
    if (!data.size) throw new Error("No se conoce el tamaño de la pista de audio.");
    const range = audioByteRange(data.size, data.duration, data.index, SLICE_SEC);
    const bytes = await fetchAudioRange(data.url, range.from, range.to);
    if (bytes.byteLength < 800) {
      return { language: "", duration: SLICE_SEC, words: [] as SttWord[] };
    }
    const result = await sttForm(
      { format: "true", language: data.language },
      { name: `slice-${data.index}.mp3`, bytes },
    );
    return normalizeStt(result, range.startTime, SLICE_SEC);
  });

function parseGooglePayload(data: unknown): string {
  if (!Array.isArray(data) || !Array.isArray(data[0])) return "";
  return data[0]
    .map((part) => (Array.isArray(part) && typeof part[0] === "string" ? part[0] : ""))
    .join("");
}

export async function translateViaGoogle(text: string, signal?: AbortSignal): Promise<string> {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=es&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`translate-http-${res.status}`);
  return parseGooglePayload(await res.json());
}

export const translateCaptionBatch = createServerFn({ method: "POST" })
  .validator((data: { texts: string[] }) => {
    const texts = (Array.isArray(data.texts) ? data.texts : [])
      .slice(0, 36)
      .map((t) => String(t ?? "").slice(0, 360));
    return { texts };
  })
  .handler(async ({ data }): Promise<{ texts: string[] }> => {
    if (data.texts.length === 0) return { texts: [] };
    try {
      const packed = data.texts.join(SEP);
      const translated = await translateViaGoogle(packed);
      const parts = translated.split(SEP).map((p) => p.trim());
      if (parts.length === data.texts.length) return { texts: parts };
    } catch {
      /* fall through */
    }
    const singles: string[] = [];
    for (const text of data.texts) {
      try {
        singles.push((await translateViaGoogle(text)).trim() || text);
      } catch {
        singles.push(text);
      }
    }
    return { texts: singles };
  });

function packBatches(texts: string[], maxChars: number): string[][] {
  const batches: string[][] = [];
  let current: string[] = [];
  let size = 0;
  for (const text of texts) {
    const next = size + text.length + SEP.length;
    if (current.length && next > maxChars) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(text);
    size += text.length + SEP.length;
  }
  if (current.length) batches.push(current);
  return batches;
}

async function translateBatchClient(texts: string[]): Promise<string[]> {
  const packed = texts.join(SEP);
  try {
    const translated = await translateViaGoogle(packed);
    const parts = translated.split(/\s*¶\s*/).map((p) => p.trim());
    if (parts.length === texts.length) return parts;
  } catch {
    /* server fallback */
  }
  const remote = await translateCaptionBatch({ data: { texts } });
  return remote.texts;
}

export async function translateCues(
  cues: Cue[],
  onProgress?: (done: number, total: number) => void,
): Promise<Cue[]> {
  const batches = packBatches(
    cues.map((c) => c.text),
    1400,
  );
  const out: string[] = [];
  let done = 0;
  const concurrency = 3;
  for (let i = 0; i < batches.length; i += concurrency) {
    const slice = batches.slice(i, i + concurrency);
    const translated = await Promise.all(slice.map((batch) => translateBatchClient(batch)));
    for (const part of translated) {
      out.push(...part);
      done += part.length;
      onProgress?.(Math.min(done, cues.length), cues.length);
    }
  }
  return cues.map((cue, index) => ({
    ...cue,
    text: (out[index] || cue.text).trim() || cue.text,
  }));
}

function tooLittleSpeech(words: SttWord[], durationSec: number) {
  if (words.length < 6) return true;
  const minutes = Math.max(durationSec / 60, 1);
  return minutes >= 8 && words.length / minutes < 2.2;
}

export async function generateSpanishVtt(
  input: { archiveId: string; filmId: string; runtime: number; language?: string },
  onProgress?: (progress: GenerateProgress) => void,
  onPartial?: (vtt: string, cues: number) => void,
): Promise<{ vtt: string; source: "audio"; fileName: string; cues: number }> {
  onProgress?.({ phase: "audio", done: 0, total: 0 });

  const stored = await loadStoredSubs({ data: { filmId: input.filmId } }).catch(() => null);
  if (stored?.vtt) {
    onProgress?.({ phase: "done", done: stored.cues, total: stored.cues });
    onPartial?.(stored.vtt, stored.cues);
    return { vtt: stored.vtt, source: "audio", fileName: stored.fileName, cues: stored.cues };
  }

  const language = input.language === "es" ? "es" : "en";
  const prepared = await prepareAudioSource({
    data: { archiveId: input.archiveId, filmId: input.filmId, runtimeMin: input.runtime },
  });

  const published: Cue[] = [];
  const langs: string[] = [];
  let heard = 0;
  let wordCount = 0;

  const publishSlice = async (sliceWords: SttWord[], detected: string) => {
    if (detected) langs.push(detected);
    wordCount += sliceWords.length;
    if (!sliceWords.length) return;
    const raw = wordsToCues(sliceWords);
    const alreadySpanish =
      language === "es" ||
      langs.some((l) => l.toLowerCase().startsWith("es")) ||
      detectCaptionLanguage(raw) === "es";
    const next = alreadySpanish ? raw : await translateCues(raw);
    published.push(...next);
    if (published.length) onPartial?.(cuesToVtt(published), published.length);
  };

  if (prepared.mode === "oneshot") {
    onProgress?.({ phase: "transcribe", done: 0, total: 1 });
    const result = await transcribeAudioOneshot({ data: { url: prepared.url, language } });
    heard = result.duration || prepared.duration;
    onProgress?.({ phase: "transcribe", done: 1, total: 1 });
    if (tooLittleSpeech(result.words, heard || input.runtime * 60)) {
      throw new Error("No se oyen diálogos claros en la pista de audio. No inventamos el texto.");
    }
    onProgress?.({ phase: "translate", done: 0, total: 1 });
    await publishSlice(result.words, result.language);
    onProgress?.({ phase: "translate", done: 1, total: 1 });
  } else {
    const total = prepared.sliceCount;
    onProgress?.({ phase: "transcribe", done: 0, total });
    const errors: string[] = [];
    for (let i = 0; i < total; i += 1) {
      try {
        const part = await transcribeAudioSlice({
          data: {
            url: prepared.url,
            index: i,
            size: prepared.size,
            duration: prepared.duration,
            language,
          },
        });
        heard += part.duration;
        await publishSlice(part.words, part.language);
      } catch (err) {
        const message = err instanceof Error ? err.message : "tramo fallido";
        errors.push(message);
        if (errors.length >= 3 && published.length === 0) throw new Error(message);
      }
      onProgress?.({ phase: "transcribe", done: i + 1, total });
    }
  }

  const duration = heard || prepared.duration || input.runtime * 60;
  if (published.length < 3 || (duration >= 480 && wordCount / Math.max(duration / 60, 1) < 2.2)) {
    throw new Error("No se oyen diálogos claros en la pista de audio. No inventamos el texto.");
  }

  const vtt = cuesToVtt(published);
  await storeGeneratedSubs({
    data: { filmId: input.filmId, archiveId: input.archiveId, vtt, cues: published.length },
  }).catch(() => undefined);
  onProgress?.({ phase: "done", done: published.length, total: published.length });
  return { vtt, source: "audio", fileName: prepared.fileName, cues: published.length };
}

function openSubsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "filmId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("idb"));
  });
}

export async function readCachedVtt(filmId: string): Promise<GeneratedSubs | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openSubsDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(filmId);
      req.onsuccess = () => resolve((req.result as GeneratedSubs | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    try {
      const raw = localStorage.getItem(`linterna-vtt-audio:${filmId}`);
      return raw ? (JSON.parse(raw) as GeneratedSubs) : null;
    } catch {
      return null;
    }
  }
}

export async function writeCachedVtt(entry: GeneratedSubs): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openSubsDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    try {
      localStorage.setItem(`linterna-vtt-audio:${entry.filmId}`, JSON.stringify(entry));
    } catch {
      /* quota */
    }
  }
}

export function vttToObjectUrl(vtt: string) {
  return URL.createObjectURL(new Blob([vtt], { type: "text/vtt" }));
}
