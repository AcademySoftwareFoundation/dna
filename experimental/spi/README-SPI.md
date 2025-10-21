# SPI Experimental Projects

This directory contains prototype tools developed by Sony Pictures Imageworks (SPI) for evaluating LLMs (Large Language Models) for assistance in note-taking during feedback and review sessions. These tools are designed as minimum viable prototypes to test real-time LLM summarization capabilities during video review sessions, particularly for online video calls using Google Meet.

## Overview

The projects in this directory are experimental prototypes focused on:
- **Real-time note-taking assistance** during review sessions
- **LLM-powered summarization** of feedback and discussions
- **Shot-based organization** of notes and comments
- **Integration with review workflows** commonly used in studios

While these tools may not have all the features of professional note-taking applications used in production studios, they provide the minimum set of features needed to actually take notes during review sessions and evaluate whether real-time LLM summaries make sense in practice.

## Projects

### 1. Dailies Note Assistant (note_assistant)
**Type**: Offline processing toolkit  
**Focus**: Post-meeting transcript analysis and AI-powered summary generation

A Python-based experimental toolkit for processing artist review sessions and generating AI-powered summaries from meeting transcripts. This tool is designed for offline processing of recorded meetings, taking raw transcript data and converting it into structured, actionable notes.

**Key Features**:
- Processes Google Meet transcripts (adaptable to other platforms)
- Multi-LLM provider support (OpenAI, Claude, Gemini, Ollama)
- Timestamp alignment and speaker identification
- Shot/version association with review segments
- Batch processing capabilities

[→ Read full documentation](note_assistant/README.md)

### 2. Dailies Note Assistant v2 (note_assistant_v2)
**Type**: Real-time web application  
**Focus**: Live meeting participation and real-time transcription/summarization

A full-stack web application that can join Google Meet sessions to capture live audio transcriptions and generate AI-powered summaries for specific shots during dailies review sessions. This represents an evolution toward real-time assistance during active meetings.

**Key Features**:
- Real-time Google Meet integration via Vexa.ai transcription bots
- React-based web interface for live note management
- Optional ShotGrid integration for playlist and shot management
- WebSocket-based live transcription streaming
- Email integration for sharing notes
- Shot pinning and focus system for targeted capture

[→ Read full documentation](note_assistant_v2/README.md)

## Use Cases

These prototypes are designed to evaluate LLM assistance in typical studio review scenarios:
- **Film/Animation Dailies**: Review of shots, sequences, and creative iterations
- **Game Development Reviews**: Asset reviews, level design feedback sessions  
- **Creative Feedback Sessions**: Campaign reviews, creative presentations
- **Technical Reviews**: Code reviews, pipeline discussions

## Experimental Nature

**Important Disclaimers**:
- These are **experimental prototypes** not intended for production use
- No formal support is provided - use at your own risk
- Code and documentation were largely generated with AI assistance
- Designed for evaluation and exploration of LLM-assisted workflows

## Getting Started

Each project contains its own detailed README with installation and usage instructions. Choose the approach that best fits your evaluation needs:

- **For offline processing**: Start with `note_assistant` to process existing meeting recordings
- **For real-time testing**: Try `note_assistant_v2` to join live Google Meet sessions

## Requirements

### note_assistant (v1) Requirements:
- Python 3.9+
- API keys for desired LLM providers (OpenAI, Claude, Gemini)

### note_assistant_v2 Requirements:
- Python 3.9+
- Node.js 18+
- API keys for desired LLM providers (OpenAI, Claude, Gemini)
- Google Cloud credentials (only required for email functionality)
- ShotGrid access (optional - for pipeline integration)
- Vexa.ai access (either cloud subscription or self-hosted instance)

## Contributing

These experimental tools are shared to encourage exploration and iteration on LLM-assisted review workflows. Feel free to fork, modify, and adapt these prototypes for your own evaluation purposes.
