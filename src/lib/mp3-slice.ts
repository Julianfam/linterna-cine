/** MPEG1 Layer III kbps table (index 0 is invalid). */
const BR_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const BR_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const SR_V1 = [44100, 48000, 32000];
const SR_V2 = [22050, 24000, 16000];

export type Mp3Slice = {
  start: number;
  duration: number;
  bytes: Uint8Array;
};

function id3Size(buf: Uint8Array): number {
  if (buf.length < 10) return 0;
  if (buf[0] !== 0x49 || buf[1] !== 0x44 || buf[2] !== 0x33) return 0;
  return (
    10 +
    ((buf[6] & 0x7f) << 21) +
    ((buf[7] & 0x7f) << 14) +
    ((buf[8] & 0x7f) << 7) +
    (buf[9] & 0x7f)
  );
}

function readFrame(buf: Uint8Array, offset: number) {
  if (offset + 4 > buf.length) return null;
  if (buf[offset] !== 0xff || (buf[offset + 1] & 0xe0) !== 0xe0) return null;
  const versionBits = (buf[offset + 1] >> 3) & 0x03;
  const layerBits = (buf[offset + 1] >> 1) & 0x03;
  if (layerBits !== 0x01) return null;
  const brIndex = (buf[offset + 2] >> 4) & 0x0f;
  const srIndex = (buf[offset + 2] >> 2) & 0x03;
  const padding = (buf[offset + 2] >> 1) & 0x01;
  if (brIndex === 0 || brIndex === 15 || srIndex === 3) return null;
  const mpeg1 = versionBits === 0x03;
  const bitrate = (mpeg1 ? BR_V1_L3[brIndex] : BR_V2_L3[brIndex]) * 1000;
  const sampleRate = mpeg1 ? SR_V1[srIndex] : SR_V2[srIndex];
  if (!bitrate || !sampleRate) return null;
  const samples = mpeg1 ? 1152 : 576;
  const frameLength = Math.floor((samples / 8) * bitrate / sampleRate) + padding;
  if (frameLength < 24 || offset + frameLength > buf.length) return null;
  return { frameLength, duration: samples / sampleRate };
}

export function splitMp3(buf: Uint8Array, sliceSec = 75): Mp3Slice[] {
  const frames: { offset: number; length: number; duration: number }[] = [];
  let i = id3Size(buf);
  while (i < buf.length - 4) {
    const frame = readFrame(buf, i);
    if (!frame) {
      i += 1;
      continue;
    }
    frames.push({ offset: i, length: frame.frameLength, duration: frame.duration });
    i += frame.frameLength;
  }
  if (!frames.length) return [];

  const slices: Mp3Slice[] = [];
  let acc = 0;
  let startTime = 0;
  let from = 0;
  const flush = (to: number) => {
    if (to <= from) return;
    const first = frames[from];
    const last = frames[to - 1];
    slices.push({
      start: startTime,
      duration: acc,
      bytes: buf.subarray(first.offset, last.offset + last.length),
    });
  };
  for (let f = 0; f < frames.length; f += 1) {
    acc += frames[f].duration;
    if (acc >= sliceSec) {
      flush(f + 1);
      startTime += acc;
      acc = 0;
      from = f + 1;
    }
  }
  if (from < frames.length) flush(frames.length);
  return slices;
}

export function mp3Duration(buf: Uint8Array): number {
  return splitMp3(buf, Number.POSITIVE_INFINITY)[0]?.duration ?? 0;
}
