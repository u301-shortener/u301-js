import { describe, expect, it, mock } from 'bun:test';
import { Domain } from './domain';

describe('domain sdk', () => {
    it('uses default shortCodeLength when randomSlugLength is omitted', async () => {
        const fetcher = mock(async (_url: string, init?: { body?: string }) => {
            expect(init?.body).toBe(JSON.stringify({
                domain: 're.time2.cc',
                shortCodeLength: 6,
            }));
            return { message: 'Domain created' };
        });

        const domain = new Domain({
            apiKey: 'test-key',
            fetcher: fetcher as any,
            workspaceId: 'test-workspace',
        });

        const result = await domain.create('re.time2.cc');

        expect(result).toBe(true);
        expect(fetcher).toHaveBeenCalledTimes(1);
    });
});
