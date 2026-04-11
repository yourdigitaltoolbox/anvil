// Layer type augmentations — reference this file to get LayerMap
// augmented with all installed layer packages.
//
// ONLY needed when consuming Anvil via `bun link` during development.
// Published npm packages emit .d.ts files that TypeScript picks up automatically.
//
// Usage: create a file like `env.d.ts` with:
//
//   import '@ydtb/anvil-layer-postgres'
//   import '@ydtb/anvil-layer-redis'
//   import '@ydtb/anvil-layer-pino'
//   // ... etc for each layer you use
//
// Or add to your tsconfig.json include array:
//
//   "node_modules/@ydtb/anvil-layer-*/src/index.ts"
//
// This forces TypeScript to include the layer's source files,
// which contain the `declare module '@ydtb/anvil'` augmentations.

export {}
