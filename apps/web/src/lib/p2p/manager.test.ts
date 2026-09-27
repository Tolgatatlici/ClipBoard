import { FakeNetwork, FakePeer } from './fake-rtc';
import { MAX_P2P_BYTES, P2PManager, type P2PSnapshot } from './manager';
import type { Signal } from './signals';

/** crypto.getRandomValues tek seferde en fazla 64 KB üretir. */
function randomData(length: number) {
  const data = new Uint8Array(length);
  for (let i = 0; i < length; i += 65536) crypto.getRandomValues(data.subarray(i, i + 65536));
  return data;
}

/** Aynı odadaki cihazlar: sinyaller (şifreleme olmadan) diğer tüm cihazlara iletilir. */
function room(names: string[], network = new FakeNetwork()) {
  const devices = new Map<
    string,
    { manager: P2PManager; snapshot: P2PSnapshot; signals: Signal[] }
  >();
  for (const name of names) {
    const device = {
      snapshot: { outgoing: [], incoming: [] } as P2PSnapshot,
      signals: [] as Signal[],
    };
    const manager = new P2PManager({
      clientId: `${name}-client-id`,
      sendSignal: (signal) => {
        device.signals.push(signal);
        queueMicrotask(() => {
          for (const [other, target] of devices) {
            if (other !== name) target.manager.handleSignal(JSON.parse(JSON.stringify(signal)));
          }
        });
      },
      iceServers: async () => [],
      onChange: (snapshot) => {
        device.snapshot = snapshot;
      },
      createPeer: () => new FakePeer(network) as unknown as RTCPeerConnection,
    });
    devices.set(name, {
      ...device,
      manager,
      get snapshot() {
        return device.snapshot;
      },
      get signals() {
        return device.signals;
      },
    });
  }
  return devices;
}

const until = async (check: () => boolean) => {
  for (let i = 0; i < 200 && !check(); i++) await new Promise((r) => setTimeout(r, 5));
  expect(check()).toBe(true);
};

describe('P2PManager', () => {
  it('transfers a file after the receiver accepts', async () => {
    const devices = room(['a', 'b']);
    const a = devices.get('a')!;
    const b = devices.get('b')!;
    const data = randomData(200_000);
    const transferId = a.manager.announce(
      new File([data], 'büyük.bin', { type: 'application/x-test' }),
    );

    await until(() => b.snapshot.incoming.length === 1);
    expect(b.snapshot.incoming[0]).toMatchObject({
      transferId,
      name: 'büyük.bin',
      status: 'offered',
    });
    b.manager.accept(transferId);

    await until(() => b.snapshot.incoming[0]?.status === 'done');
    const file = b.snapshot.incoming[0]!.file!;
    expect(file.type).toBe('application/x-test');
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(data);
    await until(() => a.snapshot.outgoing[0]?.receivers[0]?.status === 'done');
    // Dosyanın kendisi hiçbir sinyalde yer almaz.
    expect(JSON.stringify(a.signals).length).toBeLessThan(2000);
  });

  it('sends to several receivers independently', async () => {
    const devices = room(['a', 'b', 'c']);
    const [a, b, c] = ['a', 'b', 'c'].map((n) => devices.get(n)!);
    const transferId = a!.manager.announce(new File([new Uint8Array(5000)], 'x'));
    await until(() => b!.snapshot.incoming.length === 1 && c!.snapshot.incoming.length === 1);
    b!.manager.accept(transferId);
    c!.manager.decline(transferId);
    await until(() => b!.snapshot.incoming[0]?.status === 'done');
    await until(
      () =>
        a!.snapshot.outgoing[0]!.receivers.map((r) => r.status)
          .sort()
          .join() === 'declined,done',
    );
    expect(c!.snapshot.incoming).toHaveLength(0);
  });

  it('reports a failed connection', async () => {
    const network = new FakeNetwork();
    network.blocked = true;
    const devices = room(['a', 'b'], network);
    const transferId = devices.get('a')!.manager.announce(new File([new Uint8Array(10)], 'x'));
    await until(() => devices.get('b')!.snapshot.incoming.length === 1);
    devices.get('b')!.manager.accept(transferId);
    await until(() => devices.get('a')!.snapshot.outgoing[0]?.receivers[0]?.status === 'failed');
  });

  it('lets the sender cancel and re-announce to late joiners', async () => {
    const devices = room(['a', 'b']);
    const a = devices.get('a')!;
    const b = devices.get('b')!;
    const transferId = a.manager.announce(new File([new Uint8Array(10)], 'x'));
    await until(() => b.snapshot.incoming.length === 1);
    b.manager.dismiss(transferId);
    a.manager.reannounce();
    await until(() => b.snapshot.incoming.length === 1);
    a.manager.cancel(transferId);
    await until(() => b.snapshot.incoming[0]?.status === 'cancelled');
    expect(a.snapshot.outgoing).toHaveLength(0);
  });

  it('ignores signals addressed to other devices and invalid signals', async () => {
    const devices = room(['a', 'b']);
    const b = devices.get('b')!;
    b.manager.handleSignal({
      kind: 'offer',
      transferId: 'x'.repeat(10),
      from: 'z'.repeat(10),
      to: 'someone-else',
      sdp: 'x',
    });
    b.manager.handleSignal({ kind: 'nonsense' });
    b.manager.handleSignal('not an object');
    expect(b.snapshot.incoming).toHaveLength(0);
  });

  it('rejects files that are empty or too large', () => {
    const devices = room(['a']);
    const a = devices.get('a')!;
    expect(() => a.manager.announce(new File([], 'empty'))).toThrow();
    const huge = { name: 'huge', size: MAX_P2P_BYTES + 1, type: '' } as File;
    expect(() => a.manager.announce(huge)).toThrow();
  });
});
