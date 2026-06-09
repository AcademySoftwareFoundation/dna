import { Button } from '@radix-ui/themes';
import { Upload } from 'lucide-react';

interface AddRecordingButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

/**
 * Header action that opens the recording-upload modal. Rendered only when the
 * VITE_ENABLE_VIDEO_SEGMENT_PUBLISH build flag is on (gating lives in the
 * parent so this component stays presentational).
 */
export function AddRecordingButton({
  onClick,
  disabled,
}: AddRecordingButtonProps) {
  return (
    <Button
      variant="soft"
      size="2"
      onClick={onClick}
      disabled={disabled}
      aria-label="Add Recording"
    >
      <Upload size={16} />
      Add Recording
    </Button>
  );
}
