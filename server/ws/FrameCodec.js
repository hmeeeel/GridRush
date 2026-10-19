'use strict';

const OPCODE = Object.freeze({ CONTINUATION: 0x0, TEXT: 0x1, BINARY: 0x2, CLOSE: 0x8, PING: 0x9, PONG: 0xa });

/** Нарушение протокола WebSocket; closeCode - код для кадра CLOSE. */
class FrameError extends Error {
  constructor(closeCode, message) {
    super(message);
    this.closeCode = closeCode;
  }
}

/**
 * Инкрементальный декодер клиентских кадров RFC 6455.
 * Ничего не знает про сокеты и JSON: на вход байты, на выход готовые сообщения.
 */
class FrameDecoder {
  #buffer = Buffer.alloc(0);
  #fragments = [];
  #fragmentOpcode = 0;
  #fragmentBytes = 0;
  #maxPayload;

  constructor(maxPayload) {
    this.#maxPayload = maxPayload;
  }

  /** @returns {{opcode:number, payload:Buffer}[]} завершённые сообщения и управляющие кадры */
  push(chunk) {
    this.#buffer = this.#buffer.length ? Buffer.concat([this.#buffer, chunk]) : chunk;
    const out = [];
    for (;;) {
      const frame = this.#readFrame();
      if (!frame) break;
      this.#assemble(frame, out);
    }
    return out;
  }

  #readFrame() {
    const buf = this.#buffer;
    if (buf.length < 2) return null;
    const fin = (buf[0] & 0x80) !== 0;
    if (buf[0] & 0x70) throw new FrameError(1002, 'RSV bits must be 0');
    const opcode = buf[0] & 0x0f;
    if ((buf[1] & 0x80) === 0) throw new FrameError(1002, 'client frames must be masked');

    let length = buf[1] & 0x7f;
    let offset = 2;
    if (length === 126) {
      if (buf.length < 4) return null;
      length = buf.readUInt16BE(2);
      offset = 4;
    } else if (length === 127) {
      if (buf.length < 10) return null;
      if (buf.readUInt32BE(2) !== 0) throw new FrameError(1009, 'frame too large');
      length = buf.readUInt32BE(6);
      offset = 10;
    }
    if (length > this.#maxPayload) throw new FrameError(1009, 'frame too large');
    if (buf.length < offset + 4 + length) return null;

    const mask = buf.subarray(offset, offset + 4);
    const payload = Buffer.from(buf.subarray(offset + 4, offset + 4 + length));

    //Клиентские кадры всегда маскированы
    for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
    this.#buffer = buf.subarray(offset + 4 + length);
    return { fin, opcode, payload };
  }

  #assemble({ fin, opcode, payload }, out) {
    if (opcode >= OPCODE.CLOSE) {
      if (!fin || payload.length > 125) throw new FrameError(1002, 'invalid control frame');
      if (opcode > OPCODE.PONG) throw new FrameError(1002, 'unknown opcode');
      out.push({ opcode, payload });
      return;
    }
    if (opcode === OPCODE.CONTINUATION) {
      if (!this.#fragmentOpcode) throw new FrameError(1002, 'unexpected continuation');
      this.#fragmentBytes += payload.length;
      if (this.#fragmentBytes > this.#maxPayload) throw new FrameError(1009, 'message too large');
      this.#fragments.push(payload);
      if (fin) {
        out.push({ opcode: this.#fragmentOpcode, payload: Buffer.concat(this.#fragments) });
        this.#resetFragments();
      }
      return;
    }
    if (opcode !== OPCODE.TEXT && opcode !== OPCODE.BINARY) throw new FrameError(1002, 'unknown opcode');
    if (this.#fragmentOpcode) throw new FrameError(1002, 'expected continuation');
    if (fin) {
      out.push({ opcode, payload });
    } else {
      this.#fragmentOpcode = opcode;
      this.#fragments = [payload];
      this.#fragmentBytes = payload.length;
    }
  }

  #resetFragments() {
    this.#fragments = [];
    this.#fragmentOpcode = 0;
    this.#fragmentBytes = 0;
  }
}

/** Кодирует серверный (немаскированный) кадр. */
function encodeFrame(opcode, payload = Buffer.alloc(0)) {
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeUInt32BE(len, 6);
  }
  header[0] = 0x80 | opcode;
  return Buffer.concat([header, payload]);
}

function encodeClose(code, reason = '') {
  const reasonBytes = Buffer.from(reason, 'utf8').subarray(0, 123);
  const payload = Buffer.alloc(2 + reasonBytes.length);
  payload.writeUInt16BE(code, 0);
  reasonBytes.copy(payload, 2);
  return encodeFrame(OPCODE.CLOSE, payload);
}

module.exports = { OPCODE, FrameError, FrameDecoder, encodeFrame, encodeClose };
