import { createServerFn } from "@tanstack/react-start";
import { archiveFileUrl, knownArchiveStream } from "@/lib/archive";
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
  mode: "oneshot" | "slices";
  sliceCount: number;
};

type ArchiveFile = { name?: string; format?: string; size?: string | number };

const SEP = "\n¶\n";
const DB_NAME = "linterna-subs-audio";
const STORE = "vtt";
const SLICE_SEC = 75;
const ONESHOT_MAX = 16 * 60;

type AudioCache = {
  buf: Uint8Array;
  slices: { start: number; duration: number; from: number; to: number }[];
  fileName: string;
};
const audioMem = new Map<string, AudioCache>();

function assertArchiveId(id: string) {
  const archiveId = id.trim();
  if (!archiveId || archiveId.includes("/") || archiveId.includes("\\") || archiveId.includes("://")) {
    throw new Error("Archivo no válido");
  }
  return archiveId;
}

async function xaiKey() {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error("La transcripción no está disponible ahora.");
  return apiKey;
}

async function sttForm(fields: Record<string, string>, file?: { name: string; bytes: Uint8Array }) {
  const apiKey = await xaiKey();
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  if (file) {
    form.append(
      "file",
      new Blob([Uint8Array.from(file.bytes)], { type: "audio/mpeg" }),
      file.name,
    );
  }
  const res = await fetch("https://api.x.ai/v1/stt", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      res.status === 413
        ? "El audio es demasiado pesado para transcribirlo de un tirón."
        : `No se pudo transcribir el audio (${res.status})${detail ? `: ${detail.slice(0, 140)}` : ""}`,
    );
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

async function findAudioSource(archiveId: string) {
  const metaRes = await fetch(`https://archive.org/metadata/${encodeURIComponent(archiveId)}`);
  if (!metaRes.ok) throw new Error("Internet Archive no respondió.");
  const meta = (await metaRes.json()) as { files?: ArchiveFile[] };
  const picked = pickAudioFile(meta.files ?? []);
  if (picked?.name) {
    return {
      url: archiveFileUrl(archiveId, picked.name),
      fileName: picked.name,
      kind: (/\.mp3$/i.test(picked.name) ? "mp3" : "other") as "mp3" | "other",
    };
  }
  const known = knownArchiveStream(archiveId);
  if (known) {
    return { url: known.url, fileName: known.fileName, kind: "other" as const };
  }
  throw new Error("Esta copia no tiene una pista de audio que se pueda transcribir.");
}

async function downloadAudio(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("No se pudo descargar la pista de audio.");
  return new Uint8Array(await res.arrayBuffer());
}

async function ensureAudioCache(archiveId: string, url: string, fileName: string): Promise<AudioCache> {
  const hit = audioMem.get(archiveId);
  if (hit) return hit;
  const { splitMp3 } = await import("@/lib/mp3-slice");
  const buf = await downloadAudio(url);
  const rebuilt = splitMp3(buf, SLICE_SEC);
  if (!rebuilt.length) throw new Error("No se pudo cortar la pista de audio.");
  const mapped = rebuilt.map((slice) => {
    const start = slice.bytes.byteOffset - buf.byteOffset;
    return {
      start: slice.start,
      duration: slice.duration,
      from: start,
      to: start + slice.bytes.byteLength,
    };
  });
  const cached: AudioCache = { buf, slices: mapped, fileName };
  audioMem.set(archiveId, cached);
  return cached;
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
    const useOneshot = source.kind !== "mp3" || guessed <= ONESHOT_MAX;
    if (useOneshot) {
      return {
        archiveId: data.archiveId,
        url: source.url,
        fileName: source.fileName,
        kind: source.kind,
        duration: guessed,
        mode: "oneshot",
        sliceCount: 1,
      };
    }
    const cache = await ensureAudioCache(data.archiveId, source.url, source.fileName);
    const duration = cache.slices.reduce((sum, s) => sum + s.duration, 0);
    return {
      archiveId: data.archiveId,
      url: source.url,
      fileName: source.fileName,
      kind: "mp3",
      duration,
      mode: "slices",
      sliceCount: cache.slices.length,
    };
  });

