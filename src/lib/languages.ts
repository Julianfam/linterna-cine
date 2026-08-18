import { FILMS, type Film } from "@/lib/catalog";

export type CaptionMode = "es-vtt" | "es-burned" | "none";
export type AudioLang = "es" | "en" | "silent" | "none";

export type LangInfo = {
  audio: AudioLang;
  captions: CaptionMode;
  subUrl?: string;
  esArchiveId?: string;
};

const LANG: Record<string, LangInfo> = {
  sintel: { audio: "en", captions: "es-vtt", subUrl: "/subs/sintel.es.vtt" },
  "tears-of-steel": {
    audio: "en",
    captions: "es-vtt",
    subUrl: "/subs/tears-of-steel.es.vtt",
  },
  nosferatu: { audio: "silent", captions: "es-vtt", subUrl: "/subs/nosferatu.es.vtt" },
  "night-of-the-living-dead": {
    audio: "en",
    captions: "es-burned",
    esArchiveId: "NightOfTheLivingDeadwithSpanishSubtitles_595",
  },
  "cabinet-caligari": {
    audio: "silent",
    captions: "es-burned",
    esArchiveId: "NightOfTheLivingDeadwithSpanishSubtitles",
  },
  "little-shop-of-horrors": {
    audio: "en",
    captions: "es-burned",
    esArchiveId: "TheLittleShopOfHorrorswithSpanishSubtitles",
  },
  "most-dangerous-game": {
    audio: "en",
    captions: "es-burned",
    esArchiveId: "TheMostDangerousGamewithSpanishSubtitles",
  },
  haxan: {
    audio: "silent",
    captions: "es-burned",
    esArchiveId: "HaxanwithSpanishSubtitles",
  },
  "big-buck-bunny": { audio: "none", captions: "none" },
  "man-with-a-movie-camera": { audio: "silent", captions: "none" },
  "elephants-dream": { audio: "en", captions: "none" },
};

export function langInfo(film: Film): LangInfo {
  return (
    LANG[film.id] ?? {
      audio: film.language === "Mudo" ? "silent" : film.language === "Inglés" ? "en" : "en",
      captions: "none",
    }
  );
}

export function hasSpanish(film: Film) {
  const info = langInfo(film);
  return info.captions !== "none" || info.audio === "es";
}

export function playArchiveId(film: Film, pista: "es" | "original" = "es") {
  const info = langInfo(film);
  if (pista === "es" && info.esArchiveId) return info.esArchiveId;
  return film.archiveId;
}

export function spanishLabel(film: Film) {
  const info = langInfo(film);
  if (info.audio === "es") return "Audio ES";
  if (info.captions === "es-vtt") return "Sub ES";
  if (info.captions === "es-burned") return "Sub ES";
  if (info.audio === "silent" || info.audio === "none") return null;
  return null;
}

export function spanishFilms() {
  return FILMS.filter(hasSpanish);
}
