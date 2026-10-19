'use strict';

const { EventEmitter } = require('node:events');
const { OPCODE, FrameDecoder, FrameError, encodeFrame, encodeClose } = require('./FrameCodec');

const MAX_BUFFERED_BYTES = 1024 * 1024;
const utf8 = new TextDecoder('utf-8', { fatal: true });

/**
 * Одно WebSocket-соединение поверх уже «апгрейднутого» TCP-сокета.
 * События: 'message'(text), 'pong'(payload), 'close'(code, reason).
 * 
 * слушает socket.on('data'), отвечает на ping, обрабатывает закрывающее рукопожатие (close-кадр с кодом), отправляет текст
 */
class WebSocketConnection extends EventEmitter {
  #socket;
  #decoder;
  #closeSent = false;
  #closed = false;
  #closeTimer = null;

  constructor(socket, { maxPayload }) {
    super();
    this.#socket = socket;
    this.#decoder = new FrameDecoder(maxPayload);
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 30_000);
    socket.on('data', (chunk) => this.feed(chunk));
    socket.on('error', () => socket.destroy());
    socket.on('close', () => this.#finalize(1006, 'connection lost'));
  }

  get isOpen() { return !this.#closed && !this.#closeSent; }

  /** Принимает сырые байты от сокета (и «хвост» рукопожатия). */
  feed(chunk) {
    if (this.#closed) return;
    let frames;
    try {
      frames = this.#decoder.push(chunk);
    } catch (err) {
      this.close(err instanceof FrameError ? err.closeCode : 1002, err.message);
      return;
    }
    for (const frame of frames) {
      if (this.#closed) return;
      this.#onFrame(frame);
    }
  }

  sendText(text) {
    if (!this.isOpen) return false;
    if (this.#socket.writableLength > MAX_BUFFERED_BYTES) {
      this.close(1013, 'slow consumer');
      return false;
    }
    this.#socket.write(encodeFrame(OPCODE.TEXT, Buffer.from(text, 'utf8')));
    return true;
  }

  ping() {
    if (this.isOpen) this.#socket.write(encodeFrame(OPCODE.PING));
  }

  /** Инициирует закрывающее рукопожатие; через 1 с сокет принудительно уничтожается. */
  close(code = 1000, reason = '') {
    if (this.#closed || this.#closeSent) return;
    this.#closeSent = true;
    this.#socket.end(encodeClose(code, reason));
    this.#closeTimer = setTimeout(() => this.#socket.destroy(), 1000);
    this.#closeTimer.unref?.();
  }

  #onFrame({ opcode, payload }) {
    if (this.#closeSent && opcode !== OPCODE.CLOSE) return;
    switch (opcode) {
      case OPCODE.TEXT: {
        let text;
        try {
          text = utf8.decode(payload);
        } catch {
          this.close(1007, 'invalid utf-8');
          return;
        }
        this.emit('message', text);
        return;
      }
      case OPCODE.BINARY:
        this.close(1003, 'binary frames are not supported');
        return;
      case OPCODE.PING:
        this.#socket.write(encodeFrame(OPCODE.PONG, payload));
        return;
      case OPCODE.PONG:
        this.emit('pong', payload);
        return;
      case OPCODE.CLOSE: {
        const code = payload.length >= 2 ? payload.readUInt16BE(0) : 1005;
        const reason = payload.length > 2 ? payload.subarray(2).toString('utf8') : '';
        if (!this.#closeSent) {
          this.#closeSent = true;
          this.#socket.end(encodeClose(code === 1005 ? 1000 : code));
        }
        this.#finalize(code, reason);
        return;
      }
      default:
    }
  }

  #finalize(code, reason) {
    if (this.#closed) return;
    this.#closed = true;
    clearTimeout(this.#closeTimer);
    this.emit('close', code, reason);
  }
}

module.exports = { WebSocketConnection };
