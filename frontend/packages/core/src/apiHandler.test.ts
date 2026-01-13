import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { createApiHandler, ApiHandler, User } from './apiHandler';

vi.mock('axios');

const mockedAxios = vi.mocked(axios);

describe('ApiHandler', () => {
  let mockAxiosInstance: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
    interceptors: {
      request: { use: ReturnType<typeof vi.fn> };
    };
  };
  let requestInterceptor: (
    config: Record<string, unknown>
  ) => Record<string, unknown>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockAxiosInstance = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      interceptors: {
        request: {
          use: vi.fn((interceptor) => {
            requestInterceptor = interceptor;
          }),
        },
      },
    };

    mockedAxios.create.mockReturnValue(
      mockAxiosInstance as unknown as ReturnType<typeof axios.create>
    );
  });

  describe('createApiHandler', () => {
    it('should create an axios instance with correct config', () => {
      createApiHandler({ baseURL: 'http://localhost:8000' });

      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: 'http://localhost:8000',
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });

    it('should use custom timeout when provided', () => {
      createApiHandler({ baseURL: 'http://localhost:8000', timeout: 60000 });

      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: 'http://localhost:8000',
        timeout: 60000,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });

    it('should set up request interceptor', () => {
      createApiHandler({ baseURL: 'http://localhost:8000' });

      expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalled();
    });
  });

  describe('setUser / getUser', () => {
    it('should store and retrieve user', () => {
      const api = createApiHandler({ baseURL: 'http://localhost:8000' });
      const user: User = { id: '123', name: 'Test User', token: 'test-token' };

      api.setUser(user);

      expect(api.getUser()).toEqual(user);
    });

    it('should return null when no user is set', () => {
      const api = createApiHandler({ baseURL: 'http://localhost:8000' });

      expect(api.getUser()).toBeNull();
    });

    it('should allow clearing user by setting null', () => {
      const api = createApiHandler({ baseURL: 'http://localhost:8000' });
      const user: User = { id: '123', token: 'test-token' };

      api.setUser(user);
      api.setUser(null);

      expect(api.getUser()).toBeNull();
    });
  });

  describe('request interceptor', () => {
    it('should add Authorization header when user has token', () => {
      const api = createApiHandler({ baseURL: 'http://localhost:8000' });
      api.setUser({ id: '123', token: 'my-jwt-token' });

      const config = { headers: {} as Record<string, string> };
      const result = requestInterceptor(config);

      expect(result.headers).toEqual({
        Authorization: 'Bearer my-jwt-token',
        'X-User-Id': '123',
      });
    });

    it('should add X-User-Id header when user is set', () => {
      const api = createApiHandler({ baseURL: 'http://localhost:8000' });
      api.setUser({ id: 'user-456' });

      const config = { headers: {} as Record<string, string> };
      const result = requestInterceptor(config);

      expect(result.headers).toEqual({
        'X-User-Id': 'user-456',
      });
    });

    it('should not add headers when no user is set', () => {
      createApiHandler({ baseURL: 'http://localhost:8000' });

      const config = { headers: {} as Record<string, string> };
      const result = requestInterceptor(config);

      expect(result.headers).toEqual({});
    });
  });

  describe('get', () => {
    it('should make GET request and return data', async () => {
      const api = createApiHandler({ baseURL: 'http://localhost:8000' });
      const mockData = { id: 1, name: 'Test' };
      mockAxiosInstance.get.mockResolvedValue({ data: mockData });

      const result = await api.get<typeof mockData>('/test');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/test', undefined);
      expect(result).toEqual(mockData);
    });

    it('should pass config to GET request', async () => {
      const api = createApiHandler({ baseURL: 'http://localhost:8000' });
      mockAxiosInstance.get.mockResolvedValue({ data: {} });
      const config = { params: { filter: 'active' } };

      await api.get('/test', config);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/test', config);
    });
  });

  describe('post', () => {
    it('should make POST request and return data', async () => {
      const api = createApiHandler({ baseURL: 'http://localhost:8000' });
      const mockData = { id: 1, created: true };
      const postData = { name: 'New Item' };
      mockAxiosInstance.post.mockResolvedValue({ data: mockData });

      const result = await api.post<typeof mockData>('/test', postData);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/test',
        postData,
        undefined
      );
      expect(result).toEqual(mockData);
    });

    it('should pass config to POST request', async () => {
      const api = createApiHandler({ baseURL: 'http://localhost:8000' });
      mockAxiosInstance.post.mockResolvedValue({ data: {} });
      const postData = { name: 'New Item' };
      const config = { headers: { 'X-Custom': 'value' } };

      await api.post('/test', postData, config);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/test',
        postData,
        config
      );
    });
  });

  describe('put', () => {
    it('should make PUT request and return data', async () => {
      const api = createApiHandler({ baseURL: 'http://localhost:8000' });
      const mockData = { id: 1, updated: true };
      const putData = { name: 'Updated Item' };
      mockAxiosInstance.put.mockResolvedValue({ data: mockData });

      const result = await api.put<typeof mockData>('/test/1', putData);

      expect(mockAxiosInstance.put).toHaveBeenCalledWith(
        '/test/1',
        putData,
        undefined
      );
      expect(result).toEqual(mockData);
    });

    it('should pass config to PUT request', async () => {
      const api = createApiHandler({ baseURL: 'http://localhost:8000' });
      mockAxiosInstance.put.mockResolvedValue({ data: {} });
      const putData = { name: 'Updated Item' };
      const config = { headers: { 'X-Custom': 'value' } };

      await api.put('/test/1', putData, config);

      expect(mockAxiosInstance.put).toHaveBeenCalledWith(
        '/test/1',
        putData,
        config
      );
    });
  });

  describe('error handling', () => {
    it('should propagate errors from GET requests', async () => {
      const api = createApiHandler({ baseURL: 'http://localhost:8000' });
      const error = new Error('Network error');
      mockAxiosInstance.get.mockRejectedValue(error);

      await expect(api.get('/test')).rejects.toThrow('Network error');
    });

    it('should propagate errors from POST requests', async () => {
      const api = createApiHandler({ baseURL: 'http://localhost:8000' });
      const error = new Error('Server error');
      mockAxiosInstance.post.mockRejectedValue(error);

      await expect(api.post('/test', {})).rejects.toThrow('Server error');
    });

    it('should propagate errors from PUT requests', async () => {
      const api = createApiHandler({ baseURL: 'http://localhost:8000' });
      const error = new Error('Not found');
      mockAxiosInstance.put.mockRejectedValue(error);

      await expect(api.put('/test/1', {})).rejects.toThrow('Not found');
    });
  });

  describe('getProjectsForUser', () => {
    it('should make GET request to correct endpoint', async () => {
      const api = createApiHandler({ baseURL: 'http://localhost:8000' });
      const mockProjects = [
        { id: 1, type: 'Project', name: 'Project One' },
        { id: 2, type: 'Project', name: 'Project Two' },
      ];
      mockAxiosInstance.get.mockResolvedValue({ data: mockProjects });

      const result = await api.getProjectsForUser({
        userEmail: 'test@example.com',
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/projects/user/test%40example.com',
        undefined
      );
      expect(result).toEqual(mockProjects);
    });

    it('should encode special characters in email', async () => {
      const api = createApiHandler({ baseURL: 'http://localhost:8000' });
      mockAxiosInstance.get.mockResolvedValue({ data: [] });

      await api.getProjectsForUser({
        userEmail: 'user+test@example.com',
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/projects/user/user%2Btest%40example.com',
        undefined
      );
    });

    it('should return empty array when no projects found', async () => {
      const api = createApiHandler({ baseURL: 'http://localhost:8000' });
      mockAxiosInstance.get.mockResolvedValue({ data: [] });

      const result = await api.getProjectsForUser({
        userEmail: 'newuser@example.com',
      });

      expect(result).toEqual([]);
    });

    it('should propagate errors', async () => {
      const api = createApiHandler({ baseURL: 'http://localhost:8000' });
      const error = new Error('User not found');
      mockAxiosInstance.get.mockRejectedValue(error);

      await expect(
        api.getProjectsForUser({ userEmail: 'unknown@example.com' })
      ).rejects.toThrow('User not found');
    });
  });

  describe('getPlaylistsForProject', () => {
    it('should make GET request to correct endpoint', async () => {
      const api = createApiHandler({ baseURL: 'http://localhost:8000' });
      const mockPlaylists = [
        { id: 1, type: 'Playlist', code: 'Dailies Review' },
        { id: 2, type: 'Playlist', code: 'Final Review' },
      ];
      mockAxiosInstance.get.mockResolvedValue({ data: mockPlaylists });

      const result = await api.getPlaylistsForProject({ projectId: 42 });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/projects/42/playlists',
        undefined
      );
      expect(result).toEqual(mockPlaylists);
    });

    it('should return empty array when no playlists found', async () => {
      const api = createApiHandler({ baseURL: 'http://localhost:8000' });
      mockAxiosInstance.get.mockResolvedValue({ data: [] });

      const result = await api.getPlaylistsForProject({ projectId: 999 });

      expect(result).toEqual([]);
    });

    it('should propagate errors', async () => {
      const api = createApiHandler({ baseURL: 'http://localhost:8000' });
      const error = new Error('Project not found');
      mockAxiosInstance.get.mockRejectedValue(error);

      await expect(
        api.getPlaylistsForProject({ projectId: 999 })
      ).rejects.toThrow('Project not found');
    });
  });

  describe('getVersionsForPlaylist', () => {
    it('should make GET request to correct endpoint', async () => {
      const api = createApiHandler({ baseURL: 'http://localhost:8000' });
      const mockVersions = [
        { id: 1, type: 'Version', name: 'shot_010_v001' },
        { id: 2, type: 'Version', name: 'shot_020_v002' },
      ];
      mockAxiosInstance.get.mockResolvedValue({ data: mockVersions });

      const result = await api.getVersionsForPlaylist({ playlistId: 42 });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/playlists/42/versions',
        undefined
      );
      expect(result).toEqual(mockVersions);
    });

    it('should return empty array when no versions found', async () => {
      const api = createApiHandler({ baseURL: 'http://localhost:8000' });
      mockAxiosInstance.get.mockResolvedValue({ data: [] });

      const result = await api.getVersionsForPlaylist({ playlistId: 999 });

      expect(result).toEqual([]);
    });

    it('should propagate errors', async () => {
      const api = createApiHandler({ baseURL: 'http://localhost:8000' });
      const error = new Error('Playlist not found');
      mockAxiosInstance.get.mockRejectedValue(error);

      await expect(
        api.getVersionsForPlaylist({ playlistId: 999 })
      ).rejects.toThrow('Playlist not found');
    });
  });
});
