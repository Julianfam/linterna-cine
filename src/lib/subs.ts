import { createServerFn } from "@tanstack/react-start";
import { archiveFileUrl } from "@/lib/archive";
import {
  cuesToVtt,
  detectCaptionLanguage,
  parseCaptions,
  pickCaptionFile,
  type CaptionLang,
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
  pickCaptionFile,
  scoreCaptionFile,
} from "@/lib/subs-parse";

export type LoadedCaptions = {
  ok: true;
  archiveId: string;
  fileName: string;
  language: CaptionLang;
  cues: Cue[];
};

export type CaptionMiss = {
  ok: false;
  reason: "no-captions" | "bad-archive" | "fetch-failed";
  message: string;
};

export type GenerateProgress = {
  phase: "search" | "translate" | "done";
  done: number;
  total: number;
};

export type GeneratedSubs = {
  filmId: string;
  vtt: string;
  source: "es" | "translated";
  fileName: string;
  cues: number;
  createdAt: number;
};

type ArchiveFile = {
  name?: string;
  format?: string;
  size?: string | number;
};

const SEP = "\n¶\n";
const DB_NAME = "linterna-subs";
const STORE = "vtt";

async function readArchiveText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("fetch-failed");
  const buf = new Uint8Array(await res.arrayBuffer());
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  const bad = (utf8.match(/\uFFFD/g) ?? []).length;
  if (bad > 8) {
    return new TextDecoder("latin1").decode(buf);
  }
  return utf8;
}

export async function loadCaptionsFromArchive(archiveId: string): Promise<LoadedCaptions | CaptionMiss> {
  const id = archiveId.trim();
  if (!id || id.includes("/") || id.includes("\\") || id.includes("://")) {
    return { ok: false, reason: "bad-archive", message: "Identificador de archivo no válido." };
  }
  const metaRes = await fetch(`https://archive.org/metadata/${encodeURIComponent(id)}`);
  if (!metaRes.ok) {
    return { ok: false, reason: "fetch-failed", message: "Internet Archive no respondió." };
  }
  const meta = (await metaRes.json()) as { files?: ArchiveFile[] };
  const picked = pickCaptionFile(meta.files ?? []);
  if (!picked?.name) {
    return {
      ok: false,
      reason: "no-captions",
      message:
        "Esta copia no tiene una pista de subtítulos en el archivo. No inventamos diálogos.",
    };
  }
  const url = archiveFileUrl(id, picked.name);
  try {
    const raw = await readArchiveText(url);
    const cues = parseCaptions(raw, picked.name);
    if (cues.length < 4) {
      return {
        ok: false,
        reason: "no-captions",
        message: "La pista de subtítulos está vacía o es demasiado corta.",
      };
    }
    return {
      ok: true,
      archiveId: id,
      fileName: picked.name,
      language: detectCaptionLanguage(cues),
      cues,
    };
  } catch {
    return { ok: false, reason: "fetch-failed", message: "No se pudo abrir la pista de subtítulos." };
  }
}

export const loadCaptionTrack = createServerFn({ method: "GET" })
  .validator((data: { archiveId: string }) => {
    const archiveId = String(data.archiveId ?? "").trim();
    if (!archiveId || archiveId.includes("/") || archiveId.includes("://")) {
      throw new Error("Archivo no válido");
    }
    return { archiveId };
  })
  .handler(async ({ data }): Promise<LoadedCaptions | CaptionMiss> => {
    return loadCaptionsFromArchive(data.archiveId);
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

async function translateViaXai(texts: string[]): Promise<string[] | null> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey || texts.length === 0) return null;
  const numbered = texts.map((t, i) => `${i + 1}. ${t}`).join("\n");
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "grok-4.5",
      max_tokens: 1800,
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content:
            "Traduce al español de España/Latinoamérica neutro. Devuelve SOLO las mismas líneas numeradas, sin comentarios.",
        },
        { role: "user", content: numbered },
      ],
    }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content ?? "";
  const lines = content
    .split("\n")
    .map((line) => line.replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter(Boolean);
  if (lines.length !== texts.length) return null;
  return lines;
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
    const xai = await translateViaXai(data.texts);
    if (xai) return { texts: xai };
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

export async function generateSpanishVtt(
  archiveId: string,
  onProgress?: (progress: GenerateProgress) => void,
): Promise<{ vtt: string; source: "es" | "translated"; fileName: string; cues: number }> {
  onProgress?.({ phase: "search", done: 0, total: 0 });
  let loaded: LoadedCaptions | CaptionMiss;
  try {
    loaded = await loadCaptionTrack({ data: { archiveId } });
  } catch {
    loaded = await loadCaptionsFromArchive(archiveId);
  }
  if (!loaded.ok) throw new Error(loaded.message);

  if (loaded.language === "es") {
    onProgress?.({ phase: "done", done: loaded.cues.length, total: loaded.cues.length });
    return {
      vtt: cuesToVtt(loaded.cues),
      source: "es",
      fileName: loaded.fileName,
      cues: loaded.cues.length,
    };
  }

  onProgress?.({ phase: "translate", done: 0, total: loaded.cues.length });
  const translated = await translateCues(loaded.cues, (done, total) => {
    onProgress?.({ phase: "translate", done, total });
  });
  onProgress?.({ phase: "done", done: translated.length, total: translated.length });
  return {
    vtt: cuesToVtt(translated),
    source: "translated",
    fileName: loaded.fileName,
    cues: translated.length,
  };
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
      const raw = localStorage.getItem(`linterna-vtt:${filmId}`);
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
      localStorage.setItem(`linterna-vtt:${entry.filmId}`, JSON.stringify(entry));
    } catch {
      /* quota */
    }
  }
}

export function vttToObjectUrl(vtt: string) {
  return URL.createObjectURL(new Blob([vtt], { type: "text/vtt" }));
}
