// Netlify Function: the public MCP endpoint, https://<site>/mcp
import { handleMcp } from '../../src/http.mjs';

export default (req) => handleMcp(req);
export const config = { path: '/mcp' };
