/** Recording GPUDevice, encoder, and render pass. Enough for createRenderer to run under tsx. */

export type GpuCall =
  | { op: 'createBuffer'; buffer: number; size: number }
  | { op: 'writeBuffer'; buffer: number; byteLength: number }
  | { op: 'createTexture'; width: number; height: number; format: string }
  | { op: 'setPipeline'; pipeline: number }
  | { op: 'setBindGroup'; index: number }
  | { op: 'setVertexBuffer'; slot: number; buffer: number; offset: number }
  | { op: 'setIndexBuffer'; buffer: number; offset: number }
  | { op: 'draw'; vertexCount: number; instanceCount: number }
  | { op: 'drawIndexed'; indexCount: number; instanceCount: number; firstIndex: number; baseVertex: number; firstInstance: number }
  | { op: 'submit' }
  | { op: 'present' };

export interface FakeBuffer {
  readonly id: number;
  readonly size: number;
  destroyed: boolean;
  destroy(): void;
}

export interface FakeTexture {
  destroyed: boolean;
  destroy(): void;
  createView(): object;
}

export interface FakeCanvas {
  clientWidth: number;
  clientHeight: number;
  width: number;
  height: number;
}

export interface FakeGpu {
  readonly device: GPUDevice;
  readonly context: GPUCanvasContext & { present(): void };
  readonly canvas: FakeCanvas;
  readonly calls: GpuCall[];
  readonly writes: Uint8Array[];
  readonly buffers: FakeBuffer[];
  readonly textures: FakeTexture[];
  configures: number;
}

const flag = (bit: number): GPUFlagsConstant => bit as GPUFlagsConstant;

export function installGpuGlobals(): void {
  const g = globalThis as unknown as {
    GPUBufferUsage?: GPUBufferUsage;
    GPUShaderStage?: GPUShaderStage;
    GPUTextureUsage?: GPUTextureUsage;
  };
  if (g.GPUBufferUsage) return;
  g.GPUBufferUsage = {
    MAP_READ: flag(0x0001), MAP_WRITE: flag(0x0002), COPY_SRC: flag(0x0004), COPY_DST: flag(0x0008),
    INDEX: flag(0x0010), VERTEX: flag(0x0020), UNIFORM: flag(0x0040), STORAGE: flag(0x0080),
    INDIRECT: flag(0x0100), QUERY_RESOLVE: flag(0x0200),
  };
  g.GPUShaderStage = { VERTEX: flag(0x1), FRAGMENT: flag(0x2), COMPUTE: flag(0x4) };
  g.GPUTextureUsage = {
    COPY_SRC: flag(0x01), COPY_DST: flag(0x02), TEXTURE_BINDING: flag(0x04),
    STORAGE_BINDING: flag(0x08), RENDER_ATTACHMENT: flag(0x10),
  };
}

function writtenBytes(data: ArrayBufferLike | ArrayBufferView, dataOffset = 0, size?: number): Uint8Array {
  if (ArrayBuffer.isView(data)) {
    const el = 'BYTES_PER_ELEMENT' in data ? Number(data.BYTES_PER_ELEMENT) : 1;
    const count = size ?? (data.byteLength / el - dataOffset);
    return new Uint8Array(data.buffer, data.byteOffset + dataOffset * el, count * el).slice();
  }
  const byteLength = size ?? (data.byteLength - dataOffset);
  return new Uint8Array(data, dataOffset, byteLength).slice();
}

function extentWH(size: GPUExtent3D): { width: number; height: number } {
  if (Array.isArray(size) || ArrayBuffer.isView(size)) {
    const s = size as ArrayLike<number>;
    return { width: Number(s[0] ?? 1), height: Number(s[1] ?? 1) };
  }
  return { width: size.width, height: size.height ?? 1 };
}

