# filepath: /Users/loorthu/Documents/GitHub/loorthu_dna/experimental/spi/note_assistant_v2/backend/llm_service.py
import os
import random
import requests
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

class LLMSummaryRequest(BaseModel):
    text: str

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
            return yaml.safe_load(f)
    
    # Fall back to factory configuration
    print(f"Loading factory LLM prompts configuration from: {factory_config_path}")
    with open(factory_config_path, 'r') as f:
        return yaml.safe_load(f)

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
    
    # Start with default configuration from models config
    models_config = load_llm_models()
    merged_config = models_config.get('default', {}).copy()
    
    # Add prompts from the specified prompt type
    prompts_config = load_llm_prompts()
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

if __name__ == "__main__":
    import sys
    import argparse
    load_dotenv()
    parser = argparse.ArgumentParser(description="Test LLM summary functions.")
    parser.add_argument('--provider', choices=['openai', 'claude', 'gemini', 'ollama'], default='gemini', help='LLM provider to test')
    parser.add_argument('--text', type=str, default='Artist submitted new lighting pass for shot 101. Lead: Looks good, but highlights are too strong. Artist: Will reduce highlight gain and resubmit.', help='Conversation text to summarize')
    args = parser.parse_args()

    provider = args.provider
    text = args.text
    model = get_model_for_provider(provider)
    api_key = os.getenv(f'{provider.upper()}_API_KEY')
    print(f"Testing {provider} summary with model {model}...")
    try:
        client = create_llm_client(provider, api_key=api_key, model=model)
        config = get_model_config(provider, model)
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