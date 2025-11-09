import { $Fetch } from "ofetch"

export type ServiceDeps = {
    apiKey: string
    fetcher: $Fetch
    workspaceId: string
}

export class BaseService {
  protected readonly fetcher: $Fetch
  protected readonly workspaceId: string
  protected readonly apiKey: string

  constructor(deps: ServiceDeps) {
    this.fetcher = deps.fetcher
    this.workspaceId = deps.workspaceId
    this.apiKey = deps.apiKey
  }
}