export function createFakeGpu(size: { clientWidth: number; clientHeight: number } = { clientWidth: 390, clientHeight: 844 }): FakeGpu {
  installGpuGlobals();
  const calls: GpuCall[] = [];
  const writes: Uint8Array[] = [];
  const buffers: FakeBuffer[] = [];
  const textures: FakeTexture[] = [];
  const pipelines = new Map<object, number>();
  const canvas: FakeCanvas = { clientWidth: size.clientWidth, clientHeight: size.clientHeight, width: 0, height: 0 };
  let configures = 0;

  const bufferOf = (buffer: object): number => {
    const id = (buffer as FakeBuffer).id;
    if (id === undefined) throw new Error('write to an unknown buffer');
    return id;
  };

  const pass = {
    setPipeline(pipeline: object): void {
      const id = pipelines.get(pipeline);
      if (id === undefined) throw new Error('unknown pipeline');
      calls.push({ op: 'setPipeline', pipeline: id });
    },
    setBindGroup(index: number): void { calls.push({ op: 'setBindGroup', index }); },
    setVertexBuffer(slot: number, buffer: object, offset = 0): void {
      calls.push({ op: 'setVertexBuffer', slot, buffer: bufferOf(buffer), offset });
    },
    setIndexBuffer(buffer: object, _format: GPUIndexFormat, offset = 0): void {
      calls.push({ op: 'setIndexBuffer', buffer: bufferOf(buffer), offset });
    },
    draw(vertexCount: number, instanceCount = 1): void {
      calls.push({ op: 'draw', vertexCount, instanceCount });
    },
    drawIndexed(indexCount: number, instanceCount = 1, firstIndex = 0, baseVertex = 0, firstInstance = 0): void {
      calls.push({ op: 'drawIndexed', indexCount, instanceCount, firstIndex, baseVertex, firstInstance });
    },
    end(): void {},
  };

  const device = {
    createBuffer(desc: GPUBufferDescriptor): GPUBuffer {
      const buffer: FakeBuffer = {
        id: buffers.length, size: desc.size, destroyed: false,
        destroy() { buffer.destroyed = true; },
      };
      buffers.push(buffer);
      calls.push({ op: 'createBuffer', buffer: buffer.id, size: desc.size });
      return buffer as unknown as GPUBuffer;
    },
    createTexture(desc: GPUTextureDescriptor): GPUTexture {
      const { width, height } = extentWH(desc.size);
      const texture: FakeTexture = {
        destroyed: false,
        destroy() { texture.destroyed = true; },
        createView() { return {}; },
      };
      textures.push(texture);
      calls.push({ op: 'createTexture', width, height, format: desc.format });
      return texture as unknown as GPUTexture;
    },
    createBindGroupLayout(): GPUBindGroupLayout { return {} as GPUBindGroupLayout; },
    createPipelineLayout(): GPUPipelineLayout { return {} as GPUPipelineLayout; },
    createBindGroup(): GPUBindGroup { return {} as GPUBindGroup; },
    createShaderModule(): GPUShaderModule { return {} as GPUShaderModule; },
    createRenderPipeline(): GPURenderPipeline {
      const pipeline = {};
      pipelines.set(pipeline, pipelines.size);
      return pipeline as GPURenderPipeline;
    },
    createCommandEncoder(): GPUCommandEncoder {
      return {
        beginRenderPass(): GPURenderPassEncoder { return pass as unknown as GPURenderPassEncoder; },
        finish(): GPUCommandBuffer { return {} as GPUCommandBuffer; },
      } as unknown as GPUCommandEncoder;
    },
    queue: {
      writeBuffer(buffer: GPUBuffer, _offset: number, data: ArrayBufferLike | ArrayBufferView, dataOffset?: number, size?: number): void {
        const bytes = writtenBytes(data, dataOffset, size);
        writes.push(bytes);
        calls.push({ op: 'writeBuffer', buffer: bufferOf(buffer), byteLength: bytes.byteLength });
      },
      submit(): void { calls.push({ op: 'submit' }); },
    },
  };

  return {
    device: device as unknown as GPUDevice,
    context: {
      get canvas() { return canvas as unknown as HTMLCanvasElement; },
      configure(): void { configures += 1; },
      getCurrentTexture(): GPUTexture {
        return { createView() { return {}; } } as unknown as GPUTexture;
      },
      present(): void { calls.push({ op: 'present' }); },
    } as unknown as GPUCanvasContext & { present(): void },
    canvas, calls, writes, buffers, textures,
    get configures() { return configures; },
    set configures(value: number) { configures = value; },
  };
}
