# filepath: /Users/loorthu/Documents/GitHub/loorthu_dna/experimental/spi/note_assistant_v2/backend/llm_service.py
import os
import random
import requests
import pandas as pd
import sys
import tempfile
import shutil
import subprocess
import csv
from datetime import datetime
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel

router = APIRouter()

class LLMSummaryRequest(BaseModel):
    text: str

class ProcessRecordingRequest(BaseModel):
    recording_url: str
    recipient_email: str
    shotgrid_data: list  # Array of {shot, notes, transcription, ...}
    selected_project_name: str = ""  # Optional selected project name from UI
    playlist_name: str = ""  # Optional playlist name for email subject

# --- LLM IMPLEMENTATION CODE ---

import os
import yaml
import requests
from openai import OpenAI
import anthropic
import google.generativeai as genai
import re
from dotenv import load_dotenv

import json
import types
from datetime import datetime

# Load environment variables at module level
load_dotenv()

# === Gemini Response Debugging ===

def _primitiveize(obj, _depth=0, _max_depth=6):
    """
    Try to convert an arbitrary SDK object into JSON-serializable primitives.
    Handles dict/list/tuple/str/int/float/bool/None, objects with to_dict(), __dict__,
    and falls back to attribute inspection for non-callable public attrs.
    """
    if _depth > _max_depth:
        return f"<Max depth {_max_depth} reached>"
    # primitives
    if obj is None or isinstance(obj, (str, int, float, bool)):
        return obj
    if isinstance(obj, (list, tuple)):
        return [_primitiveize(x, _depth+1, _max_depth) for x in obj]
    if isinstance(obj, dict):
        return {str(k): _primitiveize(v, _depth+1, _max_depth) for k, v in obj.items()}

    # Some SDK objects have .to_dict() or .as_dict()
    for name in ("to_dict", "toJSON", "as_dict", "asDict", "dict"):
        fn = getattr(obj, name, None)
        if callable(fn):
            try:
                return _primitiveize(fn(), _depth+1, _max_depth)
            except Exception:
                pass

    # Try __dict__ (works for many simple objects)
    if hasattr(obj, "__dict__"):
        try:
            return _primitiveize(vars(obj), _depth+1, _max_depth)
        except Exception:
            pass

    # For protobuf messages, this will often fail if protobuf isn't available; try to fallback below.

    # Last resort: inspect public attributes (non-callable)
    result = {}
    try:
        for attr in dir(obj):
            if attr.startswith("_"):
                continue
            try:
                val = getattr(obj, attr)
            except Exception:
                continue
            if callable(val):
                continue
            # skip large binary-ish fields
            if isinstance(val, (bytes, bytearray)):
                result[attr] = f"<{type(val).__name__} of length {len(val)}>"
                continue
            # avoid recursion on self-references
            if val is obj:
                continue
            try:
                result[attr] = _primitiveize(val, _depth+1, _max_depth)
            except Exception:
                try:
                    result[attr] = str(val)
                except Exception:
                    result[attr] = f"<unserializable {type(val).__name__}>"
    except Exception:
        return str(obj)

    # if nothing useful found, fall back to string
    if not result:
        try:
            return str(obj)
        except Exception:
            return f"<unserializable {type(obj).__name__}>"
    return result

def inspect_response(response, dump_path_prefix=None, verbose=True):
    """
    Inspect a Gemini 'response' object returned by client.generate_content(...).

    - Prints a short summary (finish_reason, partial text).
    - Searches for common safety/moderation fields and prints them first.
    - Saves a full JSON dump to disk if dump_path_prefix is provided (uses timestamp).
    """
    # Defensive: check structure
    try:
        candidates = getattr(response, "candidates", None) or getattr(response, "outputs", None) or response
    except Exception:
        candidates = None

    # Normalize candidates into a list-like object
    if candidates is None:
        print("No candidates found on the response object.")
        print("Raw response primitiveized:")
        print(json.dumps(_primitiveize(response), indent=2))
        return

    # If response.candidates is a single object, wrap it
    if not isinstance(candidates, (list, tuple)):
        candidates = [candidates]

    # Build diagnostics for each candidate
    summary = []
    for i, cand in enumerate(candidates):
        entry = {}
        # finish_reason — common field
        fr = getattr(cand, "finish_reason", None)
        entry["finish_reason"] = fr

        # try to extract content text quickly (SDKs vary)
        text = None
        try:
            # common shapes: cand.content.parts[0].text OR cand.text
            content = getattr(cand, "content", None)
            if content:
                parts = getattr(content, "parts", None)
                if parts and len(parts) > 0:
                    # Some SDK part objects have .text or .content
                    first = parts[0]
                    text = getattr(first, "text", None) or getattr(first, "content", None) or _primitiveize(first)
                else:
                    # maybe content is already a string
                    text = getattr(content, "text", None) or getattr(content, "content", None) or (content if isinstance(content, str) else None)
            if text is None:
                text = getattr(cand, "text", None) or getattr(cand, "output_text", None)
        except Exception:
            text = None

        entry["partial_text_preview"] = (text[:800] + "...") if isinstance(text, str) and len(text) > 800 else text

        # Common safety/moderation-like fields to look for explicitly
        suspects = {}
        for key in ("safety", "safety_ratings", "safety_metadata", "moderation", "moderation_result",
                    "filters", "content_filter", "content_filters", "metadata", "details", "detectors"):
            v = getattr(cand, key, None)
            if v is not None:
                suspects[key] = _primitiveize(v)
        # Also check candidate-level metadata container (some SDKs use .metadata)
        if hasattr(cand, "metadata"):
            try:
                suspects["metadata"] = _primitiveize(getattr(cand, "metadata"))
            except Exception:
                pass

        entry["suspicious_fields"] = suspects

        # Add full primitiveized candidate (optionally heavy)
        entry["candidate_full"] = _primitiveize(cand)

        summary.append(entry)

    # Print a human-friendly summary
    if verbose:
        print("=== Gemini response inspection ===")
        for i, e in enumerate(summary):
            print(f"\n--- Candidate {i} ---")
            print("finish_reason:", e.get("finish_reason"))
            pt = e.get("partial_text_preview")
            if pt:
                print("partial_text (preview):")
                print(pt)
            else:
                print("partial_text: <none>")

            if e["suspicious_fields"]:
                print("\nDetected moderation/safety-like fields:")
                for k, v in e["suspicious_fields"].items():
                    print(f" - {k}:")
                    # pretty print small objects, otherwise print keys
                    try:
                        pretty = json.dumps(v, indent=2) if (isinstance(v, (dict, list)) and len(json.dumps(v)) < 4000) else str(type(v))
                        print(pretty)
                    except Exception:
                        print(str(type(v)))
            else:
                print("No explicit safety/moderation fields found on candidate (see full dump).")

    # Optionally save a full dump to disk (useful to attach to bug reports)
    if dump_path_prefix:
        ts = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
        filename = f"{dump_path_prefix}_{ts}.json"
        try:
            with open(filename, "w", encoding="utf-8") as fh:
                json.dump(summary, fh, indent=2)
            print(f"\nFull diagnostic dump saved to: {filename}")
        except Exception as ex:
            print("Failed to save diagnostic dump:", ex)

    # Return structured summary for programmatic use
    return summary

