// unplugin-typegpu captures the 'use gpu' shader functions in src/render/shaders.ts so TypeGPU can resolve them to WGSL.
module.exports = (api) => {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['unplugin-typegpu/babel'],
  };
};
