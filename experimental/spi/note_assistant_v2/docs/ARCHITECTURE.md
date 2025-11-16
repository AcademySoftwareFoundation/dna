# System Architecture Diagram

## Dailies Note Assistant v2 - High-Level System Overview

```mermaid
graph LR
    subgraph "Transcription Service"
        VEXA[Vexa.ai<br/>Bot Management<br/>Real-time Transcription]
    end

    subgraph "Meeting Platform"
        GM[Google Meet<br/>Meeting Sessions<br/>Audio/Video Stream]
    end

    subgraph "Dailies Note Assistant v2"
        DNA[DNA Application<br/>React Frontend + FastAPI Backend]
    end

    subgraph "Production Tracking"
        SG[ShotGrid<br/>Projects & Playlists<br/>Shot Metadata]
    end

    subgraph "LLM Providers"
        LLM[OpenAI<br/>Anthropic<br/>Google<br/>Ollama]
    end

    subgraph "Data Export"
        EXPORT[Export Services<br/>Email Delivery<br/>File Downloads]
    end

    %% Main application connections
    DNA ---|Join Meeting<br/>Control Bot| VEXA
    DNA ---|Generate Summaries<br/>Custom Prompts| LLM
    DNA ---|Import Projects<br/>Load Playlists| SG
    DNA ---|Export Notes<br/>Send Emails<br/>Download Files| EXPORT

    %% External service connections
    VEXA ---|Bot Joins<br/>Audio Capture| GM
    VEXA ---|Real-time<br/>Transcription Stream| DNA

    %% Styling
    classDef mainApp fill:#e1f5fe,stroke:#01579b,stroke-width:3px,color:#000000
    classDef external fill:#e8eaf6,stroke:#2d1b69,stroke-width:2px,color:#000000
    classDef llm fill:#e8f5e8,stroke:#1b5e20,stroke-width:2px,color:#000000
    classDef optional fill:#fff3e0,stroke:#e65100,stroke-width:2px,stroke-dasharray: 5 5,color:#000000

    class DNA mainApp
    class GM,VEXA external
    class LLM llm
    class SG,EXPORT optional
```

## System Integration Flow

```mermaid
sequenceDiagram
    participant User
    participant DNA as DNA App
    participant VEXA as Vexa.ai
    participant GM as Google Meet
    participant LLM as LLM Provider
    participant EMAIL as Email Service

    Note over User,EMAIL: Dailies Review Session Workflow

    %% Setup Phase
    User->>DNA: 1. Upload shot list (CSV/ShotGrid)
    User->>DNA: 2. Enter Google Meet URL
    DNA->>VEXA: 3. Request transcription bot
    VEXA->>GM: 4. Bot joins meeting
    
    %% Active Session
    GM->>VEXA: 5. Audio stream
    VEXA->>DNA: 6. Real-time transcription
    User->>DNA: 7. Pin shots for capture
    DNA->>DNA: 8. Associate transcripts with shots
    
    %% Summary Generation
    User->>DNA: 9. Request AI summary
    DNA->>LLM: 10. Send transcript + prompt
    LLM->>DNA: 11. Return summary
    
    %% Export & Share
    User->>DNA: 12. Export/email notes
    DNA->>EMAIL: 13. Send formatted notes
    EMAIL->>User: 14. Delivered notes
```

## External Service Dependencies

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                    USER INTERFACE                                   │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                          React Frontend (Vite) - Port 5173                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │   Shot List     │  │   Meeting       │  │  Transcription  │  │   Summary       │ │
│  │   Management    │  │   Integration   │  │    Capture      │  │   Generation    │ │
│  │                 │  │                 │  │                 │  │                 │ │
│  │ • CSV Upload    │  │ • Google Meet   │  │ • Pin Shots     │  │ • LLM Models    │ │
│  │ • ShotGrid      │  │   Join/Leave    │  │ • Live Stream   │  │ • Custom        │ │
│  │   Integration   │  │ • Bot Control   │  │ • WebSocket     │  │   Prompts       │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                        │
                              HTTP/WebSocket API Calls
                                        │
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                BACKEND SERVICES                                     │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                         FastAPI Backend - Port 8000                                │
│                                                                                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │   API Gateway   │  │   WebSocket     │  │   File          │  │   Email         │ │
│  │   & Routing     │  │   Handler       │  │   Processing    │  │   Service       │ │
│  │                 │  │                 │  │                 │  │                 │ │
│  │ • REST Endpoints│  │ • Real-time     │  │ • CSV Parser    │  │ • Gmail API     │ │
│  │ • CORS Config   │  │   Transcription │  │ • Data Export   │  │ • SMTP Server   │ │
│  │ • Middleware    │  │ • Shot Pinning  │  │ • File Download │  │ • Note Sending  │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
│                                                                                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │   LLM Service   │  │   ShotGrid      │  │   Vexa Proxy    │  │   Config        │ │
│  │   Manager       │  │   Integration   │  │   (Optional)    │  │   Manager       │ │
│  │                 │  │                 │  │                 │  │                 │ │
│  │ • Model Config  │  │ • Project Data  │  │ • API Routing   │  │ • YAML Config   │ │
│  │ • Prompt System │  │ • Playlist Mgmt │  │ • CORS Bypass   │  │ • Demo Mode     │ │
│  │ • Summary Gen   │  │ • Demo Mode     │  │ • WebSocket     │  │ • Environment   │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                        │
                              External API Integrations
                                        │
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              EXTERNAL SERVICES                                     │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │    Vexa.ai      │  │   LLM Providers │  │    ShotGrid     │  │   Email         │ │
│  │   Bot Service   │  │                 │  │     API         │  │   Services      │ │
│  │                 │  │                 │  │                 │  │                 │ │
│  │ • Google Meet   │  │ • OpenAI GPT    │  │ • Project Data  │  │ • Gmail API     │ │
│  │   Bot Control   │  │ • Claude        │  │ • Playlists     │  │ • SMTP Servers  │ │
│  │ • Audio Stream  │  │ • Gemini        │  │ • Shot/Version  │  │ • Note Delivery │ │
│  │ • Transcription │  │ • Ollama (local)│  │   Metadata      │  │                 │ │
│  │ • WebSocket     │  │                 │  │                 │  │                 │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
│                                                                                     │
│  ┌─────────────────┐                                          ┌─────────────────┐ │
│  │  Google Meet    │                                          │   LLM Backend   │ │
│  │   Sessions      │                                          │   (Optional)    │ │
│  │                 │                                          │                 │ │
│  │ • Meeting Rooms │                                          │ • Remote LLM    │ │
│  │ • Audio Stream  │                                          │   Processing    │ │
│  │ • Participants  │                                          │ • Load Balancing│ │
│  └─────────────────┘                                          └─────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

## Key Integration Points

### Required Services
- **Vexa.ai**: Core transcription service that manages Google Meet bots
- **Google Meet**: Meeting platform where audio is captured

### Optional Services  
- **LLM Providers**: AI summary generation (OpenAI, Anthropic, Google, Ollama)
- **ShotGrid**: Production tracking system for shot/playlist data
- **Email Services**: Note distribution via Gmail API or SMTP
- **File System**: CSV import/export for shot lists and notes

### Service Communication Patterns
- **Real-time**: WebSocket connection with Vexa.ai for live transcription
- **API Calls**: REST endpoints for LLM summaries, ShotGrid data, email sending
- **File Operations**: Local file system for CSV upload/download
- **Authentication**: OAuth for Gmail, API keys for LLM providers, script auth for ShotGrid