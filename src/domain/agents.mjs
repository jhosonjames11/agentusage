// Metadata affects presentation only. Supported namespaces come from ccusage --help.
const metadata = {
  claude: ['Claude Code', '#22755c'], codex: ['Codex', '#8b79bc'],
  opencode: ['OpenCode', '#668eaa'], amp: ['Amp', '#ad6990'],
  droid: ['Droid', '#799948'], codebuff: ['Codebuff', '#a67856'],
  hermes: ['Hermes', '#c88b43'], pi: ['pi-agent', '#539d99'],
  goose: ['Goose', '#7c9f62'], kilo: ['Kilo', '#9d73a2'],
  copilot: ['GitHub Copilot CLI', '#597caa'], gemini: ['Gemini CLI', '#7983cf'],
  antigravity: ['Antigravity', '#b17170'], kimi: ['Kimi', '#5ca080'],
  qwen: ['Qwen', '#a1934d'], openclaw: ['OpenClaw', '#b46f54'],
  grok: ['Grok Build CLI', '#70828c'], zcode: ['ZCode', '#958671'],
  cline: ['Cline', '#76966e'],
};
export const AGENTS = Object.keys(metadata).filter(id => id !== 'cline');
export const AGENT_NAMES = Object.fromEntries(Object.entries(metadata).map(([id, value]) => [id, value[0]]));
export const validAgent = id => typeof id === 'string' && /^[a-z][a-z0-9-]*$/.test(id) && id !== 'all' && !['__proto__', 'constructor', 'prototype'].includes(id);
export const agentName = id => metadata[id]?.[0] ?? id;
export function agentColor(id) {
  if (metadata[id]) return metadata[id][1];
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 30% 53%)`;
}
export function agentCatalog(ids) {
  return [...new Set(ids)].filter(validAgent).map(id => ({ id, name: agentName(id), color: agentColor(id) }));
}
export function parseSupportedAgents(help) {
  const commands = help.split('COMMANDS:')[1]?.split(/\n(?:For more|OPTIONS:)/)[0];
  const reports = new Set(['daily', 'weekly', 'monthly', 'session', 'blocks', 'statusline']);
  const ids = [...(commands ?? '').matchAll(/^\s{2}([a-z][a-z0-9-]*)\s{2,}[^\n]+$/gm)].map(match => match[1]).filter(id => !reports.has(id) && validAgent(id));
  if (!ids.length) throw new Error('Cannot discover ccusage agent/source commands.');
  return [...new Set(ids)];
}
