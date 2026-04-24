# auto-releases

A GitHub Action that automates semantic versioning releases using the [`auto`](https://intuit.github.io/auto/) CLI. It determines the next version from PR labels, publishes GitHub Releases, sends Slack notifications, and optionally checks AWS ECR for existing build images to skip unnecessary rebuilds.

## Features

- **Semantic versioning** — next version derived automatically from PR labels (`major`, `minor`, `patch`)
- **Pre-releases and full releases** — separate flows for candidate and release branches
- **Hotfix detection** — compares branches bidirectionally to detect out-of-sync commits
- **Slack notifications** — posts formatted release notes to one or more channels
- **AWS ECR integration** — checks whether a previous build image already exists before triggering a rebuild
- **Jira linking** — optionally links issue keys in release notes to your Jira board
- **Dry-run mode** — validates the full flow without publishing anything

## Branch Model

The action expects three branches:

| Input | Default | Role |
|-------|---------|------|
| `dev-branch` | `main` | Active development branch; triggers dev-tagged builds |
| `main-branch` | `candidate` | Pre-release branch; publishes `rc` pre-releases |
| `release-branch` | `release` | Production branch; publishes full releases |

## Usage

```yaml
name: Release

on:
  push:
    branches:
      - candidate
      - release

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - uses: iahmad-khan/auto-releases@next
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          slack-token: ${{ secrets.SLACK_TOKEN }}
          slack-channels: 'releases, engineering'
          notify-on-pre-release: true
          dev-branch: 'main'
          main-branch: 'candidate'
          release-branch: 'release'
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `github-token` | No | `${{ github.token }}` | GitHub token used to create releases and read branch/tag data |
| `slack-token` | **Yes** | — | Slack Bot token (`xoxb-...`) for posting release notes |
| `slack-channels` | **Yes** | — | Comma-separated list of Slack channel names or IDs |
| `notify-on-pre-release` | No | `true` | Whether to send Slack notifications for pre-releases |
| `dry-run` | No | `FALSE` | Validate the release flow without publishing anything |
| `dev-branch` | No | `main` | Development branch name |
| `main-branch` | No | `candidate` | Pre-release (candidate) branch name |
| `release-branch` | No | `release` | Production release branch name |
| `force-patch-releases` | No | `false` | Force a `patch` bump regardless of PR labels |
| `jira-url` | No | — | Jira base URL for issue linking (e.g. `https://yourorg.atlassian.net/browse`). Leave empty to disable. |
| `appMatrix` | No | — | JSON array of app configs. The first entry's `repository` field is used as the ECR repository name. |
| `registry` | No | — | Container registry URL |
| `ecrRegion` | No | — | AWS region for ECR (e.g. `us-east-1`) |
| `ecrAccessKey` | No | — | AWS access key ID. Not needed when using IAM roles. |
| `ecrAccessSecret` | No | — | AWS secret access key. Not needed when using IAM roles. |

## Outputs

| Output | Description |
|--------|-------------|
| `new-tag` | The tag that was created (e.g. `v1.2.3-rc.1`) |
| `latestTagWithPreReleases` | Most recent tag including pre-releases |
| `latestTagWithoutPreReleases` | Most recent stable tag |
| `releaseType` | `pre-release` or `full-release` |
| `isHotfix` | `"true"` if the release does not have a reusable previous build |
| `previousBuild` | Tag of a previous build whose image can be reused (e.g. `main-a1b2c3d`), or empty |

## PR Labels

The version bump type is driven by labels on the merged PR:

| Label | Bump |
|-------|------|
| `major` | Breaking change — `1.0.0` → `2.0.0` |
| `minor` | New feature — `1.0.0` → `1.1.0` |
| `patch` | Bug fix — `1.0.0` → `1.0.1` |
| `docs` | No release |
| `internal` | No release |

## Example with ECR

```yaml
- uses: iahmad-khan/auto-releases@next
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    slack-token: ${{ secrets.SLACK_TOKEN }}
    slack-channels: 'releases'
    appMatrix: '[{"repository": "my-ecr-repo"}]'
    ecrRegion: 'us-east-1'
    ecrAccessKey: ${{ secrets.AWS_ACCESS_KEY_ID }}
    ecrAccessSecret: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

When `isHotfix` is `"false"` and `previousBuild` is set, a Docker image for that build already exists in ECR and the build step can be skipped:

```yaml
- name: Build image
  if: steps.release.outputs.isHotfix == 'true'
  run: docker build ...
```
