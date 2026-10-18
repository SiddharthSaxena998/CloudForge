/**
 * Pure helpers for reading a container's output (no Docker, no sockets: easy to test).
 *
 *  createDemuxer   splits Docker's multiplexed log stream (8-byte frame headers) into stdout / stderr
 *  createLineSplitter  turns arbitrary text chunks into complete lines
 *  createBatcher   collects lines and hands them over every few hundred ms (stops a chatty app from
 *                  flooding the browser)
 *  parseLine       "2026-10-18T05:30:00.123456789Z hello" -> { ts, text }
 */

const MAX_LINE_CHARS = 4000;

/** Docker frame: [type, 0, 0, 0, size(4 bytes, big endian)] + payload. type 1 = stdout, 2 = stderr. */
function createDemuxer(onStdout, onStderr) {
  let pending = Buffer.alloc(0);

  return {
    push(chunk) {
      pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
      while (pending.length >= 8) {
        const size = pending.readUInt32BE(4);
        if (pending.length < 8 + size) break; // wait for the rest of this frame
        const payload = pending.subarray(8, 8 + size);
        if (pending[0] === 2) onStderr(payload);
        else onStdout(payload); // 0 (stdin echo) and 1 are shown as normal output
        pending = pending.subarray(8 + size);
      }
    },
  };
}

function createLineSplitter(emit) {
  let rest = '';

  return {
    push(chunk) {
      rest += chunk.toString('utf8');
      const parts = rest.split('\n');
      rest = parts.pop();
      for (const line of parts) emit(line.replace(/\r$/, ''));
      if (rest.length > MAX_LINE_CHARS * 2) {
        // a line without newline that keeps growing: cut it instead of buffering forever
        emit(rest.slice(0, MAX_LINE_CHARS));
        rest = '';
      }
    },
    flush() {
      if (rest) emit(rest.replace(/\r$/, ''));
      rest = '';
    },
  };
}

const TS_RE = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z) ?(.*)$/s;

function parseLine(raw) {
  const m = TS_RE.exec(raw);
  const ts = m ? m[1] : new Date().toISOString();
  let text = m ? m[2] : raw;
  // strip terminal colour codes so the browser does not show "[32m" noise
  text = text.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '');
  if (text.length > MAX_LINE_CHARS) text = `${text.slice(0, MAX_LINE_CHARS)}… (line cut)`;
  return { ts, text };
}

function createBatcher({ onBatch, intervalMs = 150, maxPending = 2000 }) {
  let pending = [];
  let dropped = 0;
  let timer = null;

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (dropped) {
      pending.unshift({
        ts: new Date().toISOString(),
        stream: 'stderr',
        text: `[CloudForge] ${dropped} log line(s) skipped because the app writes too fast`,
      });
      dropped = 0;
    }
    if (!pending.length) return;
    const batch = pending;
    pending = [];
    onBatch(batch);
  };

  return {
    add(line) {
      if (pending.length >= maxPending) {
        pending.shift();
        dropped += 1;
      }
      pending.push(line);
      if (!timer) timer = setTimeout(flush, intervalMs);
    },
    flush,
    stop() {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = [];
    },
  };
}

module.exports = { createDemuxer, createLineSplitter, createBatcher, parseLine, MAX_LINE_CHARS };
