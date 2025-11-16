# Troubleshooting Guide

Common issues and solutions for the Dailies Note Assistant v2.

## Installation Issues

### Python Environment Problems

#### Virtual Environment Not Activating

**Problem**: Virtual environment activation fails or doesn't work

**Solutions:**
```bash
# Ensure you're in the backend directory
cd backend

# Try creating a new virtual environment
rm -rf .venv
python -m venv .venv

# Activate based on your system
source .venv/bin/activate  # macOS/Linux
# or
.venv\Scripts\activate     # Windows PowerShell
# or 
.venv\Scripts\activate.bat # Windows Command Prompt
```

#### Package Installation Failures

**Problem**: `pip install -r requirements.txt` fails

**Solutions:**
```bash
# Update pip first
pip install --upgrade pip

# Try installing with verbose output to see errors
pip install -r requirements.txt -v

# For M1/M2 Macs, some packages may need special handling
pip install --no-use-pep517 package-name

# Clear pip cache if corrupted
pip cache purge
```

#### Python Version Compatibility

**Problem**: Application requires Python 3.9+ but you have an older version

**Solutions:**
```bash
# Check your Python version
python --version

# Install Python 3.9+ from python.org or use pyenv
pyenv install 3.9.19
pyenv local 3.9.19

# Use specific Python version for virtual environment
python3.9 -m venv .venv
```

### Node.js Environment Problems

#### Node Version Compatibility

**Problem**: Frontend requires Node.js 18+ but you have an older version

**Solutions:**
```bash
# Check Node version
node --version

# Install Node.js 18+ from nodejs.org or use nvm
nvm install 18
nvm use 18

# For Windows, use nvm-windows or download from nodejs.org
```

#### npm Install Failures

**Problem**: `npm install` fails with errors

**Solutions:**
```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and package-lock.json
rm -rf node_modules package-lock.json
npm install

# Try with different registry if corporate firewall
npm config set registry https://registry.npmjs.org/

# Use yarn instead of npm
npm install -g yarn
yarn install
```

## Configuration Issues

### Environment Variable Problems

#### .env File Not Loading

**Problem**: Environment variables from .env file are not being read

**Solutions:**
1. **Verify file location**: `.env` should be in the `backend/` directory
2. **Check file format**:
   ```bash
   # Correct format (no spaces around =)
   EMAIL_SENDER=user@example.com
   DISABLE_LLM=false
   
   # Incorrect format
   EMAIL_SENDER = user@example.com  # spaces around =
   DISABLE_LLM = false
   ```
3. **Restart backend server** after .env changes
4. **Check for hidden characters**: Re-create .env file if copied from elsewhere

#### Invalid Configuration Values

**Problem**: Application fails to start due to configuration errors

**Check configuration endpoint:**
```bash
# With backend running
curl http://localhost:8000/config
```

**Common fixes:**
- **Boolean values**: Use `true`/`false`, not `True`/`False` or `1`/`0`
- **URLs**: Ensure proper format with protocol (`https://`)
- **API keys**: Verify keys are valid and have proper permissions

### LLM Configuration Issues

#### No Models Available

**Problem**: `/available-models` returns empty list

**Diagnostic steps:**
```bash
# Check if LLM is disabled
grep DISABLE_LLM backend/.env

# Check API keys are set
grep -E "(OPENAI|ANTHROPIC|GEMINI)_API_KEY" backend/.env

# Verify model configuration files exist
ls -la backend/llm_models*
```

**Solutions:**
1. **Enable LLM**: Set `DISABLE_LLM=false` in .env
2. **Add API keys**: Set appropriate API keys in .env
3. **Check model configuration**: Verify YAML syntax in model configuration files

#### LLM API Errors

**Problem**: Summary generation fails with API errors

**Common solutions:**
```bash
# Check API key validity
curl -H "Authorization: Bearer $OPENAI_API_KEY" https://api.openai.com/v1/models

# Verify rate limits
# Check your API provider dashboard for usage and limits

# Test with different model
# Try a different model/provider in the UI
```

## Connection Issues

### Backend Connection Problems

#### Backend Won't Start

**Problem**: Backend fails to start or crashes immediately

**Diagnostic steps:**
```bash
cd backend
python -m uvicorn main:main --reload --port 8000 --log-level debug
```

**Common causes and fixes:**
1. **Port already in use**:
   ```bash
   # Find process using port 8000
   lsof -i :8000  # macOS/Linux
   netstat -ano | findstr :8000  # Windows
   
   # Kill the process or use different port
   python -m uvicorn main:main --reload --port 8001
   ```

