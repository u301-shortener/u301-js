import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { U301Options } from './index';

export interface StoredCliConfig {
    apiKey?: string;
    workspaceId?: string;
    baseURL?: string;
    apiVersion?: U301Options['apiVersion'];
    defaultDomain?: string;
    debug?: boolean;
}

const CONFIG_DIRNAME = '.u301';
const CONFIG_FILENAME = 'config.json';

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getOptionalString(record: Record<string, unknown>, key: string) {
    const value = record[key];
    return typeof value === 'string' ? value : undefined;
}

export function getDefaultConfigPath() {
    const homeDirectory = process.env.HOME || process.env.USERPROFILE || homedir();
    return join(homeDirectory, CONFIG_DIRNAME, CONFIG_FILENAME);
}

export async function readStoredCliConfig(configPath = getDefaultConfigPath()): Promise<StoredCliConfig> {
    try {
        const raw = await readFile(configPath, 'utf8');
        const parsed: unknown = JSON.parse(raw);

        if (!isPlainObject(parsed)) {
            throw new Error(`Invalid config file at ${configPath}: expected a JSON object.`);
        }

        const apiVersion = getOptionalString(parsed, 'apiVersion');
        const debug = parsed.debug;

        return {
            apiKey: getOptionalString(parsed, 'apiKey'),
            workspaceId: getOptionalString(parsed, 'workspaceId'),
            baseURL: getOptionalString(parsed, 'baseURL'),
            apiVersion: apiVersion === '2' || apiVersion === '3' ? apiVersion : undefined,
            defaultDomain: getOptionalString(parsed, 'defaultDomain') ?? getOptionalString(parsed, 'domain'),
            debug: typeof debug === 'boolean' ? debug : undefined,
        };
    } catch (error) {
        if (typeof error === 'object' && error && 'code' in error && error.code === 'ENOENT') {
            return {};
        }

        throw error;
    }
}

export async function writeStoredCliConfig(
    config: StoredCliConfig,
    configPath = getDefaultConfigPath(),
) {
    await mkdir(dirname(configPath), {
        recursive: true,
        mode: 0o700,
    });

    await writeFile(
        configPath,
        `${JSON.stringify(config, null, 2)}\n`,
        {
            encoding: 'utf8',
            mode: 0o600,
        },
    );

    return configPath;
}
