# Release Notes Files

Before creating a release tag, add and commit one markdown file for that tag:

- Path: `.github/release-notes/vX.Y.Z.md`
- Example: `.github/release-notes/v0.7.68.md`

`release.yml` will fail if this file is missing or empty.

`release-finalize.yml` will use the uploaded `release-notes-final.md` asset as the final stable release notes.