2. **Import errors**:
   ```bash
   # Test imports individually
   python -c "import fastapi"
   python -c "from main import app"
   ```

3. **Permission errors**:
   ```bash
   # Ensure virtual environment is activated
   which python  # Should show path to .venv
   ```

#### Backend Responds but Frontend Can't Connect

**Problem**: Backend runs on port 8000 but frontend can't reach it

**Solutions:**
1. **Check CORS configuration**: Verify frontend origin is allowed
2. **Firewall settings**: Ensure port 8000 is not blocked
3. **Network configuration**: Try `127.0.0.1:8000` instead of `localhost:8000`

### Frontend Connection Problems

#### Frontend Won't Start

**Problem**: `npm run dev` fails or frontend won't start

**Solutions:**
```bash
# Clear dev cache
rm -rf node_modules/.vite

# Try different port
npm run dev -- --port 5174

# Check for port conflicts
lsof -i :5173  # macOS/Linux
```

#### Frontend Loads but Backend Calls Fail

**Problem**: Frontend loads but API calls return errors

**Check browser console** for error messages:
1. **CORS errors**: Configure backend CORS settings
2. **Network errors**: Verify backend is running and accessible
3. **404 errors**: Check API endpoint URLs match backend routes

### WebSocket Connection Issues

#### WebSocket Connection Fails

**Problem**: Real-time transcription not working, WebSocket errors in console

**Diagnostic steps:**
```bash
# Test WebSocket connection with curl
curl --include \
     --no-buffer \
     --header "Connection: Upgrade" \
     --header "Upgrade: websocket" \
     --header "Sec-WebSocket-Key: SGVsbG8sIHdvcmxkIQ==" \
     --header "Sec-WebSocket-Version: 13" \
     http://localhost:8000/ws
```

**Common solutions:**
1. **Firewall blocking WebSockets**: Configure firewall to allow WebSocket connections
2. **Proxy server issues**: If using proxy, ensure WebSocket upgrades are supported
3. **Browser extensions**: Disable browser extensions that might block WebSockets

## Integration Issues

### Gmail API / Email Issues

#### Gmail API Authentication Fails

**Problem**: Email sending fails with authentication errors

**Solutions:**
1. **Verify credentials file**:
   ```bash
   ls -la backend/client_secret.json
   cat backend/client_secret.json  # Should contain OAuth credentials
   ```

2. **Regenerate token**:
   ```bash
   cd backend
   rm token.json  # Remove existing token
   python email_service.py  # Will prompt for re-authentication
   ```

3. **Check OAuth scopes**: Ensure Gmail API is enabled with correct scopes

#### SMTP Email Sending Fails

**Problem**: SMTP email sending produces errors

**Test SMTP configuration:**
```bash
cd backend
python -c "
import smtplib
server = smtplib.SMTP('your_smtp_host', 587)
server.starttls()
server.login('username', 'password')
print('SMTP connection successful')
server.quit()
"
```

**Common solutions:**
1. **Verify SMTP settings**: Check host, port, TLS settings
2. **Check credentials**: Verify username/password are correct
3. **Corporate firewalls**: May block SMTP connections

### ShotGrid Integration Issues

#### ShotGrid Connection Fails

**Problem**: ShotGrid endpoints return authentication or connection errors

**Diagnostic steps:**
```bash
# Test ShotGrid connection
curl -H "Authorization: Bearer $SHOTGRID_API_KEY" \
     "$SHOTGRID_URL/api/v1/projects"
```