# === CONFIGURATION LOADING ===
def load_llm_prompts():
    """Load LLM prompts configuration from YAML file. Checks for user config first, falls back to factory defaults."""
    base_dir = os.path.dirname(__file__)
    user_config_path = os.path.join(base_dir, 'llm_prompts.yaml')
    factory_config_path = os.path.join(base_dir, 'llm_prompts.factory.yaml')

    # Try to load user configuration first
    if os.path.exists(user_config_path):
        print(f"Loading user LLM prompts configuration from: {user_config_path}")
        with open(user_config_path, 'r') as f:
            config = yaml.safe_load(f)
    else:
        # Fall back to factory configuration
        print(f"Loading factory LLM prompts configuration from: {factory_config_path}")
        with open(factory_config_path, 'r') as f:
            config = yaml.safe_load(f)

    # Post-process: join user_prompt_template_parts if present
    for prompt_type in list(config.keys()):
        if prompt_type == 'format_context':
            continue  # Skip the anchor definition
        if isinstance(config[prompt_type], dict) and 'user_prompt_template_parts' in config[prompt_type]:
            # Join the parts into a single template
            parts = config[prompt_type]['user_prompt_template_parts']
            config[prompt_type]['user_prompt_template'] = '\n'.join(str(part) for part in parts)
            # Remove the parts field
            del config[prompt_type]['user_prompt_template_parts']

    return config

def load_llm_models():
    """Load LLM models configuration from YAML file. Checks for user config first, falls back to factory defaults."""
    base_dir = os.path.dirname(__file__)
    user_config_path = os.path.join(base_dir, 'llm_models.yaml')
    factory_config_path = os.path.join(base_dir, 'llm_models.factory.yaml')
    
    # Try to load user configuration first
    if os.path.exists(user_config_path):
        print(f"Loading user LLM models configuration from: {user_config_path}")
        with open(user_config_path, 'r') as f:
            return yaml.safe_load(f)
    
    # Fall back to factory configuration
    print(f"Loading factory LLM models configuration from: {factory_config_path}")
    with open(factory_config_path, 'r') as f:
        return yaml.safe_load(f)

def load_llm_config():
    """Load combined LLM configuration for backward compatibility."""
    models_config = load_llm_models()
    
    # Return models configuration directly since prompts are now handled separately
    return {
        'default': models_config.get('default', {}),
        'models': models_config.get('models', []),
        'model_overrides': models_config.get('model_overrides', {})
    }

def get_model_config(provider, model=None, config=None, prompt_type="short"):
    """Get configuration for a specific provider/model, merging defaults with model-specific overrides."""
    if config is None:
        config = LLM_CONFIG

    # Use cached configurations to avoid redundant file I/O
    models_config = get_cached_models_config()
    merged_config = models_config.get('default', {}).copy()

    # Add prompts from the specified prompt type
    prompts_config = get_cached_prompts_config()
    if prompt_type in prompts_config:
        merged_config.update(prompts_config[prompt_type])
    else:
        # Fall back to first available prompt type if specified one doesn't exist
        available_prompt_types = list(prompts_config.keys())
        if available_prompt_types:
            fallback_prompt = available_prompt_types[0]
            merged_config.update(prompts_config[fallback_prompt])

    # Apply model-specific overrides if specified
    if model and 'model_overrides' in models_config and model in models_config['model_overrides']:
        merged_config.update(models_config['model_overrides'][model])

    return merged_config



def get_available_models(config=None):
    """Get list of all available models with their display information."""
    if config is None:
        config = LLM_CONFIG
    
    return config.get('models', [])

def get_enabled_providers():
    """Get list of enabled LLM providers based on environment variables."""
    enabled = []
    if os.getenv('ENABLE_OPENAI', 'false').lower() in ('1', 'true', 'yes'):
        enabled.append('openai')
    if os.getenv('ENABLE_ANTHROPIC', 'false').lower() in ('1', 'true', 'yes'):
        enabled.append('anthropic')
    if os.getenv('ENABLE_OLLAMA', 'false').lower() in ('1', 'true', 'yes'):
        enabled.append('ollama')
    if os.getenv('ENABLE_GOOGLE', 'false').lower() in ('1', 'true', 'yes'):
        enabled.append('google')
    return enabled

