
import { BaseService } from "./base-service";
import { ParseError, ValidationError } from './errors'
import * as v from 'valibot'

export class URLShortener extends BaseService {
    apiPath = '/shorten';
    create(options: ShortenOptions): Promise<ShortenResultItem>;
    create(options: string): Promise<ShortenResultItem>;
    async create(options: ShortenOptions | string) {
        if (typeof options === 'string') {
            options = { url: options };
        }
        const shortenResult = await this.fetcher<ShortenResult>(`${this.apiPath}/bulk`, {
            method: 'POST',
            body: JSON.stringify([
                options
            ])
        })
        const results = v.safeParse(ShortenResult, shortenResult)
        if (results.success) {
            const [item] = results.output
            if (item && 'error' in item && item.error) {
                throw new ValidationError(item.message || item.error, { details: item })
            }
            return item
        }
        throw new ParseError('Invalid ShortenResult', { details: results.issues })
    }

    /**
     * Create multiple short links in a single request.
     * Strings in inputs are treated as { url }.
     *
     * @param inputs Array of items; strings are interpreted as URLs.
     * @param opts Optional behavior flags.
     * @param opts.throwOnError When true, throws ValidationError if any item fails; when false, returns successes and errors together. Severe request-level errors always throw regardless of opts.throwOnError (e.g., blocked domain policies enforced at the request level).
     * @returns ShortenResult array. Contains success and error items unless throwOnError=true.
     * @throws ValidationError When throwOnError is true and any item fails.
     * @throws ParseError When response shape cannot be parsed.
     * @throws UnauthorizedError | ForbiddenError | RateLimitError | ServerError | NetworkError for request-level failures.
     */
    createMany(inputs: (ShortenOptions | string)[], opts?: { throwOnError?: boolean }): Promise<ShortenResult>;
    async createMany(inputs: (ShortenOptions | string)[], opts: { throwOnError?: boolean } = {}) {
        const normalized = inputs.map(i => typeof i === 'string' ? { url: i } : i)
        const shortenResult = await this.fetcher<ShortenResult>(`${this.apiPath}/bulk`, {
            method: 'POST',
            body: JSON.stringify(normalized)
        })
        const parsed = v.safeParse(ShortenResult, shortenResult)
        if (!parsed.success) {
            throw new ParseError('Invalid ShortenResult', { details: parsed.issues })
        }
        const output = parsed.output
        if (opts.throwOnError) {
            const errors = output.filter(i => 'error' in i && i.error)
            if (errors.length) {
                throw new ValidationError('Bulk create failed', { details: errors })
            }
        }
        return output
    }

    async list(params: ListParams = {}): Promise<ShortenLinkList> {
        params.workspaceId ??= this.workspaceId
        const schema = v.object({
            links: v.array(ShortenLinkSchema),
            metadata: v.object({
                total: v.number(),
                perPage: v.number(),
                page: v.number(),
            }),
        })
        const result = await this.fetcher<ShortenLinkList>(`${this.apiPath}/list`, {
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
export interface URLShortenerOptions {
    /**
     * The API key for authentication
     * you can get it from https://u301.com/dashboard/api-keys
     */
    apiKey: string;
    /**
     * The workspace ID, UUID v7 format
     */
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
     * The password to protect the short URL
     * must be at least 6 characters long
     */
    password?: string
    /**
     * The expiration date for the short URL
     * must be in the future
     */
    expiredAt?: Date
    /**
     * Whether to reuse an existing short URL if one already exists for the given URL
     * @default false
     */
    reuseExisting?: boolean
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

export const ShortenResultItem = v.object({
    id: v.pipe(v.string(), v.uuid()),
    url: v.pipe(v.string(), v.url()),
    slug: v.string(),
    isCustomSlug: v.boolean(),
    domain: v.string(),
    isReused: v.boolean(),
    shortLink: v.string(),
    comment: v.string()
}) satisfies v.GenericSchema<ShortenResultItem>;
export interface ShortenResultItem {
    /**
     * The unique identifier for the short link in UUID v7 format
     */
    id: string
    /**
     * The original URL that was shortened
     */
    url: string
    /**
     * The path for the short link
     */
    slug: string
    /**
     * Whether the slug is custom or generated by the system
     */
    isCustomSlug: boolean
    /**
     * The domain name for the short link
     * @example u301.co
     */
    domain: string
    /**
     * Whether the short link is a reused existing short link
     */
    isReused: boolean
    /**
     * The full short URL for the short link
     * @example u301.co/abc123
     */
    shortLink: string
    /**
     * The comment associated with the short link
     */
    comment: string
}
export const ShortenErrorItem = v.object({
    url: v.pipe(v.string(), v.url()),
    error: v.string(),
    message: v.optional(v.string()),
}) satisfies v.GenericSchema<ShortenErrorItem>;

export interface ShortenErrorItem {
    /**
     * The URL that failed to shorten
     */
    url: string
    error: string
    message?: string
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
}) satisfies v.GenericSchema<ShortenLink>;

export interface ShortenLink {
    /**
     * The unique identifier for the short link in UUID v7 format
     */
    id: string
    /**
     * The domain name for the short link
     * @example u301.co
     */
    domainName: string
    /**
     * The path for the short link
     * @example abc123
     */
    slug: string
    /**
     * Whether the slug is custom or generated by the system
     */
    isCustomSlug: boolean
    /**
     * The short URL for the short link
     * @example https://u301.co/abc123
     */
    shortUrl: string
    /**
     * The original URL for the short link
     * @example https://www.example.com
     */
    originalUrl: string
    /**
     * Whether the short link is indexed by search engines
     */
    allowSearchEngineIndexing: boolean
    /**
     * Whether the short link is archived
     */
    archived: boolean
    /**
     * Whether the short link is suspended
     */
    suspended: boolean
    /**
     * The number of clicks for the short link
     */
    statsClicks?: number
    /**
     * The expiration date for the short link
     * format: yyyy-mm-ddThh:mm:ss.sssZ
     * @example 2023-12-31T23:59:59Z
     */
    expiresAt?: string | null
    /**
     * The user ID for the short link
     */
    userId: string
    /**
     * The workspace ID for the short link
     */
    workspaceId: string
    /**
     * The comment for the short link
     */
    comment: string
    /**
     * The creation date for the short link
     * format: yyyy-mm-ddThh:mm:ss.sssZ
     * @example 2023-12-31T23:59:59Z
     */
    createdAt: string
    /**
     * The last update date for the short link
     * format: yyyy-mm-ddThh:mm:ss.sssZ
     * @example 2023-12-31T23:59:59Z
     */
    updatedAt?: string | null
}
export interface ShortenLinkList {
    links: ShortenLink[]
    metadata: {
        /**
         * The total number of short links
         */
        total: number,
        /**
         * The number of short links per page
         */
        perPage: number,
        /**
         * The current page number
         */
        page: number,
    }
}
export const ShortenResult = v.array(v.union([ShortenResultItem, ShortenErrorItem]))
export type ShortenResult = Array<ShortenErrorItem | ShortenResultItem>