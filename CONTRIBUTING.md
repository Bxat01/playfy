# Contributing to Playfy

Thanks for considering a contribution. Issues and pull requests are welcome.

## Before opening a pull request

1. Search existing issues and pull requests for related work.
2. For a substantial change, open an issue first so the approach can be discussed.
3. Keep changes focused and describe user-visible effects, platform impact, and any manual checks performed.
4. Do not include credentials, tokens, personal data, build output, or installed dependencies.

## Development setup

Install the prerequisites listed in the [README](README.md), then install JavaScript dependencies:

```sh
pnpm install
```

For Windows development, build the native helpers and launch the app:

```sh
pnpm build:runner:win
pnpm tauri dev
```

The runner build commands for Linux and macOS are `pnpm build:runner:linux` and `pnpm build:runner:darwin`. Build each native target on its supported operating system and follow the Tauri prerequisites in the README.

For frontend-only work, use `pnpm dev`. Before submitting, run `pnpm build` and describe any platform-specific checks you performed. The project does not currently define a dedicated automated test command.

## Pull request notes

- Explain the problem and the intended change.
- Include screenshots for visible interface changes when useful.
- Update the README or other documentation when behavior or setup changes.
- Keep `pnpm-lock.yaml` in sync when changing JavaScript dependencies.
- Preserve existing copyright and attribution notices.

By submitting a contribution, you agree that it may be distributed under the project's [MIT](LICENSE) or [Apache-2.0](LICENSE-APACHE) license, at the recipient's option.
