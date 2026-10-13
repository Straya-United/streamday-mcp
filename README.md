# Streamday MCP

**Ask Alexa+ what's new to stream tonight, in Australia.** Streamday MCP is a remote [Model Context Protocol](https://modelcontextprotocol.io) server that knows what is releasing on 17 Australian streaming services, day by day, and remembers each viewer's services and shows between sessions. Its answers are written to be spoken, and its results come with show cards as an [MCP App](https://github.com/modelcontextprotocol/ext-apps).

- **MCP endpoint:** `https://streamday-mcp.netlify.app/mcp` (Streamable HTTP, MCP spec **2025-11-25**, stateless JSON responses)
- **Alexa+ simulator:** <https://streamday-mcp.netlify.app> — talk to it in Chrome or Edge
- Built for the Amazon Developer Hackathon 2026, **Alexa+ track**, by [AppForge Digital](https://appforgedigital.com.au)

## What you can ask

| You say | Tool | What happens |
|---|---|---|
| "What's new tonight?" | `whats_on` | Today's releases on *your* services: new series, new seasons, finales, episodes, movies |
| "I've got Netflix, Stan and ABC iview" | `set_my_services` | Saved for next time; understands "Disney plus", "Max", "7plus", "10" and so on |
| "Pick something light, I've got an hour" | `tonight_pick` | Ranks what's fresh on your services by follows, premiere size, mood, time and popularity; explains each pick; won't repeat what it suggested in the last few days |
| "When's the next Slow Horses?" | `next_episode` | Next Australian release date, which services carry it, and whether you have one of them |
| "Follow it" | `follow_show` | Tracks the series for you across sessions |
| "Plan my week, I'm busy Thursday" | `plan_my_week` | Followed shows on their release night, then the biggest premieres on your services on free nights |
| "What do I have?" | `my_streamday` | Your services, followed shows and when each one's next episode lands |
| — | `list_services` | The 17 services covered |

Five tools (`my_streamday`, `whats_on`, `tonight_pick`, `plan_my_week`, `next_episode`) declare the MCP App view `ui://streamday/cards.html` (`text/html;profile=mcp-app`). Hosts that support MCP Apps (Claude, ChatGPT, VS Code, Goose and others) render the results as cards, and the cards' **Follow** buttons call `follow_show` back through the host.

## How it fits together

```
  Viewer ──voice──▶ Alexa+ simulator (web/)          Any MCP host (Claude, ChatGPT, Alexa+ …)
                     │ speech in/out in the browser          │
                     ▼                                       │
               /api/agent  (MCP host)                        │
                 OpenAI model chooses tools                  │
                 MCP client ──Streamable HTTP──▶  /mcp  ◀────┘
                                                   │  Streamday MCP server (src/server.mjs)
                                                   │   • tools + MCP App view
                                                   │   • viewer memory → Netlify Blobs
                                                   ▼
                                     Streamday release calendar API (TMDB + JustWatch data)
```

- `src/server.mjs` — the MCP server (`@modelcontextprotocol/sdk` 1.32, protocol 2025-11-25) and its tools.
- `src/logic.mjs` — the agentic part: ranking tonight's picks, planning the week, wording answers for speech. Pure functions, unit tested.
- `src/memory.mjs` — per-viewer memory (services, follows, recent picks) in Netlify Blobs. A viewer is identified by the `x-streamday-viewer` header or `?viewer=` on the server URL.
- `src/http.mjs` + `netlify/functions/mcp.mjs` — stateless Streamable HTTP endpoint on Web-standard `Request`/`Response`.
- `src/view/` — the MCP App view; `npm run build` bundles it into one self-contained HTML resource.
- `netlify/functions/agent.mjs` + `web/` — the simulated Alexa+ experience: an MCP host that connects to `/mcp` as a real MCP client, gives the server's tools to an OpenAI model, runs the calls over MCP and returns a spoken reply plus cards. The **Under the hood** panel shows every MCP call live.

## Connect it to your own assistant

Add the server URL as a remote MCP server / custom connector in your host:

```
https://streamday-mcp.netlify.app/mcp?viewer=pick-any-name
```

The `viewer` value keeps your services and follows separate from everyone else's. Or inspect it with the MCP Inspector: `npx @modelcontextprotocol/inspector` → Streamable HTTP → the URL above.

## Run it locally

```bash
npm install
npm run dev            # builds the view, serves /mcp, /api/agent and the simulator on http://localhost:8787
npm run smoke          # official MCP client: lists tools/resources and calls every tool
npm test               # unit tests for dates, ranking and planning
```

The simulator needs `OPENAI_API_KEY` in the environment (optionally `OPENAI_MODEL`). The MCP server itself needs no keys: it reads Streamday's public, CDN-cached release calendar.

## Data and credits

Show details and images from [TMDB](https://www.themoviedb.org/). This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming availability data by [JustWatch](https://www.justwatch.com/au). Alexa is a trademark of Amazon.com, Inc.; the simulator is an independent demo built for the Amazon Developer Hackathon.

## License

[MIT](LICENSE) © 2026 AppForge Digital
