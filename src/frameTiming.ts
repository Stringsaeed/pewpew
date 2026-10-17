/**
 * Where one frame's JS time goes, in ms, summed over the frame. Written by the loop (bot, step) and the renderer (pack,
 * acquire, encode, submit, present) only while `on`. A perf build turns it on and reads it once per frame (src/dev/qa.ts);
 * every other build leaves it off, so the frame pays one branch per phase.
 *  pack     renderer CPU work: particles, instance packing, uniform and buffer writes
 *  acquire  getCurrentTexture: waits when every drawable is still queued on the GPU or the display
 *  encode   recording the render pass
 *  submit   handing the command buffer to the GPU queue
 *  present  queueing the drawable for display
 */
export const FRAME_TIMING = { on: false, bot: 0, step: 0, pack: 0, acquire: 0, encode: 0, submit: 0, present: 0 };

export type FramePhase = Exclude<keyof typeof FRAME_TIMING, 'on'>;
export const FRAME_PHASES: readonly FramePhase[] = ['bot', 'step', 'pack', 'acquire', 'encode', 'submit', 'present'];

/** Milliseconds createRenderer took (buffers, shader modules, pipelines), written once. A perf build logs it with the first frame. */
export const STARTUP = { renderer: 0 };
