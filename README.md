
<h1 align="center">U301 URL Shortener JS-SDK</h1>
 
<div align="center">
    U301 is a URL shortener service that allows you to bind custom domains to your shortened links.
    <br />
    <a href="https://u301.com"><strong>Home</strong></a> · 
    <a href="https://u301.com/docs"><strong>Documentation</strong></a>
</div>
<div align="center" style="margin-bottom: 1rem;">
    <a href="https://www.npmjs.com/package/u301"><img src="https://img.shields.io/npm/v/u301" alt="NPM Version"></a> <a href="https://github.com/u301-shortener/u301-js/actions/workflows/build.yml"><img src="https://github.com/u301-shortener/u301-js/actions/workflows/build.yml/badge.svg" alt="Build"></a>
</div>


> [!WARNING]
> This package is ESM-only and does not support CommonJS (CJS). 


## Installation

`bun add u301`

## Usage

```ts
import { U301 } from 'u301';

const u301 = new U301({
    apiKey: 'your-api-key',
    workspaceId: 'your-workspace-id',
});

// shorten a URL
const result = await u301.links.create('https://example.com');
```

## License

MIT