export const transcribeAudioOneshot = createServerFn({ method: "POST" })
  .validator((data: { url: string }) => {
    const url = String(data.url ?? "").trim();
    if (!url.startsWith("https://archive.org/") && !url.startsWith("https://") ) {
      throw new Error("URL de audio no válida");
    }
    if (!/^https:\/\/([a-z0-9.-]+\.)?archive\.org\//i.test(url) && !/^https:\/\/ia[0-9]+\.us\.archive\.org\//i.test(url) && !/^https:\/\/dn[0-9]+\.us\.archive\.org\//i.test(url)) {
      throw new Error("Solo transcribimos copias de Internet Archive.");
    }
    return { url };
  })
  .handler(async ({ data }) => {
    const result = await sttForm({ format: "true", language: "en", url: data.url });
    return {
      language: result.language ?? "",
      duration: result.duration ?? 0,
      words: offsetWords(result.words, 0),
    };
  });

export const transcribeAudioSlice = createServerFn({ method: "POST" })
  .validator((data: { archiveId: string; filmId?: string; index: number }) => ({
    archiveId: assertArchiveId(String(data.archiveId ?? "")),
    filmId: String(data.filmId ?? "").trim(),
    index: Math.max(0, Math.floor(Number(data.index) || 0)),
  }))
  .handler(async ({ data }) => {
    let cache = audioMem.get(data.archiveId);
    if (!cache) {
      const source = await findAudioSource(data.archiveId);
      cache = await ensureAudioCache(data.archiveId, source.url, source.fileName);
    }
    const slice = cache.slices[data.index];
    if (!slice) throw new Error("Tramo de audio no válido.");
    const bytes = cache.buf.subarray(slice.from, slice.to);
    const result = await sttForm(
      { format: "true", language: "en" },
      { name: `slice-${data.index}.mp3`, bytes },
    );
    return {
      language: result.language ?? "",
      duration: result.duration ?? slice.duration,
      words: offsetWords(result.words, slice.start),
    };
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
  input: { archiveId: string; filmId: string; runtime: number },
  onProgress?: (progress: GenerateProgress) => void,
): Promise<{ vtt: string; source: "audio"; fileName: string; cues: number }> {
  onProgress?.({ phase: "audio", done: 0, total: 0 });

  const stored = await loadStoredSubs({ data: { filmId: input.filmId } }).catch(() => null);
  if (stored?.vtt) {
    onProgress?.({ phase: "done", done: stored.cues, total: stored.cues });
    return { vtt: stored.vtt, source: "audio", fileName: stored.fileName, cues: stored.cues };
  }

  const prepared = await prepareAudioSource({
    data: { archiveId: input.archiveId, filmId: input.filmId, runtimeMin: input.runtime },
  });

  const words: SttWord[] = [];
  const langs: string[] = [];
  let heard = 0;

  if (prepared.mode === "oneshot") {
    onProgress?.({ phase: "transcribe", done: 0, total: 1 });
    const result = await transcribeAudioOneshot({ data: { url: prepared.url } });
    words.push(...result.words);
    if (result.language) langs.push(result.language);
    heard = result.duration || prepared.duration;
    onProgress?.({ phase: "transcribe", done: 1, total: 1 });
  } else {
    const total = prepared.sliceCount;
    onProgress?.({ phase: "transcribe", done: 0, total });
    const concurrency = 2;
    for (let i = 0; i < total; i += concurrency) {
      const indexes = Array.from({ length: Math.min(concurrency, total - i) }, (_, n) => i + n);
      const parts = await Promise.all(
        indexes.map((index) =>
          transcribeAudioSlice({ data: { archiveId: input.archiveId, filmId: input.filmId, index } }),
        ),
      );
      for (const part of parts) {
        words.push(...part.words);
        if (part.language) langs.push(part.language);
        heard += part.duration;
      }
      onProgress?.({ phase: "transcribe", done: Math.min(i + parts.length, total), total });
    }
  }

  words.sort((a, b) => a.start - b.start);
  const duration = heard || prepared.duration || input.runtime * 60;
  if (tooLittleSpeech(words, duration)) {
    throw new Error("No se oyen diálogos claros en la pista de audio. No inventamos el texto.");
  }

  let cues = wordsToCues(words);
  const detected = langs.find((l) => l.toLowerCase().startsWith("es"))
    ? "es"
    : detectCaptionLanguage(cues);
  if (detected !== "es") {
    onProgress?.({ phase: "translate", done: 0, total: cues.length });
    cues = await translateCues(cues, (done, total) => {
      onProgress?.({ phase: "translate", done, total });
    });
  }

  const vtt = cuesToVtt(cues);
  await storeGeneratedSubs({
    data: { filmId: input.filmId, archiveId: input.archiveId, vtt, cues: cues.length },
  }).catch(() => undefined);
  onProgress?.({ phase: "done", done: cues.length, total: cues.length });
  return { vtt, source: "audio", fileName: prepared.fileName, cues: cues.length };
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
