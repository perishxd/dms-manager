# DMsManager

A custom Vencord plugin for cleaning up your own messages and saving DM conversations.

Version **1.0.0**.

## What it does

- Select individual DMs or group DMs, with an optional date range.
- Scan for messages sent by the account you're currently using. Review the count and sample messages before deleting anything.
- Export conversations as themed HTML or JSON, including available guild tags and their badge images.
- Pause or cancel a running job. Switching accounts stops further requests.

Open **Settings → Vencord → Plugins → DMsManager → settings**, then choose **Open DMsManager**. You can also use the Vencord toolbox or right-click an existing DM.

## Delete your messages

1. Select the conversations and date range.
2. Choose **Scan and preview**. Scanning does not delete anything.
3. Check the results and type the exact `DELETE N` confirmation.
4. Choose **Delete N of my messages**.

Deletion is permanent. Only your ordinary messages and replies are eligible; other participants' messages and system events are excluded. The plugin checks ownership again immediately before each delete. A request already in flight may finish after you pause, cancel, close the manager, or switch accounts.

Requests run sequentially. The default delay between deletes is 1.5 seconds, and rate-limit responses are respected. Each scan is limited to 50,000 messages across the selected conversations. For larger histories, use smaller date ranges. Dates use UTC and include the entire selected end date.

## Exports

HTML exports capture theme colors, the active font, message spacing, and avatar rounding. They include basic message formatting, reply excerpts, attachment links, image/video previews, and available guild tags. JSON keeps the normalized message data and captured theme values.

These are static exports, so custom CSS effects and animations aren't reproduced. Fonts must be installed on the computer viewing the file. Media stays linked to Discord and may require an internet connection; attachment URLs can expire. This version does not download an offline media archive.

Guild tags reflect information available when exporting, not necessarily the tag someone had when they sent a message. Hidden or cleared tags aren't filled back in from cached data when the message explicitly reports that state.

Only conversations currently available in your DM list are listed. Closed DMs aren't recovered automatically. Export includes messages from everyone in each selected conversation; deletion includes only your own eligible messages.

No backend, token entry, or upload service is used. Exported files contain private conversation content and should be shared deliberately.

## Install

Requires a source installation of Vencord.

On Windows, extract the entire download first, then run `Install-DMsManager.cmd`. It checks both `Documents\Vencord` under your user folder and the Windows Documents location (including OneDrive), backs up an existing DMsManager folder, and builds Vencord. Other custom plugins are left in place.

To install manually on Windows or Mac:

1. Copy this `DMsManager` folder into your Vencord checkout's `src/userplugins` directory.
2. Open a terminal in the Vencord checkout and run `pnpm build`.
3. Fully quit Discord, including its tray/menu-bar process, then reopen it.
4. Enable **DMsManager** in Vencord's plugin settings.

The final source path must be `src/userplugins/DMsManager/index.tsx`, with no extra nested DMsManager folder. For a checkout that hasn't been injected yet, run `pnpm inject` after a successful build and select the Discord installation you use.

## Development

The first build passed TypeScript checking and a production Vencord build. Automated checks cover ownership verification, account changes, preview confirmation, pagination, cancellation, rate limits, and escaped HTML output. Requests in these tests are mocked; they don't verify behavior against a live Discord account.

From the Vencord checkout, run the core tests with:

```sh
node --test src/userplugins/DMsManager/tests/*.test.mjs
```

Licensed under GPL-3.0-or-later.
