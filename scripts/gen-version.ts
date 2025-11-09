
await Bun.write('src/version.ts', `export const SDK_VERSION = ${JSON.stringify(process.env.npm_package_version)};\n`);
export {}