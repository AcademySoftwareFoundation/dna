import { useMemo, useState, useEffect } from "react";
import { DNAFrontendFramework, ConnectionStatus } from "../../../dna-frontend-framework";
import type { State } from "../../../dna-frontend-framework";

export const useDNAFramework = () => {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(ConnectionStatus.UNKNOWN);
  const [state, setState] = useState<State>({ activeVersion: 0, versions: [] });

  // Memoize the framework instance so it's not recreated on every render
  const framework = useMemo(() => new DNAFrontendFramework(
    {
        vexaApiKey: import.meta.env.VITE_VEXA_API_KEY,
        vexaUrl: import.meta.env.VITE_VEXA_URL,
        platform: import.meta.env.VITE_PLATFORM,
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

  return { 
    framework, 
    connectionStatus, 
    setVersion, 
    state, 
    getTranscriptText, 
    getVersionsWithTranscripts 
  };
};
