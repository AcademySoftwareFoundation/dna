# Development Guide

Development setup and contributing guidelines for the Dailies Note Assistant v2.

## Development Environment Setup

### Prerequisites

- Python 3.9 or higher with pip
- Node.js 18 or higher with npm
- Git for version control
- Code editor with Python and JavaScript support (VS Code recommended)

### Repository Structure

```
experimental/spi/note_assistant_v2/
├── backend/                 # FastAPI backend application
│   ├── main.py             # Main application and routing
│   ├── email_service.py    # Gmail API and SMTP integration
│   ├── llm_service.py      # LLM integration and summary generation
│   ├── playlist.py         # CSV upload handling
│   ├── shotgrid_service.py # ShotGrid API integration
│   ├── vexa_service.py     # Vexa.ai API integration
│   ├── requirements.txt    # Python dependencies
│   ├── .env               # Environment configuration
│   ├── llm_models.yaml    # LLM model configuration
│   ├── llm_prompts.yaml   # LLM prompt configuration
│   └── *.factory.yaml     # Factory default configurations
├── frontend/               # React frontend application
│   ├── src/               # Source code
│   │   ├── components/    # React components
│   │   │   ├── Panels/    # Panel components
│   │   │   │   ├── UploadPanel.jsx      # File upload interface
│   │   │   │   ├── SettingsPanel.jsx    # App settings
│   │   │   │   ├── GoogleMeetPanel.jsx  # Google Meet integration
│   │   │   │   ├── ExportPanel.jsx      # Data export options
│   │   │   │   └── ShotGridPanel.jsx    # ShotGrid integration
│   │   │   ├── StatusBadge.jsx          # Status indicator component
│   │   │   ├── AppLayout.jsx            # Main layout component
│   │   │   ├── FloatingControls.jsx     # Floating action controls
│   │   │   ├── AddShotControls.jsx      # Shot addition controls
│   │   │   └── ShotTable.jsx            # Main shot table with tabs
│   │   ├── hooks/         # Custom React hooks
│   │   │   ├── useAppConfig.js          # Application configuration
│   │   │   ├── useGoogleMeet.js         # Google Meet functionality
│   │   │   ├── useShotGrid.js           # ShotGrid API hooks
│   │   │   └── useTranscription.js      # Transcription handling
│   │   ├── services/      # API service functions
│   │   │   └── llmService.js            # LLM API interactions
│   │   ├── ui.css         # Global styles
│   │   └── main.jsx       # Application entry point and coordination
│   ├── lib/               # TypeScript utility libraries
│   │   ├── transcription-service.ts     # Transcription utilities
│   │   ├── bot-service.ts              # Bot integration service
│   │   ├── config.ts                   # Configuration management
│   │   └── websocket-service.ts        # WebSocket handling
│   ├── public/            # Static assets and HTML template
│   ├── package.json       # Node.js dependencies
│   ├── package-lock.json  # Dependency lock file
│   └── .env.local         # Frontend environment config
├── docs/                  # Documentation files
└── README.md             # Main project documentation
```

### Backend Development Setup

1. **Navigate to backend directory:**
   ```bash
   cd backend
   ```

2. **Create virtual environment:**
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # macOS/Linux
   # or
   .venv\Scripts\activate     # Windows
   ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Set up development environment:**
   ```bash
   # Copy example environment file
   cp .env.example .env  # if available
   
   # Edit .env with development settings
   DISABLE_LLM=true  # Use mock responses for development
   DEMO_MODE=true    # Use anonymized data
   ```

5. **Run development server:**
   ```bash
   python -m uvicorn main:main --reload --port 8000
   ```

### Frontend Development Setup

