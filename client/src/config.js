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

export const getImageUrl = (url) => {
    if (!url) return null;
    if (url.startsWith('http') || url.startsWith('blob:')) return url;

    if (API_URL.startsWith('http')) {
        try {
            const origin = new URL(API_URL).origin;
            return `${origin}${url.startsWith('/') ? '' : '/'}${url}`;
        } catch (e) {
            console.error("Invalid API_URL", e);
            return url;
        }
    }

    return url;
};
