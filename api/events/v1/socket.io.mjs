import { createWebSocketBridge } from '../../../gateway/websocket-bridge.mjs';

// Explicit ESM prevents a CommonJS require of the ESM-only bridge.
// Next's browser app remains a static export.
export default createWebSocketBridge();
