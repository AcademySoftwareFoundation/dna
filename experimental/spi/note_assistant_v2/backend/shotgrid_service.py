import os
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

def get_project_by_code(project_code):
    """Fetch a single project from ShotGrid by code."""
    sg = Shotgun(SHOTGRID_URL, SCRIPT_NAME, API_KEY)
    filters = [["code", "is", project_code]]
    fields = ["id", "code", "name", "sg_status", "created_at"]
    project = sg.find_one("Project", filters, fields)
    return project

def get_latest_playlists_for_project(project_id, limit=20):
    """Fetch the latest playlists for a given project id."""
    sg = Shotgun(SHOTGRID_URL, SCRIPT_NAME, API_KEY)
    filters = [["project", "is", {"type": "Project", "id": project_id}]]
    fields = ["id", "code", "created_at", "updated_at"]
    playlists = sg.find("Playlist", filters, fields, order=[{"field_name": "created_at", "direction": "desc"}], limit=limit)
    return playlists

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
    return projects

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
    return [
        f"{v.get(SHOTGRID_SHOT_FIELD)}/{v.get(SHOTGRID_VERSION_FIELD)}"
        for v in versions if v.get(SHOTGRID_VERSION_FIELD) or v.get(SHOTGRID_SHOT_FIELD)
    ]

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
