# google-transcription-test

## Description

Test getting an audio stream from Chrome and sending it through Whisper for a transcription.

## Chrome extension
This project includes a Chrome extension that captures audio from the current tab and sends it to a Whisper server for transcription. The extension provides a simple user interface to start and stop audio capture, and it logs the transcription results in the console.

### Installing the Chrome Extension
1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable "Developer mode" in the top-right corner.
3. Click on "Load unpacked" and select the `extension` folder from this repository.
4. The extension should now appear in your list of extensions.

### Testing the Extension
1. Click on the extension icon in the Chrome toolbar to open the popup.
2. Click the "Start" button to begin capturing audio.
3. Right-click anywhere in the popup and select "Inspect" to open the Developer Tools.
4. Check the "Console" tab to view logs and ensure the audio is being captured and sent to the server.

## Building and Launching the Whisper Server

1. Ensure you have Docker installed on your system.
2. Navigate to the `whisper-server` directory:
   ```bash
   cd whisper-server
   ```
3. Build the docker image:
   ```bash
   docker-compose build
   ```
4. Start the server:
   ```bash
   docker-compose up
   ```
5. The server will start on `http://localhost:5000`. You can now test the transcription functionality by using the Chrome extension.

### Inspecting audio files:

The audiofiles can be saved by uncommenting the section on code in the server.py file that saves the audio files to disk. This can be useful for debugging or testing purposes. It also
helps to have ffmpeg installed on your system to convert the audio files from WebM to WAV format.