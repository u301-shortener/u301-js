import { BaseService } from "./base-service";
import * as v from 'valibot'

export class Domain extends BaseService {
    apiPath = '/shorten';

    async list() {
        const res = await this.fetcher(this.apiPath + '/domains', {
            method: 'GET',
        });
        return v.parse(v.array(DomainSchema), res);
    }

    /**
     * Create a domain
     * @param domain The domain name
     * @param opts The options
     * @param opts.randomSlugLength The length of the random slug, 3-10
     * @returns The domain status
     */
    async create(domain: string, opts: { randomSlugLength?: number } = { randomSlugLength: 6 }) {
        await this.fetcher<{ message: string }>(`${this.apiPath}/domains`, {
            method: 'PUT',
            body: JSON.stringify({
                domain,
                shortCodeLength: opts.randomSlugLength,
            }),
        })
        return true
    }
    /**
     * Delete a domain
     * @param domain The domain name
     * @returns 
     */
    async delete(domain: string) {
        await this.fetcher(`${this.apiPath}/domains/${encodeURIComponent(domain)}`, {
            method: 'DELETE',
        })
        return true
    }
    /**
     * set random slug length
     * @param domain 
     * @param length 
     * @deprecated use `setRandomCodeLength` instead
     * @returns 
     */
    async setSlugLength(domain: string, length: number) {
        return this.setRandomCodeLength(domain, length)
    }
    /**
     * set random short code length
     * @param domain 
     * @param length 
     * @returns 
     */
    async setRandomCodeLength(domain: string, length: number) {
        const res = await this.fetcher<{ success: boolean }>(`${this.apiPath}/domains/${encodeURIComponent(domain)}`, {
            method: 'PATCH',
            body: JSON.stringify({ randomCodeLength: length }),
        })
        v.parse(v.object({
            success: v.boolean(),
        }), res)
        return true
    }
    /**
     * update home page redirect url
     * @param domain The domain name
     * @param url The home page redirect url
     * @docs https://u301.com/docs/domains/update-home-page-redirect-url
     * @returns 
     */
    async updateHomePageRedirectUrl(domain: string, url: string) {
        const res = await this.fetcher<{ success: boolean }>(`${this.apiPath}/domains/${encodeURIComponent(domain)}`, {
            method: 'PATCH',
            body: JSON.stringify({ homePageRedirectUrl: url }),
        })
        v.parse(v.object({
            success: v.boolean(),
        }), res)
        return true
    }
    /**
     * update not found page redirect url
     * @param domain The domain name
     * @param url The 404 page redirect url
     * @docs https://u301.com/docs/domains/update-not-found-page-redirect-url
     * @returns 
     */
    async updateNotFoundPageRedirectUrl(domain: string, url: string) {
        const res = await this.fetcher<{ success: boolean }>(`${this.apiPath}/domains/${encodeURIComponent(domain)}`, {
            method: 'PATCH',
            body: JSON.stringify({ notFoundPageRedirectUrl: url }),
        })
        v.parse(v.object({
            success: v.boolean(),
        }), res)
        return true
    }
    /**
     * get domain details
     * @param domain The domain name
     * @returns The domain details
     */
    async getDetails(domain: string): Promise<DomainDetails> {
        const res = await this.fetcher(`${this.apiPath}/domains/${encodeURIComponent(domain)}`, {
            method: 'GET',
        })
        return v.parse(DomainDetailsSchema, res)
    }
    /**
     * get domain active status
     * @param domain The domain name
     * @returns The domain status
     */
    async getActiveStatus(domain: string) {
        const res = await this.fetcher(`${this.apiPath}/domains/active/${encodeURIComponent(domain)}`, {
            method: 'PATCH',
        })
        return v.parse(DomainStatusSchema, res)
    }
    /**
     * Wait for the domain to be active
     * @param domain The domain name
     * @param opts The options
     * @param opts.timeoutMs The timeout in milliseconds
     * @param opts.pollMs The poll interval in milliseconds
     * @returns The domain status
     */
    async waitUntilActive(domain: string, opts: { timeoutMs?: number, pollMs?: number } = {}): Promise<DomainStatus> {
        const timeoutMs = opts.timeoutMs ?? 30000
        const pollMs = opts.pollMs ?? 8000
        const deadline = Date.now() + timeoutMs
        let last: DomainStatus | undefined
        while (Date.now() < deadline) {
            const status = await this.getActiveStatus(domain)
            last = status
            if (status.actived) return status
            await new Promise(r => setTimeout(r, pollMs))
        }
        return last ?? { actived: false, message: 'timeout' }
    }
    /**
     * Wait for the domain status to change
     * @param domain The domain name
     * @param opts The options
     * @param opts.timeoutMs The timeout in milliseconds
     * @param opts.pollMs The poll interval in milliseconds
     * @param opts.emitInitial Whether to emit the initial status
     * @returns The domain status
     */
    async waitForStatusChange(domain: string, opts: { timeoutMs?: number, pollMs?: number, emitInitial?: boolean } = {}): Promise<DomainStatus> {
        const timeoutMs = opts.timeoutMs ?? 30000
        const pollMs = opts.pollMs ?? 8000
        const emitInitial = opts.emitInitial ?? false
        const deadline = Date.now() + timeoutMs
        let last = await this.getActiveStatus(domain)
        if (emitInitial || last.actived) return last
        while (Date.now() < deadline) {
            await new Promise(r => setTimeout(r, pollMs))
            const next = await this.getActiveStatus(domain)
            if (next.actived !== last.actived || next.message !== last.message) {
                return next
            }
            last = next
        }
        return last
    }
}

