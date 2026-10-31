# Publishing a release

This repository uses tag pushes to publish releases. It doesn't add plugin update checking or signed updates.

For 1.0.0, copy this kit's contents into your existing `perishxd/dms-manager` checkout. Copy the `.github` directory too. Don't put the whole release kit inside `src/userplugins`; only the `DMsManager` folder belongs there.

From your repository folder in PowerShell:

```powershell
git status
git add .
git commit -m "Release 1.0.0"
git push origin main
git tag v1.0.0
git push origin v1.0.0
```

Pushing the tag starts **Actions → Publish release**. Once it finishes, **Releases → DMs Manager 1.0.0** will contain `DMsManager-1.0.0.zip` and the release notes.

For future releases, update `DMsManager/version.ts`, both READMEs, and `RELEASE_NOTES.md`, then commit, push, and tag the new version. The packaging step rejects tags that don't match the version file and notes.

Don't reuse an existing version tag. If Git says `v1.0.0` already exists, inspect the existing tag and release before publishing anything else.

This workflow assumes the repository is public. It packages the tagged source; local verification should be completed before tagging.
