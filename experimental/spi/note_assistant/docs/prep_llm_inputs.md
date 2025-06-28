# prep_llm_inputs.py

A Python script for processing meeting transcripts and preparing them for LLM-based analysis. This tool combines transcripts from various sources, aligns timestamps, and organizes dialogues by review segments for downstream processing.

## Features

- **Multi-source transcript processing**: Supports Gemini-generated transcripts with optional Whisper VTT alignment
- **Timestamp alignment**: Improves timestamp accuracy by aligning coarse-grained transcripts with fine-grained VTT data
- **Review segment integration**: Associates dialogue with specific review items or project segments
- **CSV output**: Generates structured data suitable for LLM analysis

## Requirements

- Python 3.7+
- Standard library modules only (no external dependencies)

## Usage

### Basic Usage

```bash
python prep_llm_inputs.py --gemini_transcript transcript.txt output.csv
```

### Full Usage with All Options

```bash
python prep_llm_inputs.py \
  --gemini_transcript transcript.txt \
  --vtt whisper_output.vtt \
  --review_timestamps reviews.txt \
  output_dialogues.csv
```

### Command Line Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--gemini_transcript` | Yes | Path to the Gemini-generated transcript file |
| `--vtt` | No | Path to Whisper VTT file for improved timestamp alignment |
| `--review_timestamps` | No | Path to review timestamps file for segment association |
| `review_dialogues_csv` | Yes | Output CSV file path (positional argument) |

## Input File Formats

### Gemini Transcript Format

Expected format for Gemini transcript files:

```
Meeting Title 2024/01/15 14:30

Transcript

00:00:00
John Doe: Hello everyone, let's start the meeting.
Jane Smith: Sounds good to me.

00:05:00
John Doe: Let's review the first item.
```

**Requirements:**
- First line must contain date/time in format `YYYY/MM/DD HH:MM`
- Must contain a line with just "Transcript" to mark the start of dialogue
- Time markers in format `HH:MM:SS`
- Speaker lines in format `Speaker Name: dialogue text`

### VTT Format (Optional)

Standard WebVTT format from Whisper or similar tools:

```
WEBVTT

00:01.000 --> 00:04.000
Hello everyone, let's start the meeting.

00:04.000 --> 00:07.000
Sounds good to me.
```

### Review Timestamps Format (Optional)

Format for associating dialogue with specific review segments:

```
01:15:24:14:30:25:123: /Project/Shot001/Version1/Artist1
01:20:24:14:35:30:456: /Project/Shot002/Version2/Artist2
```

**Format:** `MM:DD:YY:HH:MM:SS:microsec: review_segment_path`

## Output Format

The script generates a CSV file with the following columns:

| Column | Description |
|--------|-------------|
| `timestamp` | Time when the conversation segment started (HH:MM:SS) |
| `shot/id` | Extracted shot/version ID from review segment path |
| `conversation` | All dialogue for this review segment, formatted as "Initials:dialogue" |

### Example Output

```csv
timestamp,shot/id,conversation
"14:30:00","Shot001/Version1","JD:Let's review this shot
JS:The lighting looks good
JD:I agree, but we need to adjust the camera angle"
"14:35:00","Shot002/Version2","JS:Moving to the next item
JD:This version has improved significantly"
```

## Key Features Explained

### Speaker Name Processing

Speaker names are automatically converted to initials:
- "John Doe" → "JD"
- "Jane Smith" → "JS"  
- "Alice" → "A"

### Timestamp Alignment

When a VTT file is provided, the script:
1. Uses text similarity matching to align Gemini transcript turns with VTT segments
2. Improves timestamp accuracy from 5-minute intervals to second-level precision
3. Ensures timestamps never move backwards in time

### Review Segment Association

When review timestamps are provided, the script:
1. Aligns review timestamps with meeting start time
2. Associates each dialogue turn with the most recent review segment
3. Extracts meaningful identifiers from review paths (e.g., "Shot001/Version1" from "/Project/Shot001/Version1/Artist1")

### Dialogue Aggregation

The script intelligently groups dialogue:
- Consecutive turns from the same speaker at the same timestamp are merged
- All dialogue within a review segment is combined into a single conversation entry
- Maintains speaker identification through initials

## Error Handling

The script includes robust error handling for:
- Missing or malformed timestamp information
- Invalid file formats
- Empty or corrupted input files
- Timeline inconsistencies

## Limitations

- Currently only supports Gemini-generated transcripts as the primary source
- VTT alignment uses text similarity matching which may not be 100% accurate
- Review timestamp format is specific and must match exactly
- Two-digit years in review timestamps are interpreted as 20xx for years < 50, 19xx for years ≥ 50

## Future Enhancements

- Support for additional transcript sources (Zoom, Teams, etc.)
- Configurable similarity thresholds for VTT alignment
- Alternative review timestamp formats
- Speaker identification improvements
- Export to additional formats (JSON, XML)

## Troubleshooting

### Common Issues

**"Could not extract meeting start time"**
- Ensure the first line of your Gemini transcript contains a date/time in format YYYY/MM/DD HH:MM

**"Could not find 'Transcript' marker"**
- Verify your transcript file contains a line with exactly "Transcript" before the dialogue begins

**Poor timestamp alignment with VTT**
- Check that your VTT file corresponds to the same meeting as the transcript
- Consider adjusting the similarity threshold in the code if needed

**Missing review segments**
- Verify the review timestamps file format matches exactly: MM:DD:YY:HH:MM:SS:microsec: path
- Ensure timestamps are in chronological order