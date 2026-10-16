// Preloaded by `npm test` (tsx --import) so TypeGPU shaders resolve under Node the way they do under Metro and Vite.
import Module, { registerHooks } from 'node:module';
import { transformSync } from '@babel/core';
import typegpu from 'unplugin-typegpu/babel';

registerHooks({
  resolve(specifier, context, nextResolve) {
    // typegpu's tsover-runtime dependency exports only an "import" condition, and tsx requires it from CommonJS.
    if (specifier === 'tsover-runtime') return nextResolve(specifier, { ...context, conditions: [...context.conditions, 'import'] });
    return nextResolve(specifier, context);
  },
});

// tsx compiles CommonJS .ts itself and skips load hooks, so the plugin runs on tsx's output just before Node compiles it.
// The plugin attaches each 'use gpu' function's AST, which tgpu.resolve turns into WGSL.
const compile = Module.prototype._compile;
Module.prototype._compile = function (code, filename, ...rest) {
  if (code.includes('use gpu') && !filename.includes('/node_modules/')) {
    code = transformSync(code, { filename, babelrc: false, configFile: false, plugins: [typegpu], retainLines: true, sourceMaps: 'inline' }).code;
  }
  return compile.call(this, code, filename, ...rest);
};
