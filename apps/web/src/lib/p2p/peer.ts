/** Tüm ICE adayları toplanana kadar (ya da süre dolana kadar) bekler. */
function iceGatheringComplete(pc: RTCPeerConnection, timeoutMs: number): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      pc.removeEventListener('icegatheringstatechange', check);
      resolve();
    };
    const check = () => {
      if (pc.iceGatheringState === 'complete') done();
    };
    const timer = setTimeout(done, timeoutMs);
    pc.addEventListener('icegatheringstatechange', check);
  });
}

/**
 * Aday parça parça gönderilmez (trickle ICE yok): teklif ve yanıt, toplanan tüm
 * adaylarla birlikte tek bir şifreli sinyal mesajında gider.
 */
export async function createOffer(pc: RTCPeerConnection, timeoutMs = 3000): Promise<string> {
  await pc.setLocalDescription(await pc.createOffer());
  await iceGatheringComplete(pc, timeoutMs);
  return pc.localDescription!.sdp;
}

export async function createAnswer(
  pc: RTCPeerConnection,
  offer: string,
  timeoutMs = 3000,
): Promise<string> {
  await pc.setRemoteDescription({ type: 'offer', sdp: offer });
  await pc.setLocalDescription(await pc.createAnswer());
  await iceGatheringComplete(pc, timeoutMs);
  return pc.localDescription!.sdp;
}
