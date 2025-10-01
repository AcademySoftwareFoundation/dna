# DNA Frontend Framework Examples

This directory contains example usage of the DNA Frontend Framework.

## Examples

### vexa-usage.ts

Demonstrates how to use the DNA Frontend Framework with the Vexa transcription system.

#### Basic Usage

```bash
# Run the basic example
npx ts-node examples/vexa-usage.ts

# Run the advanced example with state management
npx ts-node examples/vexa-usage.ts --advanced
```

## Interactive Shell

For interactive testing and experimentation, use the shell:

```bash
npx ts-node shell.ts
```

This provides a Python-like interactive environment where you can test the framework in real-time.

#### What it demonstrates

**Basic Example:**
- Initializing the DNA Frontend Framework
- Joining a meeting
- Checking connection status
- Leaving a meeting

**Advanced Example:**
- State management with multiple versions
- Setting up meeting contexts
- Monitoring connection status
- State updates during meeting lifecycle
- Final state summary

#### Prerequisites

Before running the examples, set up your environment variables:

```bash
export VEXA_URL="http://your-vexa-server.com"
export VEXA_API_KEY="your-api-key-here"
export PLATFORM="meet"
```

Or create a `.env` file in the project root:

```
VEXA_URL=http://your-vexa-server.com
VEXA_API_KEY=your-api-key-here
PLATFORM=meet
```

#### Expected Output

The examples will:
1. Initialize the framework
2. Join a meeting (if environment variables are set)
3. Print connection status
4. Simulate meeting activity
5. Leave the meeting
6. Show final state information

**Note:** The examples will show connection errors if the Vexa server is not available, but this is expected behavior for demonstration purposes.
