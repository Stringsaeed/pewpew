// The audio engine loads its native backend with a plain require() (see src/audio/engine.ts). The browser bundle aliases it to a stub.
declare function require(id: string): any;
