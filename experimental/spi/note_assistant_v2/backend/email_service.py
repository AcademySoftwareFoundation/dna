from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, EmailStr
import os
import sys
import base64
import html
import csv
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
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

SCOPES = [
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/drive.metadata.readonly',
    'https://www.googleapis.com/auth/gmail.send'
]
# Get the directory of this script for relative paths
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CREDENTIALS_FILE = os.path.join(_SCRIPT_DIR, 'client_secret.json')
TOKEN_FILE = os.path.join(_SCRIPT_DIR, 'token.json')
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


import re


def timestamp_to_seconds(timestamp_str: str) -> int:
    """
    Convert HH:MM:SS timestamp to total seconds.

    Args:
        timestamp_str: Timestamp in format "HH:MM:SS" or "MM:SS"

    Returns:
        Total seconds as integer

    Example:
        >>> timestamp_to_seconds("01:23:45")
        5025
        >>> timestamp_to_seconds("23:45")
        1425
    """
    if not timestamp_str or not timestamp_str.strip():
        return 0

    parts = timestamp_str.strip().split(':')

    try:
        if len(parts) == 3:  # HH:MM:SS
            hours, minutes, seconds = map(int, parts)
            return hours * 3600 + minutes * 60 + seconds
        elif len(parts) == 2:  # MM:SS
            minutes, seconds = map(int, parts)
            return minutes * 60 + seconds
        else:
            return 0
    except (ValueError, AttributeError):
        return 0


def create_timestamped_drive_url(drive_url: str, timestamp_str: str):
    """
    Create Google Drive video URL with timestamp parameter.

    Args:
        drive_url: Base Google Drive URL
        timestamp_str: Timestamp in HH:MM:SS format

    Returns:
        URL with timestamp parameter, or None if inputs invalid

    Example:
        >>> create_timestamped_drive_url(
        ...     "https://drive.google.com/file/d/ABC123/view",
        ...     "01:23:45"
        ... )
        "https://drive.google.com/file/d/ABC123/view?t=5025s"
    """
    if not drive_url or not drive_url.strip():
        return None

    if not timestamp_str or not timestamp_str.strip():
        return None

    seconds = timestamp_to_seconds(timestamp_str)
    if seconds == 0:
        # If timestamp is exactly 00:00:00, don't add parameter
        return drive_url

    # Add timestamp parameter to URL
    separator = '&' if '?' in drive_url else '?'
    return f"{drive_url}{separator}t={seconds}s"


def replace_version_markers_with_links(text: str, drive_url: str = None) -> str:
    """
    Replace version markers [version_number, timestamp] in text with clickable HTML links.

    Args:
        text: Text containing version markers in format [version_number, timestamp]
        drive_url: Optional Google Drive URL for creating timestamp links

    Returns:
        Text with version markers replaced by HTML links (if drive_url provided) or bold text

    Example:
        >>> replace_version_markers_with_links(
        ...     "Review of [1234, 00:15:30] looks good",
        ...     "https://drive.google.com/file/d/ABC123/view"
        ... )
        "Review of <a href='...' target='_blank'>1234</a> looks good"
    """
    if not text:
        return text

    # Pattern matches [version_number, timestamp] where:
    # - version_number is one or more digits
    # - timestamp is HH:MM:SS or MM:SS format
    pattern = r'\[(\d+),\s*(\d{1,2}:\d{2}:\d{2})\]'

    def replacer(match):
        version_num = match.group(1)
        timestamp = match.group(2)

        if drive_url:
            # Create clickable link with timestamp
            timestamped_url = create_timestamped_drive_url(drive_url, timestamp)
            if timestamped_url:
                return f'<a href="{html.escape(timestamped_url)}" target="_blank" style="color:#0066cc;text-decoration:underline;font-weight:bold;">{html.escape(version_num)}</a>'

        # Fallback to bold text if no drive URL
        return f'<span style="font-weight:bold;">{html.escape(version_num)}</span>'

    return re.sub(pattern, replacer, text)


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

