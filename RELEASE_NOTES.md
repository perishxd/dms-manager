# DMs Manager 1.0.0

The first public release of DMs Manager.

- Preview and delete your own messages in selected DMs or group DMs.
- Export themed HTML with local avatars, attachments, emoji, stickers, and guild tags, or save message data as JSON.
- Minimize a running job and reopen its progress. Get a notification when it finishes.
- Open the manager from Discord's top bar, with the current DM selected.
- Download reports show which files couldn't be saved and why.

Extract the download, run `Install-DMsManager.cmd` on Windows, and fully restart Discord. For manual installation, copy `DMsManager` to your Vencord checkout's `src/userplugins`, then run `pnpm build`.

For exported archives, use **Extract All** before opening `index.html`. Media downloads are limited to 25 MB per file and 100 MB per export; unsaved files retain their original links. Fonts aren't bundled.

Deletion is permanent and applies only to messages from the account currently signed in. Review the preview before confirming.
