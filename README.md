# Librecord Apps

The desktop and Android apps for [Librecord](https://github.com/libre-cord/librecord) instances, and the instance switcher that adds itself to Discord's own desktop apps. Each app loads an instance's web client, so people get the app they already know pointed at a server you run, and each one keeps a list of saved instances to switch between.

> Librecord is not made by, affiliated with or endorsed by Discord Inc. Accounts are separate from Discord accounts, and nothing posted on an instance is sent to Discord.

## What's here

| Part | Where | What it is |
| --- | --- | --- |
| Desktop app | `desktop` | Librecord for macOS, Windows and Linux. |
| Android app | `mobile` | Librecord for Android. Planned to be replaced by a fork of Kettu Manager, the loader side of the tooling that already injects the instance's mobile bundle into Discord's own Android app. |
| Official desktop switcher | `official-desktop` | Adds an instance switcher to Discord's own desktop apps. |
| App icon | `icon` | The Librecord icon in PNG and SVG. |

## The apps

- **Desktop:** an Electron shell that opens an instance's web client with voice, video, Go Live and screen sharing through a picker for the window, screen or tab to share. The `librecord://` link protocol, an autostart entry on Linux, games detected on the computer handed to the client through the `window.Librecord` bridge, and what plays in Spotify handed to the client the same way. The instance switcher sits under File > Switch Instance and in the tray, with `Ctrl+Shift+O` (`Cmd+Shift+O` on macOS), and pages from an instance can call `window.Librecord.openInstanceSwitcher()`.
- **Android:** a Capacitor app that opens an instance's web client. The Back button on the first page of an instance opens the switcher, Back on the switcher returns to the instance, and a long press on the app icon has a Switch instance shortcut. Pages can call the switcher through the same bridge. This app is planned to be replaced: a fork of Kettu Manager will take over the Android side and load instances into Discord's own Android app through the mobile bundle the server already serves as a Kettu payload, at which point this folder is removed and its switcher moves into the fork.
- **Official desktop switcher:** a small installer that patches Discord's own stable, PTB, Canary and Development apps on the user's computer, adding Switch instance to their menus and the same shortcut. It writes its own files into the app's core as `librecord_switcher`, upgrades installs made by the earlier `discord_oss_switcher` and undoes both when uninstalled. Run it without arguments for usage, and re-run install after every Discord update replaces the core.

## Finding instances

Every app finds and checks instances the same way: it reads `/.well-known/librecord` on the host and accepts the response when its `software.name` is `librecord`. A Librecord server serves this by default. The apps keep their saved instances themselves, the desktop app under its own settings file, the Android app in its local storage and the official switcher in the Discord profile's user data.

## Develop

Install Bun 1.4, then `bun install` in the folder you want to work on. Every app typechecks with `bun run typecheck`. [docs/building.md](docs/building.md) covers compiling and packaging each app: local builds per platform, pushing a tag to get all three from CI, and installing and upgrading the official desktop switcher.


## Credits

These apps build on [Librecord](https://github.com/libre-cord/librecord), on [Electron](https://github.com/electron/electron) and [Capacitor](https://github.com/ionic-team/capacitor), and on the `electron-builder` toolchain.

Discord's desktop apps and their artwork belong to Discord Inc. The switcher only patches an app the user already installed, and no Discord code is in this repository.

## License

[GNU Affero General Public License v3.0](LICENSE). If you run a modified app for other people, you must offer them its source code.