def create_gmail_message(sender, to, subject, html_content, attachments=None):
    """
    Create Gmail API message with optional attachments.

    Args:
        sender: Sender email address
        to: Recipient email address
        subject: Email subject
        html_content: HTML body content
        attachments: Optional list of tuples [(filename, filepath), ...]

    Returns:
        Dict with base64-encoded message for Gmail API
    """
    message = MIMEMultipart('mixed')
    message['to'] = to
    message['from'] = sender
    message['subject'] = subject

    # Attach HTML body
    html_part = MIMEText(html_content, 'html')
    message.attach(html_part)

    # Attach files if provided
    if attachments:
        for filename, filepath in attachments:
            if os.path.exists(filepath):
                with open(filepath, 'rb') as f:
                    part = MIMEBase('text', 'csv')
                    part.set_payload(f.read())
                    encoders.encode_base64(part)
                    part.add_header('Content-Disposition', f'attachment; filename="{filename}"')
                    message.attach(part)

    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
    return {'raw': raw}

def send_gmail_email(to, subject, html_content, attachments=None):
    service = get_gmail_service()
    message = create_gmail_message(EMAIL_SENDER, to, subject, html_content, attachments=attachments)
    sent = service.users().messages().send(userId="me", body=message).execute()
    return sent

def send_smtp_email(to, subject, html_content, cc=None, bcc=None, attachments=None):
    recipients = [to]
    if cc:
        recipients += cc
    if bcc:
        recipients += bcc
    msg = MIMEMultipart('mixed')
    msg['Subject'] = subject
    msg['From'] = EMAIL_SENDER
    msg['To'] = ','.join([to])
    if cc:
        msg['Cc'] = ','.join(cc)
    msg.attach(MIMEText(html_content, 'html', 'utf-8'))

    # Attach files if provided
    if attachments:
        for filename, filepath in attachments:
            if os.path.exists(filepath):
                with open(filepath, 'rb') as f:
                    part = MIMEBase('text', 'csv')
                    part.set_payload(f.read())
                    encoders.encode_base64(part)
                    part.add_header('Content-Disposition', f'attachment; filename="{filename}"')
                    msg.attach(part)

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

def send_email(to, subject, html_content, attachments=None):
    if EMAIL_PROVIDER == 'smtp':
        send_smtp_email(to, subject, html_content, attachments=attachments)
    else:
        send_gmail_email(to, subject, html_content, attachments=attachments)

