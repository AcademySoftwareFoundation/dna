// This class name ('audio-chunk-processor') must match the one used
// when creating the AudioWorkletNode in background.js
class AudioChunkProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super(options);
    // You can access processorOptions passed from the main thread here
    // For example: this.sampleRate = options.processorOptions.sampleRate;
    // this.internalBuffer = []; // If you need to buffer across multiple 'process' calls
    // this.TARGET_CHUNK_SIZE = 4096; // Example target size for sending messages
  }

  process(inputs, outputs, parameters) {
    // `inputs` is an array of inputs. Each input is an array of channels.
    // Each channel is a Float32Array containing 128 audio samples (this block size is fixed).
    const input = inputs[0]; // Get the first input

    if (!input || input.length === 0 || !input[0] || input[0].length === 0) {
      // No actual audio data, or input disconnected.
      return true; // Keep processor alive
    }

    // We'll typically work with the first channel for mono tab audio.
    // If the tab outputs stereo, you might want to mix it down or process channels separately.
    const channelData = input[0]; // Float32Array, samples typically in range -1.0 to 1.0

    // Convert Float32Array to Int16Array (PCM 16-bit)
    const pcm16Data = new Int16Array(channelData.length);
    for (let i = 0; i < channelData.length; i++) {
      const s = Math.max(-1, Math.min(1, channelData[i])); // Clamp to -1.0 to 1.0
      pcm16Data[i] = s < 0 ? s * 0x8000 : s * 0x7fff; // Scale to Int16 range
    }

    // Post the PCM data (as an Int16Array) back to the main thread (background.js)
    // To send the underlying ArrayBuffer and make it transferable (more efficient):
    this.port.postMessage(pcm16Data, [pcm16Data.buffer]);

    // Return true to keep the processor alive. Returning false would terminate it.
    return true;
  }
}

// Register the processor with the name used in background.js
registerProcessor('audio-chunk-processor', AudioChunkProcessor);
