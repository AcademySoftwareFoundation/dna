## Merged ILM + SPI Prototypes Ported to QT

This iteration of DNA is for ideas generation for what the UI should look and behave like. It is also intended for first tests to gauge utility of this LLM infused workflow. 

> [!IMPORTANT]  
> /frontend_v3 is the frontend to use. The other two are tests/iterations. I have tested frontend_v3 on Fedora (ARM) and Ubuntu (x86) as well as Mac ARM. 

## Features

### Main:
- Vexa Integration for transcribing meetings.
- LLM integration for creating AI notes from those meetings.
- ShotGrid integration for pulling and pushing playlists and notes.

### Extra:
- Collapsible UI
- Markdown Support
- Image attachment Support
- Pinning and pausing transcript streams
- Extensive keyboard shortcuts (Working on making configurable)


## Requirements

Backend:
```
fastapi
uvicorn
python-multipart
pydantic
pydantic[email]
requests
python-dotenv
grpcio
openai
anthropic
google-generativeai
google_auth_oauthlib
six
shotgun_api3
```

Frontend:
```
PySide6>=6.8.0
websockets>=12.0
requests>=2.31.0
aiohttp>=3.9.0
```


## Set-up Guide

Clone the Repo:
```
git clone https://github.com/camerontarget14/dna <your desired target directory>
```

Find the right directories (in two terminals):
```
cd experimental/cameron/backend
```
```
cd experimental/cameron/frontend_v3
```

Create virtual environments in both directories(requires python 3.11 per VFX platform and SG API compatibility)
```
python3.11 -m venv venv
```

Activate virtual environments in both directories:
```
source venv/bin/activate
```

Install requirements in both directories:
```
pip3 install -r requirements
```

Run backend in /backend:
```
python3 -m uvicorn main:app --reload --port 8000
```

Run frontend in /frontend_v3:
```
python3 main.py
```
