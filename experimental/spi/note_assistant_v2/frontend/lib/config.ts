// Enable mock mode to bypass authentication and use mock data
// Vite provides import.meta.env with the correct type in Vite projects
// Add a reference for TypeScript to recognize import.meta.env
/// <reference types="vite/client" />

export const MOCK_MODE = typeof import.meta !== 'undefined' && (import.meta as any).env && typeof (import.meta as any).env.VITE_MOCK_MODE !== 'undefined'
  ? (import.meta as any).env.VITE_MOCK_MODE === 'true' || (import.meta as any).env.VITE_MOCK_MODE === '1'
  : false;

// Mock user data for when mock mode is enabled
export const MOCK_USER = {
  id: "mock-user-id",
  email: "demo@example.com",
  user_metadata: {
    name: "Demo User",
  },
}
