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
