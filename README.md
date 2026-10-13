<img src="assets/icon.svg" width="64" height="64" alt="">

# pewpew

An offline space arcade game with 30 levels and three bosses, built with Expo and React Native WebGPU.

## Development

Install dependencies with `npm ci`. Run `npm run check` for the type check, tests, level verifier, and generated-mesh check.

Use a native build for the WebGPU and audio modules. Expo Go does not include them.

## Release

See [the iOS release guide](docs/release.md) for production builds, App Store metadata, and Expo Updates. The production binary uses the `production` update channel and the `appVersion` runtime policy.
