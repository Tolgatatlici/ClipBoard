import WebSocket from 'ws';
import type { z } from 'zod';

export interface TestSocket<T extends { type: string }> {
  socket: WebSocket;
  /** Belirtilen türde (ya da herhangi) bir sonraki mesajı bekler. */
  next(type?: T['type']): Promise<T>;
  send(message: unknown): void;
  closed: Promise<number>;
}

/** Test için WebSocket istemcisi: gelen mesajları şemayla doğrular ve sıraya koyar. */
export function openSocket<T extends { type: string }>(
  url: string,
  schema: z.ZodType<T>,
  track: WebSocket[],
): TestSocket<T> {
  const socket = new WebSocket(url);
  track.push(socket);
  const queue: T[] = [];
  const waiters: Array<() => void> = [];
  socket.on('message', (data) => {
    queue.push(schema.parse(JSON.parse(data.toString())));
    waiters.splice(0).forEach((wake) => wake());
  });
  const closed = new Promise<number>((resolve) => socket.on('close', (code) => resolve(code)));
  return {
    socket,
    closed,
    send(message) {
      const payload = JSON.stringify(message);
      if (socket.readyState === WebSocket.OPEN) socket.send(payload);
      else socket.once('open', () => socket.send(payload));
    },
    async next(type) {
      const deadline = Date.now() + 2000;
      for (;;) {
        const index = queue.findIndex((message) => !type || message.type === type);
        if (index !== -1) return queue.splice(index, 1)[0]!;
        if (Date.now() > deadline) throw new Error(`Timed out waiting for ${type ?? 'message'}`);
        await new Promise<void>((resolve) => {
          waiters.push(resolve);
          setTimeout(resolve, 50);
        });
      }
    },
  };
}

export async function closeAll(sockets: WebSocket[]) {
  await Promise.all(
    sockets.splice(0).map(
      (socket) =>
        new Promise<void>((resolve) => {
          if (socket.readyState === WebSocket.CLOSED) return resolve();
          socket.once('close', () => resolve());
          socket.close();
        }),
    ),
  );
}
