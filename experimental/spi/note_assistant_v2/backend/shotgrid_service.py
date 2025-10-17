import os
import hashlib
import re
from dotenv import load_dotenv
from shotgun_api3 import Shotgun
import argparse
from fastapi import APIRouter
from fastapi.responses import JSONResponse

load_dotenv()

# --- Configuration ---
SHOTGRID_URL = os.environ.get("SHOTGRID_URL")
SCRIPT_NAME = os.environ.get("SHOTGRID_SCRIPT_NAME")
API_KEY = os.environ.get("SHOTGRID_API_KEY")
# Configurable field names for version and shot
SHOTGRID_VERSION_FIELD = os.environ.get("SHOTGRID_VERSION_FIELD", "version")
SHOTGRID_SHOT_FIELD = os.environ.get("SHOTGRID_SHOT_FIELD", "shot")
SHOTGRID_TYPE_FILTER = os.environ.get("SHOTGRID_TYPE_FILTER", "")
SHOTGRID_TYPE_LIST = [t.strip() for t in SHOTGRID_TYPE_FILTER.split(",") if t.strip()]
# Demo mode configuration
DEMO_MODE = os.environ.get("DEMO_MODE", "false").lower() == "true"

def anonymize_text(text, prefix="DEMO"):
    """
    Anonymize text by creating a consistent hash-based replacement.
    This ensures the same input always produces the same anonymized output.
    """
    if not text or not DEMO_MODE:
        return text
    
    # Create a hash of the original text
    hash_object = hashlib.md5(text.encode())
    hash_hex = hash_object.hexdigest()[:8]  # Use first 8 characters
    
    # Extract any numeric parts to preserve structure
    numbers = re.findall(r'\d+', text)
    number_suffix = f"_{numbers[0]}" if numbers else ""
    
    return f"{prefix}_{hash_hex.upper()}{number_suffix}"

def anonymize_project_data(projects):
    """Anonymize project data for demo mode."""
    if not DEMO_MODE:
        return projects
    
    anonymized = []
    for project in projects:
        project_copy = project.copy()
        if 'code' in project_copy:
            project_copy['code'] = anonymize_text(project_copy['code'], "PROJ")
        if 'name' in project_copy:
            project_copy['name'] = anonymize_text(project_copy['name'], "PROJECT")
        anonymized.append(project_copy)
    return anonymized

def anonymize_playlist_data(playlists):
    """Anonymize playlist data for demo mode."""
    if not DEMO_MODE:
        return playlists
    
    anonymized = []
    for playlist in playlists:
        playlist_copy = playlist.copy()
        if 'code' in playlist_copy:
            playlist_copy['code'] = anonymize_text(playlist_copy['code'], "PLAYLIST")
        anonymized.append(playlist_copy)
    return anonymized

def anonymize_shot_name(shot_text):
    """Anonymize shot name to be max 5 characters."""
    if not shot_text or not DEMO_MODE:
        return shot_text
    
    # Create a hash and take first 5 characters as uppercase
    hash_object = hashlib.md5(shot_text.encode())
    hash_hex = hash_object.hexdigest()[:5].upper()
    return hash_hex

def anonymize_version_name(version_text):
    """Anonymize version name to be a 5-digit integer."""
    if not version_text or not DEMO_MODE:
        return version_text
    
    # Create a hash and convert to a 5-digit number
    hash_object = hashlib.md5(version_text.encode())
    hash_int = int(hash_object.hexdigest()[:8], 16)  # Convert hex to int
    # Ensure it's a 5-digit number (10000-99999)
    version_num = (hash_int % 90000) + 10000
    return str(version_num)

def anonymize_shot_names(shot_names):
    """Anonymize shot/version names for demo mode."""
    if not DEMO_MODE:
        return shot_names
    
    anonymized = []
    for shot_name in shot_names:
        # Split shot/version format
        if '/' in shot_name:
            parts = shot_name.split('/', 1)
            shot_part = anonymize_shot_name(parts[0])
            version_part = anonymize_version_name(parts[1])
            anonymized.append(f"{shot_part}/{version_part}")
        else:
            anonymized.append(anonymize_shot_name(shot_name))
    return anonymized

def get_project_by_code(project_code):
    """Fetch a single project from ShotGrid by code."""
    sg = Shotgun(SHOTGRID_URL, SCRIPT_NAME, API_KEY)
    filters = [["code", "is", project_code]]
    fields = ["id", "code", "name", "sg_status", "created_at"]
    project = sg.find_one("Project", filters, fields)
    
    if project and DEMO_MODE:
        project_copy = project.copy()
        if 'code' in project_copy:
            project_copy['code'] = anonymize_text(project_copy['code'], "PROJ")
        if 'name' in project_copy:
            project_copy['name'] = anonymize_text(project_copy['name'], "PROJECT")
        return project_copy
    
    return project

