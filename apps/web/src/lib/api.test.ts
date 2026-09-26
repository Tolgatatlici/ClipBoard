import { api } from './api';

afterEach(() => vi.unstubAllGlobals());

describe('api', () => {
  it('does not send a JSON content type on requests without a body', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    await api.deleteClip('ABCD', 'token');
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.headers).toEqual({ Authorization: 'Bearer token' });
  });
});
