import { createWebSocketBridge } from '../../../gateway/websocket-bridge.mjs';

// Server-only native Function. Next's browser app remains a static export.
export default createWebSocketBridge();
