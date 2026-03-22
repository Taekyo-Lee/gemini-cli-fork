# Merge History

Log of each upstream sync. Newest entries first.

| Date       | Upstream Version    | Backup Tag                | Merge Commit | Conflicts | Notes                                                                                                                      |
| ---------- | ------------------- | ------------------------- | ------------ | --------- | -------------------------------------------------------------------------------------------------------------------------- |
| 2026-03-21 | v0.34.0 (fc03891a1) | pre-merge-backup-20260321 | 6f5fdeb07    | 11        | First tracked merge. Merged from upstream/main HEAD (nightly), not stable tag. Going forward, only merge from stable tags. |

## How to add an entry

After each successful merge, add a row at the top of the table:

- **Date**: YYYY-MM-DD
- **Upstream Version**: The stable tag merged (e.g., v0.35.0)
- **Backup Tag**: The `pre-merge-backup-YYYYMMDD` tag created by the sync script
- **Merge Commit**: Short hash of the merge commit
  (`git rev-parse --short HEAD`)
- **Conflicts**: Number of files with conflicts
- **Notes**: Anything notable (new fork-modified files, tricky conflicts, etc.)
