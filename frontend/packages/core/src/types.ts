/**
 * Core types for DNA application
 */

export interface Version {
  id: string;
  name: string;
  path: string;
  createdAt: string;
}

export interface Playlist {
  id: string;
  name: string;
  versions: Version[];
}