1. **Navigate to frontend directory:**
   ```bash
   cd frontend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up development environment:**
   ```bash
   # Create development environment file
   cat > .env.local << EOF
   VITE_MOCK_MODE=true
   VITE_API_BASE_URL=http://localhost:8000
   EOF
   ```

4. **Run development server:**
   ```bash
   npm run dev
   ```

## Architecture Overview

### Backend Architecture

**Framework:** FastAPI with Python 3.9+

**Key Components:**
- **main.py**: Application entry point, routing, middleware
- **email_service.py**: Gmail API and SMTP email sending
- **llm_service.py**: LLM integration and summary generation
- **playlist.py**: CSV file processing and data validation
- **shotgrid_service.py**: ShotGrid API integration and demo mode
- **vexa_service.py**: Vexa.ai API integration for meeting transcription

**Design Patterns:**
- Service-oriented architecture with separate modules
- Environment-based configuration management
- Factory pattern for LLM model and prompt configuration
- Optional service routing for distributed deployment

### Frontend Architecture

**Framework:** React 18 with Vite build system

**Key Technologies:**
- React Hooks for state management
- WebSocket for real-time communication
- Modern CSS for styling (no external CSS frameworks)
- Fetch API for HTTP requests
- TypeScript utilities for complex services

**Component Structure:**
- **Panel-based UI**: Organized into functional panels (Upload, Settings, Google Meet, Export, ShotGrid)
- **Modular Architecture**: Clean separation between layout (AppLayout), logic (main.jsx), and UI components
- **Custom hooks** for feature-specific logic (transcription, ShotGrid, Google Meet, app configuration)
- **Multi-LLM Support**: Tabbed interface supporting multiple AI providers with individual prompt types
- **Real-time Features**: WebSocket transcription streaming with manual start/stop controls
- **Service layer** for API interactions and external integrations
- **TypeScript utilities** for configuration and WebSocket handling
- **Responsive design** with modern CSS Grid and Flexbox

**Architecture Improvements:**
- **Refactored main.jsx**: Moved from monolithic component to coordinating hub using custom hooks
- **AppLayout component**: Extracted all UI structure for better separation of concerns  
- **ShotTable component**: Full-featured table with multi-LLM tabs, bulk switching, and "Add to Notes" functionality
- **Custom hooks pattern**: useGoogleMeet, useTranscription, useAppConfig for encapsulated logic
- **Auto-summary preferences**: User-configurable auto-generation with LLM selection

### Data Flow

1. **Shot List Loading**: CSV upload or ShotGrid import → Backend processing → Frontend display
2. **Meeting Integration**: Frontend → Vexa.ai API → WebSocket transcription stream
3. **Transcription Capture**: WebSocket events → Frontend state → Backend storage
4. **Summary Generation**: Frontend request → Backend LLM processing → Frontend display
5. **Export/Email**: Frontend request → Backend formatting → File download or email sending

## Development Workflow

### Code Style and Standards

#### Python (Backend)

- **PEP 8** compliance for code formatting
- **Type hints** for function parameters and return values
- **Docstrings** for modules, classes, and functions
- **FastAPI patterns** for endpoint definitions

Example:
```python
from typing import Optional
from fastapi import HTTPException

async def generate_summary(
    conversation: str, 
    model_name: str, 
    prompt_type: Optional[str] = "short"
) -> dict:
    """Generate AI summary from conversation text.
    
    Args:
        conversation: Transcribed conversation text
        model_name: LLM model identifier
        prompt_type: Type of prompt to use for generation
    
    Returns:
        Dictionary containing summary and metadata
    
    Raises:
        HTTPException: If LLM generation fails
    """
    # Implementation here
```

#### JavaScript/React (Frontend)

- **ES6+** modern JavaScript features
- **JSX** for React component structure
- **Hooks** for state management and effects
- **Async/await** for asynchronous operations

Example:
```javascript
// Custom hook for WebSocket connection
function useWebSocket(url, onMessage) {
    const [socket, setSocket] = useState(null);
    const [connected, setConnected] = useState(false);
    
    useEffect(() => {
        const ws = new WebSocket(url);
        
        ws.onopen = () => setConnected(true);
        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            onMessage(data);
        };
        ws.onclose = () => setConnected(false);
        
        setSocket(ws);
        
        return () => ws.close();
    }, [url]);
    
    return { socket, connected };
}
```

### Testing

#### Backend Testing

**Framework:** pytest (when implemented)

**Test Categories:**
- Unit tests for individual service functions
- Integration tests for API endpoints
- Mock tests for external service dependencies

**Running Tests:**
```bash
cd backend
pytest tests/
```

#### Frontend Testing

**Framework:** Vitest + React Testing Library (when implemented)

**Test Categories:**
- Component rendering tests
- User interaction tests
- WebSocket communication tests

**Running Tests:**
```bash
cd frontend
npm test
```

### Git Workflow

#### Branch Strategy

- **main**: Production-ready code
- **develop**: Integration branch for features
- **feature/**: Individual feature development
- **bugfix/**: Bug fixes
- **hotfix/**: Critical production fixes

#### Commit Messages

Follow conventional commit format:
```
type(scope): description

