#!/bin/bash

# Auto-restart script for Note Assistant v2 Frontend
# Automatically restarts "npm run dev" when it crashes
# Press Ctrl-C to stop and exit

echo "Note Assistant v2 Frontend Auto-Restart"
echo "======================================"
echo "Starting frontend development server..."
echo "Press Ctrl-C to stop and exit"
echo ""

# Trap Ctrl-C to exit cleanly
trap 'echo -e "\n\nReceived Ctrl-C, stopping auto-restart..."; exit 0' INT

# Counter for restart attempts
restart_count=0

while true; do
    if [ $restart_count -eq 0 ]; then
        echo "Starting frontend server..."
    else
        echo "Restart #$restart_count - Starting frontend server..."
    fi
    
    # Start the frontend server (pass through any command line arguments)
    npm run dev -- "$@"
    
    # Get the exit code
    exit_code=$?
    
    # If exit code is 0, it was a clean exit (probably Ctrl-C from npm)
    if [ $exit_code -eq 0 ]; then
        echo "Frontend server stopped cleanly."
        break
    fi
    
    # If exit code is 130, it was interrupted (Ctrl-C)
    if [ $exit_code -eq 130 ]; then
        echo "Frontend server interrupted."
        break
    fi
    
    # Otherwise, it crashed
    restart_count=$((restart_count + 1))
    echo ""
    echo "⚠️  Frontend server crashed with exit code: $exit_code"
    echo "Waiting 2 seconds before restart..."
    echo ""
    
    # Wait a bit before restarting to avoid rapid restart loops
    sleep 2
    
    # Optional: Add a maximum restart limit to prevent infinite loops
    if [ $restart_count -ge 10 ]; then
        echo "❌ Maximum restart attempts (10) reached."
        echo "Please check the frontend configuration and try again."
        exit 1
    fi
done

echo "Auto-restart stopped."