
import { BaseService } from "./base-service";
import * as v from 'valibot'

export interface URLShortenerOptions {
    apiKey: string;
    workspaceId: string;
}

/**
 * U301 URL Shortener Options
 * 
 * @param url - The URL to shorten
 * @param domain - The domain to use for the short URL
 * @param slug - The slug to use for the short URL
 * @param comment - The comment to associate with the short URL
 */
export interface ShortenOptions {
    /**
     * The URL to shorten
     * must be a valid URL starting with http:// or https://
     * @example https://www.example.com
     */
    url: string
    /**
     * The domain to use for the short URL
     * You can use your own domain
     * @default u301.co
     */
    domain?: string
    slug?: string
    /**
     * The comment to associate with the short URL
     */
    comment?: string
}

export const ShortenLinkSchema = v.object({
    id: v.pipe(v.string(), v.uuid()),
    domainName: v.string(),
    slug: v.string(),
    isCustomSlug: v.boolean(),
    shortUrl: v.string(),
    originalUrl: v.pipe(v.string(), v.url()),
    allowSearchEngineIndexing: v.boolean(),
    archived: v.boolean(),
    suspended: v.boolean(),
    statsClicks: v.optional(v.number()),
    expiresAt: v.nullish(v.pipe(v.string(), v.isoTimestamp())),
    userId: v.pipe(v.string(), v.uuid()),
    workspaceId: v.pipe(v.string(), v.uuid()),
    comment: v.string(),
    createdAt: v.pipe(v.string(), v.isoTimestamp()),
    updatedAt: v.nullish(v.pipe(v.string(), v.isoTimestamp()))
})

export type ShortenLink = v.InferOutput<typeof ShortenLinkSchema>

export class URLShortener extends BaseService {
    apiPath = '/shorten';
    create(options: ShortenOptions): Promise<void>;
    create(options: string): Promise<void>;
    async create(options: ShortenOptions | string) {
        if (typeof options === 'string') {
            options = { url: options };
        }
    }

    async list(params: ListParams = {}) {
        params.workspaceId ??= this.workspaceId
        const schema = v.object({
            links: v.array(ShortenLinkSchema),
            metadata: v.object({
                total: v.number(),
                perPage: v.number(),
                page: v.number(),
            }),
        })
        const result = await this.fetcher<v.InferOutput<typeof schema>>(`${this.apiPath}/list`, {
            query: params
        })
        return v.parse(schema, result)
    }
}

export interface ListParams {
    workspaceId?: string
    /**
     * The number of items to return
     * @default 10
     */
    perPage?: number
    /**
     * The offset to start from
     * @default 1
     */
    page?: number
}