def get_latest_playlists_for_project(project_id, limit=20):
    """Fetch the latest playlists for a given project id."""
    sg = Shotgun(SHOTGRID_URL, SCRIPT_NAME, API_KEY)
    filters = [["project", "is", {"type": "Project", "id": project_id}]]
    fields = ["id", "code", "created_at", "updated_at"]
    playlists = sg.find("Playlist", filters, fields, order=[{"field_name": "created_at", "direction": "desc"}], limit=limit)
    return anonymize_playlist_data(playlists)

def get_active_projects():
    """Fetch all active projects from ShotGrid (sg_status == 'Active' and sg_type in configured list), sorted by code."""
    sg = Shotgun(SHOTGRID_URL, SCRIPT_NAME, API_KEY)
    filters = [
        ["sg_status", "is", "Active"],
        {"filter_operator": "any", "filters": [
            ["sg_type", "is", t] for t in SHOTGRID_TYPE_LIST
        ]}
    ]
    fields = ["id", "code", "created_at", "sg_type"]
    projects = sg.find("Project", filters, fields, order=[{"field_name": "code", "direction": "asc"}])
    return anonymize_project_data(projects)

def get_playlist_shot_names(playlist_id):
    """Fetch the list of shot/version names from a playlist, using configurable field names."""
    sg = Shotgun(SHOTGRID_URL, SCRIPT_NAME, API_KEY)
    fields = ["versions"]
    playlist = sg.find_one("Playlist", [["id", "is", playlist_id]], fields)
    if not playlist or not playlist.get("versions"):
        return []
    version_ids = [v["id"] for v in playlist["versions"] if v.get("id")]
    if not version_ids:
        return []
    version_fields = ["id", SHOTGRID_VERSION_FIELD, SHOTGRID_SHOT_FIELD]
    versions = sg.find("Version", [["id", "in", version_ids]], version_fields)
    shot_names = [
        f"{v.get(SHOTGRID_SHOT_FIELD)}/{v.get(SHOTGRID_VERSION_FIELD)}"
        for v in versions if v.get(SHOTGRID_VERSION_FIELD) or v.get(SHOTGRID_SHOT_FIELD)
    ]
    return anonymize_shot_names(shot_names)

router = APIRouter()

@router.get("/shotgrid/active-projects")
def shotgrid_active_projects():
    try:
        projects = get_active_projects()
        return {"status": "success", "projects": projects}
    except Exception as e:
        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})

@router.get("/shotgrid/latest-playlists/{project_id}")
def shotgrid_latest_playlists(project_id: int, limit: int = 20):
    try:
        playlists = get_latest_playlists_for_project(project_id, limit=limit)
        return {"status": "success", "playlists": playlists}
    except Exception as e:
        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})

@router.get("/shotgrid/playlist-items/{playlist_id}")
def shotgrid_playlist_items(playlist_id: int):
    try:
        items = get_playlist_shot_names(playlist_id)
        return {"status": "success", "items": items}
    except Exception as e:
        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})

@router.get("/shotgrid/most-recent-playlist-items")
def shotgrid_most_recent_playlist_items():
    try:
        projects = get_active_projects()
        if not projects:
            return {"status": "error", "message": "No active projects found"}
        # Get most recent project
        project = projects[0]
        playlists = get_latest_playlists_for_project(project['id'], limit=1)
        if not playlists:
            return {"status": "error", "message": "No playlists found for most recent project"}
        playlist = playlists[0]
        items = get_playlist_shot_names(playlist['id'])
        return {"status": "success", "project": project, "playlist": playlist, "items": items}
    except Exception as e:
        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})

if __name__ == "__main__":
    print("ShotGrid Service Test CLI")
    if DEMO_MODE:
        print("🎭 DEMO MODE ACTIVE - Data will be anonymized")
    print("1. List all active projects")
    print("2. List latest playlists for a project")
    print("3. List shot/version info for a playlist")
    choice = input("Enter choice (1/2/3): ").strip()

    if choice == "1":
        projects = get_active_projects()
        print(f"Active projects ({len(projects)}):")
        for pr in projects:
            print(f" - [id: {pr['id']}] code: {pr['code']} name: {pr.get('name', '')} status: {pr.get('sg_status', '')} created: {pr['created_at']}")
    elif choice == "2":
        project_id = input("Enter project id: ").strip()
        try:
            project_id = int(project_id)
        except Exception:
            print("Invalid project id")
            exit(1)
        playlists = get_latest_playlists_for_project(project_id, limit=5)
        print(f"Playlists for project {project_id} ({len(playlists)}):")
        for pl in playlists:
            print(f" - [id: {pl['id']}] code: {pl['code']} created: {pl['created_at']} updated: {pl['updated_at']}")
    elif choice == "3":
        playlist_id = input("Enter playlist id: ").strip()
        try:
            playlist_id = int(playlist_id)
        except Exception:
            print("Invalid playlist id")
            exit(1)
        items = get_playlist_shot_names(playlist_id)
        print(f"Shots/Versions in playlist {playlist_id} ({len(items)}):")
        for item in items:
            print(f" - {item}")
    else:
        print("Invalid choice.")
