import { useMutation } from '@tanstack/react-query';
import { apiHandler } from '../api';
import type { UploadRecordingParams, UploadRecordingResponse } from '@dna/core';

/**
 * Upload a Zoom recording and render its per-version clips.
 *
 * The backend processes synchronously (no async worker in V1), so the mutation
 * stays pending for the whole render; callers show a progress indicator off
 * `isPending` and receive `{ recording_id, clips }` on success.
 */
export const useUploadRecording = () => {
  return useMutation<UploadRecordingResponse, Error, UploadRecordingParams>({
    mutationFn: (params) => apiHandler.uploadRecording(params),
  });
};
