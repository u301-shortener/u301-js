import { describe, expect, it, mock } from 'bun:test';
import { run } from './cli';
import type { StoredCliConfig } from './cli-config';
import type { ShortenOptions, ShortenResultItem, U301Options } from './index';

function runCli(argv: string[], deps: Parameters<typeof run>[1] = {}) {
    return run(argv, {
        betaNotice: false,
        ...deps,
    });
}

describe('u301 cli', () => {
    it('prints root help without arguments', async () => {
        const stdout = mock(() => {});
        const stderr = mock(() => {});

        const exitCode = await runCli([], {
            stdout,
            stderr,
        });

        expect(exitCode).toBe(0);
        expect(stdout).toHaveBeenCalledWith(expect.stringContaining('u301 <command> [options]'));
        expect(stderr).not.toHaveBeenCalled();
    });

    it('requires credentials for shorten', async () => {
        const stdout = mock(() => {});
        const stderr = mock(() => {});

        const exitCode = await runCli(['shorten', 'https://example.com'], {
            env: {},
            readStoredConfig: async () => ({}),
            stdout,
            stderr,
        });

        expect(exitCode).toBe(1);
        expect(stderr).toHaveBeenCalledWith(expect.stringContaining('Missing credentials'));
        expect(stdout).not.toHaveBeenCalled();
    });

    it('uses stored config when args and env are missing', async () => {
        const stdout = mock(() => {});
        const stderr = mock(() => {});
        const createClient = mock((options: U301Options) => ({
            domains: {
                list: mock(async () => []),
            },
            links: {
                create: mock(async (input: ShortenOptions): Promise<ShortenResultItem> => {
                    expect(options.apiKey).toBe('stored-key');
                    expect(options.workspaceId).toBe('stored-workspace');
                    expect(options.baseURL).toBe('https://api.example.com');
                    expect(options.apiVersion).toBe('2');
                    expect(input).toMatchObject({
                        url: 'https://example.com',
                        domain: 'go.stored.example.com',
                    });

                    return {
                        id: '0195bde0-7c17-7b1b-8ab5-42b7904b4d6e',
                        url: input.url,
                        slug: 'stored',
                        isCustomSlug: false,
                        domain: 'u301.co',
                        isReused: false,
                        shortLink: 'https://u301.co/stored',
                        comment: '',
                    };
                }),
                list: mock(async () => ({
                    links: [],
                    metadata: {
                        total: 0,
                        perPage: 1,
                        page: 1,
                    },
                })),
            },
        }) as any);

        const exitCode = await runCli(['shorten', 'https://example.com'], {
            createClient,
            env: {},
            readStoredConfig: async () => ({
                apiKey: 'stored-key',
                workspaceId: 'stored-workspace',
                baseURL: 'https://api.example.com',
                apiVersion: '2',
                defaultDomain: 'go.stored.example.com',
            }),
            stdout,
            stderr,
        });

        expect(exitCode).toBe(0);
        expect(stdout).toHaveBeenCalledWith('https://u301.co/stored');
        expect(stderr).not.toHaveBeenCalled();
    });

    it('prefers args over env and stored config', async () => {
        const stdout = mock(() => {});
        const stderr = mock(() => {});
        const createClient = mock((options: U301Options) => ({
            domains: {
                list: mock(async () => []),
            },
            links: {
                create: mock(async (input: ShortenOptions): Promise<ShortenResultItem> => {
                    expect(options.apiKey).toBe('arg-key');
                    expect(options.workspaceId).toBe('arg-workspace');
                    expect(options.baseURL).toBe('https://arg.example.com');
                    expect(options.apiVersion).toBe('3');
                    expect(options.debug).toBe(true);
                    expect(input).toMatchObject({
                        url: 'https://example.com',
                        domain: 'go.example.com',
                    });

                    return {
                        id: '0195bde0-7c17-7b1b-8ab5-42b7904b4d6e',
                        url: input.url,
                        slug: 'launch',
                        isCustomSlug: true,
                        domain: input.domain ?? 'u301.co',
                        isReused: true,
                        shortLink: 'https://go.example.com/launch',
                        comment: input.comment ?? '',
                    };
                }),
                list: mock(async () => ({
                    links: [],
                    metadata: {
                        total: 0,
                        perPage: 1,
                        page: 1,
                    },
                })),
            },
        }) as any);

        const exitCode = await runCli([
            'shorten',
            'https://example.com',
            '--api-key',
            'arg-key',
            '--workspace-id',
            'arg-workspace',
            '--base-url',
            'https://arg.example.com',
            '--api-version',
            '3',
            '--domain',
            'go.example.com',
            '--slug',
            'launch',
            '--reuse-existing',
            '--debug',
        ], {
            createClient,
            env: {
                U301_API_KEY: 'env-key',
                U301_WORKSPACE_ID: 'env-workspace',
                U301_BASE_URL: 'https://env.example.com',
                U301_API_VERSION: '2',
                U301_DOMAIN: 'go.env.example.com',
                U301_DEBUG: 'true',
            },
            readStoredConfig: async () => ({
                apiKey: 'stored-key',
                workspaceId: 'stored-workspace',
                baseURL: 'https://stored.example.com',
                apiVersion: '2',
                defaultDomain: 'go.stored.example.com',
                debug: false,
            }),
            stdout,
            stderr,
        });

        expect(exitCode).toBe(0);
        expect(createClient).toHaveBeenCalledTimes(1);
        expect(stdout).toHaveBeenCalledWith('https://go.example.com/launch');
        expect(stderr).not.toHaveBeenCalled();
    });

    it('uses environment default domain when command line omits --domain', async () => {
        const stdout = mock(() => {});
        const stderr = mock(() => {});
        const createClient = mock((options: U301Options) => ({
            domains: {
                list: mock(async () => []),
            },
            links: {
                create: mock(async (input: ShortenOptions): Promise<ShortenResultItem> => {
                    expect(options.apiKey).toBe('env-key');
                    expect(options.workspaceId).toBe('env-workspace');
                    expect(input).toMatchObject({
                        url: 'https://example.com',
                        domain: 'go.env.example.com',
                    });

                    return {
                        id: '0195bde0-7c17-7b1b-8ab5-42b7904b4d6e',
                        url: input.url,
                        slug: 'env',
                        isCustomSlug: false,
                        domain: input.domain ?? 'u301.co',
                        isReused: false,
                        shortLink: 'https://go.env.example.com/env',
                        comment: '',
                    };
                }),
                list: mock(async () => ({
                    links: [],
                    metadata: {
                        total: 0,
                        perPage: 1,
                        page: 1,
                    },
                })),
            },
        }) as any);

        const exitCode = await runCli(['shorten', 'https://example.com'], {
            createClient,
            env: {
                U301_API_KEY: 'env-key',
                U301_WORKSPACE_ID: 'env-workspace',
                U301_DOMAIN: 'go.env.example.com',
            },
            readStoredConfig: async () => ({
                defaultDomain: 'go.stored.example.com',
            }),
            stdout,
            stderr,
        });

        expect(exitCode).toBe(0);
        expect(stdout).toHaveBeenCalledWith('https://go.env.example.com/env');
        expect(stderr).not.toHaveBeenCalled();
    });

    it('creates a short link with a fake client', async () => {
        const stdout = mock(() => {});
        const stderr = mock(() => {});
        const createClient = mock((options: U301Options) => ({
            domains: {
                list: mock(async () => []),
            },
            links: {
                create: mock(async (input: ShortenOptions): Promise<ShortenResultItem> => {
                    expect(options.apiKey).toBe('test-key');
                    expect(options.workspaceId).toBe('test-workspace');
                    expect(input).toMatchObject({
                        url: 'https://example.com',
                        domain: 'go.example.com',
                        slug: 'launch',
                        reuseExisting: true,
                    });

                    return {
                        id: '0195bde0-7c17-7b1b-8ab5-42b7904b4d6e',
                        url: input.url,
                        slug: input.slug ?? 'launch',
                        isCustomSlug: true,
                        domain: input.domain ?? 'u301.co',
                        isReused: true,
                        shortLink: 'https://go.example.com/launch',
                        comment: input.comment ?? '',
                    };
                }),
                list: mock(async () => ({
                    links: [],
                    metadata: {
                        total: 0,
                        perPage: 1,
                        page: 1,
                    },
                })),
            },
        }) as any);

        const exitCode = await runCli([
            'shorten',
            'https://example.com',
            '--domain',
            'go.example.com',
            '--slug',
            'launch',
            '--reuse-existing',
        ], {
            createClient,
            env: {
                U301_API_KEY: 'test-key',
                U301_WORKSPACE_ID: 'test-workspace',
            },
            stdout,
            stderr,
        });

        expect(exitCode).toBe(0);
        expect(createClient).toHaveBeenCalledTimes(1);
        expect(stdout).toHaveBeenCalledWith('https://go.example.com/launch');
        expect(stderr).not.toHaveBeenCalled();
    });

    it('creates many links through links create-many', async () => {
        const stdout = mock(() => {});
        const stderr = mock(() => {});
        const createClient = mock((options: U301Options) => ({
            links: {
                createMany: mock(async (inputs: ShortenOptions[], opts?: { throwOnError?: boolean }) => {
                    expect(options.apiKey).toBe('bulk-key');
                    expect(options.workspaceId).toBe('bulk-workspace');
                    expect(inputs).toEqual([
                        {
                            url: 'https://a.com',
                            domain: 'go.example.com',
                            comment: 'launch',
                            reuseExisting: true,
                        },
                        {
                            url: 'https://b.com',
                            domain: 'go.example.com',
                            comment: 'launch',
                            reuseExisting: true,
                        },
                    ]);
                    expect(opts).toEqual({ throwOnError: true });

                    return [
                        { url: 'https://a.com', shortLink: 'https://go.example.com/a' },
                        { url: 'https://b.com', shortLink: 'https://go.example.com/b' },
                    ];
                }),
            },
        }) as any);

        const exitCode = await runCli([
            'links',
            'create-many',
            'https://a.com',
            'https://b.com',
            '--domain',
            'go.example.com',
            '--comment',
            'launch',
            '--reuse-existing',
            '--throw-on-error',
        ], {
            createClient,
            env: {
                U301_API_KEY: 'bulk-key',
                U301_WORKSPACE_ID: 'bulk-workspace',
            },
            readStoredConfig: async () => ({}),
            stdout,
            stderr,
        });

        expect(exitCode).toBe(0);
        expect(stdout).toHaveBeenCalledWith(expect.stringContaining('"shortLink": "https://go.example.com/a"'));
        expect(stderr).not.toHaveBeenCalled();
    });

    it('lists links through links list', async () => {
        const stdout = mock(() => {});
        const stderr = mock(() => {});
        const createClient = mock(() => ({
            links: {
                list: mock(async (params?: { page?: number; perPage?: number }) => {
                    expect(params).toEqual({
                        page: 2,
                        perPage: 25,
                    });

                    return {
                        links: [],
                        metadata: {
                            total: 99,
                            perPage: 25,
                            page: 2,
                        },
                    };
                }),
            },
        }) as any);

        const exitCode = await runCli([
            'links',
            'list',
            '--page',
            '2',
            '--per-page',
            '25',
        ], {
            createClient,
            env: {
                U301_API_KEY: 'list-key',
                U301_WORKSPACE_ID: 'list-workspace',
            },
            readStoredConfig: async () => ({}),
            stdout,
            stderr,
        });

        expect(exitCode).toBe(0);
        expect(stdout).toHaveBeenCalledWith(expect.stringContaining('"total": 99'));
        expect(stderr).not.toHaveBeenCalled();
    });

    it('rejects links list when --per-page is below api minimum', async () => {
        const stdout = mock(() => {});
        const stderr = mock(() => {});

        const exitCode = await runCli([
            'links',
            'list',
            '--per-page',
            '1',
        ], {
            env: {
                U301_API_KEY: 'list-key',
                U301_WORKSPACE_ID: 'list-workspace',
            },
            readStoredConfig: async () => ({}),
            stdout,
            stderr,
        });

        expect(exitCode).toBe(1);
        expect(stderr).toHaveBeenCalledWith('`--per-page` must be at least 10.');
        expect(stdout).not.toHaveBeenCalled();
    });

    it('normalizes full short link urls for links get', async () => {
        const stdout = mock(() => {});
        const stderr = mock(() => {});
        const createClient = mock(() => ({
            links: {
                get: mock(async (shortUrl: string) => {
                    expect(shortUrl).toBe('go.example.com/launch');

                    return {
                        shortUrl,
                        originalUrl: 'https://example.com',
                    };
                }),
            },
        }) as any);

        const exitCode = await runCli([
            'links',
            'get',
            'https://go.example.com/launch',
        ], {
            createClient,
            env: {
                U301_API_KEY: 'get-key',
                U301_WORKSPACE_ID: 'get-workspace',
            },
            readStoredConfig: async () => ({}),
            stdout,
            stderr,
        });

        expect(exitCode).toBe(0);
        expect(stdout).toHaveBeenCalledWith(expect.stringContaining('"shortUrl": "go.example.com/launch"'));
        expect(stderr).not.toHaveBeenCalled();
    });

    it('normalizes full short link urls for links delete', async () => {
        const stdout = mock(() => {});
        const stderr = mock(() => {});
        const createClient = mock(() => ({
            links: {
                delete: mock(async (shortUrl: string) => {
                    expect(shortUrl).toBe('go.example.com/launch');
                    return true;
                }),
            },
        }) as any);

        const exitCode = await runCli([
            'links',
            'delete',
            'https://go.example.com/launch',
        ], {
            createClient,
            env: {
                U301_API_KEY: 'delete-key',
                U301_WORKSPACE_ID: 'delete-workspace',
            },
            readStoredConfig: async () => ({}),
            stdout,
            stderr,
        });

        expect(exitCode).toBe(0);
        expect(stdout).toHaveBeenCalledWith('Deleted link: go.example.com/launch');
        expect(stderr).not.toHaveBeenCalled();
    });

    it('waits for domain status change through domains wait-change', async () => {
        const stdout = mock(() => {});
        const stderr = mock(() => {});
        const createClient = mock(() => ({
            domains: {
                waitForStatusChange: mock(async (domain: string, opts?: { timeoutMs?: number; pollMs?: number; emitInitial?: boolean }) => {
                    expect(domain).toBe('go.example.com');
                    expect(opts).toEqual({
                        timeoutMs: 60000,
                        pollMs: 5000,
                        emitInitial: true,
                    });

                    return {
                        actived: true,
                        message: 'ok',
                    };
                }),
            },
        }) as any);

        const exitCode = await runCli([
            'domains',
            'wait-change',
            'go.example.com',
            '--timeout-ms',
            '60000',
            '--poll-ms',
            '5000',
            '--emit-initial',
        ], {
            createClient,
            env: {
                U301_API_KEY: 'domain-key',
                U301_WORKSPACE_ID: 'domain-workspace',
            },
            readStoredConfig: async () => ({}),
            stdout,
            stderr,
        });

        expect(exitCode).toBe(0);
        expect(stdout).toHaveBeenCalledWith(expect.stringContaining('"actived": true'));
        expect(stderr).not.toHaveBeenCalled();
    });

    it('updates domain home page redirect through domains set-home-page-redirect', async () => {
        const stdout = mock(() => {});
        const stderr = mock(() => {});
        const createClient = mock(() => ({
            domains: {
                updateHomePageRedirectUrl: mock(async (domain: string, url: string) => {
                    expect(domain).toBe('go.example.com');
                    expect(url).toBe('https://example.com/welcome');
                    return true;
                }),
            },
        }) as any);

        const exitCode = await runCli([
            'domains',
            'set-home-page-redirect',
            'go.example.com',
            'https://example.com/welcome',
        ], {
            createClient,
            env: {
                U301_API_KEY: 'domain-key',
                U301_WORKSPACE_ID: 'domain-workspace',
            },
            readStoredConfig: async () => ({}),
            stdout,
            stderr,
        });

        expect(exitCode).toBe(0);
        expect(stdout).toHaveBeenCalledWith('Updated home page redirect for go.example.com');
        expect(stderr).not.toHaveBeenCalled();
    });

    it('creates domain with sdk default random slug length when flag is omitted', async () => {
        const stdout = mock(() => {});
        const stderr = mock(() => {});
        const createClient = mock(() => ({
            domains: {
                create: mock(async (domain: string, opts?: { randomSlugLength?: number }) => {
                    expect(domain).toBe('re.time2.cc');
                    expect(opts).toBeUndefined();
                    return true;
                }),
            },
        }) as any);

        const exitCode = await runCli([
            'domains',
            'create',
            're.time2.cc',
        ], {
            createClient,
            env: {
                U301_API_KEY: 'domain-key',
                U301_WORKSPACE_ID: 'domain-workspace',
            },
            readStoredConfig: async () => ({}),
            stdout,
            stderr,
        });

        expect(exitCode).toBe(0);
        expect(stdout).toHaveBeenCalledWith('Created domain: re.time2.cc');
        expect(stderr).not.toHaveBeenCalled();
    });

    it('queries analytics top metric', async () => {
        const stdout = mock(() => {});
        const stderr = mock(() => {});
        const createClient = mock(() => ({
            analytics: {
                getTopCountries: mock(async (params: { range: string; timezone?: string }) => {
                    expect(params).toEqual({
                        range: '30d',
                        timezone: 'Asia/Shanghai',
                    });

                    return {
                        range: '30d',
                        data: [{ label: 'CN', click: 10 }],
                        datetimeRange: ['2025-01-01T00:00:00.000Z', '2025-01-31T00:00:00.000Z'],
                    };
                }),
            },
        }) as any);

        const exitCode = await runCli([
            'analytics',
            'top',
            'countries',
            '--range',
            '30d',
            '--timezone',
            'Asia/Shanghai',
        ], {
            createClient,
            env: {
                U301_API_KEY: 'analytics-key',
                U301_WORKSPACE_ID: 'analytics-workspace',
            },
            readStoredConfig: async () => ({}),
            stdout,
            stderr,
        });

        expect(exitCode).toBe(0);
        expect(stdout).toHaveBeenCalledWith(expect.stringContaining('"label": "CN"'));
        expect(stderr).not.toHaveBeenCalled();
    });

    it('queries analytics clicks with defaults', async () => {
        const stdout = mock(() => {});
        const stderr = mock(() => {});
        const createClient = mock(() => ({
            analytics: {
                getClicks: mock(async (params: { range: string; granularity: string; timezone?: string }) => {
                    expect(params).toEqual({
                        range: '7d',
                        granularity: 'day',
                        timezone: undefined,
                    });

                    return {
                        start: '2025-01-01T00:00:00.000Z',
                        end: '2025-01-07T00:00:00.000Z',
                        data: [{ date: '2025-01-01', click: 1 }],
                    };
                }),
            },
        }) as any);

        const exitCode = await runCli([
            'analytics',
            'clicks',
        ], {
            createClient,
            env: {
                U301_API_KEY: 'analytics-key',
                U301_WORKSPACE_ID: 'analytics-workspace',
            },
            readStoredConfig: async () => ({}),
            stdout,
            stderr,
        });

        expect(exitCode).toBe(0);
        expect(stdout).toHaveBeenCalledWith(expect.stringContaining('"click": 1'));
        expect(stderr).not.toHaveBeenCalled();
    });

    it('prints status without credentials as not configured', async () => {
        const stdout = mock(() => {});
        const stderr = mock(() => {});

        const exitCode = await runCli(['status', '--offline'], {
            env: {},
            readStoredConfig: async () => ({}),
            stdout,
            stderr,
        });

        expect(exitCode).toBe(1);
        expect(stdout).toHaveBeenCalledWith('Configured: no');
        expect(stderr).toHaveBeenCalledWith(expect.stringContaining('Missing credentials'));
    });

    it('verifies status and prints remote counts', async () => {
        const stdout = mock(() => {});
        const stderr = mock(() => {});
        const createClient = mock((options: U301Options) => ({
            domains: {
                list: mock(async () => [
                    {
                        domain: 'u301.co',
                        randomCodeLength: 6,
                        isPrimary: true,
                        isGlobal: true,
                    },
                    {
                        domain: 'go.example.com',
                        randomCodeLength: 6,
                        isPrimary: false,
                        isGlobal: false,
                    },
                ]),
            },
            links: {
                create: mock(async (): Promise<ShortenResultItem> => {
                    throw new Error('not used');
                }),
                list: mock(async (params?: { page?: number; perPage?: number }) => {
                    expect(options.apiKey).toBe('stored-key');
                    expect(options.workspaceId).toBe('stored-workspace');
                    expect(params).toEqual({
                        page: 1,
                        perPage: 10,
                    });

                    return {
                        links: [],
                        metadata: {
                            total: 42,
                            perPage: 1,
                            page: 1,
                        },
                    };
                }),
            },
        }) as any);

        const exitCode = await runCli(['status'], {
            createClient,
            env: {},
            readStoredConfig: async () => ({
                apiKey: 'stored-key',
                workspaceId: 'stored-workspace',
                defaultDomain: 'go.example.com',
            }),
            stdout,
            stderr,
        });

        expect(exitCode).toBe(0);
        expect(stdout).toHaveBeenCalledWith('Verification: ok');
        expect(stdout).toHaveBeenCalledWith('Domains: 2');
        expect(stdout).toHaveBeenCalledWith('Links: 42');
        expect(stdout).toHaveBeenCalledWith('Primary domain: u301.co');
        expect(stdout).toHaveBeenCalledWith('Default domain available: yes');
        expect(stdout).toHaveBeenCalledWith(expect.stringContaining('Quota: unavailable'));
        expect(stderr).not.toHaveBeenCalled();
    });

    it('fails status when workspace verification fails', async () => {
        const stdout = mock(() => {});
        const stderr = mock(() => {});
        const createClient = mock(() => ({
            domains: {
                list: mock(async () => []),
            },
            links: {
                create: mock(async (): Promise<ShortenResultItem> => {
                    throw new Error('not used');
                }),
                list: mock(async () => {
                    throw new Error('workspace probe failed');
                }),
            },
        }) as any);

        const exitCode = await runCli(['status'], {
            createClient,
            env: {},
            readStoredConfig: async () => ({
                apiKey: 'stored-key',
                workspaceId: 'stored-workspace',
            }),
            stdout,
            stderr,
        });

        expect(exitCode).toBe(1);
        expect(stdout).toHaveBeenCalledWith('Verification: failed');
        expect(stderr).toHaveBeenCalledWith('workspace probe failed');
    });

    it('keeps status successful when domain metadata lookup fails', async () => {
        const stdout = mock(() => {});
        const stderr = mock(() => {});
        const createClient = mock(() => ({
            domains: {
                list: mock(async () => {
                    throw new Error('domains endpoint unavailable');
                }),
            },
            links: {
                create: mock(async (): Promise<ShortenResultItem> => {
                    throw new Error('not used');
                }),
                list: mock(async () => ({
                    links: [],
                    metadata: {
                        total: 7,
                        perPage: 1,
                        page: 1,
                    },
                })),
            },
        }) as any);

        const exitCode = await runCli(['status'], {
            createClient,
            env: {},
            readStoredConfig: async () => ({
                apiKey: 'stored-key',
                workspaceId: 'stored-workspace',
                defaultDomain: 'go.example.com',
            }),
            stdout,
            stderr,
        });

        expect(exitCode).toBe(0);
        expect(stdout).toHaveBeenCalledWith('Domains: (unavailable)');
        expect(stdout).toHaveBeenCalledWith('Links: 7');
        expect(stdout).toHaveBeenCalledWith('Default domain available: (unavailable)');
        expect(stdout).toHaveBeenCalledWith(expect.stringContaining('Warning: Domain metadata unavailable: domains endpoint unavailable'));
        expect(stderr).not.toHaveBeenCalled();
    });

    it('writes config during login from flags', async () => {
        const stdout = mock(() => {});
        const stderr = mock(() => {});
        let writtenConfig: StoredCliConfig | undefined;

        const exitCode = await runCli([
            'login',
            '--api-key',
            'saved-key',
            '--workspace-id',
            'saved-workspace',
            '--base-url',
            'https://api.example.com',
            '--api-version',
            '2',
            '--domain',
            'go.example.com',
            '--debug',
        ], {
            env: {},
            prompt: async () => {
                throw new Error('prompt should not be called');
            },
            readStoredConfig: async () => ({}),
            stderr,
            stdout,
            writeStoredConfig: async (config) => {
                writtenConfig = config;
                return '/tmp/.u301/config.json';
            },
        });

        expect(exitCode).toBe(0);
        expect(writtenConfig).toEqual({
            apiKey: 'saved-key',
            workspaceId: 'saved-workspace',
            baseURL: 'https://api.example.com',
            apiVersion: '2',
            defaultDomain: 'go.example.com',
            debug: true,
        });
        expect(stdout).toHaveBeenCalledWith('Saved CLI config to /tmp/.u301/config.json');
        expect(stderr).not.toHaveBeenCalled();
    });

    it('prompts for missing values during login', async () => {
        const stdout = mock(() => {});
        const stderr = mock(() => {});
        const prompts: string[] = [];
        let writtenConfig: StoredCliConfig | undefined;

        const exitCode = await runCli(['login'], {
            env: {},
            prompt: async (label, defaultValue) => {
                prompts.push(`${label}:${defaultValue ?? ''}`);

                if (label === 'API key') {
                    return 'prompt-key';
                }
                if (label === 'Workspace ID') {
                    return 'prompt-workspace';
                }

                return '';
            },
            readStoredConfig: async () => ({
                baseURL: 'https://stored.example.com',
                apiVersion: '3',
                defaultDomain: 'go.stored.example.com',
            }),
            stderr,
            stdout,
            writeStoredConfig: async (config) => {
                writtenConfig = config;
                return '/tmp/.u301/config.json';
            },
        });

        expect(exitCode).toBe(0);
        expect(prompts).toEqual([
            'API key:',
            'Workspace ID:',
        ]);
        expect(writtenConfig).toEqual({
            apiKey: 'prompt-key',
            workspaceId: 'prompt-workspace',
            baseURL: 'https://stored.example.com',
            apiVersion: '3',
            defaultDomain: 'go.stored.example.com',
        });
        expect(stderr).not.toHaveBeenCalled();
    });

    it('reports invalid stored config during status', async () => {
        const stdout = mock(() => {});
        const stderr = mock(() => {});

        const exitCode = await runCli(['status', '--offline'], {
            env: {},
            readStoredConfig: async () => {
                throw new Error('Invalid config file at /tmp/.u301/config.json: expected a JSON object.');
            },
            stdout,
            stderr,
        });

        expect(exitCode).toBe(1);
        expect(stdout).not.toHaveBeenCalled();
        expect(stderr).toHaveBeenCalledWith(expect.stringContaining('Unable to read CLI config'));
    });

    it('reports invalid stored config during login', async () => {
        const stdout = mock(() => {});
        const stderr = mock(() => {});

        const exitCode = await runCli(['login'], {
            env: {},
            readStoredConfig: async () => {
                throw new Error('Invalid config file at /tmp/.u301/config.json: expected a JSON object.');
            },
            stdout,
            stderr,
        });

        expect(exitCode).toBe(1);
        expect(stdout).not.toHaveBeenCalled();
        expect(stderr).toHaveBeenCalledWith(expect.stringContaining('Unable to read CLI config'));
    });

    it('prints beta notice by default', async () => {
        const stdout = mock(() => {});
        const stderr = mock(() => {});

        const exitCode = await run(['--help'], {
            stdout,
            stderr,
        });

        expect(exitCode).toBe(0);
        expect(stderr).toHaveBeenCalledWith(expect.stringContaining('internal beta'));
        expect(stdout).toHaveBeenCalledWith(expect.stringContaining('u301 <command> [options]'));
    });

    it('does not print beta notice for subcommand help', async () => {
        const stdout = mock(() => {});
        const stderr = mock(() => {});

        const exitCode = await run(['links', '--help'], {
            stdout,
            stderr,
        });

        expect(exitCode).toBe(0);
        expect(stderr).not.toHaveBeenCalled();
        expect(stdout).toHaveBeenCalledWith(expect.stringContaining('u301 links'));
    });

    it('does not print beta notice for help topics', async () => {
        const stdout = mock(() => {});
        const stderr = mock(() => {});

        const exitCode = await run(['help', 'links'], {
            stdout,
            stderr,
        });

        expect(exitCode).toBe(0);
        expect(stderr).not.toHaveBeenCalled();
        expect(stdout).toHaveBeenCalledWith(expect.stringContaining('u301 links'));
    });

    it('prints links create help with the alias command name', async () => {
        const stdout = mock(() => {});
        const stderr = mock(() => {});

        const exitCode = await runCli(['links', 'create', '--help'], {
            stdout,
            stderr,
        });

        expect(exitCode).toBe(0);
        expect(stdout).toHaveBeenCalledWith(expect.stringContaining('u301 links create'));
        expect(stderr).not.toHaveBeenCalled();
    });
});
