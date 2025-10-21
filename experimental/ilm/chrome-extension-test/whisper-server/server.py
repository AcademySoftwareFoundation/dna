from flask import Flask, request, jsonify
import whisper
import tempfile
import os
import subprocess
import logging
import shutil

"""
A Flask application that provides an endpoint to transcribe audio files using the Whisper model.
The source of the audio is a WebM file uploaded via a POST request.
"""

app = Flask(__name__)

# Configure logging
logging.basicConfig(level=logging.DEBUG)

# Load the Whisper model
model = whisper.load_model("base")

def _transcribe(tmp_audio, tmp_wav):
    """
    Transcribe the audio file using the Whisper model.
    :param tmp_audio: Path to the temporary audio file.
    :param tmp_wav: Path to the temporary WAV file.
    :return: Transcription result as a string.
    """
        # Validate WebM file integrity before processing
    if not os.path.exists(tmp_audio) or os.path.getsize(tmp_audio) == 0:
        error_message = "Invalid or empty WebM file provided."
        logging.error(error_message)
        return jsonify({"error": error_message}), 400
    
    
    # Convert WebM to WAV using ffmpeg
    # Add the -y flag to force overwriting files
    ffmpeg_cmd = [
        "ffmpeg", "-y", "-i", tmp_audio, "-ar", "16000", "-ac", "1", "-f", "wav", tmp_wav
    ]

    logging.debug(f"Running ffmpeg command: {' '.join(ffmpeg_cmd)}")
    # Run ffmpeg and check if the WAV file is created
    try:
        subprocess.run(ffmpeg_cmd, capture_output=True, text=True)
        if not os.path.exists(tmp_wav):
            error_message = "FFmpeg did not produce the expected WAV file."
            logging.error(error_message)
            return jsonify({"error": error_message}), 500
        logging.debug(f"Converted audio file to WAV: {tmp_wav}")
    except Exception as e:
        error_message = f"Unexpected error during ffmpeg execution: {str(e)}"
        logging.error(error_message)
        return jsonify({"error": error_message}), 500

    try:
        # Transcribe the WAV audio using Whisper
        result = model.transcribe(tmp_wav)
        transcription = result['text']
        logging.info(f"Transcription successful: {transcription}")
        return jsonify({"transcription": transcription})
    except RuntimeError as e:
        logging.error(f"Runtime error during transcription: {str(e)}")
        return jsonify({"error": str(e)}), 500
    return jsonify({"error": "An unexpected error occurred"}), 500

@app.route('/transcribe', methods=['POST'])
def transcribe():
    if 'audio' not in request.files:
        logging.error("No audio file provided in the request.")
        return jsonify({"error": "No audio file provided"}), 400

    audio_file = request.files['audio']
    temp_audio_path = None
    temp_wav_path = None


    # Save the audio file temporarily
    with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as temp_audio:
        audio_file.save(temp_audio.name)
        temp_audio_path = temp_audio.name
        logging.debug(f"Saved audio file to {temp_audio_path}")

    # Convert WebM to WAV using ffmpeg
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_wav:
        temp_wav_path = temp_wav.name


    result = _transcribe(temp_audio_path, temp_wav_path)

    # # This will save the audio file to a temporary directory for inspection
    # # Save the audio file to a mounted directory for inspection
    # mounted_audio_path = os.path.join('/app/audio_files', os.path.basename(temp_audio_path))
    # os.makedirs(os.path.dirname(mounted_audio_path), exist_ok=True)
    # shutil.copy(temp_audio_path, mounted_audio_path)
    # logging.debug(f"Saved audio file to mounted directory: {mounted_audio_path}")

    # # Save the WAV file to a mounted directory for inspection
    # mounted_wav_path = os.path.join('/app/audio_files', os.path.basename(temp_wav_path))
    # shutil.copy(temp_wav_path, mounted_wav_path)
    # logging.debug(f"Saved WAV file to mounted directory: {mounted_wav_path}")

    # Clean up the temporary files
    if temp_audio_path and os.path.exists(temp_audio_path):
        os.remove(temp_audio_path)
        logging.debug(f"Deleted temporary audio file: {temp_audio_path}")
    if temp_wav_path and os.path.exists(temp_wav_path):
        os.remove(temp_wav_path)
        logging.debug(f"Deleted temporary WAV file: {temp_wav_path}")

    return result

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
