#!/usr/bin/env python3
"""
CSV Summary Generator

This script reads a CSV file with shot transcriptions and generates LLM summaries
by making HTTP requests to the backend server.

Usage:
    python generate_summaries.py <csv_file> --model <model_name> [options]

Example:
    python generate_summaries.py shots.csv --model "ChatGPT"
    python generate_summaries.py shots.csv --model "Claude" --prompt short
    python generate_summaries.py shots.csv --model "Gemini" --version "v002"
"""

import argparse
import csv
import json
import os
import requests
import sys
import time
import yaml
from pathlib import Path
from typing import Dict, List, Optional


class SummaryGenerator:
    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base_url = base_url.rstrip('/')
        self.session = requests.Session()
        self.models_config = self._load_llm_models()
    
    def _load_llm_models(self) -> dict:
        """Load LLM models configuration from YAML file."""
        # Look for config files relative to the backend directory
        backend_dir = Path(__file__).parent.parent
        user_config_path = backend_dir / 'llm_models.yaml'
        factory_config_path = backend_dir / 'llm_models.factory.yaml'
        
        # Try to load user configuration first
        if user_config_path.exists():
            with open(user_config_path, 'r') as f:
                return yaml.safe_load(f)
        
        # Fall back to factory configuration
        if factory_config_path.exists():
            with open(factory_config_path, 'r') as f:
                return yaml.safe_load(f)
        
        return {}
    
    def _get_client_key_for_display_name(self, display_name: str) -> Optional[str]:
        """Convert display name to internal client key."""
        models = self.models_config.get('models', [])
        for model in models:
            model_display_name = model.get('display_name', '')
            if model_display_name.lower() == display_name.lower():
                provider = model.get('provider', '')
                model_name = model.get('model_name', '')
                client_key = f"{provider}_{model_name}"
                return client_key
        return None
    
    def get_available_models(self) -> Dict[str, str]:
        """Get list of available LLM models from local configuration."""
        try:
            # Get available models directly from local config
            models = {}
            for model in self.models_config.get('models', []):
                display_name = model.get('display_name', '')
                if display_name:
                    models[display_name] = model.get('model_name', '')
            return models
        except Exception as e:
            print(f"Error getting available models: {e}")
            return {}
    
    def get_available_prompts(self) -> List[str]:
        """Get list of available prompt types from the backend."""
        try:
            response = self.session.get(f"{self.base_url}/available-models")
            response.raise_for_status()
            result = response.json()
            return result.get('available_prompt_types', [])
        except requests.RequestException as e:
            print(f"Error getting available prompts: {e}")
            return []
    
    def generate_summary(self, transcription: str, model_display_name: str, prompt_type: str = "short") -> Optional[str]:
        """Generate summary for a single transcription."""
        if not transcription.strip():
            return None
        
        # Convert display name to internal client key
        client_key = self._get_client_key_for_display_name(model_display_name)
        if not client_key:
            print(f"Warning: Could not find client key for model '{model_display_name}', falling back to provider")
            # Fallback to provider-based approach
            payload = {
                "text": transcription,
                "llm_provider": model_display_name,
                "prompt_type": prompt_type
            }
        else:
            # Use the specific model client key
            payload = {
                "text": transcription,
                "llm_model": client_key,
                "prompt_type": prompt_type
            }
        
        try:
            response = self.session.post(
                f"{self.base_url}/llm-summary",
                json=payload,
                timeout=60
            )
            response.raise_for_status()
            return response.json().get("summary")
        except requests.RequestException as e:
            print(f"Error generating summary: {e}")
            return None
    
    def test_connection(self) -> bool:
        """Test connection to backend server."""
        try:
            response = self.session.get(f"{self.base_url}/available-models", timeout=5)
            return response.status_code == 200
        except requests.RequestException:
            return False


def upload_csv_file(generator: SummaryGenerator, file_path: str) -> List[Dict[str, str]]:
    """Upload CSV file to backend server and return processed shots."""
    try:
        with open(file_path, 'rb') as file:
            files = {'file': (Path(file_path).name, file, 'text/csv')}
            response = generator.session.post(
                f"{generator.base_url}/upload-playlist",
                files=files,
                timeout=30
            )
            response.raise_for_status()
            
            result = response.json()
            if result.get('status') != 'success':
                print(f"Error: Backend processing failed: {result}")
                sys.exit(1)
            
            # Convert backend format to our expected format
            shots = []
            for item in result.get('items', []):
                shot = {
                    'Shot': item.get('name', ''),
                    'Notes': item.get('notes', ''),
                    'Transcription': item.get('conversation', ''),  # Changed from 'transcription' to 'conversation'
                    'Summary': ''  # Will be populated by LLM
                }
                shots.append(shot)
            
            return shots
                
    except FileNotFoundError:
        print(f"Error: File '{file_path}' not found.")
        sys.exit(1)
    except requests.RequestException as e:
        print(f"Error uploading CSV file to backend: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Error processing CSV file: {e}")
        sys.exit(1)


def write_csv_file(shots: List[Dict[str, str]], output_path: str):
    """Write shots with summaries back to CSV file."""
    if not shots:
        return
        
    try:
        with open(output_path, 'w', newline='', encoding='utf-8') as csvfile:
            fieldnames = shots[0].keys()
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(shots)
        print(f"Results saved to: {output_path}")
    except Exception as e:
        print(f"Error writing output file: {e}")


