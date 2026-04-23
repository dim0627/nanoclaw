# NanoClaw Migration Guide

Generated: 2026-04-24 06:09 JST
Applied: 2026-04-24 06:24 JST (v2.0.10 swap completed)
Base: a81e1651b5e48c9194162ffa2c50a22283d5ecd3
HEAD at generation: aacdbee
HEAD after upgrade: 36752dc
Upstream: 9e480a0 (upstream/main at generation)

This guide captures the customizations applied to this fork (`dim0627/nanoclaw`) on top of upstream `qwibitai/nanoclaw` v1. The upgrade target is upstream v2 (`9e480a0` or later), which includes a fundamental v1→v2 refactor of the channel/container architecture.

## Upgrade Context

Upstream has rewritten ~386 files across 394 commits, including:

- Channel system migration to Chat SDK / channel-registration model (skills self-register)
- Container runtime moved to Bun, agent-runner with MCP tools
- DB split into inbound/outbound session DBs
- CLAUDE.md composition switched to shared base + module fragments
- Version jump 1.2.x → 2.0.x

Because the architecture is different, v1-based code customizations (like a hand-written `src/channels/slack.ts`) are not portable. This guide reapplies the fork's *intent* on a clean v2 checkout, using v2-native mechanisms.

## Applied Skills

On v2, the canonical way to add Slack is the `/add-slack` skill (Socket Mode, no public URL needed). This replaces the v1-era `slack/main` remote merge.

- `add-slack` — apply via `/add-slack` skill during the upgrade phase. Uses `SLACK_BOT_TOKEN` and `SLACK_APP_TOKEN` (already present in `.env` / `data/env/env`, so tokens carry over).

No custom (user-created) skills to copy.

## Skill Interactions

None — only one skill (`add-slack`) is applied.

## Modifications to Applied Skills

None — the v1 `slack/main` branch applied prettier formatting to its own files only. Those adjustments are not meaningful on v2's entirely different Slack adapter.

## Customizations

### 1. Assistant persona: Koko

**Intent:** The assistant is named "Koko", not the upstream default "Andy". This appears in the agent's personality prompt (how it introduces itself to users).

**Files (v1):** `groups/global/CLAUDE.md`, `groups/main/CLAUDE.md`

**Note on v2:** The per-group CLAUDE.md is now composed at runtime from a shared base + module fragments, with the agent name injected dynamically (see upstream commit `e64bdb3 refactor(claude-md): split shared base into module fragments, inject name at runtime`). The name may now be a config value / env var / setup prompt rather than a literal string in CLAUDE.md. Check these in order when applying:

1. Setup flow (`npm run setup:auto` or `bash nanoclaw.sh`) — look for an "assistant name" / "display name" prompt and answer "Koko".
2. Environment variable — search for `ASSISTANT_NAME`, `AGENT_NAME`, `AGENT_DISPLAY_NAME`, or similar in `src/config.ts` / `.env.example` on v2. Set it to `Koko` if present.
3. Composed CLAUDE.md — if v2 still has `groups/global/CLAUDE.md` or `groups/main/CLAUDE.md` with a literal `# Andy` / `You are Andy` header, edit to `# Koko` / `You are Koko`.

**How to apply:**

The first-line change on v1 was:

```diff
-# Andy
+# Koko

-You are Andy, a personal assistant. You help with tasks, answer questions, and can schedule reminders.
+You are Koko, a personal assistant. You help with tasks, answer questions, and can schedule reminders.
```

Apply the equivalent on v2 via whichever of the three mechanisms above exists. No other content was added to these files beyond the Andy→Koko substitution.

### 2. Removed GitHub Actions workflows

**Intent:** The fork-maintenance strategy does not use upstream's automated version-bump and token-count-update workflows. These were removed because they create churn on the fork and because the user prefers to manage versions/tokens manually (or via other workflows like `fork-sync-skills.yml` which was also removed later).