def get_available_models_for_enabled_providers():
    """Get models that are available for enabled providers."""
    enabled_providers = get_enabled_providers()
    available_models = []
    
    for model in LLM_CONFIG.get('models', []):
        if model['provider'] in enabled_providers:
            available_models.append(model)
    
    return available_models

def get_models_for_provider(provider):
    """Get all model configurations for a specific provider."""
    models = []
    for model in LLM_CONFIG.get('models', []):
        if model['provider'] == provider:
            models.append(model)
    return models

def get_model_for_provider(provider):
    """Get the first model name for a specific provider from configuration (for backward compatibility)."""
    models = get_models_for_provider(provider)
    return models[0]['model_name'] if models else None

# Load configuration
LLM_CONFIG = load_llm_config()

# Cache for loaded configurations to avoid redundant file I/O
_PROMPTS_CONFIG_CACHE = None
_MODELS_CONFIG_CACHE = None

def clear_config_cache():
    """Clear configuration cache - useful for reloading after config changes."""
    global _PROMPTS_CONFIG_CACHE, _MODELS_CONFIG_CACHE
    _PROMPTS_CONFIG_CACHE = None
    _MODELS_CONFIG_CACHE = None

def get_cached_prompts_config():
    """Get cached prompts configuration, loading once if needed."""
    global _PROMPTS_CONFIG_CACHE
    if _PROMPTS_CONFIG_CACHE is None:
        _PROMPTS_CONFIG_CACHE = load_llm_prompts()
    return _PROMPTS_CONFIG_CACHE

def get_cached_models_config():
    """Get cached models configuration, loading once if needed."""
    global _MODELS_CONFIG_CACHE
    if _MODELS_CONFIG_CACHE is None:
        _MODELS_CONFIG_CACHE = load_llm_models()
    return _MODELS_CONFIG_CACHE

def summarize_openai(conversation, model, client, config):
    prompt = config['user_prompt_template'].format(conversation=conversation)
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": config['system_prompt']},
            {"role": "user", "content": prompt}
        ],
        temperature=config['temperature'],
    )
    return response.choices[0].message.content

def summarize_claude(conversation, model, client, config):
    prompt = config['user_prompt_template'].format(conversation=conversation)
    response = client.messages.create(
        model=model,
        max_tokens=config['max_tokens'],
        temperature=config['temperature'],
        messages=[
            {"role": "system", "content": config['system_prompt']},
            {"role": "user", "content": prompt}
        ]
    )
    return response.content[0].text

def summarize_ollama(conversation, model, client, config):
    prompt = config['system_prompt'] + "\n\n" + config['user_prompt_template'].format(conversation=conversation)
    ollama_base_url = os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434')
    response = client.post(
        f"{ollama_base_url}/api/generate",
        json={"model": model, "prompt": prompt, "stream": False}
    )
    return response.json()["response"]

def summarize_gemini(conversation, model, client, config):
    full_prompt = f"{config['system_prompt']}\n\n{config['user_prompt_template'].format(conversation=conversation)}"
    response = client.generate_content(
        full_prompt,
        generation_config=genai.types.GenerationConfig(
            max_output_tokens=config['max_tokens'],
            temperature=config['temperature'],
        )
    )
    
    if not response.candidates:
        # Inspect & dump to ./debug_gemini
        diagnostics = inspect_response(response, dump_path_prefix="./debug_gemini_no_candidates")
        print("No response candidates returned. Inspect the dump for details.")
        raise Exception("No response candidates returned from Gemini")
    candidate = response.candidates[0]
    if candidate.finish_reason == 2:
        # Inspect & dump to ./debug_gemini
        diagnostics = inspect_response(response, dump_path_prefix="./debug_gemini_safety_block")
        # If candidate indicates a safety block, print the category if available:
        print("Likely safety block. Inspect 'suspicious_fields' in the dump for details.")
        raise Exception("Response blocked by Gemini safety filters")
    elif candidate.finish_reason == 3:
        # Inspect & dump to ./debug_gemini
        diagnostics = inspect_response(response, dump_path_prefix="./debug_gemini_recitation")
        print("Response blocked due to recitation concerns. Inspect the dump for details.")
        raise Exception("Response blocked due to recitation concerns")
    elif candidate.finish_reason == 4:
        # Inspect & dump to ./debug_gemini
        diagnostics = inspect_response(response, dump_path_prefix="./debug_gemini_other_block")
        print("Response blocked for other reasons. Inspect the dump for details.")
        raise Exception("Response blocked for other reasons")
    if not candidate.content or not candidate.content.parts:
        # Inspect & dump to ./debug_gemini
        diagnostics = inspect_response(response, dump_path_prefix="./debug_gemini_no_content")
        print("No content parts in response. Inspect the dump for details.")
        raise Exception("No content parts in response")
    return candidate.content.parts[0].text

def create_llm_client(provider, api_key=None, model=None):
    provider = provider.lower()
    if provider == "openai":
        if not api_key:
            raise ValueError("OpenAI requires an api_key.")
        return OpenAI(api_key=api_key)
    elif provider == "claude":
        if not api_key:
            raise ValueError("Anthropic Claude requires an api_key.")
        return anthropic.Anthropic(api_key=api_key)
    elif provider == "ollama":
        return requests.Session()
    elif provider == "gemini":
        if not api_key:
            raise ValueError("Gemini requires an api_key.")
        if not model:
            raise ValueError("Gemini requires a model name.")
        genai.configure(api_key=api_key)
        return genai.GenerativeModel(model)
    else:
        raise ValueError(f"Unsupported provider: {provider}")

