// This tsconfig lists only @webgpu/types, so the Node modules the engine tests and the WAV script use are declared here.
declare module 'node:module' {
  export function createRequire(filename: string | URL): (id: string) => unknown;
}

declare module 'node:fs' {
  export function mkdirSync(path: string, opts?: { recursive?: boolean }): void;
  export function writeFileSync(path: string, data: Uint8Array): void;
}

declare module 'node:assert/strict' {
  interface Assert {
    equal(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
    ok(value: unknown, message?: string): void;
    match(value: string, regexp: RegExp, message?: string): void;
  }
  const assert: Assert;
  export default assert;
}

declare module 'node:test' {
  export function test(name: string, fn: () => void | Promise<void>): void;
  export function afterEach(fn: () => void | Promise<void>): void;
}
