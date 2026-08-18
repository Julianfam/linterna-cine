import { createServerFn } from "@tanstack/react-start";

export type StreamInfo = {
  archiveId: string;
  url: string;
  fallbackUrl?: string;
  fileName: string;
  width?: number;
  height?: number;
  format?: string;
  embedUrl: string;
};

type ArchiveFile = {
  name?: string;
  format?: string;
  size?: string | number;
  width?: string | number;
  height?: string | number;
};

type ArchiveMeta = {
  files?: ArchiveFile[];
};

const WIKI = "https://upload.wikimedia.org/wikipedia/commons";

/** 480p en la CDN de Wikimedia: arranca en décimas de segundo. */
const WIKI_STREAMS: Record<string, string> = {
  "night-of-the-living-dead":
    `${WIKI}/transcoded/b/bb/Night_of_the_Living_Dead_%281968_film%29.webm/Night_of_the_Living_Dead_%281968_film%29.webm.480p.vp9.webm`,
  nosferatu:
    `${WIKI}/transcoded/7/78/Nosferatu_%281922%29.webm/Nosferatu_%281922%29.webm.480p.vp9.webm`,
  "cabinet-caligari":
    `${WIKI}/transcoded/8/88/The_Cabinet_of_Dr._Caligari_%281920%29.webm/The_Cabinet_of_Dr._Caligari_%281920%29.webm.480p.vp9.webm`,
  "his-girl-friday":
    `${WIKI}/transcoded/f/fb/His_Girl_Friday_%281940%29.webm/His_Girl_Friday_%281940%29.webm.480p.vp9.webm`,
  "carnival-of-souls":
    `${WIKI}/transcoded/6/69/Carnival_of_Souls_%281962%29_by_Herk_Harvey.webm/Carnival_of_Souls_%281962%29_by_Herk_Harvey.webm.480p.vp9.webm`,
  sintel: `${WIKI}/transcoded/f/f1/Sintel_movie_4K.webm/Sintel_movie_4K.webm.480p.vp9.webm`,
  "tears-of-steel":
    `${WIKI}/transcoded/c/cb/Tears_of_Steel_1080p.webm/Tears_of_Steel_1080p.webm.480p.vp9.webm`,
  "big-buck-bunny":
    `${WIKI}/transcoded/c/c0/Big_Buck_Bunny_4K.webm/Big_Buck_Bunny_4K.webm.480p.vp9.webm`,
  "elephants-dream":
    `${WIKI}/transcoded/d/d5/Elephants_Dream.ogv/Elephants_Dream.ogv.240p.vp9.webm`,
};

/** Copias ligeras de Archive.org, por si Wikimedia no cubre el título. */
const FAST_FILES: Record<string, { file: string; fallback?: string }> = {
  Sintel: {
    file: "sintel-2048-stereo_512kb.mp4",
    fallback: "sintel-2048-surround_512kb.mp4",
  },
  "Tears-of-Steel": {
    file: "tears_of_steel_720p.mp4",
    fallback: "tears_of_steel_1080p.mp4",
  },
  ElephantsDream: { file: "ed_1024_512kb.mp4", fallback: "ed_hd.mp4" },
  BigBuckBunny_124: { file: "Content/big_buck_bunny_720p_surround.mp4" },
  "Night.Of.The.Living.Dead_1080p": {
    file: "NightOfTheLivingDead_1080p_512kb.mp4",
    fallback: "NightOfTheLivingDead_DVD5_512kb.mp4",
  },
  NightOfTheLivingDeadwithSpanishSubtitles_595: {
    file: "NightOfTheLivingDead_SpanishSubs_512kb.mp4",
  },
  NightOfTheLivingDeadwithSpanishSubtitles: {
    file: "TheCabinetOfDrCaligari_SpanishSubs_512kb.mp4",
  },
  TheLittleShopOfHorrorswithSpanishSubtitles: {
    file: "The_Little_Shop_of_Horrors_512kb_sub.mp4",
    fallback: "The_Little_Shop_of_Horrors_512kb_sub_512kb.mp4",
  },
  TheMostDangerousGamewithSpanishSubtitles: {
    file: "The_Most_Dangerous_Game_With_Spanish_Subtitles_512kb.mp4",
  },
  HaxanwithSpanishSubtitles: { file: "Haxan_SpanishSubs_512kb.mp4" },
  his_girl_friday: {
    file: "his_girl_friday_512kb.mp4",
    fallback: "his_girl_friday.mp4",
  },
  CarnivalofSouls: {
    file: "CarnivalOfSouls_512kb.mp4",
    fallback: "CarnivalOfSouls.mp4",
  },
};

const memory = new Map<string, StreamInfo>();

