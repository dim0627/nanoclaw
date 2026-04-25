# Verify Slack

Add the bot to a Slack channel, then send a message or @mention the bot. The bot should respond within a few seconds.

## If the bot doesn't respond

### Check the host logs first

```bash
tail -50 logs/nanoclaw.error.log
```

Common errors and what they mean:

#### `An API error occurred: missing_scope`

The bot token lacks an OAuth scope that the adapter needs (most often `reactions:write`, used to acknowledge messages with a working-on-it emoji). Slack does **not** apply scope changes until the app is reinstalled.

Fix:

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → your NanoClaw app
2. **OAuth & Permissions** → confirm every scope from the SKILL.md install list is present:
   - `chat:write`, `channels:history`, `groups:history`, `im:history`, `channels:read`, `groups:read`, `users:read`, `reactions:write`
3. Add any missing scope, then click **Reinstall to Workspace** at the top of the page
4. Copy the new **Bot User OAuth Token** (it changes on reinstall)
5. Update `.env`:

   ```bash
   sed -i.bak 's|^SLACK_BOT_TOKEN=.*|SLACK_BOT_TOKEN=xoxb-NEW-TOKEN|' .env && rm -f .env.bak
   ```

6. Restart NanoClaw so the new token loads:
   - macOS: `launchctl kickstart -k gui/$(id -u)/com.nanoclaw`
   - Linux: `systemctl --user restart nanoclaw`

#### `invalid_auth` or `not_authed`

The bot token is wrong or revoked. Re-copy from **OAuth & Permissions** and update `.env` as above.

#### No errors logged but no response

Check that the message reaches the host:

```bash
tail -f logs/nanoclaw.log
```

Send a message to the bot. You should see a `Message routed` entry within a second. If nothing appears, the webhook isn't reaching the host — verify the **Request URL** in **Event Subscriptions** points at your public webhook endpoint and shows green.
