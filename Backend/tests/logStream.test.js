const { createDemuxer, createLineSplitter, createBatcher, parseLine, MAX_LINE_CHARS } = require('../utils/logStream');

const frame = (type, text) => {
  const payload = Buffer.from(text);
  const header = Buffer.alloc(8);
  header[0] = type;
  header.writeUInt32BE(payload.length, 4);
  return Buffer.concat([header, payload]);
};

describe('createDemuxer', () => {
  it('splits stdout and stderr frames, even when chunks cut a frame in half', () => {
    const out = [];
    const err = [];
    const demux = createDemuxer((c) => out.push(c.toString()), (c) => err.push(c.toString()));
    const all = Buffer.concat([frame(1, 'hello\n'), frame(2, 'oops\n'), frame(1, 'wor'), frame(1, 'ld\n')]);
    for (let i = 0; i < all.length; i += 5) demux.push(all.subarray(i, i + 5));
    expect(out).toEqual(['hello\n', 'wor', 'ld\n']);
    expect(err).toEqual(['oops\n']);
  });
});

describe('createLineSplitter', () => {
  it('joins partial chunks into lines and removes CR', () => {
    const lines = [];
    const splitter = createLineSplitter((l) => lines.push(l));
    splitter.push('a\r\nb');
    splitter.push('c\nlast');
    splitter.flush();
    expect(lines).toEqual(['a', 'bc', 'last']);
  });

  it('cuts a runaway line that never ends', () => {
    const lines = [];
    const splitter = createLineSplitter((l) => lines.push(l));
    splitter.push('x'.repeat(MAX_LINE_CHARS * 3));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveLength(MAX_LINE_CHARS);
  });
});

describe('parseLine', () => {
  it('reads the timestamp and strips colour codes', () => {
    expect(parseLine('2026-10-18T05:30:00.123456789Z \u001b[32mhi\u001b[0m')).toEqual({
      ts: '2026-10-18T05:30:00.123456789Z',
      text: 'hi',
    });
  });

  it('cuts very long lines', () => {
    expect(parseLine(`2026-10-18T05:30:00Z ${'y'.repeat(MAX_LINE_CHARS + 50)}`).text.endsWith('(line cut)')).toBe(true);
  });
});

describe('createBatcher', () => {
  it('hands lines over in batches and reports dropped lines', async () => {
    const batches = [];
    const batcher = createBatcher({ onBatch: (b) => batches.push(b), intervalMs: 20, maxPending: 3 });
    for (let i = 0; i < 5; i += 1) batcher.add({ stream: 'stdout', ts: 't', text: `l${i}` });
    await new Promise((r) => setTimeout(r, 60));
    expect(batches).toHaveLength(1);
    expect(batches[0][0].text).toContain('2 log line');
    expect(batches[0].slice(1).map((l) => l.text)).toEqual(['l2', 'l3', 'l4']);
  });
});