# --- Initialize enabled LLM clients ---
enabled_providers = get_enabled_providers()
print(f"Enabled LLM providers: {enabled_providers}")

# Initialize clients for enabled providers
llm_clients = {}

if 'google' in enabled_providers:
    gemini_api_key = os.getenv("GEMINI_API_KEY")
    gemini_models = get_models_for_provider("google")
    if gemini_api_key and gemini_models:
        for model_config in gemini_models:
            model_name = model_config['model_name']
            try:
                client_key = f"google_{model_name}"
                llm_clients[client_key] = {
                    'client': create_llm_client("gemini", api_key=gemini_api_key, model=model_name),
                    'model': model_name,
                    'provider': 'google',
                    'config': model_config
                }
                print(f"Initialized Gemini client with model: {model_name}")
            except Exception as e:
                print(f"Error initializing Gemini client for {model_name}: {e}")

if 'openai' in enabled_providers:
    openai_api_key = os.getenv("OPENAI_API_KEY")
    openai_models = get_models_for_provider("openai")
    if openai_api_key and openai_models:
        for model_config in openai_models:
            model_name = model_config['model_name']
            try:
                client_key = f"openai_{model_name}"
                llm_clients[client_key] = {
                    'client': create_llm_client("openai", api_key=openai_api_key, model=model_name),
                    'model': model_name,
                    'provider': 'openai',
                    'config': model_config
                }
                print(f"Initialized OpenAI client with model: {model_name}")
            except Exception as e:
                print(f"Error initializing OpenAI client for {model_name}: {e}")

if 'anthropic' in enabled_providers:
    claude_api_key = os.getenv("CLAUDE_API_KEY")
    claude_models = get_models_for_provider("anthropic")
    if claude_api_key and claude_models:
        for model_config in claude_models:
            model_name = model_config['model_name']
            try:
                client_key = f"anthropic_{model_name}"
                llm_clients[client_key] = {
                    'client': create_llm_client("claude", api_key=claude_api_key, model=model_name),
                    'model': model_name,
                    'provider': 'anthropic',
                    'config': model_config
                }
                print(f"Initialized Claude client with model: {model_name}")
            except Exception as e:
                print(f"Error initializing Claude client for {model_name}: {e}")

if 'ollama' in enabled_providers:
    ollama_models = get_models_for_provider("ollama")
    if ollama_models:
        for model_config in ollama_models:
            model_name = model_config['model_name']
            try:
                client_key = f"ollama_{model_name}"
                llm_clients[client_key] = {
                    'client': create_llm_client("ollama"),
                    'model': model_name,
                    'provider': 'ollama',
                    'config': model_config
                }
                print(f"Initialized Ollama client with model: {model_name}")
            except Exception as e:
                print(f"Error initializing Ollama client for {model_name}: {e}")



DISABLE_LLM = os.getenv('DISABLE_LLM', 'true').lower() in ('1', 'true', 'yes')

# Check if LLM backend routing is configured
LLM_BACKEND_BASE_URL = os.environ.get("LLM_BACKEND_BASE_URL")
llm_backend_routing_enabled = bool(LLM_BACKEND_BASE_URL and LLM_BACKEND_BASE_URL.strip())

def route_to_llm_backend(endpoint, method="GET", data=None, params=None):
    """Route request to LLM backend server."""
    if not llm_backend_routing_enabled:
        raise HTTPException(status_code=500, detail="LLM backend routing not configured")
    
    url = f"{LLM_BACKEND_BASE_URL.rstrip('/')}{endpoint}"
    
    try:
        if method.upper() == "GET":
            response = requests.get(url, params=params, timeout=30)
        elif method.upper() == "POST":
            response = requests.post(url, json=data, timeout=30)
        else:
            raise ValueError(f"Unsupported HTTP method: {method}")
        
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=500, detail=f"Error routing to LLM backend: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error routing to LLM backend: {str(e)}")

@router.get("/available-models")
async def get_available_models_endpoint():
    """
    Get list of available LLM models based on enabled providers.
    """
    # Route to LLM backend if configured
    if llm_backend_routing_enabled:
        try:
            return route_to_llm_backend("/available-models", method="GET")
        except HTTPException:
            raise
        except Exception as e:
            print(f"Error routing to LLM backend for /available-models: {e}")
            # Fall back to local processing if routing fails
    
    try:
        available_models = get_available_models_for_enabled_providers()
        enabled_providers = get_enabled_providers()
        
        # Get available prompt types
        prompts_config = load_llm_prompts()
        available_prompt_types = list(prompts_config.keys())
        
        return {
            "available_models": available_models,
            "enabled_providers": enabled_providers,
            "available_prompt_types": available_prompt_types,
            "disable_llm": DISABLE_LLM,
            "llm_backend_routing_enabled": llm_backend_routing_enabled
        }
    except Exception as e:
        print(f"Error in /available-models: {e}")
        raise HTTPException(status_code=500, detail=f"Error getting available models: {str(e)}")

