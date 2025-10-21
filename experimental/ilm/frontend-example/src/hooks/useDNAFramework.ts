import { useMemo, useState, useEffect, useCallback } from "react";
import { DNAFrontendFramework, ConnectionStatus } from "../../../dna-frontend-framework";
import type { State } from "../../../dna-frontend-framework";

export const useDNAFramework = () => {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(ConnectionStatus.UNKNOWN);
  const [state, setState] = useState<State>({ activeVersion: 0, versions: [] });
  console.log(state);
  // Memoize the framework instance so it's not recreated on every render
  const framework = useMemo(() => new DNAFrontendFramework(
    {
        vexaApiKey: import.meta.env.VITE_VEXA_API_KEY,
        vexaUrl: import.meta.env.VITE_VEXA_URL,
        platform: import.meta.env.VITE_PLATFORM,
        llmInterface: import.meta.env.VITE_LLM_INTERFACE,
        llmModel: import.meta.env.VITE_LLM_MODEL || "gpt-3.5-turbo",
        llmApiKey: import.meta.env.VITE_LLM_API_KEY || "",
        llmBaseURL: import.meta.env.VITE_LLM_BASEURL || "",
    }
  ), []);

  // Monitor connection status changes
  useEffect(() => {
    const checkConnectionStatus = async () => {
      try {
        const status = await framework.getConnectionStatus();
        setConnectionStatus(status);
      } catch (error) {
        console.error('Error getting connection status:', error);
        setConnectionStatus(ConnectionStatus.ERROR);
      }
    };

    // Check status immediately
    checkConnectionStatus();

    // Set up interval to check status periodically
    const interval = setInterval(checkConnectionStatus, 1000);

    return () => clearInterval(interval);
  }, [framework]);

  // Subscribe to state changes
  useEffect(() => {
    const unsubscribe = framework.subscribeToStateChanges((newState: State) => {
      setState(newState);
    });

    return unsubscribe;
  }, [framework]);

  const setVersion = (version: number, context: Record<string, any>) => {
    framework.setVersion(version, context);
  };

  // Helper function to get transcript text for a specific version
  const getTranscriptText = (versionId: string): string => {
    const version = state.versions.find(v => v.id === versionId);
    if (!version) return '';
    
    // Sort transcriptions by timestamp and concatenate text
    const transcriptions = Object.values(version.transcriptions);
    return transcriptions
      .sort((a, b) => new Date(a.timestampStart).getTime() - new Date(b.timestampStart).getTime())
      .map(t => `${t.speaker}: ${t.text}`)
      .join('\n');
  };

  // Helper function to get all versions with their transcript data
  const getVersionsWithTranscripts = () => {
    return state.versions.map(version => ({
      ...version,
      transcriptText: getTranscriptText(version.id)
    }));
  };

  const generateNotes = async (versionId: number) => {
    return await framework.generateNotes(versionId);
  };

  const setUserNotes = (versionId: number, notes: string) => {
    framework.getStateManager().setUserNotes(versionId, notes);
  };

  const setAiNotes = (versionId: number, notes: string) => {
    framework.getStateManager().setAiNotes(versionId, notes);
  };

  const addVersions = useCallback((versions: Array<{ id: number; context?: Record<string, any> }>) => {
    framework.addVersions(versions);
  }, [framework]);

  return { 
    framework, 
    connectionStatus, 
    setVersion,
    setUserNotes,
    setAiNotes,
    addVersions,
    state, 
    getTranscriptText, 
    getVersionsWithTranscripts,
    generateNotes
  };
};
