import React, { useState, useCallback } from 'react';
import StatusBadge from '../StatusBadge';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

function UploadPanel({ setRows, setCurrentIndex, setOriginalFilename }) {
  const [uploadStatus, setUploadStatus] = useState({ msg: "", type: "info" });
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const uploadFile = async (file) => {
    setUploading(true);
    setUploadStatus({ msg: `Uploading ${file.name}...`, type: "info" });
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`${BACKEND_URL}/upload-playlist`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.status === "success") {
        const mapped = (data.items || []).map(v => ({
          shot: v.name,
          transcription: v.transcription,
          notes: v.notes,
          summary: ""
        }));
        setRows(mapped);
        setCurrentIndex(0);
        // Store the original filename for export naming
        if (setOriginalFilename && data.original_filename) {
          setOriginalFilename(data.original_filename);
        }
        setUploadStatus({ msg: "Playlist CSV uploaded successfully", type: "success" });
      } else {
        setUploadStatus({ msg: "Upload failed", type: "error" });
      }
    } catch (err) {
      setUploadStatus({ msg: "Network error during upload", type: "error" });
    } finally {
      setUploading(false);
    }
  };

  const onFileInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  };

  const onDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const onDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.name.toLowerCase().endsWith(".csv")) {
      uploadFile(file);
    } else if (file) {
      setUploadStatus({ msg: "Please drop a .csv file", type: "warning" });
    }
  };

  const openFileDialog = useCallback(() => {
    document.getElementById("playlist-file-input")?.click();
  }, []);

  return (
    <div>
      <p className="help-text">Upload a playlist .csv file. First column should contain the shot/version info.</p>
      <div
        className={`drop-zone ${dragActive ? "active" : ""}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        role="button"
        tabIndex={0}
        onClick={openFileDialog}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") openFileDialog(); }}
        aria-label="Upload playlist CSV via drag and drop or click"
      >
        <div className="dz-inner">
          <strong>Drag & Drop</strong> CSV here<br />
          <span className="muted">or click to browse</span>
        </div>
        <input
          id="playlist-file-input"
          type="file"
          accept=".csv"
          onChange={onFileInputChange}
          style={{ display: "none" }}
        />
      </div>
      <div className="actions-row">
        {uploading && <span className="spinner" aria-hidden="true" />}
        <StatusBadge type={uploadStatus.type}>{uploadStatus.msg}</StatusBadge>
      </div>
    </div>
  );
}

export default UploadPanel;