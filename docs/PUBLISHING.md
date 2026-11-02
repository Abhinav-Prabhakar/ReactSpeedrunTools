# Publishing React Speedrun Tools

This runbook is for maintainers. It covers recovering the existing Marketplace
publisher account and shipping a new version.

## Account details

| Item | Value |
| --- | --- |
| Marketplace extension ID | `AbhinavPrabhakar.react-speedrun-tools` |
| Marketplace page | <https://marketplace.visualstudio.com/items?itemName=AbhinavPrabhakar.react-speedrun-tools> |
| Publisher management | <https://marketplace.visualstudio.com/manage/publishers/AbhinavPrabhakar> |
| Publisher name | `AbhinavPrabhakar` |
| Publisher display name | Abhinav Prabhakar |
| Publisher ID | `fb7b33d4-c8f3-4eda-b664-842b27889fc6` |
| Last Marketplace version | `0.0.2`, published 2023-04-14 |
| Old repository in the 0.0.2 VSIX | `https://github.com/CodeDreamer06/ReactSpeedrunTools` |
| Old GitHub username | `CodeDreamer06`, renamed to `Abhinav-Prabhakar` |
| Likely original account email | `codedreamer06@gmail.com` |

`package.json` must keep `"publisher": "AbhinavPrabhakar"`. Using the GitHub
handle (`abhinav-prabhakar`) will not authenticate against the existing
Marketplace publisher.

## 1. Recover access to the publisher account

1. Open <https://marketplace.visualstudio.com/manage/publishers/AbhinavPrabhakar>.
2. Sign in with one of these:
   - The Microsoft account for the original publisher. The likely email is
     `codedreamer06@gmail.com`, taken from the original commit history.
   - **Sign in with GitHub** using the old `CodeDreamer06` account. The username
     was renamed to `Abhinav-Prabhakar`, but the account ID and login are the
     same. The old account is still authenticated locally in `gh`.
3. If you see “You don’t have access”:
   - Sign out of Marketplace and Azure DevOps completely.
   - Try the other sign-in method above.
   - Check your password manager for `codedreamer06@gmail.com`,
     `marketplace.visualstudio.com`, or `dev.azure.com`.
4. Confirm you can see the **React Speedrun Tools** publisher and extension.

Do not create a new publisher unless recovery is impossible. A new publisher
would lose the existing listing, install history, and reviews.

If recovery fails, contact Microsoft/Azure DevOps support and provide the
publisher ID `fb7b33d4-c8f3-4eda-b664-842b27889fc6`.

## 2. Create a Marketplace personal access token

1. Sign in at <https://dev.azure.com/_usersSettings/tokens> with the same account
   that owns the publisher.
2. Create a new token:
   - Name: `react-speedrun-tools-publish`
   - Organization: **All accessible organizations**
   - Expiration: a short period such as 90 days
   - Scopes: **Custom defined** → **Marketplace** → **Manage**
     (also enable **Acquire** if it is shown)
3. Create the token and copy it immediately.

This token is the value for `VSCE_PAT`. Never commit it to the repository.

## 3. Verify the token locally

Check which publishers are already stored locally:

```bash
npx vsce ls-publishers
```

Verify the token against the publisher:

```bash
npx vsce verify-pat AbhinavPrabhakar
```

You can also log in interactively:

```bash
npx vsce login AbhinavPrabhakar
```

Remove a stored token later with:

```bash
npx vsce logout AbhinavPrabhakar
```

## 4. Store the token in GitHub Actions

Either set the repository secret:

```bash
gh secret set VSCE_PAT
```

and paste the token when prompted, or use the GitHub UI:

**Settings → Secrets and variables → Actions → New repository secret**
with the name `VSCE_PAT`.

Confirm the secret exists:

```bash
gh secret list
```

## 5. Publish a release

The tag-triggered workflow builds, tests, packages, and publishes:

```bash
git tag -a v0.1.1 -m "React Speedrun Tools 0.1.1"
git push origin v0.1.1
```

Or run the release workflow manually after updating the version:

```bash
gh workflow run release.yml -f publish=true
```

To publish an already-built VSIX directly:

```bash
gh release download v0.1.0 --pattern react-speedrun-tools.vsix
npx vsce publish --packagePath react-speedrun-tools.vsix --pat "$VSCE_PAT"
```

The release workflow publishes only when `VSCE_PAT` is set. If it is missing, the
workflow skips the Marketplace step but still creates a GitHub release for tag
builds.

## 6. Verify the listing

Check the published version:

```bash
npx vsce show AbhinavPrabhakar.react-speedrun-tools
```

Then open the Marketplace page and confirm the version, README, and icon:

<https://marketplace.visualstudio.com/items?itemName=AbhinavPrabhakar.react-speedrun-tools>

Marketplace updates can take a few minutes to appear.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `You don't have access` | Wrong Microsoft account. Sign out fully and try the original email or GitHub sign-in. |
| `Publisher AbhinavPrabhakar not found` | The token belongs to a different Azure DevOps account. Recreate it under the publisher owner. |
| `Invalid publisher name` during publish | Ensure `package.json` still uses `AbhinavPrabhakar`, not `abhinav-prabhakar`. |
| Publish skipped in Actions | `VSCE_PAT` is missing. Set the secret and rerun the workflow. |
| Version already exists | Bump the version in `package.json` and `CHANGELOG.md`, then tag a new release. |
