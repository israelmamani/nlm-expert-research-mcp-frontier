# Installation

## Requirements

- Windows 10 or 11
- Node.js 20 or 22 LTS
- Google Chrome
- A Google account with access to NotebookLM
- Claude Desktop for MCPB use

## Source installation

```powershell
git clone https://github.com/israelmamani/nlm-expert-research-mcp-frontier.git
cd nlm-expert-research-mcp-frontier
npm ci
npm test
npm run setup-auth -- --force
```

Complete Google login and 2FA in the visible window and wait for the command to exit normally. Then run `npm run doctor` and `npm run certify:live`.

## MCPB installation

Build with `npm run package:mcpb`. Install the resulting `.mcpb` through Claude Desktop's Extensions interface; do not configure the internal upstream package separately. See [CLAUDE_DESKTOP.md](CLAUDE_DESKTOP.md).