@router.post("/llm-summary")
async def llm_summary(request: dict):
    """
    Generate a summary using specified or available LLM providers.
    """
    # Route to LLM backend if configured
    if llm_backend_routing_enabled:
        try:
            return route_to_llm_backend("/llm-summary", method="POST", data=request)
        except HTTPException as e:
            raise
        except Exception as e:
            # Fall back to local processing if routing fails
            pass
    
    text = request.get("text", "")
    llm_model = request.get("llm_model")  # Specific model key like "google_gemini-1.5-pro"
    llm_provider = request.get("llm_provider")  # Fallback to provider
    prompt_type = request.get("prompt_type")  # No default assumption
    
    # If no prompt_type specified, use the first available one
    if not prompt_type:
        prompts_config = load_llm_prompts()
        available_prompt_types = list(prompts_config.keys())
        prompt_type = available_prompt_types[0] if available_prompt_types else "short"
    
    if DISABLE_LLM:
        # Return a random summary for testing
        random_summaries = [
            "The team discussed lighting and animation improvements.",
            "Minor tweaks needed for character animation; background approved.",
            "Action items: soften shadows, adjust highlight gain, improve hand motion.",
            "Most notes addressed; only a few minor issues remain.",
            "Ready for final review after next round of changes.",
            "Feedback: color grade is close, but highlights too hot.",
            "Artist to be notified about animation and lighting feedback.",
            "Overall progress is good; next steps communicated to the team."
        ]
        return {"summary": random.choice(random_summaries), "routed": False}
    
    if not llm_clients:
        raise HTTPException(status_code=500, detail="No LLM clients initialized.")
    
    # Choose model: use specific model if available, otherwise use provider, otherwise use first available
    selected_client_key = None
    
    if llm_model:
        # Try direct match first
        if llm_model in llm_clients:
            selected_client_key = llm_model
        else:
            # Try to find model by matching the model name part
            for key, client_info in llm_clients.items():
                if client_info['model'] == llm_model:
                    selected_client_key = key
                    break
    
    if not selected_client_key and llm_provider:
        # Find first model for this provider
        for key in llm_clients.keys():
            if llm_clients[key]['provider'] == llm_provider:
                selected_client_key = key
                break
    
    if not selected_client_key:
        # Use first available
        selected_client_key = list(llm_clients.keys())[0]
    
    if not selected_client_key:
        raise HTTPException(status_code=500, detail=f"No client found for model: {llm_model} or provider: {llm_provider}")
    
    client_info = llm_clients[selected_client_key]
    client = client_info['client']
    model = client_info['model']
    provider = client_info['provider']
    
    try:
        config = get_model_config(provider, model, prompt_type=prompt_type)
        
        if provider == 'openai':
            summary = summarize_openai(text, model, client, config)
        elif provider == 'anthropic':
            summary = summarize_claude(text, model, client, config)
        elif provider == 'ollama':
            summary = summarize_ollama(text, model, client, config)
        elif provider == 'google':
            summary = summarize_gemini(text, model, client, config)
        else:
            raise HTTPException(status_code=500, detail=f"Unsupported provider: {provider}")
        
        return {"summary": summary, "provider": provider, "model": model, "prompt_type": prompt_type, "routed": False}
    except Exception as e:
        print(f"Error in /llm-summary with {provider}: {e}")
        # Return error in summary field instead of raising exception
        return {"summary": f"Error: {str(e)}", "provider": provider, "model": model, "prompt_type": prompt_type, "routed": False, "error": True}

# --- GOOGLE MEET RECORDING PROCESSING ---

