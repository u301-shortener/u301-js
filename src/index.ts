import { ofetch } from 'ofetch';
import { BaseService } from './base-service';
import { toU301Error } from './errors';
import { URLShortener } from './url-shortener';
import { Analytics } from './analytics';
import { SDK_VERSION } from './version';

export interface U301Options {
    apiKey: string;
    workspaceId: string;
    apiVersion?: '2' | '3'
    /**
     * Base URL for the API. Defaults to https://api.u301.com
     */
    baseURL?: string
    /** Enable debug request logging in development */
    debug?: boolean
}

export class U301 extends BaseService {
    apiVersion: U301Options['apiVersion'];
    links: URLShortener;
    analytics: Analytics;
    constructor(options: U301Options) {
        const apiVersion = options.apiVersion || '3';
        const baseURL = options.baseURL || `https://api.u301.com`;
        const debugEnabled = options.debug === true || (process.env.DEBUG ?? '').includes('u301-js');
        const fetcher = ofetch.create({
            baseURL: `${baseURL}/v${apiVersion}`,
            headers: {
                'Authorization': `Bearer ${options.apiKey}`,
                'User-Agent': `u301-js/${SDK_VERSION}`,
            },
            query: {
                workspaceId: options.workspaceId,
            },
            responseType: 'json',
            onRequest({ request, options }) {
                if (!debugEnabled) return;
                const url = typeof request === 'string' ? request : request.url;
                const method = options.method ?? 'GET';
                const params = 'params' in options ? options.params : undefined;
                const body = 'body' in options ? options.body : undefined;
                if (params || body) {
                    console.debug(`[u301-js] -> ${method} ${url}`, { params, body });
                } else {
                    console.debug(`[u301-js] -> ${method} ${url}`);
                }
            },
            onResponse({ request, response }) {
                if (!debugEnabled) return;
                const url = typeof request === 'string' ? request : request.url;
                console.debug(`[u301-js] <- ${response.status} ${url}`);
            },
            async onResponseError({ request, response, error }) {
                const uerr = toU301Error(response, error)
                if (debugEnabled) {
                    const url = typeof request === 'string' ? request : request.url;
                    const status = response?.status ?? 0;
                    console.debug(`[u301-js] x  ${status} ${url} ${uerr.message}`, { error: uerr.toJSON() });
                }
                throw uerr
            },
        }) 
        const initializerOptions = {
            fetcher,
            apiKey: options.apiKey,
            workspaceId: options.workspaceId,
        }
        super(initializerOptions);
        this.apiVersion = apiVersion;
        this.links = new URLShortener(initializerOptions);
        this.analytics = new Analytics(initializerOptions);
    }
}

export { URLShortener, Analytics }
export * from './errors'