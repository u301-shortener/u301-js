
<h1 align="center">U301 URL Shortener JS-SDK</h1>
 
<p align="center">
    U301 is a URL shortener service that allows you to bind custom domains to your shortened links.
    <br />
    <a href="https://u301.com"><strong>Home</strong></a> - 
    <a href="https://u301.com/docs"><strong>Documentation</strong></a>
</p>

> [!WARNING]
> This package is ESM-only and does not support CommonJS (CJS). 

![NPM Version](https://img.shields.io/npm/v/u301) [![Build](https://github.com/u301-shortener/u301-js/actions/workflows/build.yml/badge.svg)](https://github.com/u301-shortener/u301-js/actions/workflows/build.yml)

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