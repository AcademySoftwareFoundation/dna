export interface MixedAudioCapture {
  stream: MediaStream;
  includesMic: boolean;
  stop: () => void;
}

/**
 * Combine Meet tab audio with the local microphone so your own voice is
 * transcribed. Tab capture alone typically excludes mic input.
 */
export async function mixTabAudioWithMicrophone(
  tabStream: MediaStream,
  onLog?: (message: string, detail?: unknown) => void,
): Promise<MixedAudioCapture> {
  let micStream: MediaStream | null = null;

  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    onLog?.('Microphone capture started', {
      label: micStream.getAudioTracks()[0]?.label,
    });
  } catch (error) {
    onLog?.('Microphone unavailable; using Meet tab audio only', error);
    return {
      stream: tabStream,
      includesMic: false,
      stop: () => {
        tabStream.getTracks().forEach((track) => track.stop());
      },
    };
  }

  const audioContext = new AudioContext();
  const destination = audioContext.createMediaStreamDestination();
  const tabSource = audioContext.createMediaStreamSource(tabStream);
  const micSource = audioContext.createMediaStreamSource(micStream);

  tabSource.connect(destination);
  micSource.connect(destination);

  onLog?.('Mixed tab audio with microphone');

  return {
    stream: destination.stream,
    includesMic: true,
    stop: () => {
      tabSource.disconnect();
      micSource.disconnect();
      tabStream.getTracks().forEach((track) => track.stop());
      micStream?.getTracks().forEach((track) => track.stop());
      void audioContext.close();
    },
  };
}
