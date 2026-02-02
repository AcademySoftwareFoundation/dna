/**
 * DNA Core Package
 *
 * A TypeScript package without React dependencies.
 * Contains shared utilities, types, and business logic.
 */

// export * from './types'; // Conflict with interfaces
export * from './interfaces';
export * from './utils';
export {
    createApiHandler,
    ApiHandler,
    type ApiHandlerConfig,
    type User as ApiUser,
} from './apiHandler';
export * from './eventClient';
export * from './aiSuggestionManager';