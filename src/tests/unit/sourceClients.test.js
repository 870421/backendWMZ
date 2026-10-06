const { fetchJsonWithRetry } = require('../../integrations/httpClient');
const { buildGetFeatureUrl, fetchWfsPages } = require('../../integrations/idezar/wfsClient');
const { runOverpassQuery } = require('../../integrations/osm/overpassClient');

const jsonResponse = (body, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body
});

async function collect(iterator) {
  const pages = [];

  for await (const page of iterator) pages.push(page);
  return pages;
}

describe('source clients', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  describe('WFS client', () => {
    it('builds a GetFeature URL in EPSG:4326 with stable ordering', () => {
      const url = new URL(
        buildGetFeatureUrl('https://wfs.test/wfs', {
          typeName: 'ns:layer',
          sortBy: 'ID',
          count: 10,
          startIndex: 20
        })
      );

      expect(Object.fromEntries(url.searchParams)).toEqual({
        service: 'WFS',
        version: '2.0.0',
        request: 'GetFeature',
        typeNames: 'ns:layer',
        outputFormat: 'application/json',
        srsName: 'EPSG:4326',
        sortBy: 'ID',
        count: '10',
        startIndex: '20'
      });
    });

    it('pages with startIndex until numberMatched is reached', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce(jsonResponse({ numberMatched: 3, features: [{ id: 1 }, { id: 2 }] }))
        .mockResolvedValueOnce(jsonResponse({ numberMatched: 3, features: [{ id: 3 }] }));

      const pages = await collect(
        fetchWfsPages({ baseUrl: 'https://wfs.test/wfs', typeName: 'ns:layer', pageSize: 2 })
      );

      expect(pages.map((page) => [page.sourceCount, page.startIndex, page.items.length])).toEqual([
        [3, 0, 2],
        [3, 2, 1]
      ]);
      expect(new URL(global.fetch.mock.calls[1][0]).searchParams.get('startIndex')).toBe('2');
    });

    it('stops on a short page when the server does not report numberMatched', async () => {
      global.fetch = jest.fn().mockResolvedValue(jsonResponse({ features: [{ id: 1 }] }));

      const pages = await collect(
        fetchWfsPages({ baseUrl: 'https://wfs.test/wfs', typeName: 'ns:layer', pageSize: 2 })
      );

      expect(pages).toEqual([{ sourceCount: null, startIndex: 0, items: [{ id: 1 }] }]);
    });

    it('fails on responses without features', async () => {
      global.fetch = jest.fn().mockResolvedValue(jsonResponse({ error: 'x' }));

      await expect(
        collect(fetchWfsPages({ baseUrl: 'https://wfs.test/wfs', typeName: 'ns:l', pageSize: 2 }))
      ).rejects.toThrow('Invalid WFS response for ns:l');
    });
  });

  describe('HTTP retries', () => {
    it('retries server errors and then succeeds', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce(jsonResponse({}, 503))
        .mockResolvedValueOnce(jsonResponse({ ok: true }));

      await expect(fetchJsonWithRetry('https://x.test', { retryDelayMs: 1 })).resolves.toEqual({
        ok: true
      });
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('does not retry client errors', async () => {
      global.fetch = jest.fn().mockResolvedValue(jsonResponse({}, 400));

      await expect(fetchJsonWithRetry('https://x.test', { retryDelayMs: 1 })).rejects.toThrow(
        'HTTP 400'
      );
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('gives up after the configured retries', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNRESET'));

      await expect(
        fetchJsonWithRetry('https://x.test', { retries: 2, retryDelayMs: 1 })
      ).rejects.toThrow('ECONNRESET');
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('reports timeouts', async () => {
      global.fetch = jest.fn(
        (_url, { signal }) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(new Error('aborted')));
          })
      );

      await expect(
        fetchJsonWithRetry('https://x.test', { retries: 0, timeoutMs: 5 })
      ).rejects.toThrow('Timed out after 5 ms');
    });
  });

  describe('Overpass client', () => {
    it('posts the query and returns its elements', async () => {
      global.fetch = jest.fn().mockResolvedValue(jsonResponse({ elements: [{ id: 1 }] }));

      await expect(runOverpassQuery('https://overpass.test', '[out:json];')).resolves.toEqual([
        { id: 1 }
      ]);
      const [, init] = global.fetch.mock.calls[0];
      expect(init.method).toBe('POST');
      expect(new URLSearchParams(init.body).get('data')).toBe('[out:json];');
    });

    it('fails on invalid responses', async () => {
      global.fetch = jest.fn().mockResolvedValue(jsonResponse({ remark: 'runtime error' }));

      await expect(runOverpassQuery('https://overpass.test', 'q')).rejects.toThrow(
        'Invalid Overpass response'
      );
    });
  });
});
