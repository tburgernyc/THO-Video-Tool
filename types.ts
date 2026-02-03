export interface SystemStatus {
  gpu: boolean;
  generatorOnline: boolean;
  dbConnected: boolean;
  diskSpace?: string;
}

export interface Episode {
  id: number;
  title: string;
  script: string;
  runtime: number;
}

export interface Character {
  id?: number;
  name: string;
  description: string;
}

export interface Scene {
  id: number; // This is the scene_index
  description: string;
  characters: string[]; // Names
  prompt?: string;
  negative_prompt?: string;
  latest_version?: number;
}

export interface Job {
  id: string;
  sceneId: number;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  output_path?: string;
  error?: string;
}