#!/bin/bash

# Lines of Code Counter for Note Assistant v2
# Counts relevant source code files, excluding auto-generated content

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "Counting lines of code in: $PROJECT_DIR"
echo "======================================="

# Function to count lines in a directory with specific patterns
count_lines() {
    local dir="$1"
    local name="$2"
    
    if [ ! -d "$dir" ]; then
        echo "$name: Directory not found" >&2
        echo "0"
        return
    fi
    
    # Count lines excluding:
    # - Hidden files/directories (starting with .)
    # - node_modules
    # - dist/build directories
    # - package-lock.json, yarn.lock
    # - .pyc, .pyo, __pycache__
    # - .git directories
    local count=$(find "$dir" -type f \
        ! -path "*/.*" \
        ! -path "*/node_modules/*" \
        ! -path "*/dist/*" \
        ! -path "*/build/*" \
        ! -path "*/__pycache__/*" \
        ! -name "package-lock.json" \
        ! -name "yarn.lock" \
        ! -name "*.pyc" \
        ! -name "*.pyo" \
        \( -name "*.js" -o -name "*.jsx" -o -name "*.ts" -o -name "*.tsx" \
        -o -name "*.py" -o -name "*.html" -o -name "*.css" -o -name "*.scss" \
        -o -name "*.json" -o -name "*.md" -o -name "*.txt" -o -name "*.yaml" \
        -o -name "*.yml" -o -name "*.toml" -o -name "*.sh" -o -name "*.env*" \
        -o -name "Dockerfile*" -o -name "*.config.*" \) \
        -exec wc -l {} + 2>/dev/null | tail -n 1 | awk '{print $1}')
    
    if [ -z "$count" ]; then
        count=0
    fi
    
    echo "$name: $count lines" >&2
    echo "$count"
}

# Count frontend files
echo "Frontend (React/JavaScript):"
FRONTEND_COUNT=$(count_lines "$PROJECT_DIR/frontend" "Frontend")

echo ""
echo "Backend (Python/FastAPI):"
BACKEND_COUNT=$(count_lines "$PROJECT_DIR/backend" "Backend")

echo ""
echo "Documentation:"
DOCS_COUNT=$(count_lines "$PROJECT_DIR/docs" "Documentation")

# Count root level files
echo ""
echo "Root configuration files:"
ROOT_COUNT=$(find "$PROJECT_DIR" -maxdepth 1 -type f \
    ! -name ".*" \
    \( -name "*.md" -o -name "*.txt" -o -name "*.sh" -o -name "*.yaml" \
    -o -name "*.yml" -o -name "*.json" -o -name "*.toml" -o -name "Dockerfile*" \
    -o -name "*.env*" -o -name "requirements.txt" -o -name "package.json" \) \
    -exec wc -l {} + 2>/dev/null | tail -n 1 | awk '{print $1}')

if [ -z "$ROOT_COUNT" ]; then
    ROOT_COUNT=0
fi
echo "Root files: $ROOT_COUNT lines"

# Calculate totals
TOTAL_COUNT=$((FRONTEND_COUNT + BACKEND_COUNT + DOCS_COUNT + ROOT_COUNT))

echo ""
echo "======================================="
echo "SUMMARY:"
echo "======================================="
echo "Frontend:      $(printf "%8d" $FRONTEND_COUNT) lines"
echo "Backend:       $(printf "%8d" $BACKEND_COUNT) lines"
echo "Documentation: $(printf "%8d" $DOCS_COUNT) lines"
echo "Root files:    $(printf "%8d" $ROOT_COUNT) lines"
echo "--------------------------------------"
echo "TOTAL:         $(printf "%8d" $TOTAL_COUNT) lines"
echo "======================================="

# Show breakdown by file type
echo ""
echo "Breakdown by file type:"
echo "======================="

for ext in py js jsx ts tsx html css scss json md txt yaml yml sh; do
    count=$(find "$PROJECT_DIR" -type f \
        ! -path "*/.*" \
        ! -path "*/node_modules/*" \
        ! -path "*/dist/*" \
        ! -path "*/build/*" \
        ! -path "*/__pycache__/*" \
        ! -name "package-lock.json" \
        ! -name "yarn.lock" \
        -name "*.$ext" \
        -exec wc -l {} + 2>/dev/null | tail -n 1 | awk '{print $1}')
    
    if [ ! -z "$count" ] && [ "$count" -gt 0 ]; then
        printf "%-5s: %8d lines\n" "$ext" "$count"
    fi
done

echo ""
echo "Scan complete!"