function num(v: string | number | undefined) {
  if (v === undefined || v === null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function archiveFileUrl(archiveId: string, name: string) {
  const path = name
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `https://archive.org/download/${encodeURIComponent(archiveId)}/${path}`;
}

function embedUrl(archiveId: string) {
  return `https://archive.org/embed/${encodeURIComponent(archiveId)}?autoplay=1`;
}

export function knownArchiveStream(archiveId: string): StreamInfo | null {
  const known = FAST_FILES[archiveId];
  if (!known) return null;
  return {
    archiveId,
    url: archiveFileUrl(archiveId, known.file),
    fallbackUrl: known.fallback ? archiveFileUrl(archiveId, known.fallback) : undefined,
    fileName: known.file,
    embedUrl: embedUrl(archiveId),
  };
}

export function instantStream(filmId: string, archiveId: string): StreamInfo | null {
  const wiki = WIKI_STREAMS[filmId];
  if (wiki) {
    const ia = knownArchiveStream(archiveId);
    return {
      archiveId,
      url: wiki,
      fallbackUrl: ia?.url,
      fileName: wiki.split("/").pop() ?? "stream.webm",
      format: "webm",
      embedUrl: embedUrl(archiveId),
    };
  }
  return knownArchiveStream(archiveId);
}

function scoreFile(file: ArchiveFile) {
  const name = (file.name ?? "").toLowerCase();
  const format = (file.format ?? "").toLowerCase();
  const isMp4 =
    name.endsWith(".mp4") || format.includes("mpeg4") || format.includes("h.264");
  if (!isMp4) return -1;
  if (name.includes(".thumbs/") || name.includes("__ia_thumb")) return -1;
  if (name.endsWith(".ia.mp4")) return 1;

  const longSide = Math.max(num(file.height), num(file.width));
  const size = num(file.size);
  let score = 8;

  if (name.includes("512kb")) score += 48;
  if (format.includes("h.264")) score += 8;

  if (size >= 25_000_000 && size <= 140_000_000) score += 46;
  else if (size > 140_000_000 && size <= 280_000_000) score += 22;
  else if (size > 280_000_000 && size <= 450_000_000) score += 10;
  else if (size > 700_000_000) score -= 55;
  else if (size > 500_000_000) score -= 28;
  if (size > 0 && size < 18_000_000 && longSide < 360) score -= 16;

  if (longSide >= 360 && longSide <= 720) score += 14;
  else if (longSide >= 240 && longSide < 360) score += 6;
  else if (longSide >= 1080 && size > 220_000_000) score -= 24;

  if (name.includes("720") && size < 200_000_000) score += 8;
  return score;
}

export function pickFromMetadata(archiveId: string, files: ArchiveFile[]): StreamInfo | null {
  const ranked = files
    .map((file) => ({ file, score: scoreFile(file) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.file);
  const best = ranked[0];
  if (!best?.name) return null;
  const fallback = ranked.find(
    (f) => f.name && f.name !== best.name && num(f.size) > 0 && num(f.size) < num(best.size),
  );
  return {
    archiveId,
    url: archiveFileUrl(archiveId, best.name),
    fallbackUrl: fallback?.name ? archiveFileUrl(archiveId, fallback.name) : undefined,
    fileName: best.name,
    width: num(best.width) || undefined,
    height: num(best.height) || undefined,
    format: best.format,
    embedUrl: embedUrl(archiveId),
  };
}

function cacheKey(filmId: string, archiveId: string) {
  return `${filmId}::${archiveId}`;
}

function cacheGet(key: string): StreamInfo | null {
  const mem = memory.get(key);
  if (mem) return mem;
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(`linterna-stream:${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StreamInfo;
    if (parsed?.url) {
      memory.set(key, parsed);
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function cacheSet(key: string, info: StreamInfo) {
  memory.set(key, info);
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(`linterna-stream:${key}`, JSON.stringify(info));
  } catch {
    /* ignore */
  }
}

export async function resolveStreamClient(
  archiveId: string,
  filmId = "",
): Promise<StreamInfo> {
  const key = cacheKey(filmId, archiveId);
  const cached = cacheGet(key);
  if (cached) return cached;

  const instant = instantStream(filmId, archiveId);
  if (instant) {
    cacheSet(key, instant);
    return instant;
  }

  const res = await fetch(`https://archive.org/metadata/${encodeURIComponent(archiveId)}`);
  if (!res.ok) throw new Error("Internet Archive no respondió. Inténtalo de nuevo.");
  const json = (await res.json()) as ArchiveMeta;
  const picked = pickFromMetadata(archiveId, json.files ?? []);
  if (!picked) throw new Error("No hay un archivo de vídeo reproducible para este título.");
  cacheSet(key, picked);
  return picked;
}

export function prefetchStream(archiveId: string, filmId = "") {
  if (instantStream(filmId, archiveId) || cacheGet(cacheKey(filmId, archiveId))) return;
  void resolveStreamClient(archiveId, filmId).catch(() => undefined);
}

export const resolveStream = createServerFn({ method: "GET" })
  .validator((data: { archiveId: string; filmId?: string }) => {
    const archiveId = data.archiveId.trim();
    if (!archiveId) throw new Error("Archivo no válido");
    return { archiveId, filmId: data.filmId?.trim() ?? "" };
  })
  .handler(async ({ data }): Promise<StreamInfo> => {
    return resolveStreamClient(data.archiveId, data.filmId);
  });
