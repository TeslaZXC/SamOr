// Dynamically determine the API URL
// If VITE_API_URL is set in .env, use it.
// Otherwise, assume the API is served from the same host at /api
export const API_URL = import.meta.env.VITE_API_URL || '/api';

// Dynamically determine the WebSocket URL
// If VITE_WS_URL is set in .env, use it.
// Otherwise, construct it from the current location
export const WS_URL = import.meta.env.VITE_WS_URL || (() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}/api/ws/connect`;
})();