def process_recording_task(recording_url: str, recipient_email: str, shotgrid_data: list, selected_project_name: str = "", playlist_name: str = ""):
    """
    Background task: Process Google Meet recording and email results.
    This function runs asynchronously in the background.

    Strategy: Call the existing process_gmeet_recording.py script as a subprocess.
    All logic (downloading, extracting, LLM processing, emailing) is already there.
    """
    temp_dir = None
    log_file_path = None

    try:
        # Create temporary directory for ShotGrid CSV and logs
        temp_dir = tempfile.mkdtemp(prefix="past_recording_")
        sg_csv_path = os.path.join(temp_dir, "shotgrid_playlist.csv")

        # Create timestamped log file
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        logs_dir = os.path.join(os.path.dirname(__file__), 'logs')
        os.makedirs(logs_dir, exist_ok=True)
        log_file_path = os.path.join(logs_dir, f"past_recording_{timestamp}.log")

        print(f"Log file: {log_file_path}")

        # Extract project name from uploaded ShotGrid data
        # Look for version field in the first row (e.g., "project-123" -> "project")
        project_name = ''
        if shotgrid_data and len(shotgrid_data) > 0:
            first_row = shotgrid_data[0]
            shot_field = first_row.get('shot', '')

            # Try to extract from shot field (format: "shot_name/version_name")
            if '/' in shot_field:
                version_name = shot_field.split('/', 1)[1]
                # Extract project prefix from version name (e.g., "project-123" -> "project")
                if '-' in version_name:
                    project_name = version_name.split('-')[0]

        # Fallback to selected project from UI parameter
        if not project_name and selected_project_name:
            project_name = selected_project_name

        print(f"Extracted project name: {project_name or '(none)'}")

        # Build command to run process_gmeet_recording.py
        tools_dir = os.path.join(os.path.dirname(__file__), 'tools')
        script_path = os.path.join(tools_dir, 'process_gmeet_recording.py')

        # Determine which LLM model to use (first available)
        if not llm_clients:
            raise Exception("No LLM clients available")

        client_key = list(llm_clients.keys())[0]
        client_info = llm_clients[client_key]
        model_name = client_info['model']

        # Read configuration from environment variables
        version_pattern = os.getenv('GMEET_VERSION_PATTERN', r'(\d+)')

        # Replace {project} or $project placeholder with actual project name
        if project_name:
            version_pattern = version_pattern.replace('{project}', project_name)
            version_pattern = version_pattern.replace('$project', project_name)

        version_column = os.getenv('SG_CSV_VERSION_FIELD', 'jts').split(',')[0]  # Use first field
        audio_model = os.getenv('GMEET_AUDIO_MODEL', 'base')
        frame_interval = os.getenv('GMEET_FRAME_INTERVAL', '5.0')
        batch_size = os.getenv('GMEET_BATCH_SIZE', '20')
        reference_threshold = os.getenv('GMEET_REFERENCE_THRESHOLD', '30')
        parallel = os.getenv('GMEET_PARALLEL', 'false').lower() == 'true'
        prompt_type = os.getenv('GMEET_PROMPT_TYPE', 'short')
        thumbnail_url = os.getenv('GMEET_THUMBNAIL_URL', '')
        duration = os.getenv('GMEET_DURATION', '')
        # Build email subject from playlist name if available
        if playlist_name:
            # Strip .csv extension if present
            email_subject = playlist_name[:-4] if playlist_name.endswith('.csv') else playlist_name
        else:
            email_subject = os.getenv('GMEET_EMAIL_SUBJECT', 'Dailies Review Data - Version Notes and Summaries')

        # Replace {project} or $project placeholder in thumbnail URL
        if project_name and thumbnail_url:
            thumbnail_url = thumbnail_url.replace('{project}', project_name)
            thumbnail_url = thumbnail_url.replace('$project', project_name)

        # Update the CSV to use the correct version column name
        # Re-create the CSV with the correct column name for version_column
        print(f"Re-creating ShotGrid CSV with version column '{version_column}'...")
        with open(sg_csv_path, 'w', newline='', encoding='utf-8') as csvfile:
            # Use the version_column name from config instead of generic 'Version'
            fieldnames = ['shot', version_column, 'notes']
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            writer.writeheader()

            # Write each row from shotgrid_data
            for row in shotgrid_data:
                # Parse shot field which might contain "shot_name/version_name"
                shot_field = row.get('shot', '')
                if '/' in shot_field:
                    shot_name, version_name = shot_field.split('/', 1)
                else:
                    shot_name = shot_field
                    version_name = ''

                writer.writerow({
                    'shot': shot_name,
                    version_column: version_name,  # Use the correct column name
                    'notes': row.get('notes', '')
                })

        # Build command arguments
        cmd = [
            sys.executable,  # Use current Python interpreter
            script_path,
            recording_url,  # Google Drive URL (script handles download)
            sg_csv_path,  # ShotGrid playlist CSV
            recipient_email,  # Email address (positional arg - must come before optional flags)
            '--version-pattern', version_pattern,
            '--version-column', version_column,
            '--model', model_name,
            '--drive-url', recording_url,  # For clickable timestamps
            '--audio-model', audio_model,
            '--frame-interval', frame_interval,
            '--batch-size', batch_size,
            '--reference-threshold', reference_threshold,
            '--prompt-type', prompt_type,
            '--email-subject', email_subject,
            '--verbose'
        ]

        # Add optional arguments
        if parallel:
            cmd.append('--parallel')

        # Keep intermediate files if configured
        keep_intermediate = os.getenv('GMEET_KEEP_INTERMEDIATE', 'false').lower() == 'true'
        if keep_intermediate:
            cmd.append('--keep-intermediate')

        # Add duration limit if configured
        if duration:
            try:
                duration_seconds = float(duration)
                if duration_seconds > 0:
                    cmd.extend(['--duration', str(duration_seconds)])
                    print(f"Duration limit enabled: processing first {duration_seconds} seconds")
            except ValueError:
                print(f"Warning: Invalid GMEET_DURATION value '{duration}', ignoring")

        if thumbnail_url:
            cmd.extend(['--thumbnail-url', thumbnail_url])

        # Enable caching if GMEET_CACHE_DIR is configured
        cache_dir = os.getenv('GMEET_CACHE_DIR', '')
        if cache_dir and project_name:
            # Convert relative path to absolute path (relative to backend directory)
            if not os.path.isabs(cache_dir):
                cache_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), cache_dir))

            cmd.extend(['--output', cache_dir])
            cmd.extend(['--project', project_name])
            print(f"Cache enabled: recordings will be cached in {cache_dir}/{project_name}/")
        else:
            print("Cache disabled: using temporary files only")
            if not cache_dir:
                print("  Reason: GMEET_CACHE_DIR not set")
            if not project_name:
                print("  Reason: project_name not available")

        print(f"Running command: {' '.join(cmd)}")

        print(f"Command: {' '.join(cmd)}")
        print(f"Log file: {log_file_path}")
        print(f"Temp ShotGrid CSV: {sg_csv_path}")
        #return  # TEMPORARY: Remove this return to actually execute the command

        # Run the subprocess and capture output to log file
        import time
        start_time = time.time()

        with open(log_file_path, 'w') as log_file:
            log_file.write(f"=== Google Meet Past Recording Processing ===\n")
            log_file.write(f"Started: {datetime.now().isoformat()}\n")
            log_file.write(f"Recording URL: {recording_url}\n")
            log_file.write(f"Recipient: {recipient_email}\n")
            log_file.write(f"Shots: {len(shotgrid_data)}\n")
            log_file.write(f"Command: {' '.join(cmd)}\n")
            log_file.write(f"\n{'='*60}\n\n")
            log_file.flush()

            # Run subprocess with output redirected to log file
            process = subprocess.Popen(
                cmd,
                stdout=log_file,
                stderr=subprocess.STDOUT,
                text=True,
                cwd=tools_dir
            )

            # Wait for completion
            return_code = process.wait()

            # Calculate execution time
            elapsed_seconds = time.time() - start_time
            hours = int(elapsed_seconds // 3600)
            minutes = int((elapsed_seconds % 3600) // 60)
            seconds = int(elapsed_seconds % 60)

            if hours > 0:
                elapsed_str = f"{hours}h {minutes}m {seconds}s"
            elif minutes > 0:
                elapsed_str = f"{minutes}m {seconds}s"
            else:
                elapsed_str = f"{seconds}s"

            log_file.write(f"\n{'='*60}\n")
            log_file.write(f"Completed: {datetime.now().isoformat()}\n")
            log_file.write(f"Duration: {elapsed_str} ({elapsed_seconds:.2f} seconds)\n")
            log_file.write(f"Return code: {return_code}\n")

        if return_code != 0:
            raise Exception(f"Processing failed with return code {return_code}. Check log: {log_file_path}")

        print(f"Processing completed in {elapsed_str}! Log: {log_file_path}")

    except Exception as e:
        error_msg = f"Error processing Google Meet recording: {str(e)}"
        print(error_msg)

        # Log the error
        if log_file_path:
            try:
                with open(log_file_path, 'a') as log_file:
                    log_file.write(f"\n{'='*60}\n")
                    log_file.write(f"ERROR: {error_msg}\n")
                    log_file.write(f"{'='*60}\n")
            except:
                pass

        # Note: Error email would be sent by the process_gmeet_recording.py script if it fails
        # We don't need to send error notification here

    finally:
        # Clean up temporary directory (ShotGrid CSV)
        # Keep log file for debugging
        if temp_dir and os.path.exists(temp_dir):
            try:
                shutil.rmtree(temp_dir)
                print(f"Cleaned up temporary directory: {temp_dir}")
            except Exception as e:
                print(f"Failed to clean up temp directory: {e}")

@router.post("/process-past-recording")
async def process_past_recording(
    request: ProcessRecordingRequest,
    background_tasks: BackgroundTasks
):
    """
    Process a past Google Meet recording asynchronously.

    The recording will be downloaded, processed, and results emailed.
    This endpoint returns immediately; processing happens in background.
    """
    # Validate inputs
    if not request.recording_url or not request.recording_url.strip():
        raise HTTPException(status_code=400, detail="recording_url is required")

    if not request.recipient_email or not request.recipient_email.strip():
        raise HTTPException(status_code=400, detail="recipient_email is required")

    if not request.shotgrid_data or len(request.shotgrid_data) == 0:
        raise HTTPException(
            status_code=400,
            detail="shotgrid_data is required. Please upload a ShotGrid playlist first."
        )

    # Validate Google Drive URL format
    if "drive.google.com" not in request.recording_url:
        raise HTTPException(
            status_code=400,
            detail="Invalid Google Drive URL. Must be a drive.google.com link"
        )

    # Pre-validate project name extraction (before background task starts)
    version_pattern = os.getenv('GMEET_VERSION_PATTERN', r'(\d+)')
    has_placeholder = '{project}' in version_pattern or '$project' in version_pattern

    if has_placeholder:
        # Tier 1: Try to extract project name from uploaded CSV data
        project_name = ''
        if request.shotgrid_data and len(request.shotgrid_data) > 0:
            first_row = request.shotgrid_data[0]
            shot_field = first_row.get('shot', '')

            # Try to extract from shot field (format: "shot_name/version_name")
            if '/' in shot_field:
                version_name = shot_field.split('/', 1)[1]
                # Extract project prefix from version name (e.g., "project-123" -> "project")
                if '-' in version_name:
                    project_name = version_name.split('-')[0]

        # Tier 2: Fallback to selected project from UI
        if not project_name and request.selected_project_name:
            project_name = request.selected_project_name

        # If pattern requires project name but we couldn't get it from either source, fail early
        if not project_name:
            raise HTTPException(
                status_code=400,
                detail="Could not determine project name. Please select a project in the ShotGrid panel (Import tab) before submitting."
            )

    # Add background task
    background_tasks.add_task(
        process_recording_task,
        request.recording_url,
        request.recipient_email,
        request.shotgrid_data,
        request.selected_project_name,
        request.playlist_name
    )

    return {
        "status": "success",
        "message": "Processing started. You will receive an email when complete.",
        "recipient_email": request.recipient_email,
        "shots_count": len(request.shotgrid_data)
    }

# --- CSV PROCESSING FUNCTIONS ---

def process_csv_with_llm_summaries(csv_path, output_path, provider=None, model=None, prompt_type="short", limit=None):
    """
    Process a CSV file by adding LLM summaries for conversation data.

    Args:
        csv_path: Path to input CSV file
        output_path: Path to output CSV file with summaries
        provider: LLM provider to use (optional)
        model: Specific model to use (optional)
        prompt_type: Type of prompt to use for summaries
        limit: Maximum number of entries to process (optional, for experimentation)

    Returns:
        Tuple of (success: bool, llm_time: float) where llm_time is total LLM processing time in seconds
    """
    import time
    llm_start_time = time.time()

    print(f"Loading CSV from: {csv_path}")
    
    # Read the CSV file
    try:
        df = pd.read_csv(csv_path)
        print(f"Loaded {len(df)} rows from CSV")
    except Exception as e:
        print(f"Error reading CSV file: {e}")
        return (False, 0.0)

    # Check if conversation column exists
    if 'conversation' not in df.columns:
        print("Error: 'conversation' column not found in CSV")
        print(f"Available columns: {list(df.columns)}")
        return (False, 0.0)
    
    # Initialize new columns for LLM results
    df['llm_summary'] = ''
    df['llm_provider'] = ''
    df['llm_model'] = ''
    df['llm_prompt_type'] = ''
    df['llm_error'] = ''
    
    # Choose the LLM client to use
    selected_client_key = None
    
    if model:
        # Try to find specific model
        if model in llm_clients:
            selected_client_key = model
        else:
            # Try to find model by matching the model name part
            for key, client_info in llm_clients.items():
                if client_info['model'] == model:
                    selected_client_key = key
                    break
    
    if not selected_client_key and provider:
        # Find first model for this provider
        for key in llm_clients.keys():
            if llm_clients[key]['provider'] == provider:
                selected_client_key = key
                break
    
    if not selected_client_key and llm_clients:
        # Use first available
        selected_client_key = list(llm_clients.keys())[0]
    
    if not selected_client_key:
        print("No LLM clients available for processing")
        return (False, 0.0)
    
    client_info = llm_clients[selected_client_key]
    client = client_info['client']
    model_name = client_info['model']
    provider_name = client_info['provider']
    
    print(f"Using LLM: {provider_name} with model: {model_name}")

    # Apply limit if specified
    if limit is not None and limit > 0:
        print(f"Limiting processing to first {limit} entries with conversation data")

    # Process each row with conversation data
    processed_count = 0
    for index, row in df.iterrows():
        conversation = str(row['conversation']).strip()
        
        # Skip empty conversations
        if not conversation or conversation.lower() in ['nan', 'null', '']:
            continue

        # Check if we've reached the limit
        if limit is not None and limit > 0 and processed_count >= limit:
            print(f"Reached limit of {limit} entries, stopping processing")
            break

        print(f"Processing row {index + 1}/{len(df)}: version_id={row.get('version_id', 'N/A')}")
        
        try:
            # Get model configuration
            config = get_model_config(provider_name, model_name, prompt_type=prompt_type)
            
            # Generate summary based on provider
            if provider_name == 'openai':
                summary = summarize_openai(conversation, model_name, client, config)
            elif provider_name == 'anthropic':
                summary = summarize_claude(conversation, model_name, client, config)
            elif provider_name == 'ollama':
                summary = summarize_ollama(conversation, model_name, client, config)
            elif provider_name == 'google':
                summary = summarize_gemini(conversation, model_name, client, config)
            else:
                raise ValueError(f"Unsupported provider: {provider_name}")
            
            # Store results
            df.at[index, 'llm_summary'] = summary
            df.at[index, 'llm_provider'] = provider_name
            df.at[index, 'llm_model'] = model_name
            df.at[index, 'llm_prompt_type'] = prompt_type
            df.at[index, 'llm_error'] = ''
            
            processed_count += 1
            print(f"  ✓ Generated summary: {summary[:100]}...")
            
        except Exception as e:
            error_msg = str(e)
            print(f"  ✗ Error generating summary: {error_msg}")
            df.at[index, 'llm_summary'] = f"Error: {error_msg}"
            df.at[index, 'llm_provider'] = provider_name
            df.at[index, 'llm_model'] = model_name
            df.at[index, 'llm_prompt_type'] = prompt_type
            df.at[index, 'llm_error'] = error_msg
    
    # Rename columns for final output
    df = df.rename(columns={
        'llm_summary': 'summary'
        # Keep 'conversation' column as-is (don't rename to 'transcription')
        # 'notes' already renamed in combine stage
        # 'shot' and version column already present
    })

    # Save the results to output CSV
    try:
        df.to_csv(output_path, index=False)
        llm_total_time = time.time() - llm_start_time
        print(f"\nResults saved to: {output_path}")
        print(f"Processed {processed_count} conversations successfully")
        return (True, llm_total_time)
    except Exception as e:
        print(f"Error saving output CSV: {e}")
        llm_total_time = time.time() - llm_start_time
        return (False, llm_total_time)

if __name__ == "__main__":
    import sys
    import argparse
    load_dotenv()
    
    parser = argparse.ArgumentParser(description="Test LLM summary functions or process CSV files.")
    parser.add_argument('--provider', choices=['openai', 'claude', 'gemini', 'ollama'], default='gemini', help='LLM provider to test')
    parser.add_argument('--text', type=str, default='Artist submitted new lighting pass for shot 101. Lead: Looks good, but highlights are too strong. Artist: Will reduce highlight gain and resubmit.', help='Conversation text to summarize')
    parser.add_argument('--csv-input', type=str, help='Input CSV file path for batch processing')
    parser.add_argument('--csv-output', type=str, help='Output CSV file path for batch processing results')
    parser.add_argument('--model', type=str, help='Specific model to use (e.g., gemini-1.5-pro)')
    parser.add_argument('--prompt-type', type=str, default='short', help='Prompt type to use for summaries')
    parser.add_argument('--limit', type=int, help='Maximum number of entries to process from CSV (useful for experimentation)')
    
    args = parser.parse_args()

    # CSV processing mode
    if args.csv_input:
        if not args.csv_output:
            print("Error: --csv-output is required when using --csv-input")
            sys.exit(1)
        
        print(f"Processing CSV file: {args.csv_input}")
        success = process_csv_with_llm_summaries(
            csv_path=args.csv_input,
            output_path=args.csv_output,
            provider=args.provider,
            model=args.model,
            prompt_type=args.prompt_type,
            limit=args.limit
        )
        
        if success:
            print("CSV processing completed successfully!")
            sys.exit(0)
        else:
            print("CSV processing failed!")
            sys.exit(1)
    
    # Single text processing mode (original functionality)
    provider = args.provider
    text = args.text
    model = args.model or get_model_for_provider(provider)
    api_key = os.getenv(f'{provider.upper()}_API_KEY')
    print(f"Testing {provider} summary with model {model}...")
    try:
        client = create_llm_client(provider, api_key=api_key, model=model)
        config = get_model_config(provider, model, prompt_type=args.prompt_type)
        print(f"Using config: temperature={config['temperature']}, max_tokens={config['max_tokens']}")
        if provider == 'openai':
            summary = summarize_openai(text, model, client, config)
        elif provider == 'claude':
            summary = summarize_claude(text, model, client, config)
        elif provider == 'ollama':
            summary = summarize_ollama(text, model, client, config)
        elif provider == 'gemini':
            summary = summarize_gemini(text, model, client, config)
        else:
            print(f"Unknown provider: {provider}")
            sys.exit(1)
        print(f"Summary:\n{summary}")
    except Exception as e:
        print(f"Error: {e}")