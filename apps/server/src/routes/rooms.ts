import type { FastifyInstance } from 'fastify';
import { roomIdSchema } from '@clipboard/shared';
import type { RoomHub } from '../rooms/hub.js';

export async function roomRoutes(app: FastifyInstance, { hub }: { hub: RoomHub }) {
  app.get<{ Params: { roomId: string } }>(
    '/ws/rooms/:roomId',
    { websocket: true },
    async (socket, request) => {
      if (!roomIdSchema.safeParse(request.params.roomId).success) {
        socket.close(1008, 'invalid_room');
        return;
      }
      await hub.join(request.params.roomId, socket);
    },
  );
}