**Solutions:**
1. **Verify credentials**:
   - Check `SHOTGRID_URL` format (should include https://)
   - Verify script name and API key are correct
   - Ensure script user has proper permissions

2. **Check field names**:
   - Verify `SHOTGRID_SHOT_FIELD` and `SHOTGRID_VERSION_FIELD` match your schema
   - Check project type filters are valid

3. **Network issues**:
   - Ensure ShotGrid site is accessible from your network
   - Check for firewall or proxy blocking connections

#### ShotGrid Data Not Loading

**Problem**: ShotGrid UI shows no projects or playlists

**Solutions:**
1. **Check project filters**: Verify `SHOTGRID_TYPE_FILTER` matches your project types
2. **Check permissions**: Ensure script user can read projects and playlists
3. **Verify field mapping**: Check that field names match your ShotGrid schema

### Vexa.ai Integration Issues

#### Vexa Bot Won't Join Meeting

**Problem**: Transcription bot fails to join Google Meet session

**Solutions:**
1. **Verify Vexa configuration**:
   ```bash
   # Check frontend .env.local
   grep VEXA frontend/.env.local
   ```

2. **Check meeting URL format**:
   - Use full Google Meet URL: `https://meet.google.com/abc-defg-hij`
   - Or just meeting ID: `abc-defg-hij`

3. **Verify Vexa service status**: Check Vexa.ai dashboard for service status

#### No Transcription Data

**Problem**: Bot joins but no transcription appears

**Solutions:**
1. **Check bot permissions**: Ensure bot can access audio in the meeting
2. **Verify pinned shots**: Ensure shots are pinned to receive transcriptions
3. **Check "Get Transcripts" toggle**: Must be enabled to capture transcriptions
4. **Meeting activity**: Ensure there's actual conversation happening

## Performance Issues

### Slow Response Times

#### Backend Performance Issues

**Problem**: API calls are slow or time out

**Diagnostic approaches:**
1. **Check logs**: Look for slow operations in backend logs
2. **Monitor resource usage**: Check CPU/memory usage during operation
3. **Database queries**: If using database, check query performance

**Solutions:**
1. **LLM timeouts**: Increase timeout settings for LLM providers
2. **ShotGrid performance**: Cache frequently accessed ShotGrid data
3. **Large CSV files**: Break large playlists into smaller chunks

#### Frontend Performance Issues

**Problem**: UI is slow or unresponsive

**Solutions:**
1. **Browser developer tools**: Check for JavaScript errors or memory leaks
2. **Large datasets**: Implement pagination for large shot lists
3. **WebSocket message volume**: Throttle or batch high-frequency messages

### Memory Usage Issues

#### Backend Memory Leaks

**Problem**: Backend memory usage grows over time

**Solutions:**
1. **Monitor background tasks**: Check for unclosed connections or tasks
2. **WebSocket connections**: Ensure WebSocket connections are properly cleaned up
3. **LLM responses**: Clear large response objects after processing

## File and Data Issues

### CSV Upload Problems

#### CSV File Won't Upload

**Problem**: CSV upload fails with format or processing errors

**Solutions:**
1. **Check CSV format**:
   ```csv
   Shot/Version,Description
   shot_010_v001,Character animation scene
   shot_020_v002,Lighting pass
   ```

2. **File encoding**: Ensure CSV is UTF-8 encoded
3. **File size**: Check if file exceeds size limits
4. **Special characters**: Ensure proper escaping of commas and quotes

#### Invalid CSV Data

**Problem**: CSV uploads but data is incorrect

**Solutions:**
1. **Header row**: Ensure first row contains proper headers
2. **Required columns**: First column (shot/version identifier) is required
3. **Data validation**: Check for empty rows or malformed entries

### Export Issues

#### Download Files Are Empty or Corrupted

**Problem**: Downloaded CSV or TXT files are empty or unreadable

**Solutions:**
1. **Check browser settings**: Ensure downloads are not being blocked
2. **File permissions**: Verify backend can write to temp directories
3. **Data availability**: Ensure there's data to export (transcriptions, summaries)

## Debugging Techniques

### Backend Debugging

#### Enable Debug Logging

```bash
cd backend
python -m uvicorn main:main --reload --port 8000 --log-level debug
```

#### Python Debug Console

```python
# Add to backend code for debugging
import pdb; pdb.set_trace()

# Or use print statements
print(f"Debug: variable_value = {variable_value}")
```

### Frontend Debugging

#### Browser Developer Tools

1. **Console**: Check for JavaScript errors
2. **Network tab**: Monitor API calls and responses
3. **WebSocket tab**: Monitor WebSocket messages
4. **Application tab**: Check localStorage and session storage

#### React Debug Information

```javascript
// Add debug logging to components
console.log('Component state:', state);
console.log('Props received:', props);

// Use React Developer Tools browser extension
```

### Network Debugging

#### Check Network Connectivity

```bash
# Test backend connectivity
curl http://localhost:8000/config

# Test external services
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"

# Test WebSocket
websocat ws://localhost:8000/ws
```

## Getting Additional Help

### Log Collection

When reporting issues, include:

1. **Backend logs**: Full output from uvicorn command
2. **Frontend console**: Browser console errors and warnings
3. **Environment info**: OS, Python/Node versions, browser version
4. **Configuration**: Sanitized .env file (remove sensitive keys)

### Reporting Issues

1. **Search existing issues** first
2. **Use issue templates** when available
3. **Provide minimal reproduction case**
4. **Include environment details**

### Community Resources

- GitHub Issues: For bug reports and feature requests
- Documentation: Check all docs files for additional guidance
- Code Examples: Review example configurations in the codebase