**Files:** `.github/workflows/bump-version.yml`, `.github/workflows/update-tokens.yml`

**How to apply:** After upgrading to v2, check `.github/workflows/`. If these two files (or their v2 equivalents) are present on upstream, delete them:

```bash
rm -f .github/workflows/bump-version.yml .github/workflows/update-tokens.yml
```

Note: On v2, upstream may have renamed or restructured these workflows. If so, the intent is the same — remove any workflow that auto-commits version bumps or token counts on this fork. Verify with `ls .github/workflows/` after upgrade.

### 3. Slack channel — migrate from custom fork to /add-slack skill

**Intent:** Slack is the only channel needed (memory confirms: "Slack-only, #nano channel"). On v1, this was achieved by merging the `slack` remote (`https://github.com/qwibitai/nanoclaw-slack.git`) which provided a hand-written `src/channels/slack.ts` using `@slack/bolt`. On v2, Slack has a canonical skill — use it.

**Files on v1 (all come from the `slack/main` remote merge, not independent work):**

- `src/channels/slack.ts` (added, ~851 lines)
- `src/channels/slack.test.ts` (added)
- `src/channels/index.ts` (added `import './slack.js'` registration)
- `package.json` (added `@slack/bolt` ^4.3.0, `@slack/types` ^2.15.0)
- `package-lock.json` (updated)
- `.env.example` (added `SLACK_BOT_TOKEN=` and `SLACK_APP_TOKEN=`)

**How to apply on v2:**

1. After the clean upstream checkout is validated, run the `/add-slack` skill inside Claude Code.
2. When prompted, reuse the existing Slack app (tokens `SLACK_BOT_TOKEN` / `SLACK_APP_TOKEN` are already provisioned on the fork's `.env` / OneCLI vault).
3. The skill handles: channel adapter registration, dependencies, env var wiring, and the chat SDK / channel-registration integration — all in the v2 way.
4. Do NOT merge the `slack` remote. Do NOT hand-port `src/channels/slack.ts`. The v2 adapter lives on `upstream/channels` and is reapplied via the skill.

**Verification after applying `/add-slack`:**

- Install runs and connects to Slack.
- A test message in the `#nano` channel routes to the agent container and gets a reply.
- `SLACK_BOT_TOKEN` and `SLACK_APP_TOKEN` are still respected (check `.env` or `onecli secret list`).

## Migration Plan

Order of operations during upgrade (Phase 2):

1. Clean upstream checkout in a worktree (handled by `/migrate-nanoclaw`).
2. Apply persona customization (Customization 1) — identify where the name is injected on v2, set to Koko.
3. Run `/add-slack` skill to install Slack (Customization 3).
4. Delete the two workflow files if they exist (Customization 2).
5. Validate with `pnpm install && pnpm build` (v2 uses pnpm, not npm — see upstream commits `3e1f226` `113caa9`).
6. Optional: live test against Slack before swapping into main tree.
7. Swap worktree into main tree, restart service.

Risks / manual review areas:

- **Persona location uncertainty:** The name mechanism on v2 may differ. If neither a setup prompt nor an env var nor a literal CLAUDE.md header surfaces, search `src/` and `groups/` for `Andy` and `Koko` and adapt.
- **Token/vault compatibility:** v2 uses OneCLI Agent Vault. Confirm existing `SLACK_BOT_TOKEN` / `SLACK_APP_TOKEN` transfer correctly — `/init-onecli` may be needed before `/add-slack`.
- **Timezone + owner identity:** Memory notes `TZ Asia/Tokyo`. v2's setup flow auto-detects timezone (upstream commit `202ee71`). Confirm it detects Asia/Tokyo; if not, set `TZ=Asia/Tokyo` in env.
- **Data compatibility:** v2 split session DB into inbound/outbound (`82cb363`) and introduced new migrations. Data directories (`groups/`, `store/`, `data/`, `.env`) are carried over untouched — v2 migrations will run on first start. Back up `store/` before the swap just in case.