export const DomainSchema = v.object({
    domain: v.string(),
    randomCodeLength: v.number(),
    isPrimary: v.boolean(),
    isGlobal: v.boolean()
}) satisfies v.GenericSchema<DomainSchema>

export interface DomainSchema {
    /**
     * The domain name
     */
    domain: string
    /**
     * The length of the random slug, 3-10
     */
    randomCodeLength: number
    /**
     * is it the primary domain?
     * current u301.co is the primary domain
     */
    isPrimary: boolean
    /**
     * is it the global (public) domain
     * false means your private domain
     */
    isGlobal: boolean
}

export const DomainStatusSchema = v.object({
    actived: v.boolean(),
    message: v.optional(v.string()),
}) satisfies v.GenericSchema<DomainStatus>

export interface DomainStatus {
    actived: boolean
    message?: string
}

export const DomainDetailsSchema = v.object({
    domain: v.string(),
    isValid: v.boolean(),
    isArchived: v.boolean(),
    lastCheckedAt: v.nullable(v.pipe(v.string(), v.isoTimestamp())),
    randomCodeLength: v.number(),
    workspaceId: v.pipe(v.string(), v.uuid()),
    homePageRedirectUrl: v.nullable(v.pipe(v.string(), v.url())),
    notFoundPageRedirectUrl: v.nullable(v.pipe(v.string(), v.url())),
    createdAt: v.pipe(v.string(), v.isoTimestamp()),
    updatedAt: v.nullable(v.pipe(v.string(), v.isoTimestamp())),
    isPrimary: v.boolean(),
    isGlobal: v.boolean(),
    dnsSettings: v.object({
        cnameValue: v.string(),
        isHostedOnCloudflare: v.boolean(),
        baseDomain: v.string(),
        subdomain: v.string(),
        domainConnectUrl: v.nullable(v.pipe(v.string())),
        cloudflareAuthUrl: v.nullable(v.pipe(v.string(), v.url())),
    })
}) satisfies v.GenericSchema<DomainDetails>

export interface DomainDetails {
    domain: string
    /**
     * Whether the domain is valid on u301
     */
    isValid: boolean
    isArchived: boolean
    lastCheckedAt: string | null
    /**
     * The length of the random slug, 3-10
     */
    randomCodeLength: number
    /**
     * The workspace ID for the domain, UUIDv7
     */
    workspaceId: string
    homePageRedirectUrl: string | null
    notFoundPageRedirectUrl: string | null
    createdAt: string
    updatedAt: string | null
    isPrimary: boolean
    isGlobal: boolean
    dnsSettings: {
        /**
         * The CNAME value for the domain
         */
        cnameValue: string
        /**
         * Whether the domain is hosted on Cloudflare
         */
        isHostedOnCloudflare: boolean
        /**
         * The apex domain 
         * @example example.com
         */
        baseDomain: string
        /**
         * The subdomain for the domain
         * @example www
         */
        subdomain: string
        domainConnectUrl: string | null
        /**
         * The URL to authorize the domain on Cloudflare
         */
        cloudflareAuthUrl: string | null
    }
}