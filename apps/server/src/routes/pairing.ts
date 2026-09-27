import type { FastifyInstance } from 'fastify';
import { pairingCodeSchema, type CreatePairingResponse } from '@clipboard/shared';
import type { PairingHub } from '../rooms/pairing-hub.js';

export async function pairingRoutes(
  app: FastifyInstance,
  { hub, rateLimit }: { hub: PairingHub; rateLimit: number },
) {
  app.post(
    '/api/pairings',
    { config: { rateLimit: { max: rateLimit, timeWindow: '1 minute' } } },
    async (_request, reply) => {
      const body: CreatePairingResponse = await hub.create();
      return reply.code(201).header('Cache-Control', 'no-store').send(body);
    },
  );

  app.get<{ Params: { code: string } }>(
    '/ws/pair/:code',
    { websocket: true },
    async (socket, request) => {
      if (!pairingCodeSchema.safeParse(request.params.code).success) {
        socket.close(1008, 'invalid_code');
        return;
      }
      await hub.connect(request.params.code, socket);
    },
  );
}
