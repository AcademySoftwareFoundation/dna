from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, EmailStr
import os
import sys
import base64
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from google.auth.transport.requests import Request
import smtplib

# Load environment variables from .env file (optional)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

SCOPES = ['https://www.googleapis.com/auth/gmail.send']
CREDENTIALS_FILE = 'client_secret.json'  # Place this in your backend dir
TOKEN_FILE = 'token.json'
EMAIL_SENDER = os.getenv('EMAIL_SENDER')
EMAIL_PROVIDER = os.getenv('EMAIL_PROVIDER', 'gmail')
SMTP_HOST = os.getenv('SMTP_HOST', 'localhost')
SMTP_PORT = os.getenv('SMTP_PORT')
if SMTP_PORT is not None:
    SMTP_PORT = int(SMTP_PORT)
SMTP_USER = os.getenv('SMTP_USER')
SMTP_PASSWORD = os.getenv('SMTP_PASSWORD')
SMTP_TLS = os.getenv('SMTP_TLS', 'false').lower() == 'true'

router = APIRouter()

class EmailNotesRequest(BaseModel):
    email: EmailStr
    notes: list
    subject: str = "Dailies Shot Notes"  # Optional custom subject with default

def get_gmail_service():
    creds = None
    if os.path.exists(TOKEN_FILE):
        try:
            creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
        except Exception as e:
            raise RuntimeError(f"Google credentials file is missing or invalid: {e}")
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            raise RuntimeError("Google credentials are missing or invalid. Please contact your administrator.")
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
    message = create_gmail_message(EMAIL_SENDER, to, subject, html_content)
    sent = service.users().messages().send(userId="me", body=message).execute()
    return sent

def send_smtp_email(to, subject, html_content, cc=None, bcc=None):
    recipients = [to]
    if cc:
        recipients += cc
    if bcc:
        recipients += bcc
    msg = MIMEMultipart('')
    msg['Subject'] = subject
    msg['From'] = EMAIL_SENDER
    msg['To'] = ','.join([to])
    if cc:
        msg['Cc'] = ','.join(cc)
    msg.attach(MIMEText(html_content, 'html', 'utf-8'))
    try:
        smtp_msg = smtplib.SMTP()
        if SMTP_PORT is not None:
            smtp_msg.connect(SMTP_HOST, SMTP_PORT)
        else:
            smtp_msg.connect(SMTP_HOST)
        if SMTP_TLS:
            smtp_msg.starttls()
        if SMTP_USER and SMTP_PASSWORD:
            smtp_msg.login(SMTP_USER, SMTP_PASSWORD)
        smtp_msg.sendmail(EMAIL_SENDER, recipients, msg.as_string())
        smtp_msg.close()
    except Exception as e:
        raise RuntimeError(f"SMTP email send failed: {e}")

def send_email(to, subject, html_content):
    if EMAIL_PROVIDER == 'smtp':
        send_smtp_email(to, subject, html_content)
    else:
        send_gmail_email(to, subject, html_content)

@router.post("/email-notes")
async def email_notes(data: EmailNotesRequest):
    """
    Send the notes as an HTML table to the given email address using Gmail API.
    """
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
    
    # Use the custom subject from the request
    subject = data.subject
    try:
        send_email(data.email, subject, html)
        return {"status": "success", "message": f"Notes sent to {data.email}"}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"status": "error", "message": f"Email service error: {str(e)}"}

def main():
    """
    Standalone test for sending an email using Gmail API or SMTP, depending on EMAIL_PROVIDER.
    If token.json does not exist, run OAuth flow to create it for Gmail.
    """
    TO_EMAIL = sys.argv[1] if len(sys.argv) > 1 else EMAIL_SENDER
    FROM_EMAIL = EMAIL_SENDER
    SUBJECT = 'Test Email from DNA'
    HTML_CONTENT = '''
    <h2>Hello from DNA!</h2>
    <p>This is a test email sent using the configured email provider.</p>
    '''
    if EMAIL_PROVIDER == 'smtp':
        print("Sending test email using SMTP...")
        try:
            send_smtp_email(TO_EMAIL, SUBJECT, HTML_CONTENT)
            print("SMTP test email sent successfully.")
        except Exception as e:
            print(f"SMTP test email failed: {e}")
    else:
        creds = None
        if not os.path.exists(TOKEN_FILE):
            print("token.json not found. Running OAuth flow to create it...")
            flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_FILE, SCOPES)
            creds = flow.run_local_server(port=0)
            with open(TOKEN_FILE, 'w') as token:
                token.write(creds.to_json())
            print("token.json created.")
        service = get_gmail_service()
        message = create_gmail_message(FROM_EMAIL, TO_EMAIL, SUBJECT, HTML_CONTENT)
        sent = service.users().messages().send(userId="me", body=message).execute()
        print(f"Gmail API test email sent! Message ID: {sent['id']}")

if __name__ == '__main__':
    main()
