import React, { useState } from 'react';
import StatusBadge from '../StatusBadge';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

function ExportPanel({ rows, shotSegments, originalFilename }) {
  const [email, setEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState({ msg: "", type: "info" });
  const [sendingEmail, setSendingEmail] = useState(false);

  // --- CSV Download Helper ---
  const downloadCSV = async () => {
    if (!rows.length) return;
    
    try {
      const res = await fetch(`${BACKEND_URL}/export-notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          notes: rows, 
          export_format: 'csv',
          original_filename: originalFilename 
        }),
      });
      
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        // Create blob and trigger download
        const blob = new Blob([data.content], { type: data.content_type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        console.error('Failed to export notes:', data);
      }
    } catch (err) {
      console.error('Error exporting notes:', err);
    }
  };

  // --- Transcript Download Helper ---
  const downloadTranscript = () => {
    if (!rows.length) return;
    let transcriptContent = 'Audio Transcript\n================\n\n';
    rows.forEach(row => {
      transcriptContent += `${row.shot}\n`;
      transcriptContent += '-------------------\n';
      transcriptContent += `${row.transcription || ''}\n\n`;
    });
    
    // Generate filename based on original source
    let filename = 'audio_transcript.txt';
    if (originalFilename) {
      const baseName = originalFilename.replace(/\.[^/.]+$/, ''); // Remove extension
      filename = `${baseName}_transcript.txt`;
    }
    
    // Create blob and trigger download
    const blob = new Blob([transcriptContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleEmailSend = async () => {
    setSendingEmail(true);
    setEmailStatus({ msg: "Sending notes...", type: "info" });
    try {
      // Generate email subject based on original filename
      let emailSubject = "Shot Notes";
      if (originalFilename) {
        const baseName = originalFilename.replace(/\.[^/.]+$/, ''); // Remove extension
        emailSubject = `Shot Notes - ${baseName}`;
      }
      
      const res = await fetch(`${BACKEND_URL}/email-notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          email, 
          notes: rows, 
          subject: emailSubject 
        }),
      });
      const data = await res.json();
      if (res.ok && data.status === "success") {
        setEmailStatus({ msg: data.message, type: "success" });
      } else {
        // Enhanced error handling for credential issues
        let errorMsg = data.message || "Failed to send email";
        if (
          errorMsg.toLowerCase().includes("jsondecodeerror") ||
          errorMsg.toLowerCase().includes("credentials") ||
          errorMsg.includes("Expecting value: line 1 column 1 (char 0)")
        ) {
          errorMsg = "Email service error: Google credentials are missing or invalid. Please contact your administrator.";
        }
        setEmailStatus({ msg: errorMsg, type: "error" });
      }
    } catch (err) {
      setEmailStatus({ msg: "Network error while sending email", type: "error" });
    } finally {
      setSendingEmail(false);
    }
  };

  return (
    <div>
      <p className="help-text">Download your notes and transcripts, or email them to a recipient.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
        <button
          className="btn primary"
          style={{ alignSelf: 'flex-start', minWidth: 160, height: 36, padding: '0 16px', fontSize: '14px' }}
          onClick={downloadCSV}
          disabled={rows.length === 0}
        >
          Download Notes
        </button>
        <button
          className="btn primary"
          style={{ alignSelf: 'flex-start', minWidth: 160, height: 36, padding: '0 16px', fontSize: '14px' }}
          onClick={downloadTranscript}
          disabled={!shotSegments || Object.keys(shotSegments).length === 0}
        >
          Download Transcript
        </button>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="email"
            className="text-input"
            style={{ flex: 1, height: 36, padding: '0 12px', boxSizing: 'border-box', fontSize: '14px' }}
            placeholder="Enter email address"
            value={email}
            onChange={e => setEmail(e.target.value)}
            disabled={sendingEmail}
            aria-label="Recipient email address"
            required
          />
          <button
            className="btn primary"
            style={{ minWidth: 100, height: 36, padding: '0 16px', fontSize: '14px' }}
            disabled={!email || sendingEmail || rows.length === 0}
            onClick={handleEmailSend}
          >
            {sendingEmail ? "Sending..." : "Email"}
          </button>
        </div>
      </div>
      <div style={{ marginTop: 8 }}>
        <StatusBadge type={emailStatus.type}>{emailStatus.msg}</StatusBadge>
      </div>
    </div>
  );
}

export default ExportPanel;