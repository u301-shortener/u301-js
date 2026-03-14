#!/usr/bin/env node

import { realpathSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { stdin as input, stdout as output } from 'node:process';
import { granularities, ranges } from './analytics';
import { getDefaultConfigPath, readStoredCliConfig, writeStoredCliConfig } from './cli-config';
import { SDK_VERSION } from './version';
import { U301 } from './index';
import type {
    DomainSchema,
    ListParams,
    ShortenLinkList,
    ShortenOptions,
    ShortenResultItem,
    U301Options,
} from './index';

type ArgValue = boolean | string | undefined;
type ArgValues = Record<string, ArgValue>;
type ConfigSource = 'arg' | 'env' | 'stored' | 'default' | 'missing';
type ConfigSources = {
    apiKey: ConfigSource;
    workspaceId: ConfigSource;
    baseURL: ConfigSource;
    apiVersion: ConfigSource;
    defaultDomain: ConfigSource;
    debug: ConfigSource;
};
type ConfigError = { error: string };
type IntegerOptionResult = { value: number | undefined } | ConfigError;
type ExpiredAtOptionResult = { value: Date | undefined } | ConfigError;
type AnalyticsRangeResult = { value: (typeof ranges)[number] } | ConfigError;
type AnalyticsGranularityResult = { value: (typeof granularities)[number] } | ConfigError;
type ResolvedConfig = {
    apiKey?: string;
    workspaceId?: string;
    baseURL?: string;
    apiVersion?: U301Options['apiVersion'];
    defaultDomain?: string;
    debug: boolean;
    sources: ConfigSources;
    storedConfig: StoredCliConfig;
};
type AuthenticatedConfig = ResolvedConfig & {
    apiKey: string;
    workspaceId: string;
};

type CliClient = {
    links: {
        create(options: ShortenOptions): Promise<ShortenResultItem>;
        createMany(
            inputs: (ShortenOptions | string)[],
            opts?: { throwOnError?: boolean },
        ): Promise<unknown>;
        delete(shortUrl: string): Promise<boolean>;
        get(shortUrl: string): Promise<unknown>;
        list(params?: ListParams): Promise<ShortenLinkList>;
    };
    domains: {
        create(domain: string, opts?: { randomSlugLength?: number }): Promise<boolean>;
        delete(domain: string): Promise<boolean>;
        getActiveStatus(domain: string): Promise<unknown>;
        getDetails(domain: string): Promise<unknown>;
        list(): Promise<DomainSchema[]>;
        setRandomCodeLength(domain: string, length: number): Promise<boolean>;
        updateHomePageRedirectUrl(domain: string, url: string): Promise<boolean>;
        updateNotFoundPageRedirectUrl(domain: string, url: string): Promise<boolean>;
        waitForStatusChange(
            domain: string,
            opts?: { timeoutMs?: number; pollMs?: number; emitInitial?: boolean },
        ): Promise<unknown>;
        waitUntilActive(
            domain: string,
            opts?: { timeoutMs?: number; pollMs?: number },
        ): Promise<unknown>;
    };
    analytics: {
        getClicks(params: { range: string; granularity: string; timezone?: string }): Promise<unknown>;
        getTopBots(params: { range: string; timezone?: string }): Promise<unknown>;
        getTopBrowsers(params: { range: string; timezone?: string }): Promise<unknown>;
        getTopCities(params: { range: string; timezone?: string }): Promise<unknown>;
        getTopCountries(params: { range: string; timezone?: string }): Promise<unknown>;
        getTopDeviceTypes(params: { range: string; timezone?: string }): Promise<unknown>;
        getTopDeviceVendors(params: { range: string; timezone?: string }): Promise<unknown>;
        getTopLanguages(params: { range: string; timezone?: string }): Promise<unknown>;
        getTopOperatingSystems(params: { range: string; timezone?: string }): Promise<unknown>;
        getTopReferers(params: { range: string; timezone?: string }): Promise<unknown>;
        getTopShortLinks(params: { range: string; timezone?: string }): Promise<unknown>;
    };
};

interface CliDeps {
    betaNotice?: false | string;
    createClient?: (options: U301Options) => CliClient;
    env?: NodeJS.ProcessEnv;
    prompt?: (label: string, defaultValue?: string) => Promise<string>;
    readStoredConfig?: () => Promise<StoredCliConfig>;
    stderr?: (message: string) => void;
    stdout?: (message: string) => void;
    writeStoredConfig?: (config: StoredCliConfig) => Promise<string>;
}

type StoredCliConfig = Awaited<ReturnType<typeof readStoredCliConfig>>;

const BETA_NOTICE = 'Warning: U301 CLI is currently in internal beta. Behavior may change and bugs may exist.';

const ROOT_HELP = `u301 ${SDK_VERSION}

Usage:
  u301 <command> [options]

Commands:
  links             Manage short links
  domains           Manage domains
  analytics         Query analytics data
  shorten <url>     Create a short link (alias for \`links create\`)
  login             Save default credentials to ~/.u301/config.json
  status            Show login/config status and verify API access
  help [command]  Show help
  version         Show version

Global options:
  -h, --help      Show help
  -v, --version   Show version

Examples:
  u301 login
  u301 status
  u301 links list
  u301 domains details go.example.com
  u301 analytics top countries --range 7d
  u301 shorten https://example.com --api-key <key> --workspace-id <id>
  U301_API_KEY=xxx U301_WORKSPACE_ID=yyy u301 shorten https://example.com --slug launch
`;

const LINKS_HELP = `u301 links

Usage:
  u301 links <subcommand> [options]

Subcommands:
  create <url>             Create one short link
  create-many <urls...>    Create multiple short links
  get <short-url>          Fetch one short link
  list                     List short links
  delete <short-url>       Delete one short link

Examples:
  u301 links create https://example.com --domain go.example.com
  u301 links create-many https://a.com https://b.com --domain go.example.com
  u301 links get go.example.com/launch
  u301 links list --page 1 --per-page 20
  u301 links delete go.example.com/launch
`;

const DOMAINS_HELP = `u301 domains

Usage:
  u301 domains <subcommand> [options]

Subcommands:
  list                                   List domains
  create <domain>                        Create a domain
  delete <domain>                        Delete a domain
  details <domain>                       Get domain details
  active <domain>                        Get active status
  wait-active <domain>                   Wait until a domain becomes active
  wait-change <domain>                   Wait until domain status changes
  set-random-code-length <domain> <n>    Update random short code length
  set-home-page-redirect <domain> <url>  Update home page redirect
  set-not-found-page-redirect <domain> <url>
                                         Update 404 redirect

Examples:
  u301 domains list
  u301 domains create go.example.com --random-slug-length 6
  u301 domains details go.example.com
  u301 domains wait-active go.example.com --timeout-ms 60000
`;

const ANALYTICS_HELP = `u301 analytics

Usage:
  u301 analytics <subcommand> [options]

Subcommands:
  clicks                  Query click series
  top <metric>            Query top analytics metric

Metrics:
  browsers
  device-types
  short-links
  bots
  device-vendors
  operating-systems
  countries
  referers
  languages
  cities

Examples:
  u301 analytics clicks --range 7d --granularity day
  u301 analytics top countries --range 30d
  u301 analytics top short-links --range 7d --timezone Asia/Shanghai
`;

function getShortenHelp(commandPath = 'u301 shorten') {
    return `${commandPath}

Usage:
  ${commandPath} <url> [options]

Options:
  --api-key <key>          API key for authentication
  --workspace-id <id>      Workspace ID
  --base-url <url>         Override API base URL
  --api-version <2|3>      API version to use
  --domain <domain>        Domain for the short link
  --slug <slug>            Custom slug
  --comment <text>         Comment stored with the link
  --password <text>        Password protection
  --expired-at <iso>       Expiration time in ISO-8601 format
  --reuse-existing         Reuse an existing short link when possible
  --debug                  Enable request debug logging
  --json                   Print the full API response as JSON
  --verbose                Print a readable summary
  -h, --help               Show command help

Environment variables:
  U301_API_KEY
  U301_WORKSPACE_ID
  U301_BASE_URL
  U301_API_VERSION
  U301_DOMAIN
  U301_DEBUG

Priority:
  command line options > environment variables > ~/.u301/config.json
`;
}

const LOGIN_HELP = `u301 login

Usage:
  u301 login [options]

Options:
  --api-key <key>          API key to save
  --workspace-id <id>      Workspace ID to save
  --base-url <url>         Default API base URL to save
  --api-version <2|3>      Default API version to save
  --domain <domain>        Default domain to save
  --debug                  Save debug=true in config
  -h, --help               Show command help

Notes:
  Missing required values will be prompted interactively.
  Saved config is used with the lowest priority.
  Priority is: command line options > environment variables > ~/.u301/config.json
`;

const STATUS_HELP = `u301 status

Usage:
  u301 status [options]

Options:
  --api-key <key>          API key override
  --workspace-id <id>      Workspace ID override
  --base-url <url>         API base URL override
  --api-version <2|3>      API version override
  --domain <domain>        Default domain override
  --offline                Skip API verification and only inspect local config
  --json                   Print status as JSON
  -h, --help               Show command help

Environment variables:
  U301_API_KEY
  U301_WORKSPACE_ID
  U301_BASE_URL
  U301_API_VERSION
  U301_DOMAIN
  U301_DEBUG

Priority:
  command line options > environment variables > ~/.u301/config.json
`;

function createLineWriter(stream: NodeJS.WriteStream) {
    return (message: string) => {
        stream.write(`${message}\n`);
    };
}

function getStringArg(values: ArgValues, key: string) {
    const value = values[key];
    return typeof value === 'string' ? value : undefined;
}

function hasFlag(values: ArgValues, key: string) {
    return values[key] === true;
}

function isTruthyEnv(value: string | undefined) {
    return value === '1' || value === 'true';
}

function getHelpText(command?: string) {
    if (command === 'shorten') {
        return getShortenHelp();
    }

    if (command === 'login') {
        return LOGIN_HELP;
    }

    if (command === 'status') {
        return STATUS_HELP;
    }

    if (command === 'links') {
        return LINKS_HELP;
    }

    if (command === 'domains') {
        return DOMAINS_HELP;
    }

    if (command === 'analytics') {
        return ANALYTICS_HELP;
    }

    return ROOT_HELP;
}

function writeShortenSummary(stdout: (message: string) => void, result: ShortenResultItem) {
    stdout(`Short link: ${result.shortLink}`);
    stdout(`Original URL: ${result.url}`);
    stdout(`Domain: ${result.domain}`);
    stdout(`Slug: ${result.slug}`);
    stdout(`Reused: ${result.isReused ? 'yes' : 'no'}`);
    if (result.comment) {
        stdout(`Comment: ${result.comment}`);
    }
}

function writeError(
    stderr: (message: string) => void,
    error: unknown,
    asJson: boolean,
) {
    if (asJson) {
        const payload = error && typeof error === 'object' && 'toJSON' in error && typeof error.toJSON === 'function'
            ? error.toJSON()
            : { message: error instanceof Error ? error.message : String(error) };
        stderr(JSON.stringify(payload, null, 2));
        return;
    }

    stderr(error instanceof Error ? error.message : String(error));
}

function resolveApiVersion(
    value: string | undefined,
): U301Options['apiVersion'] | { error: string } | undefined {
    if (!value) {
        return undefined;
    }

    if (value === '2' || value === '3') {
        return value;
    }

    return { error: '`--api-version` must be `2` or `3`.' };
}

function trimToUndefined(value: string | undefined) {
    if (typeof value !== 'string') {
        return undefined;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
}

function normalizeShortLinkInput(value: string) {
    return value.trim().replace(/^https?:\/\//i, '');
}

function getSourceLabel(source: ConfigSource) {
    switch (source) {
        case 'arg':
            return 'command';
        case 'env':
            return 'env';
        case 'stored':
            return 'config';
        case 'default':
            return 'default';
        default:
            return 'missing';
    }
}

function maskSecret(value: string | undefined) {
    if (!value) {
        return '(missing)';
    }

    if (value.length <= 8) {
        return `${value.slice(0, 2)}***`;
    }

    return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function writeJson(stdout: (message: string) => void, value: unknown) {
    stdout(JSON.stringify(value, null, 2));
}

function writeMutationResult(
    stdout: (message: string) => void,
    asJson: boolean,
    message: string,
    payload: Record<string, unknown>,
) {
    if (asJson) {
        writeJson(stdout, payload);
        return;
    }

    stdout(message);
}

function parseIntegerOption(
    rawValue: string | undefined,
    label: string,
    opts: { min?: number; max?: number } = {},
): IntegerOptionResult {
    if (!rawValue) {
        return { value: undefined as number | undefined };
    }

    const parsed = Number.parseInt(rawValue, 10);

    if (!Number.isInteger(parsed)) {
        return { error: `\`${label}\` must be an integer.` };
    }

    if (typeof opts.min === 'number' && parsed < opts.min) {
        return { error: `\`${label}\` must be at least ${opts.min}.` };
    }

    if (typeof opts.max === 'number' && parsed > opts.max) {
        return { error: `\`${label}\` must be at most ${opts.max}.` };
    }

    return { value: parsed };
}

function parseExpiredAtOption(rawValue: string | undefined): ExpiredAtOptionResult {
    if (!rawValue) {
        return { value: undefined };
    }

    const value = new Date(rawValue);

    if (Number.isNaN(value.getTime())) {
        return { error: '`--expired-at` must be a valid ISO-8601 date string.' };
    }

    return { value };
}

function parseAnalyticsRange(rawValue: string | undefined): AnalyticsRangeResult {
    const value = rawValue ?? '7d';

    if (!ranges.includes(value as (typeof ranges)[number])) {
        return { error: `\`--range\` must be one of: ${ranges.join(', ')}.` };
    }

    return { value: value as (typeof ranges)[number] };
}

function parseAnalyticsGranularity(rawValue: string | undefined): AnalyticsGranularityResult {
    const value = rawValue ?? 'day';

    if (!granularities.includes(value as (typeof granularities)[number])) {
        return { error: `\`--granularity\` must be one of: ${granularities.join(', ')}.` };
    }

    return { value: value as (typeof granularities)[number] };
}

async function resolveAuthenticatedConfig(
    values: ArgValues,
    deps: Required<CliDeps>,
): Promise<AuthenticatedConfig | ConfigError> {
    const config = await resolveStoredAndRuntimeConfig(values, deps);

    if ('error' in config) {
        return config;
    }

    if (!config.apiKey || !config.workspaceId) {
        return {
            error: 'Missing credentials. Provide `--api-key` and `--workspace-id`, set `U301_API_KEY` and `U301_WORKSPACE_ID`, or run `u301 login`.',
        };
    }

    return {
        ...config,
        apiKey: config.apiKey,
        workspaceId: config.workspaceId,
    };
}

function createSdkClient(
    deps: Required<CliDeps>,
    config: {
        apiKey: string;
        workspaceId: string;
        apiVersion?: U301Options['apiVersion'];
        baseURL?: string;
        debug?: boolean;
    },
) {
    return deps.createClient({
        apiKey: config.apiKey,
        workspaceId: config.workspaceId,
        apiVersion: config.apiVersion,
        baseURL: config.baseURL,
        debug: config.debug,
    });
}

function toErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}

async function defaultPrompt(label: string, defaultValue?: string) {
    const rl = createInterface({
        input,
        output,
    });

    try {
        const suffix = defaultValue ? ` [${defaultValue}]` : '';
        const answer = await rl.question(`${label}${suffix}: `);
        return answer.trim();
    } finally {
        rl.close();
    }
}

async function resolveStoredAndRuntimeConfig(
    values: ArgValues,
    deps: Required<CliDeps>,
): Promise<ResolvedConfig | ConfigError> {
    let storedConfig: StoredCliConfig;

    try {
        storedConfig = await deps.readStoredConfig();
    } catch (error) {
        return {
            error: `Unable to read CLI config: ${toErrorMessage(error)}`,
        };
    }
    const apiKeyFromArg = getStringArg(values, 'api-key');
    const apiKeyFromEnv = deps.env.U301_API_KEY;
    const apiKeyFromStored = storedConfig.apiKey;
    const workspaceIdFromArg = getStringArg(values, 'workspace-id');
    const workspaceIdFromEnv = deps.env.U301_WORKSPACE_ID;
    const workspaceIdFromStored = storedConfig.workspaceId;
    const baseURLFromArg = getStringArg(values, 'base-url');
    const baseURLFromEnv = deps.env.U301_BASE_URL;
    const baseURLFromStored = storedConfig.baseURL;
    const apiVersionFromArg = getStringArg(values, 'api-version');
    const apiVersionFromEnv = deps.env.U301_API_VERSION;
    const apiVersionFromStored = storedConfig.apiVersion;
    const defaultDomainFromArg = getStringArg(values, 'domain');
    const defaultDomainFromEnv = deps.env.U301_DOMAIN;
    const defaultDomainFromStored = storedConfig.defaultDomain;
    const debugFromArg = hasFlag(values, 'debug');
    const debugFromEnv = isTruthyEnv(deps.env.U301_DEBUG);
    const debugFromStored = storedConfig.debug === true;

    const apiVersionInput = apiVersionFromArg
        ?? apiVersionFromEnv
        ?? apiVersionFromStored;
    const apiVersion = resolveApiVersion(apiVersionInput);

    if (apiVersion && typeof apiVersion === 'object') {
        return { error: apiVersion.error };
    }

    const apiKey = apiKeyFromArg ?? apiKeyFromEnv ?? apiKeyFromStored;
    const workspaceId = workspaceIdFromArg ?? workspaceIdFromEnv ?? workspaceIdFromStored;
    const baseURL = baseURLFromArg ?? baseURLFromEnv ?? baseURLFromStored;
    const defaultDomain = defaultDomainFromArg ?? defaultDomainFromEnv ?? defaultDomainFromStored;
    const debug = debugFromArg || debugFromEnv || debugFromStored;

    const sources: ConfigSources = {
        apiKey: apiKeyFromArg ? 'arg' : apiKeyFromEnv ? 'env' : apiKeyFromStored ? 'stored' : 'missing',
        workspaceId: workspaceIdFromArg ? 'arg' : workspaceIdFromEnv ? 'env' : workspaceIdFromStored ? 'stored' : 'missing',
        baseURL: baseURLFromArg ? 'arg' : baseURLFromEnv ? 'env' : baseURLFromStored ? 'stored' : 'default',
        apiVersion: apiVersionFromArg ? 'arg' : apiVersionFromEnv ? 'env' : apiVersionFromStored ? 'stored' : 'default',
        defaultDomain: defaultDomainFromArg ? 'arg' : defaultDomainFromEnv ? 'env' : defaultDomainFromStored ? 'stored' : 'missing',
        debug: debugFromArg ? 'arg' : debugFromEnv ? 'env' : debugFromStored ? 'stored' : 'default',
    };

    return {
        apiKey,
        workspaceId,
        baseURL,
        apiVersion,
        defaultDomain,
        debug,
        sources,
        storedConfig,
    };
}

async function runStatusCommand(argv: string[], deps: Required<CliDeps>) {
    let parsed;

    try {
        parsed = parseArgs({
            args: argv,
            allowPositionals: true,
            options: {
                help: { type: 'boolean', short: 'h' },
                json: { type: 'boolean' },
                offline: { type: 'boolean' },
                debug: { type: 'boolean' },
                'api-key': { type: 'string' },
                'workspace-id': { type: 'string' },
                'base-url': { type: 'string' },
                'api-version': { type: 'string' },
                domain: { type: 'string' },
            },
        });
    } catch (error) {
        writeError(deps.stderr, error, false);
        deps.stderr('');
        deps.stderr(STATUS_HELP);
        return 1;
    }

    const values = parsed.values as ArgValues;
    const asJson = hasFlag(values, 'json');
    const offline = hasFlag(values, 'offline');

    if (hasFlag(values, 'help')) {
        deps.stdout(STATUS_HELP);
        return 0;
    }

    if (parsed.positionals.length > 0) {
        deps.stderr(`Unexpected extra arguments: ${parsed.positionals.join(' ')}`);
        return 1;
    }

    const config = await resolveStoredAndRuntimeConfig(values, deps);

    if ('error' in config) {
        deps.stderr(config.error);
        return 1;
    }

    const configured = Boolean(config.apiKey && config.workspaceId);
    const storedConfigPath = getDefaultConfigPath();
    const statusReport = {
        configured,
        authenticated: null as boolean | null,
        verificationMode: offline ? 'offline' : 'online',
        configPath: storedConfigPath,
        config: {
            apiKeyPresent: Boolean(config.apiKey),
            apiKeyPreview: maskSecret(config.apiKey),
            workspaceId: config.workspaceId ?? null,
            baseURL: config.baseURL ?? 'https://api.u301.com',
            apiVersion: config.apiVersion ?? '3',
            defaultDomain: config.defaultDomain ?? null,
            debug: config.debug,
            sources: config.sources,
        },
        remote: null as null | {
            domainsTotal: number | null;
            linksTotal: number | null;
            primaryDomain: string | null;
            defaultDomainAvailable: boolean | null;
        },
        warnings: [] as string[],
        quota: {
            available: false,
            reason: 'No documented public quota endpoint found yet.',
        },
        error: null as string | null,
    };

    if (!configured) {
        statusReport.error = 'Missing credentials. Run `u301 login`, or provide `--api-key` and `--workspace-id`.';

        if (asJson) {
            deps.stdout(JSON.stringify(statusReport, null, 2));
        } else {
            deps.stdout('Configured: no');
            deps.stdout(`Config path: ${storedConfigPath}`);
            deps.stdout(`API key: ${maskSecret(config.apiKey)} (${getSourceLabel(config.sources.apiKey)})`);
            deps.stdout(`Workspace ID: ${config.workspaceId ?? '(missing)'} (${getSourceLabel(config.sources.workspaceId)})`);
            deps.stdout(`Default domain: ${config.defaultDomain ?? '(none)'} (${getSourceLabel(config.sources.defaultDomain)})`);
            deps.stdout(`Quota: unavailable (${statusReport.quota.reason})`);
            deps.stderr(statusReport.error);
        }

        return 1;
    }

    if (!offline) {
        const authenticatedConfig: AuthenticatedConfig = {
            ...config,
            apiKey: config.apiKey!,
            workspaceId: config.workspaceId!,
        };
        const client = createSdkClient(deps, authenticatedConfig);

        try {
            const links = await client.links.list({ page: 1, perPage: 10 });

            statusReport.authenticated = true;
            statusReport.remote = {
                domainsTotal: null,
                linksTotal: links.metadata.total,
                primaryDomain: null,
                defaultDomainAvailable: null,
            };

            try {
                const domains = await client.domains.list();
                statusReport.remote.domainsTotal = domains.length;
                statusReport.remote.primaryDomain = domains.find((domain) => domain.isPrimary)?.domain ?? null;
                statusReport.remote.defaultDomainAvailable = config.defaultDomain
                    ? domains.some((domain) => domain.domain === config.defaultDomain)
                    : null;
            } catch (error) {
                statusReport.warnings.push(`Domain metadata unavailable: ${toErrorMessage(error)}`);
            }
        } catch (error) {
            statusReport.authenticated = false;
            statusReport.error = toErrorMessage(error);
        }
    }

    if (asJson) {
        deps.stdout(JSON.stringify(statusReport, null, 2));
        return statusReport.authenticated === false ? 1 : 0;
    }

    deps.stdout(`Configured: yes`);
    deps.stdout(`Verification: ${offline ? 'skipped (offline)' : statusReport.authenticated ? 'ok' : 'failed'}`);
    deps.stdout(`Config path: ${storedConfigPath}`);
    deps.stdout(`API key: ${maskSecret(config.apiKey)} (${getSourceLabel(config.sources.apiKey)})`);
    deps.stdout(`Workspace ID: ${config.workspaceId} (${getSourceLabel(config.sources.workspaceId)})`);
    deps.stdout(`Base URL: ${statusReport.config.baseURL} (${getSourceLabel(config.sources.baseURL)})`);
    deps.stdout(`API version: ${statusReport.config.apiVersion} (${getSourceLabel(config.sources.apiVersion)})`);
    deps.stdout(`Default domain: ${config.defaultDomain ?? '(none)'} (${getSourceLabel(config.sources.defaultDomain)})`);
    deps.stdout(`Debug: ${config.debug ? 'on' : 'off'} (${getSourceLabel(config.sources.debug)})`);

    if (statusReport.remote) {
        deps.stdout(`Domains: ${statusReport.remote.domainsTotal ?? '(unavailable)'}`);
        deps.stdout(`Links: ${statusReport.remote.linksTotal ?? '(unavailable)'}`);
        deps.stdout(`Primary domain: ${statusReport.remote.primaryDomain ?? '(unavailable)'}`);
        if (config.defaultDomain) {
            deps.stdout(
                `Default domain available: ${statusReport.remote.defaultDomainAvailable === null
                    ? '(unavailable)'
                    : statusReport.remote.defaultDomainAvailable
                    ? 'yes'
                    : 'no'}`,
            );
        }
    }

    deps.stdout(`Quota: unavailable (${statusReport.quota.reason})`);

    for (const warning of statusReport.warnings) {
        deps.stdout(`Warning: ${warning}`);
    }

    if (statusReport.error) {
        deps.stderr(statusReport.error);
        return 1;
    }

    return 0;
}

async function runLinksCreateManyCommand(argv: string[], deps: Required<CliDeps>) {
    let parsed;

    try {
        parsed = parseArgs({
            args: argv,
            allowPositionals: true,
            options: {
                help: { type: 'boolean', short: 'h' },
                json: { type: 'boolean' },
                debug: { type: 'boolean' },
                'api-key': { type: 'string' },
                'workspace-id': { type: 'string' },
                'base-url': { type: 'string' },
                'api-version': { type: 'string' },
                domain: { type: 'string' },
                comment: { type: 'string' },
                password: { type: 'string' },
                'expired-at': { type: 'string' },
                'reuse-existing': { type: 'boolean' },
                'throw-on-error': { type: 'boolean' },
            },
        });
    } catch (error) {
        writeError(deps.stderr, error, false);
        deps.stderr('');
        deps.stderr('Usage: u301 links create-many <url...> [options]');
        return 1;
    }

    const values = parsed.values as ArgValues;

    if (hasFlag(values, 'help')) {
        deps.stdout('Usage: u301 links create-many <url...> [--domain <domain>] [--reuse-existing] [--throw-on-error]');
        return 0;
    }

    if (parsed.positionals.length === 0) {
        deps.stderr('Missing required arguments: <url...>');
        return 1;
    }

    const config = await resolveAuthenticatedConfig(values, deps);

    if ('error' in config) {
        deps.stderr(config.error);
        return 1;
    }

    const expiredAtResult = parseExpiredAtOption(getStringArg(values, 'expired-at'));

    if ('error' in expiredAtResult) {
        deps.stderr(expiredAtResult.error);
        return 1;
    }

    const sharedOptions: Omit<ShortenOptions, 'url'> = {};
    const domain = getStringArg(values, 'domain') ?? config.defaultDomain;
    const comment = getStringArg(values, 'comment');
    const password = getStringArg(values, 'password');

    if (domain) {
        sharedOptions.domain = domain;
    }
    if (comment) {
        sharedOptions.comment = comment;
    }
    if (password) {
        sharedOptions.password = password;
    }
    if (expiredAtResult.value) {
        sharedOptions.expiredAt = expiredAtResult.value;
    }
    if (hasFlag(values, 'reuse-existing')) {
        sharedOptions.reuseExisting = true;
    }

    try {
        const client = createSdkClient(deps, config);
        const result = await client.links.createMany(
            parsed.positionals.map((url) => ({ url, ...sharedOptions })),
            { throwOnError: hasFlag(values, 'throw-on-error') },
        );
        writeJson(deps.stdout, result);
        return 0;
    } catch (error) {
        writeError(deps.stderr, error, hasFlag(values, 'json'));
        return 1;
    }
}

async function runLinksGetCommand(argv: string[], deps: Required<CliDeps>) {
    let parsed;

    try {
        parsed = parseArgs({
            args: argv,
            allowPositionals: true,
            options: {
                help: { type: 'boolean', short: 'h' },
                debug: { type: 'boolean' },
                'api-key': { type: 'string' },
                'workspace-id': { type: 'string' },
                'base-url': { type: 'string' },
                'api-version': { type: 'string' },
            },
        });
    } catch (error) {
        writeError(deps.stderr, error, false);
        deps.stderr('');
        deps.stderr('Usage: u301 links get <short-url>');
        return 1;
    }

    if (hasFlag(parsed.values as ArgValues, 'help')) {
        deps.stdout('Usage: u301 links get <short-url>');
        return 0;
    }

    if (parsed.positionals.length !== 1) {
        deps.stderr('Usage: u301 links get <short-url>');
        return 1;
    }

    const config = await resolveAuthenticatedConfig(parsed.values as ArgValues, deps);

    if ('error' in config) {
        deps.stderr(config.error);
        return 1;
    }

    try {
        const client = createSdkClient(deps, config);
        const result = await client.links.get(normalizeShortLinkInput(parsed.positionals[0]!));
        writeJson(deps.stdout, result);
        return 0;
    } catch (error) {
        writeError(deps.stderr, error, false);
        return 1;
    }
}

async function runLinksListCommand(argv: string[], deps: Required<CliDeps>) {
    let parsed;

    try {
        parsed = parseArgs({
            args: argv,
            allowPositionals: true,
            options: {
                help: { type: 'boolean', short: 'h' },
                debug: { type: 'boolean' },
                'api-key': { type: 'string' },
                'workspace-id': { type: 'string' },
                'base-url': { type: 'string' },
                'api-version': { type: 'string' },
                page: { type: 'string' },
                'per-page': { type: 'string' },
            },
        });
    } catch (error) {
        writeError(deps.stderr, error, false);
        deps.stderr('');
        deps.stderr('Usage: u301 links list [--page <n>] [--per-page <n>]');
        return 1;
    }

    if (hasFlag(parsed.values as ArgValues, 'help')) {
        deps.stdout('Usage: u301 links list [--page <n>] [--per-page <n>]');
        return 0;
    }

    if (parsed.positionals.length > 0) {
        deps.stderr(`Unexpected extra arguments: ${parsed.positionals.join(' ')}`);
        return 1;
    }

    const values = parsed.values as ArgValues;
    const pageResult = parseIntegerOption(getStringArg(values, 'page'), '--page', { min: 1 });
    const perPageResult = parseIntegerOption(getStringArg(values, 'per-page'), '--per-page', { min: 10 });

    if ('error' in pageResult) {
        deps.stderr(pageResult.error);
        return 1;
    }
    if ('error' in perPageResult) {
        deps.stderr(perPageResult.error);
        return 1;
    }

    const config = await resolveAuthenticatedConfig(values, deps);

    if ('error' in config) {
        deps.stderr(config.error);
        return 1;
    }

    try {
        const client = createSdkClient(deps, config);
        const result = await client.links.list({
            page: pageResult.value,
            perPage: perPageResult.value,
        });
        writeJson(deps.stdout, result);
        return 0;
    } catch (error) {
        writeError(deps.stderr, error, false);
        return 1;
    }
}

async function runLinksDeleteCommand(argv: string[], deps: Required<CliDeps>) {
    let parsed;

    try {
        parsed = parseArgs({
            args: argv,
            allowPositionals: true,
            options: {
                help: { type: 'boolean', short: 'h' },
                json: { type: 'boolean' },
                debug: { type: 'boolean' },
                'api-key': { type: 'string' },
                'workspace-id': { type: 'string' },
                'base-url': { type: 'string' },
                'api-version': { type: 'string' },
            },
        });
    } catch (error) {
        writeError(deps.stderr, error, false);
        deps.stderr('');
        deps.stderr('Usage: u301 links delete <short-url>');
        return 1;
    }

    const values = parsed.values as ArgValues;

    if (hasFlag(values, 'help')) {
        deps.stdout('Usage: u301 links delete <short-url>');
        return 0;
    }

    if (parsed.positionals.length !== 1) {
        deps.stderr('Usage: u301 links delete <short-url>');
        return 1;
    }

    const config = await resolveAuthenticatedConfig(values, deps);

    if ('error' in config) {
        deps.stderr(config.error);
        return 1;
    }

    const shortUrl = normalizeShortLinkInput(parsed.positionals[0]!);

    try {
        const client = createSdkClient(deps, config);
        await client.links.delete(shortUrl);
        writeMutationResult(
            deps.stdout,
            hasFlag(values, 'json'),
            `Deleted link: ${shortUrl}`,
            { success: true, shortUrl },
        );
        return 0;
    } catch (error) {
        writeError(deps.stderr, error, hasFlag(values, 'json'));
        return 1;
    }
}

async function runLinksCommand(argv: string[], deps: Required<CliDeps>) {
    const [subcommand, ...rest] = argv;

    if (!subcommand || subcommand === 'help' || subcommand === '--help' || subcommand === '-h') {
        deps.stdout(LINKS_HELP);
        return 0;
    }

    if (subcommand === 'create') {
        return runShortenCommand(rest, deps, 'u301 links create');
    }

    if (subcommand === 'create-many') {
        return runLinksCreateManyCommand(rest, deps);
    }

    if (subcommand === 'get') {
        return runLinksGetCommand(rest, deps);
    }

    if (subcommand === 'list') {
        return runLinksListCommand(rest, deps);
    }

    if (subcommand === 'delete') {
        return runLinksDeleteCommand(rest, deps);
    }

    deps.stderr(`Unknown links subcommand: ${subcommand}`);
    deps.stderr('');
    deps.stderr(LINKS_HELP);
    return 1;
}

async function runDomainsListCommand(argv: string[], deps: Required<CliDeps>) {
    let parsed;

    try {
        parsed = parseArgs({
            args: argv,
            allowPositionals: true,
            options: {
                help: { type: 'boolean', short: 'h' },
                debug: { type: 'boolean' },
                'api-key': { type: 'string' },
                'workspace-id': { type: 'string' },
                'base-url': { type: 'string' },
                'api-version': { type: 'string' },
            },
        });
    } catch (error) {
        writeError(deps.stderr, error, false);
        deps.stderr('');
        deps.stderr('Usage: u301 domains list');
        return 1;
    }

    if (hasFlag(parsed.values as ArgValues, 'help')) {
        deps.stdout('Usage: u301 domains list');
        return 0;
    }

    if (parsed.positionals.length > 0) {
        deps.stderr(`Unexpected extra arguments: ${parsed.positionals.join(' ')}`);
        return 1;
    }

    const config = await resolveAuthenticatedConfig(parsed.values as ArgValues, deps);

    if ('error' in config) {
        deps.stderr(config.error);
        return 1;
    }

    try {
        const client = createSdkClient(deps, config);
        const result = await client.domains.list();
        writeJson(deps.stdout, result);
        return 0;
    } catch (error) {
        writeError(deps.stderr, error, false);
        return 1;
    }
}

async function runDomainsCreateCommand(argv: string[], deps: Required<CliDeps>) {
    let parsed;

    try {
        parsed = parseArgs({
            args: argv,
            allowPositionals: true,
            options: {
                help: { type: 'boolean', short: 'h' },
                json: { type: 'boolean' },
                debug: { type: 'boolean' },
                'api-key': { type: 'string' },
                'workspace-id': { type: 'string' },
                'base-url': { type: 'string' },
                'api-version': { type: 'string' },
                'random-slug-length': { type: 'string' },
            },
        });
    } catch (error) {
        writeError(deps.stderr, error, false);
        deps.stderr('');
        deps.stderr('Usage: u301 domains create <domain> [--random-slug-length <n>]');
        return 1;
    }

    const values = parsed.values as ArgValues;

    if (hasFlag(values, 'help')) {
        deps.stdout('Usage: u301 domains create <domain> [--random-slug-length <n>]');
        return 0;
    }

    if (parsed.positionals.length !== 1) {
        deps.stderr('Usage: u301 domains create <domain> [--random-slug-length <n>]');
        return 1;
    }

    const randomSlugLengthResult = parseIntegerOption(
        getStringArg(values, 'random-slug-length'),
        '--random-slug-length',
        { min: 3, max: 10 },
    );

    if ('error' in randomSlugLengthResult) {
        deps.stderr(randomSlugLengthResult.error);
        return 1;
    }

    const config = await resolveAuthenticatedConfig(values, deps);

    if ('error' in config) {
        deps.stderr(config.error);
        return 1;
    }

    const domain = parsed.positionals[0]!;

    try {
        const client = createSdkClient(deps, config);
        await client.domains.create(
            domain,
            randomSlugLengthResult.value === undefined
                ? undefined
                : { randomSlugLength: randomSlugLengthResult.value },
        );
        writeMutationResult(
            deps.stdout,
            hasFlag(values, 'json'),
            `Created domain: ${domain}`,
            { success: true, domain, randomSlugLength: randomSlugLengthResult.value ?? 6 },
        );
        return 0;
    } catch (error) {
        writeError(deps.stderr, error, hasFlag(values, 'json'));
        return 1;
    }
}

async function runDomainsDeleteCommand(argv: string[], deps: Required<CliDeps>) {
    let parsed;

    try {
        parsed = parseArgs({
            args: argv,
            allowPositionals: true,
            options: {
                help: { type: 'boolean', short: 'h' },
                json: { type: 'boolean' },
                debug: { type: 'boolean' },
                'api-key': { type: 'string' },
                'workspace-id': { type: 'string' },
                'base-url': { type: 'string' },
                'api-version': { type: 'string' },
            },
        });
    } catch (error) {
        writeError(deps.stderr, error, false);
        deps.stderr('');
        deps.stderr('Usage: u301 domains delete <domain>');
        return 1;
    }

    const values = parsed.values as ArgValues;

    if (hasFlag(values, 'help')) {
        deps.stdout('Usage: u301 domains delete <domain>');
        return 0;
    }

    if (parsed.positionals.length !== 1) {
        deps.stderr('Usage: u301 domains delete <domain>');
        return 1;
    }

    const config = await resolveAuthenticatedConfig(values, deps);

    if ('error' in config) {
        deps.stderr(config.error);
        return 1;
    }

    const domain = parsed.positionals[0]!;

    try {
        const client = createSdkClient(deps, config);
        await client.domains.delete(domain);
        writeMutationResult(
            deps.stdout,
            hasFlag(values, 'json'),
            `Deleted domain: ${domain}`,
            { success: true, domain },
        );
        return 0;
    } catch (error) {
        writeError(deps.stderr, error, hasFlag(values, 'json'));
        return 1;
    }
}

async function runDomainsDetailsCommand(argv: string[], deps: Required<CliDeps>) {
    let parsed;

    try {
        parsed = parseArgs({
            args: argv,
            allowPositionals: true,
            options: {
                help: { type: 'boolean', short: 'h' },
                debug: { type: 'boolean' },
                'api-key': { type: 'string' },
                'workspace-id': { type: 'string' },
                'base-url': { type: 'string' },
                'api-version': { type: 'string' },
            },
        });
    } catch (error) {
        writeError(deps.stderr, error, false);
        deps.stderr('');
        deps.stderr('Usage: u301 domains details <domain>');
        return 1;
    }

    if (hasFlag(parsed.values as ArgValues, 'help')) {
        deps.stdout('Usage: u301 domains details <domain>');
        return 0;
    }

    if (parsed.positionals.length !== 1) {
        deps.stderr('Usage: u301 domains details <domain>');
        return 1;
    }

    const config = await resolveAuthenticatedConfig(parsed.values as ArgValues, deps);

    if ('error' in config) {
        deps.stderr(config.error);
        return 1;
    }

    try {
        const client = createSdkClient(deps, config);
        const result = await client.domains.getDetails(parsed.positionals[0]!);
        writeJson(deps.stdout, result);
        return 0;
    } catch (error) {
        writeError(deps.stderr, error, false);
        return 1;
    }
}

async function runDomainsActiveCommand(argv: string[], deps: Required<CliDeps>) {
    let parsed;

    try {
        parsed = parseArgs({
            args: argv,
            allowPositionals: true,
            options: {
                help: { type: 'boolean', short: 'h' },
                debug: { type: 'boolean' },
                'api-key': { type: 'string' },
                'workspace-id': { type: 'string' },
                'base-url': { type: 'string' },
                'api-version': { type: 'string' },
            },
        });
    } catch (error) {
        writeError(deps.stderr, error, false);
        deps.stderr('');
        deps.stderr('Usage: u301 domains active <domain>');
        return 1;
    }

    if (hasFlag(parsed.values as ArgValues, 'help')) {
        deps.stdout('Usage: u301 domains active <domain>');
        return 0;
    }

    if (parsed.positionals.length !== 1) {
        deps.stderr('Usage: u301 domains active <domain>');
        return 1;
    }

    const config = await resolveAuthenticatedConfig(parsed.values as ArgValues, deps);

    if ('error' in config) {
        deps.stderr(config.error);
        return 1;
    }

    try {
        const client = createSdkClient(deps, config);
        const result = await client.domains.getActiveStatus(parsed.positionals[0]!);
        writeJson(deps.stdout, result);
        return 0;
    } catch (error) {
        writeError(deps.stderr, error, false);
        return 1;
    }
}

async function runDomainsWaitActiveCommand(argv: string[], deps: Required<CliDeps>) {
    let parsed;

    try {
        parsed = parseArgs({
            args: argv,
            allowPositionals: true,
            options: {
                help: { type: 'boolean', short: 'h' },
                debug: { type: 'boolean' },
                'api-key': { type: 'string' },
                'workspace-id': { type: 'string' },
                'base-url': { type: 'string' },
                'api-version': { type: 'string' },
                'timeout-ms': { type: 'string' },
                'poll-ms': { type: 'string' },
            },
        });
    } catch (error) {
        writeError(deps.stderr, error, false);
        deps.stderr('');
        deps.stderr('Usage: u301 domains wait-active <domain> [--timeout-ms <n>] [--poll-ms <n>]');
        return 1;
    }

    if (hasFlag(parsed.values as ArgValues, 'help')) {
        deps.stdout('Usage: u301 domains wait-active <domain> [--timeout-ms <n>] [--poll-ms <n>]');
        return 0;
    }

    if (parsed.positionals.length !== 1) {
        deps.stderr('Usage: u301 domains wait-active <domain> [--timeout-ms <n>] [--poll-ms <n>]');
        return 1;
    }

    const values = parsed.values as ArgValues;
    const timeoutResult = parseIntegerOption(getStringArg(values, 'timeout-ms'), '--timeout-ms', { min: 1 });
    const pollResult = parseIntegerOption(getStringArg(values, 'poll-ms'), '--poll-ms', { min: 1 });

    if ('error' in timeoutResult) {
        deps.stderr(timeoutResult.error);
        return 1;
    }
    if ('error' in pollResult) {
        deps.stderr(pollResult.error);
        return 1;
    }

    const config = await resolveAuthenticatedConfig(values, deps);

    if ('error' in config) {
        deps.stderr(config.error);
        return 1;
    }

    try {
        const client = createSdkClient(deps, config);
        const result = await client.domains.waitUntilActive(parsed.positionals[0]!, {
            timeoutMs: timeoutResult.value,
            pollMs: pollResult.value,
        });
        writeJson(deps.stdout, result);
        return 0;
    } catch (error) {
        writeError(deps.stderr, error, false);
        return 1;
    }
}

async function runDomainsWaitChangeCommand(argv: string[], deps: Required<CliDeps>) {
    let parsed;

    try {
        parsed = parseArgs({
            args: argv,
            allowPositionals: true,
            options: {
                help: { type: 'boolean', short: 'h' },
                debug: { type: 'boolean' },
                'api-key': { type: 'string' },
                'workspace-id': { type: 'string' },
                'base-url': { type: 'string' },
                'api-version': { type: 'string' },
                'timeout-ms': { type: 'string' },
                'poll-ms': { type: 'string' },
                'emit-initial': { type: 'boolean' },
            },
        });
    } catch (error) {
        writeError(deps.stderr, error, false);
        deps.stderr('');
        deps.stderr('Usage: u301 domains wait-change <domain> [--timeout-ms <n>] [--poll-ms <n>] [--emit-initial]');
        return 1;
    }

    const values = parsed.values as ArgValues;

    if (hasFlag(values, 'help')) {
        deps.stdout('Usage: u301 domains wait-change <domain> [--timeout-ms <n>] [--poll-ms <n>] [--emit-initial]');
        return 0;
    }

    if (parsed.positionals.length !== 1) {
        deps.stderr('Usage: u301 domains wait-change <domain> [--timeout-ms <n>] [--poll-ms <n>] [--emit-initial]');
        return 1;
    }

    const timeoutResult = parseIntegerOption(getStringArg(values, 'timeout-ms'), '--timeout-ms', { min: 1 });
    const pollResult = parseIntegerOption(getStringArg(values, 'poll-ms'), '--poll-ms', { min: 1 });

    if ('error' in timeoutResult) {
        deps.stderr(timeoutResult.error);
        return 1;
    }
    if ('error' in pollResult) {
        deps.stderr(pollResult.error);
        return 1;
    }

    const config = await resolveAuthenticatedConfig(values, deps);

    if ('error' in config) {
        deps.stderr(config.error);
        return 1;
    }

    try {
        const client = createSdkClient(deps, config);
        const result = await client.domains.waitForStatusChange(parsed.positionals[0]!, {
            timeoutMs: timeoutResult.value,
            pollMs: pollResult.value,
            emitInitial: hasFlag(values, 'emit-initial'),
        });
        writeJson(deps.stdout, result);
        return 0;
    } catch (error) {
        writeError(deps.stderr, error, false);
        return 1;
    }
}

async function runDomainsSetRandomCodeLengthCommand(argv: string[], deps: Required<CliDeps>) {
    let parsed;

    try {
        parsed = parseArgs({
            args: argv,
            allowPositionals: true,
            options: {
                help: { type: 'boolean', short: 'h' },
                json: { type: 'boolean' },
                debug: { type: 'boolean' },
                'api-key': { type: 'string' },
                'workspace-id': { type: 'string' },
                'base-url': { type: 'string' },
                'api-version': { type: 'string' },
            },
        });
    } catch (error) {
        writeError(deps.stderr, error, false);
        deps.stderr('');
        deps.stderr('Usage: u301 domains set-random-code-length <domain> <length>');
        return 1;
    }

    const values = parsed.values as ArgValues;

    if (hasFlag(values, 'help')) {
        deps.stdout('Usage: u301 domains set-random-code-length <domain> <length>');
        return 0;
    }

    if (parsed.positionals.length !== 2) {
        deps.stderr('Usage: u301 domains set-random-code-length <domain> <length>');
        return 1;
    }

    const lengthResult = parseIntegerOption(parsed.positionals[1]!, '<length>', { min: 3, max: 10 });

    if ('error' in lengthResult) {
        deps.stderr(lengthResult.error);
        return 1;
    }

    const config = await resolveAuthenticatedConfig(values, deps);

    if ('error' in config) {
        deps.stderr(config.error);
        return 1;
    }

    const domain = parsed.positionals[0]!;
    const lengthRaw = parsed.positionals[1]!;
    const length = lengthResult.value ?? Number.parseInt(lengthRaw, 10);

    try {
        const client = createSdkClient(deps, config);
        await client.domains.setRandomCodeLength(domain, length);
        writeMutationResult(
            deps.stdout,
            hasFlag(values, 'json'),
            `Updated random code length for ${domain} to ${length}`,
            { success: true, domain, randomCodeLength: length },
        );
        return 0;
    } catch (error) {
        writeError(deps.stderr, error, hasFlag(values, 'json'));
        return 1;
    }
}

async function runDomainsSetRedirectCommand(
    argv: string[],
    deps: Required<CliDeps>,
    kind: 'home' | 'not-found',
) {
    let parsed;

    try {
        parsed = parseArgs({
            args: argv,
            allowPositionals: true,
            options: {
                help: { type: 'boolean', short: 'h' },
                json: { type: 'boolean' },
                debug: { type: 'boolean' },
                'api-key': { type: 'string' },
                'workspace-id': { type: 'string' },
                'base-url': { type: 'string' },
                'api-version': { type: 'string' },
            },
        });
    } catch (error) {
        writeError(deps.stderr, error, false);
        deps.stderr('');
        deps.stderr(`Usage: u301 domains ${kind === 'home' ? 'set-home-page-redirect' : 'set-not-found-page-redirect'} <domain> <url>`);
        return 1;
    }

    const values = parsed.values as ArgValues;
    const commandName = kind === 'home' ? 'set-home-page-redirect' : 'set-not-found-page-redirect';

    if (hasFlag(values, 'help')) {
        deps.stdout(`Usage: u301 domains ${commandName} <domain> <url>`);
        return 0;
    }

    if (parsed.positionals.length !== 2) {
        deps.stderr(`Usage: u301 domains ${commandName} <domain> <url>`);
        return 1;
    }

    const config = await resolveAuthenticatedConfig(values, deps);

    if ('error' in config) {
        deps.stderr(config.error);
        return 1;
    }

    const domain = parsed.positionals[0]!;
    const url = parsed.positionals[1]!;

    try {
        const client = createSdkClient(deps, config);

        if (kind === 'home') {
            await client.domains.updateHomePageRedirectUrl(domain, url);
        } else {
            await client.domains.updateNotFoundPageRedirectUrl(domain, url);
        }

        writeMutationResult(
            deps.stdout,
            hasFlag(values, 'json'),
            `Updated ${kind === 'home' ? 'home page' : '404'} redirect for ${domain}`,
            { success: true, domain, url, type: kind === 'home' ? 'homePageRedirectUrl' : 'notFoundPageRedirectUrl' },
        );
        return 0;
    } catch (error) {
        writeError(deps.stderr, error, hasFlag(values, 'json'));
        return 1;
    }
}

async function runDomainsCommand(argv: string[], deps: Required<CliDeps>) {
    const [subcommand, ...rest] = argv;

    if (!subcommand || subcommand === 'help' || subcommand === '--help' || subcommand === '-h') {
        deps.stdout(DOMAINS_HELP);
        return 0;
    }

    if (subcommand === 'list') {
        return runDomainsListCommand(rest, deps);
    }
    if (subcommand === 'create') {
        return runDomainsCreateCommand(rest, deps);
    }
    if (subcommand === 'delete') {
        return runDomainsDeleteCommand(rest, deps);
    }
    if (subcommand === 'details') {
        return runDomainsDetailsCommand(rest, deps);
    }
    if (subcommand === 'active') {
        return runDomainsActiveCommand(rest, deps);
    }
    if (subcommand === 'wait-active') {
        return runDomainsWaitActiveCommand(rest, deps);
    }
    if (subcommand === 'wait-change') {
        return runDomainsWaitChangeCommand(rest, deps);
    }
    if (subcommand === 'set-random-code-length') {
        return runDomainsSetRandomCodeLengthCommand(rest, deps);
    }
    if (subcommand === 'set-home-page-redirect') {
        return runDomainsSetRedirectCommand(rest, deps, 'home');
    }
    if (subcommand === 'set-not-found-page-redirect') {
        return runDomainsSetRedirectCommand(rest, deps, 'not-found');
    }

    deps.stderr(`Unknown domains subcommand: ${subcommand}`);
    deps.stderr('');
    deps.stderr(DOMAINS_HELP);
    return 1;
}

async function runAnalyticsClicksCommand(argv: string[], deps: Required<CliDeps>) {
    let parsed;

    try {
        parsed = parseArgs({
            args: argv,
            allowPositionals: true,
            options: {
                help: { type: 'boolean', short: 'h' },
                debug: { type: 'boolean' },
                'api-key': { type: 'string' },
                'workspace-id': { type: 'string' },
                'base-url': { type: 'string' },
                'api-version': { type: 'string' },
                range: { type: 'string' },
                granularity: { type: 'string' },
                timezone: { type: 'string' },
            },
        });
    } catch (error) {
        writeError(deps.stderr, error, false);
        deps.stderr('');
        deps.stderr('Usage: u301 analytics clicks [--range <range>] [--granularity <granularity>] [--timezone <tz>]');
        return 1;
    }

    const values = parsed.values as ArgValues;

    if (hasFlag(values, 'help')) {
        deps.stdout('Usage: u301 analytics clicks [--range <range>] [--granularity <granularity>] [--timezone <tz>]');
        return 0;
    }

    if (parsed.positionals.length > 0) {
        deps.stderr(`Unexpected extra arguments: ${parsed.positionals.join(' ')}`);
        return 1;
    }

    const rangeResult = parseAnalyticsRange(getStringArg(values, 'range'));
    const granularityResult = parseAnalyticsGranularity(getStringArg(values, 'granularity'));

    if ('error' in rangeResult) {
        deps.stderr(rangeResult.error);
        return 1;
    }
    if ('error' in granularityResult) {
        deps.stderr(granularityResult.error);
        return 1;
    }

    const config = await resolveAuthenticatedConfig(values, deps);

    if ('error' in config) {
        deps.stderr(config.error);
        return 1;
    }

    try {
        const client = createSdkClient(deps, config);
        const result = await client.analytics.getClicks({
            range: rangeResult.value,
            granularity: granularityResult.value,
            timezone: getStringArg(values, 'timezone'),
        });
        writeJson(deps.stdout, result);
        return 0;
    } catch (error) {
        writeError(deps.stderr, error, false);
        return 1;
    }
}

async function runAnalyticsTopCommand(argv: string[], deps: Required<CliDeps>) {
    let parsed;

    try {
        parsed = parseArgs({
            args: argv,
            allowPositionals: true,
            options: {
                help: { type: 'boolean', short: 'h' },
                debug: { type: 'boolean' },
                'api-key': { type: 'string' },
                'workspace-id': { type: 'string' },
                'base-url': { type: 'string' },
                'api-version': { type: 'string' },
                range: { type: 'string' },
                timezone: { type: 'string' },
            },
        });
    } catch (error) {
        writeError(deps.stderr, error, false);
        deps.stderr('');
        deps.stderr('Usage: u301 analytics top <metric> [--range <range>] [--timezone <tz>]');
        return 1;
    }

    const values = parsed.values as ArgValues;

    if (hasFlag(values, 'help')) {
        deps.stdout('Usage: u301 analytics top <metric> [--range <range>] [--timezone <tz>]');
        deps.stdout('Metrics: browsers, device-types, short-links, bots, device-vendors, operating-systems, countries, referers, languages, cities');
        return 0;
    }

    if (parsed.positionals.length !== 1) {
        deps.stderr('Usage: u301 analytics top <metric> [--range <range>] [--timezone <tz>]');
        return 1;
    }

    const metric = parsed.positionals[0]!;
    const rangeResult = parseAnalyticsRange(getStringArg(values, 'range'));

    if ('error' in rangeResult) {
        deps.stderr(rangeResult.error);
        return 1;
    }

    const config = await resolveAuthenticatedConfig(values, deps);

    if ('error' in config) {
        deps.stderr(config.error);
        return 1;
    }

    const client = createSdkClient(deps, config);
    const params = {
        range: rangeResult.value,
        timezone: getStringArg(values, 'timezone'),
    };

    try {
        let result;

        switch (metric) {
            case 'browsers':
                result = await client.analytics.getTopBrowsers(params);
                break;
            case 'device-types':
                result = await client.analytics.getTopDeviceTypes(params);
                break;
            case 'short-links':
                result = await client.analytics.getTopShortLinks(params);
                break;
            case 'bots':
                result = await client.analytics.getTopBots(params);
                break;
            case 'device-vendors':
                result = await client.analytics.getTopDeviceVendors(params);
                break;
            case 'operating-systems':
                result = await client.analytics.getTopOperatingSystems(params);
                break;
            case 'countries':
                result = await client.analytics.getTopCountries(params);
                break;
            case 'referers':
                result = await client.analytics.getTopReferers(params);
                break;
            case 'languages':
                result = await client.analytics.getTopLanguages(params);
                break;
            case 'cities':
                result = await client.analytics.getTopCities(params);
                break;
            default:
                deps.stderr(`Unknown analytics metric: ${metric}`);
                deps.stderr('Metrics: browsers, device-types, short-links, bots, device-vendors, operating-systems, countries, referers, languages, cities');
                return 1;
        }

        writeJson(deps.stdout, result);
        return 0;
    } catch (error) {
        writeError(deps.stderr, error, false);
        return 1;
    }
}

async function runAnalyticsCommand(argv: string[], deps: Required<CliDeps>) {
    const [subcommand, ...rest] = argv;

    if (!subcommand || subcommand === 'help' || subcommand === '--help' || subcommand === '-h') {
        deps.stdout(ANALYTICS_HELP);
        return 0;
    }

    if (subcommand === 'clicks') {
        return runAnalyticsClicksCommand(rest, deps);
    }

    if (subcommand === 'top') {
        return runAnalyticsTopCommand(rest, deps);
    }

    deps.stderr(`Unknown analytics subcommand: ${subcommand}`);
    deps.stderr('');
    deps.stderr(ANALYTICS_HELP);
    return 1;
}

async function runShortenCommand(
    argv: string[],
    deps: Required<CliDeps>,
    commandPath = 'u301 shorten',
) {
    const helpText = getShortenHelp(commandPath);
    let parsed;

    try {
        parsed = parseArgs({
            args: argv,
            allowPositionals: true,
            options: {
                help: { type: 'boolean', short: 'h' },
                json: { type: 'boolean' },
                verbose: { type: 'boolean' },
                debug: { type: 'boolean' },
                'api-key': { type: 'string' },
                'workspace-id': { type: 'string' },
                'base-url': { type: 'string' },
                'api-version': { type: 'string' },
                domain: { type: 'string' },
                slug: { type: 'string' },
                comment: { type: 'string' },
                password: { type: 'string' },
                'expired-at': { type: 'string' },
                'reuse-existing': { type: 'boolean' },
            },
        });
    } catch (error) {
        writeError(deps.stderr, error, false);
        deps.stderr('');
        deps.stderr(helpText);
        return 1;
    }

    const values = parsed.values as ArgValues;
    const asJson = hasFlag(values, 'json');

    if (hasFlag(values, 'help')) {
        deps.stdout(helpText);
        return 0;
    }

    const url = parsed.positionals[0];

    if (!url) {
        deps.stderr('Missing required argument: <url>');
        deps.stderr('');
        deps.stderr(helpText);
        return 1;
    }

    if (parsed.positionals.length > 1) {
        deps.stderr(`Unexpected extra arguments: ${parsed.positionals.slice(1).join(' ')}`);
        return 1;
    }

    const config = await resolveAuthenticatedConfig(values, deps);

    if ('error' in config) {
        deps.stderr(config.error);
        return 1;
    }
    const expiredAtResult = parseExpiredAtOption(getStringArg(values, 'expired-at'));

    if ('error' in expiredAtResult) {
        deps.stderr(expiredAtResult.error);
        return 1;
    }

    const shortenOptions: ShortenOptions = {
        url,
    };

    const domain = getStringArg(values, 'domain') ?? config.defaultDomain;
    const slug = getStringArg(values, 'slug');
    const comment = getStringArg(values, 'comment');
    const password = getStringArg(values, 'password');

    if (domain) {
        shortenOptions.domain = domain;
    }
    if (slug) {
        shortenOptions.slug = slug;
    }
    if (comment) {
        shortenOptions.comment = comment;
    }
    if (password) {
        shortenOptions.password = password;
    }
    if (expiredAtResult.value) {
        shortenOptions.expiredAt = expiredAtResult.value;
    }
    if (hasFlag(values, 'reuse-existing')) {
        shortenOptions.reuseExisting = true;
    }

    try {
        const client = deps.createClient({
            apiKey: config.apiKey,
            workspaceId: config.workspaceId,
            apiVersion: config.apiVersion,
            baseURL: config.baseURL,
            debug: config.debug,
        });
        const result = await client.links.create(shortenOptions);

        if (asJson) {
            deps.stdout(JSON.stringify(result, null, 2));
            return 0;
        }

        if (hasFlag(values, 'verbose')) {
            writeShortenSummary(deps.stdout, result);
            return 0;
        }

        deps.stdout(result.shortLink);
        return 0;
    } catch (error) {
        writeError(deps.stderr, error, asJson);
        return 1;
    }
}

async function runLoginCommand(argv: string[], deps: Required<CliDeps>) {
    let parsed;

    try {
        parsed = parseArgs({
            args: argv,
            allowPositionals: true,
            options: {
                help: { type: 'boolean', short: 'h' },
                debug: { type: 'boolean' },
                'api-key': { type: 'string' },
                'workspace-id': { type: 'string' },
                'base-url': { type: 'string' },
                'api-version': { type: 'string' },
                domain: { type: 'string' },
            },
        });
    } catch (error) {
        writeError(deps.stderr, error, false);
        deps.stderr('');
        deps.stderr(LOGIN_HELP);
        return 1;
    }

    const values = parsed.values as ArgValues;

    if (hasFlag(values, 'help')) {
        deps.stdout(LOGIN_HELP);
        return 0;
    }

    if (parsed.positionals.length > 0) {
        deps.stderr(`Unexpected extra arguments: ${parsed.positionals.join(' ')}`);
        return 1;
    }

    let storedConfig: StoredCliConfig;

    try {
        storedConfig = await deps.readStoredConfig();
    } catch (error) {
        deps.stderr(`Unable to read CLI config: ${toErrorMessage(error)}`);
        return 1;
    }
    const apiKey = trimToUndefined(
        getStringArg(values, 'api-key')
        ?? deps.env.U301_API_KEY
        ?? await deps.prompt('API key', storedConfig.apiKey),
    );
    const workspaceId = trimToUndefined(
        getStringArg(values, 'workspace-id')
        ?? deps.env.U301_WORKSPACE_ID
        ?? await deps.prompt('Workspace ID', storedConfig.workspaceId),
    );

    if (!apiKey || !workspaceId) {
        deps.stderr('`apiKey` and `workspaceId` are required to save CLI config.');
        return 1;
    }

    const baseURL = trimToUndefined(
        getStringArg(values, 'base-url')
        ?? deps.env.U301_BASE_URL
        ?? storedConfig.baseURL,
    );
    const defaultDomain = trimToUndefined(
        getStringArg(values, 'domain')
        ?? deps.env.U301_DOMAIN
        ?? storedConfig.defaultDomain,
    );
    const apiVersionInput = trimToUndefined(
        getStringArg(values, 'api-version')
        ?? deps.env.U301_API_VERSION
        ?? storedConfig.apiVersion,
    );
    const apiVersion = resolveApiVersion(apiVersionInput);

    if (apiVersion && typeof apiVersion === 'object') {
        deps.stderr(apiVersion.error);
        return 1;
    }

    const configToWrite: StoredCliConfig = {
        apiKey,
        workspaceId,
    };

    if (baseURL) {
        configToWrite.baseURL = baseURL;
    }
    if (defaultDomain) {
        configToWrite.defaultDomain = defaultDomain;
    }
    if (apiVersion) {
        configToWrite.apiVersion = apiVersion;
    }
    if (hasFlag(values, 'debug')) {
        configToWrite.debug = true;
    } else if (storedConfig.debug === true) {
        configToWrite.debug = true;
    }

    const configPath = await deps.writeStoredConfig(configToWrite);
    deps.stdout(`Saved CLI config to ${configPath}`);
    deps.stdout('Priority: command line options > environment variables > stored config');
    return 0;
}

export async function run(argv: string[] = process.argv.slice(2), deps: CliDeps = {}) {
    const resolvedDeps: Required<CliDeps> = {
        betaNotice: deps.betaNotice ?? BETA_NOTICE,
        createClient: deps.createClient ?? ((options) => new U301(options)),
        env: deps.env ?? process.env,
        prompt: deps.prompt ?? defaultPrompt,
        readStoredConfig: deps.readStoredConfig ?? (() => readStoredCliConfig()),
        stderr: deps.stderr ?? createLineWriter(process.stderr),
        stdout: deps.stdout ?? createLineWriter(process.stdout),
        writeStoredConfig: deps.writeStoredConfig ?? ((config) => writeStoredCliConfig(config)),
    };

    const [command, ...rest] = argv;
    const isRootHelp = !command || command === '--help' || command === '-h' || (command === 'help' && rest.length === 0);

    if (isRootHelp) {
        if (resolvedDeps.betaNotice) {
            resolvedDeps.stderr(resolvedDeps.betaNotice);
        }
        resolvedDeps.stdout(ROOT_HELP);
        return 0;
    }

    if (command === 'help') {
        resolvedDeps.stdout(getHelpText(rest[0]));
        return 0;
    }

    if (command === 'version' || command === '--version' || command === '-v') {
        resolvedDeps.stdout(`u301 ${SDK_VERSION}`);
        return 0;
    }

    if (command === 'status') {
        return runStatusCommand(rest, resolvedDeps);
    }

    if (command === 'login') {
        return runLoginCommand(rest, resolvedDeps);
    }

    if (command === 'links') {
        return runLinksCommand(rest, resolvedDeps);
    }

    if (command === 'domains') {
        return runDomainsCommand(rest, resolvedDeps);
    }

    if (command === 'analytics') {
        return runAnalyticsCommand(rest, resolvedDeps);
    }

    if (command === 'shorten') {
        return runShortenCommand(rest, resolvedDeps);
    }

    resolvedDeps.stderr(`Unknown command: ${command}`);
    resolvedDeps.stderr('');
    resolvedDeps.stderr(ROOT_HELP);
    return 1;
}

function isDirectExecution() {
    const entrypoint = process.argv[1];

    if (!entrypoint) {
        return false;
    }

    try {
        return realpathSync(entrypoint) === realpathSync(fileURLToPath(import.meta.url));
    } catch {
        return false;
    }
}

if (isDirectExecution()) {
    process.exitCode = await run();
}
