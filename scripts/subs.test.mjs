import assert from "node:assert/strict";
import test from "node:test";
import {
  parseSrt,
  cuesToVtt,
  detectCaptionLanguage,
  parseTimestamp,
  scoreCaptionFile,
  scoreAudioFile,
  wordsToCues,
} from "../src/lib/subs-parse.ts";
import { splitMp3, audioByteRange } from "../src/lib/mp3-slice.ts";
import { bufferAhead } from "../src/lib/buffer.ts";
import { readFile } from "node:fs/promises";

test("parsea tiempos de Archive con centésimas", () => {
  assert.equal(parseTimestamp("00:01:01,95"), 61.95);
  assert.equal(parseTimestamp("00:00:12.807"), 12.807);
});

test("srt a vtt conserva el texto", () => {
  const cues = parseSrt(`1
00:00:01,00 --> 00:00:03,50
Hello there

2
00:00:04,000 --> 00:00:06,200
Second line`);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].start, 1);
  assert.equal(cues[0].end, 3.5);
  assert.equal(cues[1].text, "Second line");
  const vtt = cuesToVtt(cues);
  assert.match(vtt, /^WEBVTT/);
  assert.match(vtt, /00:00:01\.000 --> 00:00:03\.500/);
});

test("detecta idioma", () => {
  const es = detectCaptionLanguage([
    { start: 0, end: 1, text: "¿Qué está pasando aquí, señor?" },
    { start: 1, end: 2, text: "También hay una señora después." },
    { start: 2, end: 3, text: "Porque usted no está solo." },
  ]);
  const en = detectCaptionLanguage([
    { start: 0, end: 1, text: "What are you doing here with him?" },
    { start: 1, end: 2, text: "I have not seen that from you." },
    { start: 2, end: 3, text: "This was the last of them." },
  ]);
  assert.equal(es, "es");
  assert.equal(en, "en");
});

test("prioriza pistas en español sobre ASR", () => {
  const picked = [
    { name: "movie.asr.srt", format: "SubRip", size: 80000 },
    { name: "movie.spanish.srt", format: "SubRip", size: 22000 },
    { name: "movie.GERMAN.srt", format: "SubRip", size: 21000 },
  ].sort((a, b) => scoreCaptionFile(b) - scoreCaptionFile(a))[0];
  assert.equal(picked.name, "movie.spanish.srt");
});

test("agrupa palabras del audio en cues", () => {
  const cues = wordsToCues([
    { text: "We", start: 1, end: 1.1 },
    { text: "have", start: 1.15, end: 1.4 },
    { text: "to", start: 1.45, end: 1.55 },
    { text: "go.", start: 1.6, end: 1.9 },
    { text: "Now", start: 4.2, end: 4.5 },
    { text: "what?", start: 4.55, end: 4.9 },
  ]);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].text, "We have to go.");
  assert.equal(cues[1].text, "Now what?");
});

test("elige mp3 estéreo 64kb frente a stems 5.1", () => {
  const stereo = { name: "film_64kb.mp3", format: "64Kbps MP3", size: 5_000_000 };
  const lfe = { name: "film-LFE.mp3", format: "VBR MP3", size: 2_000_000 };
  const mp4 = { name: "film_512kb.mp4", format: "512Kb MPEG4", size: 40_000_000 };
  assert.ok(scoreAudioFile(stereo) > scoreAudioFile(mp4));
  assert.ok(scoreAudioFile(lfe) < 0);
});

test("calcula rangos de bytes para tramos de audio", () => {
  const first = audioByteRange(8_000_000, 1000, 0, 45);
  assert.equal(first.from, 0);
  assert.ok(first.to > 350_000 && first.to < 400_000);
  assert.equal(first.startTime, 0);
  const second = audioByteRange(8_000_000, 1000, 1, 45);
  assert.ok(second.from >= first.to - 5000);
  assert.ok(second.startTime > 40 && second.startTime < 50);
});

test("parte un mp3 en tramos", async () => {
  const path = "/tmp/stt-test/ed64.mp3";
  try {
    await readFile(path);
  } catch {
    return;
  }
  const buf = new Uint8Array(await readFile(path));
  const slices = splitMp3(buf, 75);
  assert.ok(slices.length >= 8);
  const total = slices.reduce((s, x) => s + x.duration, 0);
  assert.ok(total > 600 && total < 800);
  assert.ok(slices[0].bytes.byteLength > 1000);
});

test("calcula segundos de buffer por delante", () => {
  const ranges = [
    { start: 0, end: 12 },
    { start: 40, end: 55 },
  ];
  assert.equal(bufferAhead(ranges, 3), 9);
  assert.equal(bufferAhead(ranges, 42), 13);
  assert.equal(bufferAhead(ranges, 20), 0);
});
