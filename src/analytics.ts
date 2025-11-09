import { BaseService } from "./base-service"
import type { Timezone } from "./timezone"
import * as v from 'valibot'

export const ranges = ['24h', '1d', '3d', '7d', '14d', '30d', '60d', '1m'] as const
export const granularities = ['day', 'hour'] as const

export type Range = (typeof ranges)[number]
export type Granularity = (typeof granularities)[number]

const DEFAULT_TIMEZONE: Timezone = 'Etc/UTC'
type TopParams = { range: Range; timezone?: Timezone; workspaceId?: string }
type ClicksParams = TopParams & { granularity: Granularity }

const IsoTimestamp = v.pipe(
    v.string(),
    v.isoTimestamp()
)

export const AnalyticsTopSchema = v.object({
    datetimeRange: v.pipe(v.array(IsoTimestamp), v.length(2)),
    range: v.picklist(ranges),
    data: v.array(v.object({
        label: v.string(),
        click: v.number(),
        meta: v.optional(
            v.record(
                v.string(),
                v.nullable(v.union([v.string(), v.number()]))
            )
        ),
    })),
})
export type AnalyticsTopSchema = v.InferOutput<typeof AnalyticsTopSchema>


const ClickDateItemSchema = v.object({
    date: v.pipe(v.string(), v.isoDate()),
    click: v.number(),
})
const ClickHourItemSchema = v.object({
    date: v.pipe(v.string()),
    click: v.number(),
})
const AnalyticsClicksSchema = v.object({
    start: IsoTimestamp,
    end: IsoTimestamp,
    data: v.array(v.union([ClickDateItemSchema, ClickHourItemSchema])),
})
export type AnalyticsClicks = v.InferOutput<typeof AnalyticsClicksSchema>
export class Analytics extends BaseService {
    apiPath = '/shorten/analytics';
    
    private async getTopData({ type, range, timezone = DEFAULT_TIMEZONE, workspaceId = this.workspaceId }: { type: 'browsers' | 'device-types' | 'short-links' | 'bots' | 'device-vendors' | 'operating-systems' | 'countries' | 'referers' | 'languages' | 'cities'} & TopParams) {
        const result = await this.fetcher<AnalyticsTopSchema>(`${this.apiPath}/top-${type}`, {
            query: {
                range,
                timezone,
                workspaceId
            }
        })
        return v.parse(AnalyticsTopSchema, result)
    }
    async getTopBrowsers(params: TopParams) {
        return this.getTopData({ type: 'browsers', ...params })
    }
    async getTopDeviceTypes(params: TopParams) {
        return this.getTopData({ type: 'device-types', ...params })
    }
    async getTopShortLinks(params: TopParams) {
        return this.getTopData({ type: 'short-links', ...params })
    }
    async getTopBots(params: TopParams) {
        return this.getTopData({ type: 'bots', ...params })
    }
    async getTopDeviceVendors(params: TopParams) {
        return this.getTopData({ type: 'device-vendors', ...params })
    }
    async getTopOperatingSystems(params: TopParams) {
        return this.getTopData({ type: 'operating-systems', ...params })
    }
    async getTopCountries(params: TopParams) {
        return this.getTopData({ type: 'countries', ...params })
    }
    async getTopReferers(params: TopParams) {
        return this.getTopData({ type: 'referers', ...params })
    }
    async getTopLanguages(params: TopParams) {
        return this.getTopData({ type: 'languages', ...params })
    }
    async getTopCities(params: TopParams) {
        return this.getTopData({ type: 'cities', ...params })
    }
    async getClicks({ range, granularity, timezone = DEFAULT_TIMEZONE, workspaceId = this.workspaceId }: ClicksParams) {
        const result = await this.fetcher<AnalyticsClicks>(`${this.apiPath}/clicks`, {
            query: {
                range,
                granularity,
                timezone,
                workspaceId,
            }
        })
        return v.parse(AnalyticsClicksSchema, result)
    }
}
