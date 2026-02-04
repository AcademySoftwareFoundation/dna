export type EntityType =
  | 'Project'
  | 'Shot'
  | 'Asset'
  | 'Note'
  | 'Task'
  | 'Version'
  | 'Playlist';

export interface ProjectReference {
  type: string;
  id: number;
  name?: string;
}

export interface PipelineStep {
  type: string;
  id: number;
  name?: string;
}

export interface UserReference {
  id: number;
  name: string;
  type: string;
}

export interface EntityBase {
  id: number;
  type: EntityType;
}

export interface Project extends EntityBase {
  type: 'Project';
  name?: string;
}

export interface Task extends EntityBase {
  type: 'Task';
  name?: string;
  status?: string;
  pipeline_step?: PipelineStep;
  project?: ProjectReference;
  entity?: EntityBase;
}

export interface Note extends EntityBase {
  type: 'Note';
  subject?: string;
  content?: string;
  project?: ProjectReference;
  note_links: EntityBase[];
}

export interface Shot extends EntityBase {
  type: 'Shot';
  name?: string;
  description?: string;
  project?: ProjectReference;
  tasks: Task[];
}

export interface Asset extends EntityBase {
  type: 'Asset';
  name?: string;
  description?: string;
  project?: ProjectReference;
  tasks: Task[];
}

export interface Version extends EntityBase {
  type: 'Version';
  name?: string;
  description?: string;
  status?: string;
  user?: UserReference;
  created_at?: string;
  updated_at?: string;
  movie_path?: string;
  frame_path?: string;
  thumbnail?: string;
  project?: ProjectReference;
  entity?: Shot | Asset;
  task?: Task;
  notes: Note[];
}

export interface Playlist extends EntityBase {
  type: 'Playlist';
  code?: string;
  description?: string;
  project?: ProjectReference;
  created_at?: string;
  updated_at?: string;
  versions: Version[];
}

export interface User {
  id: number;
  type: 'User';
  name?: string;
  email?: string;
  login?: string;
}

export type DNAEntity =
  | Project
  | Shot
  | Asset
  | Note
  | Task
  | Version
  | Playlist
  | User;

export interface EntityLink {
  type: string;
  id: number;
}

export interface CreateNoteRequest {
  subject: string;
  content?: string;
  project: ProjectReference;
  note_links?: EntityLink[];
}

export interface GetProjectsForUserParams {
  userEmail: string;
}

export interface GetPlaylistsForProjectParams {
  projectId: number;
}

export interface GetVersionsForPlaylistParams {
  playlistId: number;
}

export interface GetUserByEmailParams {
  userEmail: string;
}

export interface DraftNoteLink {
  entity_type: string;
  entity_id: number;
}

export interface DraftNote {
  _id: string;
  user_email: string;
  playlist_id: number;
  version_id: number;
  content: string;
  subject: string;
  to: string;
  cc: string;
  links: DraftNoteLink[];
  version_status: string;
  updated_at: string;
  created_at: string;
}

export interface DraftNoteUpdate {
  content?: string;
  subject?: string;
  to?: string;
  cc?: string;
  links?: DraftNoteLink[];
  version_status?: string;
}

export interface GetDraftNoteParams {
  playlistId: number;
  versionId: number;
  userEmail: string;
}

export interface UpsertDraftNoteParams {
  playlistId: number;
  versionId: number;
  userEmail: string;
  data: DraftNoteUpdate;
}

export interface DeleteDraftNoteParams {
  playlistId: number;
  versionId: number;
  userEmail: string;
}

export interface GetAllDraftNotesParams {
  playlistId: number;
  versionId: number;
}

export interface PlaylistMetadata {
  _id: string;
  playlist_id: number;
  in_review: number | null;
  meeting_id: string | null;
  platform: Platform | null;
  transcription_paused: boolean;
}

export interface PlaylistMetadataUpdate {
  in_review?: number | null;
  meeting_id?: string | null;
  platform?: Platform | null;
  transcription_paused?: boolean;
}

export interface GetPlaylistMetadataParams {
  playlistId: number;
}

export interface UpsertPlaylistMetadataParams {
  playlistId: number;
  data: PlaylistMetadataUpdate;
}

export interface DeletePlaylistMetadataParams {
  playlistId: number;
}

export type Platform = 'google_meet' | 'teams';

export type BotStatusEnum =
  | 'idle'
  | 'joining'
  | 'waiting_room'
  | 'in_call'
  | 'transcribing'
  | 'failed'
  | 'stopped'
  | 'completed';

export interface DispatchBotRequest {
  platform: Platform;
  meeting_id: string;
  playlist_id: number;
  passcode?: string;
  bot_name?: string;
  language?: string;
}

export interface BotStatus {
  platform: Platform;
  meeting_id: string;
  status: BotStatusEnum;
  message?: string;
  updated_at: string;
}

export interface BotSession {
  platform: Platform;
  meeting_id: string;
  playlist_id: number;
  status: BotStatusEnum;
  bot_name?: string;
  language?: string;
  created_at: string;
  updated_at: string;
}

export interface TranscriptSegment {
  text: string;
  speaker?: string;
  start_time?: number;
  end_time?: number;
  timestamp: string;
}

export interface Transcript {
  platform: Platform;
  meeting_id: string;
  segments: TranscriptSegment[];
  language?: string;
  duration?: number;
}

export interface DispatchBotParams {
  request: DispatchBotRequest;
}

export interface StopBotParams {
  platform: Platform;
  meetingId: string;
}

export interface GetBotStatusParams {
  platform: Platform;
  meetingId: string;
}

export interface GetTranscriptParams {
  platform: Platform;
  meetingId: string;
}

export interface StoredSegment {
  id: string;
  segment_id: string;
  playlist_id: number;
  version_id: number;
  text: string;
  speaker?: string;
  language?: string;
  absolute_start_time: string;
  absolute_end_time: string;
  vexa_updated_at?: string;
  created_at: string;
  updated_at: string;
}

export interface GetSegmentsParams {
  playlistId: number;
  versionId: number;
}

export interface UserSettings {
  _id: string;
  user_email: string;
  note_prompt: string;
  regenerate_on_version_change: boolean;
  regenerate_on_transcript_update: boolean;
  updated_at: string;
  created_at: string;
}

export interface UserSettingsUpdate {
  note_prompt?: string;
  regenerate_on_version_change?: boolean;
  regenerate_on_transcript_update?: boolean;
}

export interface GetUserSettingsParams {
  userEmail: string;
}

export interface UpsertUserSettingsParams {
  userEmail: string;
  data: UserSettingsUpdate;
}

export interface DeleteUserSettingsParams {
  userEmail: string;
}

export interface GenerateNoteParams {
  playlistId: number;
  versionId: number;
  userEmail: string;
  additionalInstructions?: string;
}

export interface GenerateNoteResponse {
  suggestion: string;
  prompt: string;
  context: string;
}

export interface AISuggestionState {
  suggestion: string | null;
  prompt: string | null;
  context: string | null;
  isLoading: boolean;
  error: Error | null;
}

export type AISuggestionStateChangeCallback = (
  playlistId: number,
  versionId: number,
  state: AISuggestionState
) => void;

export interface PublishNotesRequest {
  user_email: string;
  include_others: boolean;
}

export interface PublishNotesResponse {
  published_count: number;
  skipped_count: number;
  failed_count: number;
  total: number;
}

export interface PublishNotesParams {
  playlistId: number;
  request: PublishNotesRequest;
}