def prepare_output_format(shots: List[Dict[str, str]]) -> List[Dict[str, str]]:
    """Prepare shots data for CSV output with proper field mapping."""
    output_shots = []
    
    for shot in shots:
        # Extract shot and version from the 'Shot' field if it contains "/"
        shot_name = shot.get('Shot', '')
        shot_value = ''
        version_value = ''
        
        if shot_name and '/' in shot_name:
            parts = shot_name.split('/', 1)  # Split only on first occurrence
            shot_value = parts[0]
            version_value = parts[1]
        else:
            shot_value = shot_name
        
        # Create output format matching the backend export format
        output_shot = {
            'shot': shot_value,
            'version': version_value,
            'notes': shot.get('Notes', ''),
            'transcription': shot.get('Transcription', ''),
            'summary': shot.get('Summary', '')
        }
        output_shots.append(output_shot)
    
    return output_shots


def main():
    parser = argparse.ArgumentParser(description="Generate LLM summaries from CSV transcriptions")
    parser.add_argument("csv_file", help="Path to CSV file with transcriptions")
    parser.add_argument("--model", "-m", required=True, help="LLM model to use")
    parser.add_argument("--prompt", "-p", default="short", help="Prompt type (default: short)")
    parser.add_argument("--output", "-o", help="Output CSV file (default: input_file_with_summaries.csv)")
    parser.add_argument("--base-url", default="http://localhost:8000", help="Backend server URL")
    parser.add_argument("--delay", type=float, default=1.0, help="Delay between requests in seconds")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be processed without making requests")
    parser.add_argument("--version", "-v", help="Process only shots with this specific version number and print summary to terminal")
    
    args = parser.parse_args()
    
    # Initialize generator
    generator = SummaryGenerator(args.base_url)
    
    # Test connection
    if not args.dry_run and not generator.test_connection():
        print(f"Error: Cannot connect to backend server at {args.base_url}")
        print("Make sure the server is running and accessible.")
        sys.exit(1)
    
    # Get available models and prompts
    if not args.dry_run:
        available_models = generator.get_available_models()  # Returns dict of display_name -> model_name
        available_prompts = generator.get_available_prompts()
        
        if args.model not in available_models:
            print(f"Error: Model '{args.model}' not available.")
            print(f"Available models: {', '.join(available_models.keys())}")
            sys.exit(1)
        
        # Get the actual model name for the backend
        if args.model not in available_models:
            print(f"Error: Model '{args.model}' not available.")
            print(f"Available models: {', '.join(available_models.keys())}")
            sys.exit(1)
        
        # Don't use model_name - we want to keep the display name for conversion
        model_name = args.model  # Keep the original display name
        
        if args.prompt not in available_prompts:
            print(f"Error: Prompt type '{args.prompt}' not available.")
            print(f"Available prompts: {', '.join(available_prompts)}")
            sys.exit(1)
    else:
        model_name = args.model  # For dry run, use as-is
    
    # Upload and process CSV file via backend
    print(f"Uploading CSV file to backend: {args.csv_file}")
    shots = upload_csv_file(generator, args.csv_file)
    
    if not shots:
        print("No data found in processed CSV file.")
        sys.exit(1)
    
    print(f"Found {len(shots)} shots in CSV file")
    
    # The backend already processes the CSV and maps transcription field correctly
    transcription_col = 'Transcription'
    print(f"Using transcription from backend processing")
    
    # Summary column is already included from backend processing
    
    # Process shots
    processed = 0
    skipped = 0
    
    # Filter shots by version if specified
    if args.version:
        filtered_shots = []
        for shot in shots:
            shot_name = shot.get('Shot', '')
            # Check if shot contains version info in "shot/version" format
            if '/' in shot_name and shot_name.split('/', 1)[1] == args.version:
                filtered_shots.append(shot)
            # Also check if the entire shot name matches the version (for simple version-only entries)
            elif shot_name == args.version:
                filtered_shots.append(shot)
        
        shots = filtered_shots
        print(f"Filtered to {len(shots)} shots matching version '{args.version}'")
        
        if not shots:
            print(f"No shots found with version '{args.version}'")
            sys.exit(0)
    
    for i, shot in enumerate(shots, 1):
        shot_id = shot.get('Shot', f"shot_{i}")
        transcription = shot.get('Transcription', "")
        
        if not transcription.strip():
            print(f"Skipping {shot_id}: No transcription")
            skipped += 1
            continue
        
        if args.dry_run:
            print(f"Would process {shot_id}: {len(transcription)} characters")
            processed += 1
            continue
        
        print(f"Processing {shot_id} ({i}/{len(shots)})...")
        
        summary = generator.generate_summary(transcription, model_name, args.prompt)
        
        if summary:
            shot['Summary'] = summary
            processed += 1
            
            # If processing specific version, print summary to terminal
            if args.version:
                print(f"\n=== SUMMARY for {shot_id} ===")
                print(summary)
                print("=" * (len(f"SUMMARY for {shot_id}") + 8))
                print()
            else:
                print(f"  Generated summary ({len(summary)} characters)")
        else:
            print(f"  Failed to generate summary")
            skipped += 1
        
        # Add delay between requests
        if i < len(shots):
            time.sleep(args.delay)
    
    print(f"\nProcessing complete:")
    print(f"  Processed: {processed}")
    print(f"  Skipped: {skipped}")
    
    # Save results (skip if processing specific version - summaries already printed)
    if not args.dry_run and processed > 0 and not args.version:
        if args.output:
            output_path = args.output
        else:
            input_path = Path(args.csv_file)
            output_path = input_path.parent / f"{input_path.stem}_with_summaries{input_path.suffix}"
        
        # Convert to output format that matches backend export format
        output_shots = prepare_output_format(shots)
        write_csv_file(output_shots, str(output_path))
    elif args.version and processed > 0:
        print(f"\nProcessing complete for version '{args.version}'. Summaries printed above.")


if __name__ == "__main__":
    main()