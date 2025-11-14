import React, { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

function StatusBadge({ type = "info", children, detailedMessage = null, maxLength = 40 }) {
  const [showPopup, setShowPopup] = useState(false);
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });
  const badgeRef = useRef(null);
  
  const closePopup = useCallback(() => {
    setShowPopup(false);
  }, []);
  
  const handleInfoClick = useCallback((e) => {
    e.stopPropagation();
    
    if (badgeRef.current) {
      const rect = badgeRef.current.getBoundingClientRect();
      let x = rect.left + rect.width + 8;
      let y = rect.top;
      
      // Ensure popup stays within viewport bounds
      const maxWidth = 400;
      const maxHeight = 200;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      // Adjust horizontal position
      if (x + maxWidth > viewportWidth) {
        x = Math.max(10, rect.left - maxWidth - 8);
      }
      
      // Adjust vertical position
      if (y + maxHeight > viewportHeight) {
        y = Math.max(10, viewportHeight - maxHeight - 10);
      }
      
      // Ensure minimum distance from edges
      x = Math.max(10, Math.min(x, viewportWidth - maxWidth - 10));
      y = Math.max(10, Math.min(y, viewportHeight - maxHeight - 10));
      
      setPopupPosition({ x, y });
    }
    setShowPopup(true);
  }, []);
  
  // Close popup when clicking outside
  useEffect(() => {
    if (!showPopup) return;
    
    const handleClickOutside = (e) => {
      // Check if click is outside both the badge and the popup
      const clickedElement = e.target;
      const isClickInBadge = badgeRef.current && badgeRef.current.contains(clickedElement);
      const isClickInPopup = clickedElement.closest('.status-popup');
      
      if (!isClickInBadge && !isClickInPopup) {
        closePopup();
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showPopup, closePopup]);
  
  // Early return MUST come after all hooks
  if (!children) return null;
  
  const message = children.toString();
  const fullMessage = detailedMessage || message;
  const hasDetailedMessage = detailedMessage && detailedMessage !== message;
  const shouldTruncate = message.length > maxLength;
  const showInfoIcon = shouldTruncate || hasDetailedMessage;
  const displayMessage = shouldTruncate ? message.substring(0, maxLength) + "..." : message;
  
  return (
    <>
      <span 
        ref={badgeRef}
        className={`badge badge-${type} ${showInfoIcon ? 'badge-truncated' : ''}`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
      >
        <span>{displayMessage}</span>
        {showInfoIcon && (
          <button
            type="button"
            className="badge-info-icon"
            onClick={handleInfoClick}
            style={{
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              padding: '0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              opacity: 0.8,
              fontSize: '12px'
            }}
            title="Click to see full message"
          >
            ⓘ
          </button>
        )}
      </span>
      
      {showPopup && createPortal(
        <div
          className="status-popup"
          style={{
            position: 'fixed',
            left: `${popupPosition.x}px`,
            top: `${popupPosition.y}px`,
            zIndex: 10001,
            background: '#1f242d',
            border: '1px solid #444',
            borderRadius: '8px',
            padding: '12px',
            maxWidth: '400px',
            minWidth: '200px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
            color: '#e6ecf2',
            fontSize: '13px',
            lineHeight: '1.4',
            wordBreak: 'break-word',
            visibility: 'visible',
            pointerEvents: 'auto',
            display: 'block'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ marginBottom: '8px', fontWeight: '500', color: '#93a1b3' }}>
            Full Message:
          </div>
          <div style={{ marginRight: '20px' }}>{fullMessage}</div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              closePopup();
            }}
            style={{
              position: 'absolute',
              top: '8px',
              right: '8px',
              background: 'none',
              border: 'none',
              color: '#93a1b3',
              cursor: 'pointer',
              fontSize: '16px',
              padding: '0',
              width: '20px',
              height: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="Close"
          >
            ×
          </button>
        </div>,
        document.body
      )}
    </>
  );
}

export default StatusBadge;