# note_assistant.py

An AI-powered meeting transcript summarization tool that processes CSV files containing meeting conversations and generates concise, actionable notes using Large Language Models (LLMs). Specifically designed for creative review meetings where artists submit work for feedback.

## Features

- **Multi-LLM Support**: Works with OpenAI GPT, Anthropic Claude, Google Gemini, and local Ollama models
- **Intelligent Chunking**: Automatically splits large conversations into manageable chunks with configurable overlap
- **Caching System**: Save and reuse LLM responses to avoid redundant API calls
- **Filtering Options**: Process only specific shots/topics using ID filters
- **Production Notes Integration**: Merge existing production notes with AI-generated summaries
- **Pre-processing Mode**: Inspect chunked data before sending to LLMs
- **Error Handling**: Robust error handling with detailed logging

## Requirements

- Python 3.7+
- Required packages: `pandas`, `requests`, `tqdm`, `openai`, `anthropic`, `google-generativeai`, `python-dotenv`

### Installation

```bash
pip install pandas requests tqdm openai anthropic google-generativeai python-dotenv
```

## Setup

### Environment Variables

Create a `.env` file in your project directory with your API keys:

```env
OPENAI_API_KEY=your_openai_api_key_here
CLAUDE_API_KEY=your_claude_api_key_here
GOOGLE_API_KEY=your_google_api_key_here
```

### For Ollama (Local Models)

Install and run Ollama locally:
```bash
# Install Ollama (see https://ollama.ai)
ollama pull llama3.2  # or your preferred model
ollama serve  # Start the server on localhost:11434
```

## Usage

### Basic Usage

```bash
python note_assistant.py input.csv output.csv --provider openai
```

### Complete Example

```bash
python note_assistant.py conversations.csv summaries.csv \
  --provider claude \
  --model claude-3-sonnet-20240229 \
  --max-chars 6000 \
  --overlap-chars 800 \
  --output-llm-response llm_log.csv \
  --verbose
```

## Command Line Arguments

### Required Arguments

| Argument | Description |
|----------|-------------|
| `input_csv` | Path to input CSV file with meeting transcripts |
| `output_csv` | Path where results will be saved |

### Optional Arguments

| Argument | Default | Description |
|----------|---------|-------------|
| `--provider` | - | LLM provider: `openai`, `claude`, `ollama`, or `gemini` |
| `--model` | See defaults | Specific model to use (overrides provider default) |
| `--max-chars` | 8000 | Maximum characters per chunk |
| `--overlap-chars` | 1000 | Characters to overlap between chunks |
| `--pre-process` | False | Skip LLM processing, output chunks only |
| `--output-llm-response` | - | Save LLM request/response pairs to CSV |
| `--input-llm-response` | - | Use cached LLM responses instead of live calls |
| `--review` | - | Comma-separated list of shot IDs to process |
| `--review-csv` | - | CSV file with shot IDs and production notes |
| `--verbose` | False | Enable detailed output |

### Default Models

| Provider | Default Model |
|----------|---------------|
| OpenAI | `gpt-4o` |
| Claude | `claude-3-sonnet-20240229` |
| Ollama | `llama3.2` |
| Gemini | `gemini-2.5-flash-preview-05-20` |

## Input Format

The script expects a CSV file with these columns:

| Column | Description |
|--------|-------------|
| `shot/id` | Unique identifier for the shot/topic |
| `conversation` | The actual dialogue/conversation text |

**Example input CSV:**
```csv
shot/id,conversation
"shot001/v1","JD:Let's review the lighting\nJS:Looks good to me\nJD:Approved"
"shot002/v2","JS:The animation needs work\nJD:I agree, let's iterate"
```

## Output Formats

### Standard Processing Mode

| Column | Description |
|--------|-------------|
| `chunk_id` | Sequential chunk identifier |
| `shots_included` | Comma-separated list of shots in this chunk |
| `shot/id` | Individual shot identifier (may be combined topics) |
| `summary` | AI-generated summary |
| `prod notes` | Production notes (if `--review-csv` used) |
| `original_conversation` | Original conversation text |

### Pre-processing Mode (`--pre-process`)

| Column | Description |
|--------|-------------|
| `chunk_id` | Sequential chunk identifier |
| `chunk_size` | Size of chunk in characters |
| `shots_included` | Comma-separated list of shots in chunk |
| `chunk_content` | Complete chunk content |

