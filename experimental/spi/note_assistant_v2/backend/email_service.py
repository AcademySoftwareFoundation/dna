from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, EmailStr
import os
import sys
import base64
from email.mime.text import MIMEText
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from google.auth.transport.requests import Request

# Load environment variables from .env file (optional)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

SCOPES = ['https://www.googleapis.com/auth/gmail.send']
CREDENTIALS_FILE = 'client_secret.json'  # Place this in your backend dir
TOKEN_FILE = 'token.json'
GMAIL_SENDER = os.getenv('GMAIL_SENDER')

router = APIRouter()

class EmailNotesRequest(BaseModel):
    email: EmailStr
    notes: list

def get_gmail_service():
    creds = None
    if os.path.exists(TOKEN_FILE):
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            with open(TOKEN_FILE, 'w') as token:
                token.write(creds.to_json())
    return build('gmail', 'v1', credentials=creds)

def create_gmail_message(sender, to, subject, html_content):
    message = MIMEText(html_content, 'html')
    message['to'] = to
    message['from'] = sender
    message['subject'] = subject
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
    return {'raw': raw}

def send_gmail_email(to, subject, html_content):
    service = get_gmail_service()
    message = create_gmail_message(GMAIL_SENDER, to, subject, html_content)
    sent = service.users().messages().send(userId="me", body=message).execute()
    return sent

@router.post("/email-notes")
async def email_notes(data: EmailNotesRequest, background_tasks: BackgroundTasks):
    """
    Send the notes as an HTML table to the given email address using Gmail API.
    """
    # Build HTML table
    html = """
    <h2>Dailies Shot Notes</h2>
    <table border='1' cellpadding='6' cellspacing='0' style='border-collapse:collapse;font-family:sans-serif;'>
      <thead>
        <tr style='background:#f1f5f9;'>
          <th>Shot/Version</th>
          <th>Notes</th>
          <th>Transcription</th>
          <th>Summary</th>
        </tr>
      </thead>
      <tbody>
    """
    for row in data.notes:
        html += f"<tr>"
        html += f"<td>{row.get('shot','')}</td>"
        html += f"<td>{row.get('notes','').replace(chr(10),'<br>')}</td>"
        html += f"<td>{row.get('transcription','').replace(chr(10),'<br>')}</td>"
        html += f"<td>{row.get('summary','').replace(chr(10),'<br>')}</td>"
        html += "</tr>"
    html += "</tbody></table>"
    subject = "Dailies Shot Notes"
    def send_task():
        send_gmail_email(data.email, subject, html)
    background_tasks.add_task(send_task)
    return {"status": "success", "message": f"Notes sent to {data.email}"}

def main():
    """
    Standalone test for sending a Gmail message using the Gmail API.
    """
    TO_EMAIL = sys.argv[1] if len(sys.argv) > 1 else GMAIL_SENDER
    FROM_EMAIL = GMAIL_SENDER
    SUBJECT = 'Gmail API Test Email'
    HTML_CONTENT = '''
    <h2>Hello from Gmail API!</h2>
    <p>This is a test email sent using the Gmail API and Python.</p>
    '''
    service = get_gmail_service()
    message = create_gmail_message(FROM_EMAIL, TO_EMAIL, SUBJECT, HTML_CONTENT)
    sent = service.users().messages().send(userId="me", body=message).execute()
    print(f"Email sent! Message ID: {sent['id']}")

if __name__ == '__main__':
    main()
