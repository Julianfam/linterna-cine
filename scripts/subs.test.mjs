import assert from "node:assert/strict";
import test from "node:test";
import {
  parseSrt,
  cuesToVtt,
  detectCaptionLanguage,
  parseTimestamp,
  scoreCaptionFile,
} from "../src/lib/subs-parse.ts";

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
