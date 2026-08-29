# Agent Looper developer resources

Agent Looper is the npm package `@dancingteeth/agent-looper` and the CLI `agent-loop`. Use these URLs when an agent or a human needs API-level, runtime, or architecture detail — not the slogan on the homepage.

- Agent Looper README (install, flags, verify, reviewGate): https://github.com/dancingteeth/agent-looper/blob/main/README.md
- Agent Looper ARCHITECTURE (control-flow graph): https://github.com/dancingteeth/agent-looper/blob/main/ARCHITECTURE.md
- Agent Looper npm: https://www.npmjs.com/package/@dancingteeth/agent-looper
- Agent Looper GitHub: https://github.com/dancingteeth/agent-looper
- Harnesses (worker runtimes, Grok Bot operator, published models): https://looper.dancingteeth.net/harnesses/index.md
- OpenCode providers (OpenRouter, Vercel, Ollama): https://github.com/dancingteeth/agent-looper/blob/main/docs/opencode-providers.md
- Pi runtime: https://github.com/dancingteeth/agent-looper/blob/main/docs/pi-runtime.md
- DSH plugin (DeepSeek Harness): https://github.com/dancingteeth/agent-looper/blob/main/docs/dsh-plugin.md
- Agent Looper llms.txt: https://looper.dancingteeth.net/llms.txt
- Agent Looper homepage (markdown): https://looper.dancingteeth.net/index.md

There is no separate hosted OpenAPI, OAuth, webhook, or MCP server for Agent Looper. The product is a local CLI harness. Worker and judge talk to the agent SDKs you install. Auth is whatever those harnesses already use (`CURSOR_API_KEY`, OpenCode Go, Doppler, and similar).
