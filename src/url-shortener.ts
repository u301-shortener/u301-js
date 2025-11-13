
import { BaseService } from "./base-service";
import { ParseError, ValidationError } from './errors'
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
    comment: v.string()
})
export const ShortenErrorItem = v.object({
    url: v.pipe(v.string(), v.url()),
    error: v.string(),
    message: v.optional(v.string()),
})
export type ShortenResultItem = v.InferOutput<typeof ShortenResultItem>
export type ShortenErrorItem = v.InferOutput<typeof ShortenErrorItem>
export const ShortenResult = v.array(v.union([ShortenResultItem, ShortenErrorItem]))
export type ShortenResult = v.InferOutput<typeof ShortenResult>

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