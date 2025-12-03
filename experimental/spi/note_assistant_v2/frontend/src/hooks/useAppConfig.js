import { useState, useEffect } from 'react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

export function useAppConfig() {
  const [config, setConfig] = useState({ shotgrid_enabled: false });
  const [configLoaded, setConfigLoaded] = useState(false);
  const [enabledLLMs, setEnabledLLMs] = useState([]);
  const [availablePromptTypes, setAvailablePromptTypes] = useState([]);

  useEffect(() => {
    // Fetch both config and available models
    Promise.all([
      fetch(`${BACKEND_URL}/config`).then(res => res.json()),
      fetch(`${BACKEND_URL}/available-models`).then(res => res.json())
    ])
      .then(([configData, modelsData]) => {
        setConfig(configData);
        setConfigLoaded(true);
        
        // Use the actual available models from the backend
        if (modelsData.available_models) {
          const llms = modelsData.available_models.map(model => ({
            key: model.model_name, // Use model name as unique key
            name: model.display_name,
            model_name: model.model_name,
            provider: model.provider
          }));
          setEnabledLLMs(llms);
        } else {
          setEnabledLLMs([]);
        }
        
        // Set available prompt types
        if (modelsData.available_prompt_types) {
          setAvailablePromptTypes(modelsData.available_prompt_types);
        } else {
          setAvailablePromptTypes([]); // No assumptions about available prompt types
        }
      })
      .catch(() => {
        console.error("Failed to fetch app config and models");
        setConfig({ shotgrid_enabled: false });
        setConfigLoaded(true);
        setEnabledLLMs([]);
      });
  }, []);

  return {
    config,
    configLoaded,
    enabledLLMs,
    availablePromptTypes
  };
}