def send_csv_email(recipient_email: str, csv_file_path: str, drive_url: str = None, thumbnail_url: str = None, timeline_csv_path: str = None, subject: str = None, execution_time: str = None, timing_breakdown: dict = None, participants: list = None, meeting_duration: str = None) -> bool:
    """
    Send email with CSV data including version number, LLM summary, SG notes, and first 500 characters from conversation.

    Version IDs are rendered as clickable links that jump to specific timestamps in the Google Drive recording
    (if drive_url is provided). Optional thumbnails can be displayed for each version.

    Args:
        recipient_email: Email address to send to
        csv_file_path: Path to CSV file with results
        drive_url: Optional Google Drive URL for creating timestamp links
        thumbnail_url: Optional base URL for thumbnails. Version ID will be appended.
        timeline_csv_path: Optional path to timeline CSV file to attach
        subject: Optional custom email subject line
        execution_time: Optional total execution time string (e.g., "7m 45s")
        timing_breakdown: Optional dict with stage timings (e.g., {'stage1': 337.5, 'stage2': 2.1, ...})
        participants: Optional list of participant names
        meeting_duration: Optional total meeting duration string (e.g., "45m 30s")

    Returns:
        True if email was sent successfully, False otherwise
    """
    # Check if CSV file exists
    if not os.path.exists(csv_file_path):
        print(f"CSV file not found: {csv_file_path}")
        return False

    FROM_EMAIL = EMAIL_SENDER
    # Use custom subject if provided, otherwise use default
    if subject is None:
        subject = 'Dailies Review Data - Version Notes and Summaries'
    SUBJECT = subject

    # Read CSV data
    rows = []
    try:
        with open(csv_file_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                # Skip rows without version_id
                if row.get('version_id') and row['version_id'].strip():
                    rows.append(row)
    except Exception as e:
        print(f"Error reading CSV file: {e}")
        return False

    if not rows:
        print("No valid data found in CSV file")
        return False

    # Generate HTML content
    html_content = f'''
    <h2>{html.escape(SUBJECT)}</h2>
    '''

    # Add meeting summary section if any info is provided
    if participants or meeting_duration or rows:
        html_content += '''
    <div style="margin-bottom: 25px; padding: 15px; background-color: #f9fafb; border-left: 4px solid #3b82f6; border-radius: 4px;">
        <h3 style="margin: 0 0 12px 0; font-size: 16px; color: #1f2937;">Meeting Summary</h3>
        <table style="border: none; font-size: 14px; color: #374151;">
    '''

        if participants:
            participants_str = ', '.join(participants)
            html_content += f'''
            <tr>
                <td style="padding: 4px 12px 4px 0; font-weight: bold; vertical-align: top;">Participants:</td>
                <td style="padding: 4px 0;">{html.escape(participants_str)}</td>
            </tr>
    '''

        if rows:
            version_ids = [row.get('version_id', '') for row in rows if row.get('version_id')]
            version_list = ', '.join(version_ids)
            html_content += f'''
            <tr>
                <td style="padding: 4px 12px 4px 0; font-weight: bold; vertical-align: top;">Versions Reviewed:</td>
                <td style="padding: 4px 0;">{len(version_ids)} version(s) - {html.escape(version_list)}</td>
            </tr>
    '''

        if meeting_duration:
            html_content += f'''
            <tr>
                <td style="padding: 4px 12px 4px 0; font-weight: bold; vertical-align: top;">Meeting Duration:</td>
                <td style="padding: 4px 0;">{html.escape(meeting_duration)}</td>
            </tr>
    '''

        html_content += '''
        </table>
    </div>
    '''

    html_content += '''
    <table border='1' cellpadding='8' cellspacing='0' style='border-collapse:collapse;font-family:Arial,sans-serif;font-size:12px;'>
      <thead>
        <tr style='background:#f1f5f9;font-weight:bold;'>
          <th style='min-width:80px;'>Version ID</th>
          <th style='min-width:150px;'>Notes</th>
          <th style='min-width:200px;'>Transcript Summary</th>
          <!-- <th style='min-width:250px;'>Conversation (First 500 chars)</th> -->
        </tr>
      </thead>
      <tbody>
    '''

    for row in rows:
        version_id = row.get('version_id', '')
        timestamp = row.get('timestamp', '')
        reference_versions = row.get('reference_versions', '')
        summary = row.get('summary', '')  # Don't escape yet - need to process version markers first
        notes = html.escape(row.get('notes', ''))      # Renamed from sg_summary
        # transcription = row.get('transcription', '')  # Renamed from conversation

        # Get first 500 characters of conversation
        # conversation_preview = conversation[:500]
        # if len(conversation) > 500:
        #     conversation_preview += "..."
        # conversation_preview = html.escape(conversation_preview)

        # Replace version markers with clickable links BEFORE escaping HTML
        summary = replace_version_markers_with_links(summary, drive_url)

        # Now escape any remaining HTML and replace newlines with <br> tags
        # Note: The version markers have already been converted to HTML links,
        # so we need to be careful not to double-escape them
        summary = summary.replace('\n', '<br>')
        notes = notes.replace('\n', '<br>')
        # transcription_preview = transcription_preview.replace('\n', '<br>')

        # Generate clickable version ID link if Drive URL available
        timestamped_url = create_timestamped_drive_url(drive_url, timestamp)
        if timestamped_url:
            version_id_html = f'<a href="{html.escape(timestamped_url)}" target="_blank" style="color:#0066cc;text-decoration:underline;font-weight:bold;">{html.escape(version_id)}</a>'
        else:
            # Fallback to plain text if no Drive URL or timestamp
            version_id_html = f'<span style="font-weight:bold;">{html.escape(version_id)}</span>'

        # Add thumbnail if URL provided
        if thumbnail_url and version_id:
            thumbnail_src = f"{thumbnail_url}{version_id}"
            version_id_html += f'<br/><img src="{html.escape(thumbnail_src)}" alt="Thumbnail for {html.escape(version_id)}" style="max-width:150px;margin-top:8px;display:block;"/>'

        # Parse and generate reference version links
        if reference_versions and reference_versions.strip():
            # Parse new format: "9495:00:12:25,9493:00:14:30"
            ref_entries = []
            for ref_entry in reference_versions.split(','):
                ref_entry = ref_entry.strip()
                if ':' in ref_entry:
                    parts = ref_entry.split(':', 1)
                    if len(parts) == 2:
                        ref_v, ref_ts = parts
                        ref_entries.append((ref_v.strip(), ref_ts.strip()))

            if ref_entries:
                ref_links = []
                for ref_v, ref_ts in ref_entries:
                    # Create link with reference version's own timestamp
                    ref_url = create_timestamped_drive_url(drive_url, ref_ts)
                    if ref_url:
                        ref_link = f'<a href="{html.escape(ref_url)}" target="_blank" style="color:#0066cc;text-decoration:underline;">{html.escape(ref_v)}</a>'
                    else:
                        ref_link = f'<span style="text-decoration:underline;">{html.escape(ref_v)}</span>'
                    ref_links.append(ref_link)

                # Add reference versions with (ref: ...) format on new line
                version_id_html += f'<br/><span style="font-size:0.9em;color:#666;">(ref: {", ".join(ref_links)})</span>'

        html_content += f'''
        <tr style='vertical-align:top;'>
          <td>{version_id_html}</td>
          <td>{notes}</td>
          <td>{summary}</td>
          <!-- <td style='font-family:monospace;font-size:11px;'>conversation_preview</td> -->
        </tr>
        '''

    html_content += '''
      </tbody>
    </table>
    '''

    # Add execution time and breakdown if provided
    if execution_time:
        html_content += f'''
        <div style="margin-top: 30px; padding: 15px; background-color: #f5f5f5; border-radius: 5px;">
            <p style="margin: 0 0 10px 0; font-size: 14px; font-weight: bold;">
                ⏱️ Processing Time: {execution_time}
            </p>
        '''

        # Add timing breakdown if provided
        if timing_breakdown:
            # Helper function to format duration
            def format_time(seconds):
                hours = int(seconds // 3600)
                minutes = int((seconds % 3600) // 60)
                secs = int(seconds % 60)
                if hours > 0:
                    return f"{hours}h {minutes}m {secs}s"
                elif minutes > 0:
                    return f"{minutes}m {secs}s"
                else:
                    return f"{secs}s"

            # Build detailed breakdown items
            detailed_items = []
            if 'download' in timing_breakdown:
                detailed_items.append(f'<li>Google Drive Download: {format_time(timing_breakdown["download"])}</li>')

            # Show parallel speedup if available
            if 'parallel_elapsed' in timing_breakdown and 'parallel_speedup' in timing_breakdown:
                transcription_time = timing_breakdown['transcription']
                visual_time = timing_breakdown['visual_detection']
                sequential_time = transcription_time + visual_time
                parallel_time = timing_breakdown['parallel_elapsed']
                speedup = timing_breakdown['parallel_speedup']

                detailed_items.append(f'<li>Audio Transcription: {format_time(transcription_time)} (actual)</li>')
                detailed_items.append(f'<li>Visual Detection: {format_time(visual_time)} (actual)</li>')
                detailed_items.append(f'<li style="margin-left: 15px; color: #4a90e2;">→ Sequential: {format_time(sequential_time)}, Parallel: {format_time(parallel_time)}, Speedup: {speedup:.2f}x</li>')
            else:
                # Sequential mode
                if 'transcription' in timing_breakdown:
                    detailed_items.append(f'<li>Audio Transcription: {format_time(timing_breakdown["transcription"])}</li>')
                if 'visual_detection' in timing_breakdown:
                    detailed_items.append(f'<li>Visual Detection: {format_time(timing_breakdown["visual_detection"])}</li>')

            if 'llm_summarization' in timing_breakdown:
                detailed_items.append(f'<li>LLM Summarization: {format_time(timing_breakdown["llm_summarization"])}</li>')

            if detailed_items:
                html_content += '<p style="margin: 0 0 5px 0; font-size: 12px; color: #666;">Timing Breakdown:</p>'
                html_content += '<ul style="margin: 0; padding-left: 20px; font-size: 12px; color: #666;">'
                html_content += '\n'.join(detailed_items)
                html_content += '</ul>'

        html_content += '</div>'

    html_content += '''
    <p style='margin-top:20px;font-size:11px;color:#666;'>
      Generated from combined_review_data_with_summaries.csv
    </p>
    '''

    # Prepare attachments (used by both SMTP and Gmail)
    attachments = []
    main_csv_filename = os.path.basename(csv_file_path)
    attachments.append((main_csv_filename, csv_file_path))

    # Add timeline CSV if provided
    if timeline_csv_path and os.path.exists(timeline_csv_path):
        timeline_filename = os.path.basename(timeline_csv_path)
        attachments.append((timeline_filename, timeline_csv_path))

    # Send email based on provider
    if EMAIL_PROVIDER == 'smtp':
        print("Sending email using SMTP...")
        try:
            send_smtp_email(recipient_email, SUBJECT, html_content, attachments=attachments)
            print(f"Email sent successfully to {recipient_email} with {len(rows)} records and {len(attachments)} attachment(s).")
            return True
        except Exception as e:
            print(f"SMTP email failed: {e}")
            return False
    else:
        print("Sending email using Gmail API...")
        try:
            # Handle Gmail OAuth if needed
            creds = None
            if not os.path.exists(TOKEN_FILE):
                print("token.json not found. Running OAuth flow to create it...")
                flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_FILE, SCOPES)
                creds = flow.run_local_server(port=0)
                with open(TOKEN_FILE, 'w') as token:
                    token.write(creds.to_json())
                print("token.json created.")

            service = get_gmail_service()
            message = create_gmail_message(FROM_EMAIL, recipient_email, SUBJECT, html_content, attachments=attachments)
            sent = service.users().messages().send(userId="me", body=message).execute()
            print(f"Gmail API email sent successfully to {recipient_email}! Message ID: {sent['id']}")
            print(f"Sent {len(rows)} records from CSV file with {len(attachments)} attachment(s).")
            return True
        except Exception as e:
            print(f"Gmail API email failed: {e}")
            return False

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
        html += f"<td>{row.get('conversation','').replace(chr(10),'<br>')}</td>"
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
    Send email with CSV data including version number, LLM summary, SG notes, and first 500 characters from conversation.

    Usage:
        python email_service.py <recipient_email> <csv_file_path> [--drive-url URL] [--thumbnail-url URL]

    Examples:
        # Basic usage
        python email_service.py user@example.com results.csv

        # With Drive URL for clickable timestamps
        python email_service.py user@example.com results.csv --drive-url "https://drive.google.com/file/d/ABC123/view"

        # With thumbnails
        python email_service.py user@example.com results.csv --thumbnail-url "http://thumbs.example.com/images/project-"

        # With both
        python email_service.py user@example.com results.csv \
            --drive-url "https://drive.google.com/file/d/ABC123/view" \
            --thumbnail-url "http://thumbs.example.com/images/project-"
    """
    import argparse

    parser = argparse.ArgumentParser(
        description='Send email with CSV data including version notes, summaries, and clickable links.',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
Examples:
  # Basic usage
  python email_service.py user@example.com results.csv

  # With Drive URL for clickable timestamps
  python email_service.py user@example.com results.csv --drive-url "https://drive.google.com/file/d/ABC123/view"

  # With thumbnails
  python email_service.py user@example.com results.csv --thumbnail-url "http://thumbs.example.com/images/project-"

  # With both Drive URL and thumbnails
  python email_service.py user@example.com results.csv \\
      --drive-url "https://drive.google.com/file/d/ABC123/view" \\
      --thumbnail-url "http://thumbs.example.com/images/project-"
        '''
    )

    parser.add_argument('recipient_email', help='Email address to send to')
    parser.add_argument('csv_file_path', help='Path to CSV file with results')
    parser.add_argument('--drive-url', default=None,
                       help='Google Drive URL for video (optional - enables clickable timestamp links)')
    parser.add_argument('--thumbnail-url', default=None,
                       help='Base URL for version thumbnails (optional). Version ID will be appended. Example: "http://thumbs.example.com/images/project-"')

    args = parser.parse_args()

    success = send_csv_email(args.recipient_email, args.csv_file_path, drive_url=args.drive_url, thumbnail_url=args.thumbnail_url)

    if success:
        print(f"\nEmail sent successfully to {args.recipient_email}")
    else:
        print(f"\nFailed to send email to {args.recipient_email}")
        sys.exit(1)

if __name__ == '__main__':
    main()
