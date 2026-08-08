# Instalación Windows + Claude Desktop

Requisitos: Node.js 20+, Google Chrome si se habilita el adaptador real y Claude Desktop con extensiones locales permitidas.

```powershell
npm install
npm run build
npm run package:mcpb
```

Instale `release\NLM-Expert-Research-MCP-Frontier-0.1.0.mcpb` desde Claude Desktop. Para configuración manual, use comando `node` y argumento absoluto `dist/index.js`. El modo local funciona sin login y sirve para validar el protocolo.
