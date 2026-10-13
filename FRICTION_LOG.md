# Friction log

Kept while building Streamday for Alexa+ for the Amazon Developer Hackathon 2026 (Alexa+ track). Newest first. Times are AEST (UTC+10).

Severity scale: **High** = blocked or forced a change of plan · **Medium** = cost an hour or more, or a bug reached production · **Low** = slowed us down.

---

## 1. Netlify Blobs memory failed in production with "Token expired"
- **When:** 14 Oct 2026, 5:20am
- **Tool:** Netlify Blobs (`@netlify/blobs`) inside Netlify Functions, used for per-viewer MCP memory
- **Task attempted:** keep each viewer's services and followed shows between sessions.
- **Steps taken:** created the store once at module level with `getStore({ name, consistency: 'strong' })` and reused it across invocations; deployed; recorded the demo video against production.
- **Expected:** reads and writes keep working for as long as the function stays warm.
- **Actual:** after a warm instance had been running a while, every `get` failed with "Token expired". The cached store's request-scoped credentials had expired. Local dev never showed it.
- **Severity:** Medium (production bug, caught only while recording the demo)
- **Workaround:** open the store per request: call `getStore()` inside each handler instead of caching it ([fix in `src/memory.mjs`](src/memory.mjs)).
- **Suggestion:** state in the Functions + Blobs docs that `getStore()` must be called per request, and make the error say so ("store credentials are request-scoped; call getStore() inside the handler").

## 2. Unclear whether MCP Apps 2.x works with the 1.x MCP server SDK
- **When:** 13 Oct 2026, 9:00pm
- **Tool:** `@modelcontextprotocol/ext-apps` 2.0.3 with `@modelcontextprotocol/sdk` 1.32.1
- **Task attempted:** register the show-card view as an MCP App on our existing server.
- **Steps taken:** installed ext-apps 2.x; npm listed the v2 MCP SDK packages as peers; checked the README and source; tried `registerAppTool` / `registerAppResource` against the 1.x `McpServer`.
- **Expected:** a clear statement of which server SDK versions are supported.
- **Actual:** the peer warning suggested 1.x wasn't supported. It works fine, but we only found that out by trying.
- **Severity:** Low
- **Workaround:** none needed once tested.
- **Suggestion:** one line in the README: "The `/server` helpers work with `@modelcontextprotocol/sdk` 1.x and 2.x."

## 3. No way to connect a custom MCP server to Alexa+ for testing
- **When:** 13 Oct 2026, 8:45pm
- **Tool:** Alexa+ track
- **Task attempted:** test our MCP server in a real Alexa+ conversation.
- **Steps taken:** read the track rules and resources; searched the Alexa developer docs for an MCP or test-device option.
- **Expected:** a developer console, test profile or device setting that accepts an MCP server URL.
- **Actual:** nothing available, so the only option is a simulated Alexa+ experience.
- **Severity:** High (the core experience can't be tested on the target platform)
- **Workaround:** built a simulated Alexa+ smart display that is a real MCP host: an MCP client plus an LLM choosing tools, with voice in and out (`web/`, `netlify/functions/agent.mjs`).
- **Suggestion:** an Alexa+ developer console or test device profile that accepts an MCP URL, even rate-limited or text-only.

## 4. Alexa+ track has almost no starter resources
- **When:** 13 Oct 2026, 8:40pm
- **Tool:** Hackathon resources page, Alexa+ track
- **Task attempted:** find a sample MCP server and testing guidance for Alexa+.
- **Steps taken:** went through the resources page and the linked Alexa+ pages.
- **Expected:** a sample repo and testing guide like the Fire TV and Vega tracks have.
- **Actual:** two Alexa+ links, with no sample repo, example MCP server or testing guide.
- **Severity:** Medium
- **Workaround:** built from the MCP spec and the official SDK docs instead.
- **Suggestion:** a minimal "hello Alexa+" MCP server sample plus a guide to building the simulated web experience the rules ask for.

## 5. Vega Virtual Device doesn't run on Windows
- **When:** 13 Oct 2026, 8:30pm
- **Tool:** Vega Virtual Device (Fire TV track)
- **Task attempted:** build and demo a Fire TV app.
- **Steps taken:** checked the Vega SDK requirements; checked whether WSL is supported; checked whether we could buy a device instead.
- **Expected:** a simulator that runs on Windows, the most common developer OS.
- **Actual:** the simulator is macOS and Linux only (not Windows or WSL), and the demo must run on a device or that simulator.
- **Severity:** High (forced a switch of track)
- **Workaround:** moved to the Alexa+ track.
- **Suggestion:** Windows support for the Vega Virtual Device, or a cloud-hosted simulator.

## 6. Hard to tell which Fire TV Sticks run Vega OS
- **When:** 13 Oct 2026, 8:30pm
- **Tool:** Fire TV hardware, Amazon store pages
- **Task attempted:** buy the right device for the Fire TV track.
- **Steps taken:** compared current Fire TV Stick product pages and developer docs.
- **Expected:** the OS listed on each product page.
- **Actual:** product pages don't say whether a stick runs Fire OS (Android apps) or Vega OS.
- **Severity:** Low
- **Workaround:** none; we changed track.
- **Suggestion:** list the OS on each device's product page, plus a developer note on which device to buy for each track.

## 7. Eligible countries not listed
- **When:** 13 Oct 2026, 8:20pm
- **Tool:** Hackathon official rules
- **Task attempted:** confirm an Australian resident can enter and be paid.
- **Steps taken:** read the rules' eligibility and excluded-country sections, then the tax-form requirements.
- **Expected:** an explicit "open to" list.
- **Actual:** the rules list only exclusions, so we had to read them closely to be sure.
- **Severity:** Low
- **Workaround:** careful reading of the rules.
- **Suggestion:** an explicit list of eligible countries, or an eligibility checker.
