console.log('Popup script loaded');

document.getElementById('start').addEventListener('click', () => {
  console.log('Start button clicked');
  chrome.tabCapture.getMediaStreamId({}, async (streamId) => {
    if (chrome.runtime.lastError) {
      console.error(
        'Failed to get stream ID:',
        chrome.runtime.lastError.message
      );
      return;
    }

    console.log('Got stream IDs:', streamId);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: 'tab',
            chromeMediaSourceId: streamId,
          },
        },
        video: false,
      });

      console.log('Captured tab audio stream:', stream);

      let currentMediaRecorder = null; // Store the current MediaRecorder instance

      // Function to create and start a new MediaRecorder
      const startNewMediaRecorder = () => {
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'audio/webm',
        });
        currentMediaRecorder = mediaRecorder; // Update the reference to the current MediaRecorder

        const recordedChunks = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            recordedChunks.push(event.data);
          }
        };

        mediaRecorder.onstop = async () => {
          console.log('MediaRecorder stopped. All chunks should be complete.');

          // Combine the recorded chunks into a single Blob
          const audioBlob = new Blob(recordedChunks, { type: 'audio/webm' });

          // Save the audio chunk locally for debugging
          const downloadLink = document.createElement('a');
          const audioURL = URL.createObjectURL(audioBlob);
          downloadLink.href = audioURL;
          downloadLink.download = `audio_chunk_${Date.now()}.webm`;
          downloadLink.textContent = 'Download Audio Chunk';
          document.body.appendChild(downloadLink);

          const formData = new FormData();
          formData.append('audio', audioBlob, 'chunk.wav');

          try {
            const response = await fetch('http://localhost:5000/transcribe', {
              method: 'POST',
              body: formData,
            });

            if (!response.ok) {
              throw new Error(`Server error: ${response.statusText}`);
            }

            const result = await response.json();
            console.log('Transcription chunk:', result.transcription);
          } catch (error) {
            console.error('Error sending audio chunk to server:', error);
          }
        };

        mediaRecorder.onerror = (event) => {
          console.error('MediaRecorder error:', event.error);
        };

        mediaRecorder.start();
        console.log('New MediaRecorder started.');

        // Stop the MediaRecorder after 10 seconds
        setTimeout(() => {
          if (mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
            startNewMediaRecorder();
          }
        }, 10000);
      };

      // Start the first MediaRecorder
      startNewMediaRecorder();
    } catch (err) {
      console.error('getUserMedia error:', err);
    }
  });
});
