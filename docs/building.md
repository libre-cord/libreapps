# Building the apps

How to compile and package each app from a checkout of this repository. Every app needs Bun 1.4 and runs `bun install` in its own folder first. The Android app in `mobile/` is deliberately not documented here: it is planned to be replaced by a fork of Kettu Manager, which loads instances into Discord's own Android app instead of wrapping its own shell around the web client, so its build steps are not worth recording.

## Desktop app

### Requirements

- Bun 1.4.
- On Linux, the `rpm` tool and `libarchive-tools` for the rpm and pacman packages.
- Build on the platform you are packaging for: the macOS DMG is built on macOS and the Windows installers are built on Windows. Linux packages build on Linux.

### Build and package

```sh
cd desktop
bun install
bun run dist
```

`bun run dist` compiles the TypeScript and runs electron-builder, which writes every installer for your platform into `release/`:

| Platform | Targets |
| --- | --- |
| macOS | DMG (universal), ZIP (universal) |
| Windows | NSIS installers, x64 and arm64 |
| Linux | AppImage, tar.gz, deb, rpm and pacman, x64 and arm64 |

To run the app from source without packaging, use `bun run start`. To only compile the TypeScript, use `bun run build`.

### Building all three platforms from one machine

Local builds produce the platform you are on. To produce every platform at once, let CI do it:

1. Push a `v*` tag, for example `git tag v1.0.2 && git push origin v1.0.2`.
2. GitHub builds the desktop app on macOS, Windows and Linux and uploads the installers to a draft release for that version.
3. Publish the draft from the repository's releases page when you are happy with it.

## Official desktop switcher

### Build

```sh
cd official-desktop
bun install
bun run installer
```

`bun run installer` compiles the switcher into `dist/librecord-switcher`, a standalone program for your platform. `bun run build` rebuilds the switcher's pieces without compiling the installer program.

### Use

Run `dist/librecord-switcher` without arguments for the full usage text. The three commands:

| Command | What it does |
| --- | --- |
| `install` | Patches Discord's own apps to add Switch instance and the Cmd/Ctrl+Shift+O shortcut. |
| `status` | Lists the Discord apps it found and whether the switcher is installed in each. |
| `uninstall` | Removes the switcher from every Discord app it is installed in. |

Two things to know:

- A Discord update replaces the patched core, so run `install` again after every Discord update.
- If the earlier `discord_oss_switcher` version is installed, `install` upgrades it: it removes the old files and swaps the old loader line for the new one, and `uninstall` removes both generations.