## Advanced Features

### Chunking Strategy

The script intelligently groups conversations by shot ID and then creates chunks based on character limits:

1. **Shot Grouping**: Multiple conversation entries for the same shot are combined
2. **Chunk Creation**: Shots are grouped into chunks up to `--max-chars` limit
3. **Overlap Handling**: Chunks can overlap by `--overlap-chars` to maintain context
4. **Order Preservation**: Original conversation order is maintained

### Caching System

Save LLM responses to avoid redundant API calls:

```bash
# First run - save responses
python note_assistant.py input.csv output.csv --provider openai --output-llm-response cache.csv

# Later run - reuse cached responses
python note_assistant.py input.csv output2.csv --input-llm-response cache.csv
```

### Filtering Options

Process only specific shots:

```bash
# Filter by specific shot IDs
python note_assistant.py input.csv output.csv --provider claude --review "shot001,shot003,shot007"

# Filter using CSV file with production notes
python note_assistant.py input.csv output.csv --provider claude --review-csv priority_shots.csv
```

**Example `priority_shots.csv`:**
```csv
shot/id,notes
shot001,"High priority - client feedback pending"
shot003,"Technical issues need resolution"
```

### Pre-processing Mode

Inspect how your data will be chunked before sending to LLMs:

```bash
python note_assistant.py input.csv chunks_preview.csv --pre-process --max-chars 5000
```

## AI Prompt Configuration

The script uses specialized prompts designed for creative review meetings:

- **System Prompt**: Establishes context about creative work review meetings
- **User Prompt**: Provides examples and formatting instructions
- **Output Format**: Structured as `<topic>|<summary>` for easy parsing

### Example AI Output

```
shot001/v1|JD: Approves lighting setup with y-grad and spec additions
shot002/v2, shot003/v1|JS: Animation needs iteration, JD agrees on technical improvements needed
```

## Error Handling

The script includes comprehensive error handling:

- **API Failures**: Graceful handling of LLM API errors
- **Malformed Data**: Continues processing despite individual chunk failures
- **Cache Misses**: Falls back to live API calls when cached data is unavailable
- **Format Errors**: Logs parsing issues while continuing processing

## Performance Tips

1. **Chunking**: Adjust `--max-chars` based on your LLM's context window
2. **Overlap**: Use `--overlap-chars` for better context preservation
3. **Caching**: Use `--output-llm-response` to cache expensive API calls
4. **Filtering**: Use `--review` to process only relevant shots
5. **Pre-processing**: Use `--pre-process` to optimize chunk sizes before LLM calls

## Integration Workflow

This script is designed to work with the output from `prep_llm_inputs.py`:

```bash
# Step 1: Prepare transcript data
python prep_llm_inputs.py --gemini_transcript meeting.txt conversations.csv

# Step 2: Generate AI summaries
python note_assistant.py conversations.csv summaries.csv --provider claude --verbose
```

## Troubleshooting

### Common Issues

**"Provider is required"**
- Ensure you specify `--provider` unless using `--pre-process` or `--input-llm-response`

**API Key Errors**
- Verify your API keys are set in the `.env` file
- Check that environment variables are loaded correctly

**Empty Output**
- Verify your input CSV has the required columns: `shot/id` and `conversation`
- Check that conversation text is not empty

**Chunk Size Warnings**
- Individual shots larger than `--max-chars` will be processed alone with a warning
- Consider increasing `--max-chars` or splitting large conversations manually

**Ollama Connection Issues**
- Ensure Ollama is running: `ollama serve`
- Verify the model is available: `ollama list`

### Debugging Tips

1. **Use `--verbose`** for detailed processing information
2. **Try `--pre-process`** to inspect chunking before LLM calls
3. **Use `--output-llm-response`** to examine raw LLM outputs
4. **Test with small datasets** first to validate configuration

## Cost Optimization

- **Use caching** (`--output-llm-response`) to avoid repeated API calls
- **Filter processing** (`--review`) to focus on specific shots
- **Choose appropriate models** (consider cost vs. quality trade-offs)
- **Optimize chunk sizes** to minimize API calls while maintaining quality

## Future Enhancements

- Support for additional LLM providers
- Batch processing for better API efficiency
- Custom prompt templates
- Integration with project management tools
- Real-time processing capabilities
