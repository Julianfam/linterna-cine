import { getFilm, type Film, type License } from "@/lib/catalog";

const BLOCK =
  /netflix|yify|yts\.|webrip|hdtv|onlyfans|xxx|porn|brazzers|temporada|dual.?audio|latino.?1080|bluray.?rip|complete.?series/i;

export function filmIdFromArchive(archiveId: string) {
  return `ia-${archiveId}`;
}

export function archiveIdFromFilmId(id: string) {
  return id.startsWith("ia-") ? id.slice(3) : null;
}

type ArchiveDoc = {
  identifier?: string;
  title?: string;
  year?: string | number;
  creator?: string | string[];
  description?: string | string[];
  runtime?: string | number;
  language?: string | string[];
  licenseurl?: string;
  downloads?: number;
};

type ArchiveMeta = {
  metadata?: {
    identifier?: string;
    title?: string;
    year?: string | number;
    date?: string;
    creator?: string | string[];
    director?: string | string[];
    description?: string | string[];
    runtime?: string | number;
    language?: string | string[];
    licenseurl?: string;
    collection?: string | string[];
    subject?: string | string[];
  };
};

function first(v: string | string[] | undefined) {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

function asList(v: string | string[] | undefined) {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function parseYear(v: unknown) {
  const n = Number(String(v ?? "").slice(0, 4));
  return Number.isFinite(n) && n > 1880 && n < 2100 ? n : 0;
}

function parseRuntime(v: unknown) {
  if (typeof v === "number" && v > 0 && v < 500) return Math.round(v);
  const s = String(v ?? "");
  const min = s.match(/(\d+)\s*min/i);
  if (min) return Number(min[1]);
  const clock = s.match(/(\d+):(\d{2})(?::(\d{2}))?/);
  if (clock) {
    const a = Number(clock[1]);
    const b = Number(clock[2]);
    const c = clock[3] ? Number(clock[3]) : 0;
    if (clock[3]) return a * 60 + b;
    return a > 8 ? a : a * 60 + b + (c ? 0 : 0);
  }
  return 0;
}

function licenseOf(url: string): License {
  const u = url.toLowerCase();
  if (u.includes("by-sa")) return "cc-by-sa";
  if (u.includes("creativecommons") || u.includes("cc-by")) return "cc-by";
  return "dominio-publico";
}

function allowed(doc: { title?: string; identifier?: string; year?: number; licenseurl?: string }) {
  const title = doc.title ?? "";
  const id = doc.identifier ?? "";
  if (!id || BLOCK.test(title) || BLOCK.test(id)) return false;
  const year = doc.year ?? 0;
  const cc = /creativecommons|publicdomain/i.test(doc.licenseurl ?? "");
  if (year >= 1978 && !cc) return false;
  if (year > 1965 && year < 1978 && !cc) return false;
  return true;
}

function toFilm(doc: ArchiveDoc): Film | null {
  const archiveId = doc.identifier?.trim();
  if (!archiveId) return null;
  const year = parseYear(doc.year);
  const licenseurl = doc.licenseurl ?? "";
  if (!allowed({ title: doc.title, identifier: archiveId, year, licenseurl })) return null;
  const description = first(doc.description).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const lang = first(doc.language);
  return {
    id: filmIdFromArchive(archiveId),
    archiveId,
    title: (doc.title ?? archiveId).replace(/\s+/g, " ").trim().slice(0, 90),
    year: year || 1920,
    runtime: parseRuntime(doc.runtime),
    director: first(doc.creator) || "Anónimo",
    country: "Archivo",
    language: /spa|esl|castellano|español/i.test(lang) ? "Español" : lang || "Original",
    genres: ["archivo"],
    synopsis:
      description.slice(0, 360) ||
      "Copia libre alojada en Internet Archive. Dominio público o Creative Commons; la añadimos a tu sala para verla aquí.",
    license: licenseOf(licenseurl),
    quality: "SD",
  };
}

function buildQuery(user: string) {
  const raw = user.replace(/[()[\]{}]/g, " ").trim();
  const legal =
    '(collection:(feature_films) OR licenseurl:(*creativecommons* OR *publicdomain*) OR subject:("public domain" OR "dominio publico" OR "dominio público"))';
  const playable = 'mediatype:movies AND (format:MPEG4 OR format:"h.264" OR format:512Kb MPEG4)';
  const era = "(year:[1890 TO 1965] OR licenseurl:(*creativecommons*))";
  if (!raw) {
    return `${legal} AND ${playable} AND ${era} AND collection:(feature_films)`;
  }
  if (raw.startsWith("raw:")) return `${legal} AND ${playable} AND ${era} AND (${raw.slice(4)})`;
  return `${legal} AND ${playable} AND ${era} AND (title:(${raw}) OR creator:(${raw}))`;
}

export const ARCHIVE_HINTS = [
  { label: "Chaplin", q: "chaplin" },
  { label: "Keaton", q: "keaton" },
  { label: "Méliès", q: "melies" },
  { label: "Murnau", q: "murnau" },
  { label: "Western", q: "raw:subject:western AND year:[1915 TO 1952]" },
  { label: "Blender", q: "raw:creator:blender" },
  { label: "1927", q: "1927" },
  { label: "Español", q: "raw:language:(spa OR spanish OR español)" },
] as const;

export async function searchArchive(query: string): Promise<Film[]> {
  const params = new URLSearchParams({
    q: buildQuery(query),
    rows: "24",
    page: "1",
    output: "json",
  });
  params.append("fl[]", "identifier");
  params.append("fl[]", "title");
  params.append("fl[]", "year");
  params.append("fl[]", "creator");
  params.append("fl[]", "description");
  params.append("fl[]", "runtime");
  params.append("fl[]", "language");
  params.append("fl[]", "licenseurl");
  params.append("sort[]", "downloads desc");

  const res = await fetch(`https://archive.org/advancedsearch.php?${params.toString()}`);
  if (!res.ok) throw new Error("El archivo no respondió. Prueba de nuevo en un momento.");
  const json = (await res.json()) as { response?: { docs?: ArchiveDoc[] } };
  const seen = new Set<string>();
  const films: Film[] = [];
  for (const doc of json.response?.docs ?? []) {
    const film = toFilm(doc);
    if (!film || seen.has(film.archiveId) || getFilm(film.id)) continue;
    seen.add(film.archiveId);
    films.push(film);
  }
  return films;
}

export async function filmFromArchive(archiveId: string): Promise<Film | null> {
  const res = await fetch(`https://archive.org/metadata/${encodeURIComponent(archiveId)}`);
  if (!res.ok) return null;
  const json = (await res.json()) as ArchiveMeta;
  const meta = json.metadata;
  if (!meta?.identifier && !archiveId) return null;
  const year = parseYear(meta?.year) || parseYear(meta?.date);
  const licenseurl = meta?.licenseurl ?? "";
  const title = meta?.title ?? archiveId;
  if (!allowed({ title, identifier: archiveId, year, licenseurl })) return null;
  const description = first(meta?.description).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const subjects = asList(meta?.subject).join(" ").toLowerCase();
  const lang = first(meta?.language);
  return {
    id: filmIdFromArchive(archiveId),
    archiveId,
    title: title.replace(/\s+/g, " ").trim().slice(0, 90),
    year: year || 1920,
    runtime: parseRuntime(meta?.runtime),
    director: first(meta?.director) || first(meta?.creator) || "Anónimo",
    country: "Archivo",
    language: /spa|esl|castellano|español/i.test(lang) ? "Español" : lang || "Original",
    genres: subjects.includes("horror") || subjects.includes("terror")
      ? ["archivo", "terror"]
      : subjects.includes("comedy") || subjects.includes("comedia")
        ? ["archivo", "comedia"]
        : ["archivo"],
    synopsis:
      description.slice(0, 420) ||
      "Copia libre de Internet Archive. La sala solo admite dominio público o Creative Commons.",
    license: licenseOf(licenseurl),
    quality: "SD",
  };
}

export async function resolveFilm(slug: string): Promise<Film | undefined> {
  const local = getFilm(slug);
  if (local) return local;
  const archiveId = archiveIdFromFilmId(slug);
  if (!archiveId) return undefined;
  return (await filmFromArchive(archiveId)) ?? undefined;
}
