import { BaseService } from "./base-service";
import * as v from 'valibot'

export class Domain extends BaseService {
    apiPath = '/shorten';

    async list() {
        const res = await this.fetcher(this.apiPath+'/domains', {
            method: 'GET',
        });
        return v.parse(v.array(DomainSchema), res);
    }
}

export const DomainSchema = v.object({
    domain: v.string(),
    isPrimary: v.boolean(),
    isGlobal: v.boolean()
}) satisfies v.GenericSchema<DomainSchema>

export interface DomainSchema {
    /**
     * The domain name
     */
    domain: string,
    /**
     * is it the primary domain?
     * current u301.co is the primary domain
     */
    isPrimary: boolean,
    /**
     * is it the global (public) domain
     * false means your private domain
     */
    isGlobal: boolean
}