# Quick Start Guide

Get the merged DNA application running in 5 minutes!

## Prerequisites Check

```bash
# Check Node.js version (need 18+)
node --version

# Check Python version (need 3.8+)
python --version

# Check npm
npm --version
```

## Fast Setup (3 Steps)

### Step 1: Build the Framework

```bash
cd shared/dna-frontend-framework
npm install
npm run build
cd ../..
```

### Step 2: Start the Backend

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create .env file (edit with your keys)
cp .env.example .env

# Start server
uvicorn main:app --reload --port 8000
```

Keep this terminal open!

### Step 3: Start the Frontend (New Terminal)

```bash
cd frontend

# Install dependencies
npm install

# Create .env file (edit with your keys)
cp .env.example .env

# Start dev server
npm run dev
```

## Access the App

Open http://localhost:5173 in your browser!

## Minimal Configuration

At minimum, you need:

**Backend `.env`:**
```env
GEMINI_API_KEY=your-key-here
GMAIL_SENDER=your-email@gmail.com
```

**Frontend `.env`:**
```env
VITE_VEXA_API_KEY=your-key-here
VITE_VEXA_URL=http://pe-vexa-sf-01v:18056
VITE_PLATFORM=google_meet
VITE_LLM_INTERFACE=litellm
VITE_LLM_MODEL=gemini-2.5-pro
VITE_LLM_API_KEY=your-key-here
VITE_LLM_BASEURL=https://litellm.k8s-prod.ilm-sf.lucasfilm.com
```

## What You Get

✅ Meeting transcription (via Vexa)  
✅ AI-powered note generation  
✅ Email integration  
✅ Version/shot tracking  
✅ Real-time transcript display  

## Troubleshooting

**"Module not found" error?**
```bash
cd shared/dna-frontend-framework
npm run build
```

**Backend won't start?**
- Check Python virtual environment is activated
- Verify .env file exists with API keys

**Frontend connection error?**
- Verify backend is running on http://localhost:8000
- Check Vexa URL is accessible from your network

**Can't resolve Vexa hostname?**
- You may need to be on the Lucasfilm VPN
- Update `VITE_VEXA_URL` to an accessible server

## Next Steps

- Read the full [README.md](README.md) for detailed configuration
- Set up Gmail API for email features
- Configure ShotGrid integration (optional)
- Customize LLM providers and prompts

## Development Workflow

After the initial setup, your daily workflow is:

```bash
# Terminal 1: Backend
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 8000

# Terminal 2: Frontend
cd frontend
npm run dev
```

That's it! 🚀