feat(backend): add LLM backend routing support
fix(frontend): resolve WebSocket connection issues
docs(api): update endpoint documentation
refactor(email): simplify SMTP configuration
```

#### Pull Request Process

1. Create feature branch from `develop`
2. Implement changes with tests
3. Update documentation if needed
4. Submit PR with descriptive title and description
5. Address review feedback
6. Merge after approval

## Adding New Features

### Adding a New LLM Provider

1. **Update model configuration:**
   ```yaml
   # backend/llm_models.factory.yaml
   models:
     - display_name: "New Model"
       model_name: "new-model-id"
       provider: "new_provider"
   ```

2. **Implement provider logic:**
   ```python
   # backend/llm_service.py
   async def call_new_provider_llm(model_name: str, messages: list) -> str:
       # Implementation for new provider
       pass
   ```

3. **Add configuration variables:**
   ```bash
   # backend/.env
   NEW_PROVIDER_API_KEY=your_api_key
   ENABLE_NEW_PROVIDER=true
   ```

### Adding a New API Endpoint

1. **Define endpoint in main.py:**
   ```python
   @app.post("/new-endpoint")
   async def new_endpoint(data: RequestModel):
       # Implementation
       return {"result": "success"}
   ```

2. **Create request/response models:**
   ```python
   from pydantic import BaseModel
   
   class RequestModel(BaseModel):
       field1: str
       field2: Optional[int] = None
   ```

3. **Add frontend integration:**
   ```javascript
   const callNewEndpoint = async (data) => {
       const response = await fetch('/new-endpoint', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify(data)
       });
       return response.json();
   };
   ```

### Adding Frontend Components

1. **Create component file:**
   ```javascript
   // frontend/src/components/NewComponent.jsx
   import React, { useState } from 'react';
   
   function NewComponent({ props }) {
       const [state, setState] = useState();
       
       return (
           <div className="new-component">
               {/* Component JSX */}
           </div>
       );
   }
   
   export default NewComponent;
   ```

2. **Add component styles:**
   ```css
   /* frontend/src/ui.css */
   .new-component {
       /* Component styles */
   }
   ```

3. **Integrate in AppLayout or main.jsx:**
   ```javascript
   // For UI components, add to AppLayout.jsx
   import NewComponent from './NewComponent';
   
   function AppLayout({ /* props */ }) {
       return (
           <div>
               <NewComponent props={data} />
           </div>
       );
   }
   
   // For logic components, integrate in main.jsx
   function App() {
       // State management and logic coordination
       return (
           <AppLayout
               // Pass props to layout
           />
       );
   }
   ```

### Creating Custom Hooks

For feature-specific logic, create custom hooks:

```javascript
// frontend/src/hooks/useNewFeature.js
import { useState, useEffect, useCallback } from 'react';

export function useNewFeature(dependencies) {
    const [state, setState] = useState(initialState);
    
    const handleAction = useCallback(() => {
        // Feature logic here
    }, [dependencies]);
    
    useEffect(() => {
        // Side effects and cleanup
    }, [dependencies]);
    
    return {
        // Exposed state and functions
        state,
        handleAction
    };
}
```

### ShotTable Enhancements

The ShotTable component supports several advanced features:

1. **Multi-LLM Tabs**: Each row can display different AI summaries
2. **Bulk Tab Switching**: Header links to switch all rows to specific tabs
3. **Auto-Summary**: Configurable auto-generation on context switching
4. **Add to Notes**: Copy summaries to notes with selection support
5. **Prompt Type Selection**: Per-LLM prompt configuration

## Build and Deployment

### Production Build

#### Backend

```bash
cd backend
# Install production dependencies
pip install -r requirements.txt

# Run with production ASGI server
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker
```

#### Frontend

```bash
cd frontend
# Build for production
npm run build

# Serve static files (example with serve)
npm install -g serve
serve -s dist
```

### Environment Configuration

#### Production Environment Variables

```bash
# Backend production .env
DISABLE_LLM=false
DEMO_MODE=false
EMAIL_PROVIDER=gmail
OPENAI_API_KEY=prod_openai_key
SHOTGRID_URL=https://studio.shotgrid.autodesk.com
```

#### Security Considerations

- **API Keys**: Store in secure environment variables, never commit to code
- **CORS**: Configure appropriate origins for production
- **HTTPS**: Use HTTPS in production for WebSocket and API calls
- **Authentication**: Implement proper authentication for production use

## Contributing Guidelines

### Getting Started

1. **Fork the repository** and clone your fork
2. **Set up development environment** following setup instructions
3. **Create a feature branch** for your contribution
4. **Make your changes** following code style guidelines
5. **Test your changes** thoroughly
6. **Submit a pull request** with clear description

### Code Review Process

- **All changes** require code review before merging
- **Automated checks** must pass (linting, tests)
- **Documentation updates** required for new features
- **Breaking changes** require discussion and approval

### Issue Reporting

When reporting bugs or requesting features:

1. **Search existing issues** to avoid duplicates
2. **Use issue templates** when available
3. **Provide detailed reproduction steps** for bugs
4. **Include environment information** (OS, Python/Node versions)

### Documentation

- **Update relevant docs** when adding features
- **Follow markdown conventions** for consistency
- **Include code examples** for new APIs
- **Test documentation** for accuracy

See [Troubleshooting Guide](TROUBLESHOOTING.md) for common development issues.