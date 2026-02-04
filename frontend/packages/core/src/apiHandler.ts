import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import {
  GetProjectsForUserParams,
  GetPlaylistsForProjectParams,
  GetVersionsForPlaylistParams,
  GetUserByEmailParams,
  GetDraftNoteParams,
  GetAllDraftNotesParams,
  UpsertDraftNoteParams,
  DeleteDraftNoteParams,
  GetPlaylistMetadataParams,
  UpsertPlaylistMetadataParams,
  DeletePlaylistMetadataParams,
  DispatchBotParams,
  StopBotParams,
  GetBotStatusParams,
  GetTranscriptParams,
  GetSegmentsParams,
  GetUserSettingsParams,
  UpsertUserSettingsParams,
  DeleteUserSettingsParams,
  GenerateNoteParams,
  GenerateNoteResponse,
  DraftNote,
  Playlist,
  PlaylistMetadata,
  Project,
  User as DNAUser,
  Version,
  BotSession,
  BotStatus,
  Transcript,
  StoredSegment,
  UserSettings,
} from './interfaces';

export interface User {
  id: string;
  name?: string;
  email?: string;
  token?: string;
}

export interface ApiHandlerConfig {
  baseURL: string;
  timeout?: number;
}

class ApiHandler {
  private axiosInstance: AxiosInstance;
  private currentUser: User | null = null;

  constructor(config: ApiHandlerConfig) {
    this.axiosInstance = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout ?? 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.axiosInstance.interceptors.request.use((requestConfig) => {
      if (this.currentUser?.token) {
        requestConfig.headers.Authorization = `Bearer ${this.currentUser.token}`;
      }
      if (this.currentUser?.id) {
        requestConfig.headers['X-User-Id'] = this.currentUser.id;
      }
      return requestConfig;
    });
  }

  setUser(user: User | null): void {
    this.currentUser = user;
  }

  getUser(): User | null {
    return this.currentUser;
  }

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.axiosInstance.get(
      url,
      config
    );
    return response.data;
  }

  async post<T>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<T> {
    const response: AxiosResponse<T> = await this.axiosInstance.post(
      url,
      data,
      config
    );
    return response.data;
  }

  async put<T>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<T> {
    const response: AxiosResponse<T> = await this.axiosInstance.put(
      url,
      data,
      config
    );
    return response.data;
  }

  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.axiosInstance.delete(
      url,
      config
    );
    return response.data;
  }

  async getProjectsForUser(
    params: GetProjectsForUserParams
  ): Promise<Project[]> {
    return this.get<Project[]>(
      `/projects/user/${encodeURIComponent(params.userEmail)}`
    );
  }

  async getPlaylistsForProject(
    params: GetPlaylistsForProjectParams
  ): Promise<Playlist[]> {
    return this.get<Playlist[]>(`/projects/${params.projectId}/playlists`);
  }

  async getVersionsForPlaylist(
    params: GetVersionsForPlaylistParams
  ): Promise<Version[]> {
    return this.get<Version[]>(`/playlists/${params.playlistId}/versions`);
  }

  async getUserByEmail(params: GetUserByEmailParams): Promise<DNAUser> {
    return this.get<DNAUser>(`/users/${encodeURIComponent(params.userEmail)}`);
  }

  async getDraftNote(params: GetDraftNoteParams): Promise<DraftNote | null> {
    return this.get<DraftNote | null>(
      `/playlists/${params.playlistId}/versions/${params.versionId}/draft-notes/${encodeURIComponent(params.userEmail)}`
    );
  }

  async upsertDraftNote(params: UpsertDraftNoteParams): Promise<DraftNote> {
    return this.put<DraftNote>(
      `/playlists/${params.playlistId}/versions/${params.versionId}/draft-notes/${encodeURIComponent(params.userEmail)}`,
      params.data
    );
  }

  async deleteDraftNote(params: DeleteDraftNoteParams): Promise<boolean> {
    return this.delete<boolean>(
      `/playlists/${params.playlistId}/versions/${params.versionId}/draft-notes/${encodeURIComponent(params.userEmail)}`
    );
  }

  async getAllDraftNotes(params: GetAllDraftNotesParams): Promise<DraftNote[]> {
    return this.get<DraftNote[]>(
      `/playlists/${params.playlistId}/versions/${params.versionId}/draft-notes`
    );
  }

  async getPlaylistMetadata(
    params: GetPlaylistMetadataParams
  ): Promise<PlaylistMetadata | null> {
    return this.get<PlaylistMetadata | null>(
      `/playlists/${params.playlistId}/metadata`
    );
  }

  async upsertPlaylistMetadata(
    params: UpsertPlaylistMetadataParams
  ): Promise<PlaylistMetadata> {
    return this.put<PlaylistMetadata>(
      `/playlists/${params.playlistId}/metadata`,
      params.data
    );
  }

  async deletePlaylistMetadata(
    params: DeletePlaylistMetadataParams
  ): Promise<boolean> {
    return this.delete<boolean>(`/playlists/${params.playlistId}/metadata`);
  }

  async dispatchBot(params: DispatchBotParams): Promise<BotSession> {
    return this.post<BotSession>('/transcription/bot', params.request);
  }

  async stopBot(params: StopBotParams): Promise<boolean> {
    return this.delete<boolean>(
      `/transcription/bot/${params.platform}/${encodeURIComponent(params.meetingId)}`
    );
  }

  async getBotStatus(params: GetBotStatusParams): Promise<BotStatus> {
    return this.get<BotStatus>(
      `/transcription/bot/${params.platform}/${encodeURIComponent(params.meetingId)}/status`
    );
  }

  async getTranscript(params: GetTranscriptParams): Promise<Transcript> {
    return this.get<Transcript>(
      `/transcription/transcript/${params.platform}/${encodeURIComponent(params.meetingId)}`
    );
  }

  async getSegmentsForVersion(
    params: GetSegmentsParams
  ): Promise<StoredSegment[]> {
    return this.get<StoredSegment[]>(
      `/transcription/segments/${params.playlistId}/${params.versionId}`
    );
  }

  async getUserSettings(
    params: GetUserSettingsParams
  ): Promise<UserSettings | null> {
    return this.get<UserSettings | null>(
      `/users/${encodeURIComponent(params.userEmail)}/settings`
    );
  }

  async upsertUserSettings(
    params: UpsertUserSettingsParams
  ): Promise<UserSettings> {
    return this.put<UserSettings>(
      `/users/${encodeURIComponent(params.userEmail)}/settings`,
      params.data
    );
  }

  async deleteUserSettings(params: DeleteUserSettingsParams): Promise<boolean> {
    return this.delete<boolean>(
      `/users/${encodeURIComponent(params.userEmail)}/settings`
    );
  }

  async generateNote(
    params: GenerateNoteParams
  ): Promise<GenerateNoteResponse> {
    return this.post<GenerateNoteResponse>('/generate-note', {
      playlist_id: params.playlistId,
      version_id: params.versionId,
      user_email: params.userEmail,
      additional_instructions: params.additionalInstructions,
    });
  }
}

export const createApiHandler = (config: ApiHandlerConfig): ApiHandler => {
  return new ApiHandler(config);
};

export { ApiHandler };
