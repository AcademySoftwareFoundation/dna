import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import {
  GetProjectsForUserParams,
  GetPlaylistsForProjectParams,
  GetVersionsForPlaylistParams,
  GetUserByEmailParams,
  Playlist,
  Project,
  User as DNAUser,
  Version,
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

  async getProjectsForUser(params: GetProjectsForUserParams): Promise<Project[]> {
    return this.get<Project[]>(`/projects/user/${encodeURIComponent(params.userEmail)}`);
  }

  async getPlaylistsForProject(params: GetPlaylistsForProjectParams): Promise<Playlist[]> {
    return this.get<Playlist[]>(`/projects/${params.projectId}/playlists`);
  }

  async getVersionsForPlaylist(params: GetVersionsForPlaylistParams): Promise<Version[]> {
    return this.get<Version[]>(`/playlists/${params.playlistId}/versions`);
  }

  async getUserByEmail(params: GetUserByEmailParams): Promise<DNAUser> {
    return this.get<DNAUser>(`/users/${encodeURIComponent(params.userEmail)}`);
  }
}

export const createApiHandler = (config: ApiHandlerConfig): ApiHandler => {
  return new ApiHandler(config);
};

export { ApiHandler };
