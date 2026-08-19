import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { type Film } from "@/lib/catalog";
import { useLibrary } from "@/lib/library";
import {
  generateSpanishVtt,
  readCachedVtt,
  vttToObjectUrl,
  writeCachedVtt,
  type GenerateProgress,
} from "@/lib/subs";

export function useGeneratedCaptions(film: Film, enabled: boolean) {
  const markGenerated = useLibrary((s) => s.markGenerated);
  const known = useLibrary((s) => Boolean(s.generatedSubs[film.id]));
  const [url, setUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState<GenerateProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const blobRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void readCachedVtt(film.id).then((cached) => {
      if (!live || !cached?.vtt) return;
      if (blobRef.current) URL.revokeObjectURL(blobRef.current);
      const next = vttToObjectUrl(cached.vtt);
      blobRef.current = next;
      setUrl(next);
      markGenerated(film.id);
    });
    return () => {
      live = false;
    };
  }, [enabled, film.id, markGenerated]);

  useEffect(() => {
    return () => {
      if (blobRef.current) URL.revokeObjectURL(blobRef.current);
    };
  }, []);

  const generate = async () => {
    if (!enabled || progress) return;
    setError(null);
    setProgress({ phase: "audio", done: 0, total: 0 });
    try {
      const result = await generateSpanishVtt(
        { archiveId: film.archiveId, filmId: film.id, runtime: film.runtime },
        setProgress,
      );
      await writeCachedVtt({
        filmId: film.id,
        vtt: result.vtt,
        source: "audio",
        fileName: result.fileName,
        cues: result.cues,
        createdAt: Date.now(),
      });
      if (blobRef.current) URL.revokeObjectURL(blobRef.current);
      const next = vttToObjectUrl(result.vtt);
      blobRef.current = next;
      setUrl(next);
      markGenerated(film.id);
      toast(`Subtítulos generados desde el audio · ${result.cues} líneas`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "No se pudieron generar los subtítulos.";
      setError(message);
      toast(message);
    } finally {
      setProgress(null);
    }
  };

  return {
    url,
    progress,
    error,
    generate,
    busy: Boolean(progress),
    ready: Boolean(url),
    known,
  };
}
