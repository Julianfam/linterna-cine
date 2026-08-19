export type BufferRange = { start: number; end: number };

export function readBufferRanges(buffered: {
  length: number;
  start: (index: number) => number;
  end: (index: number) => number;
}): BufferRange[] {
  const ranges: BufferRange[] = [];
  for (let i = 0; i < buffered.length; i += 1) {
    const start = buffered.start(i);
    const end = buffered.end(i);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      ranges.push({ start, end });
    }
  }
  return ranges;
}

export function bufferAhead(ranges: BufferRange[], time: number): number {
  for (const range of ranges) {
    if (time >= range.start - 0.2 && time <= range.end) return Math.max(0, range.end - time);
  }
  return 0;
}

export const BUFFER_STALL = 1.3;
export const BUFFER_RESUME = 7;
export const BUFFER_COMFORT = 14;
