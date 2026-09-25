# infinite-desk

**You work on a laptop and you're out of screens.** The editor on one, the docs on another, the
browser running your app on a third, the team chat on a fourth… and all you have is 14 inches.
You spend the day switching windows.

**infinite-desk turns your laptop into a workstation with as many screens as you want.** Step
into a 3D space and every window on your desktop becomes a floating screen you can place
anywhere: one in front, one to the left, one up high. Turn your head to look at another. And
they're not screenshots: they're your real windows, live, and **you can type and click in them**.

## What you can do

- **As many screens as windows.** VS Code, the browser, Discord, a video, File Explorer: each
  one is a screen you move, bring closer and resize. Videos keep playing.
- **Work inside them.** Aim at a screen, press Enter, and your keyboard and mouse go to that real
  window. Click outside it and you're moving around the space again.
- **Open things without leaving.** F opens your desktop (files, folders, apps, web links) and
  whatever you open shows up as a new screen.
- **See your projects.** Every repository in your work folder is an island with its code map:
  modules and dependencies if you have [galaxy-brain](https://github.com/Llicklair/galaxy-brain),
  or its folder tree if you don't. With galaxy-brain you also see agents at work: the modules they
  touch light up live.
- **As your wallpaper.** The same space, slowly turning behind your desktop icons; right-click the
  desktop → *Enter infinite-desk* to step in.

## Requirements

- Windows 10 or 11, with Microsoft Edge (it ships with Windows).
- [Node.js](https://nodejs.org) 20 or newer.
- [.NET 10 SDK](https://dotnet.microsoft.com/download) to work inside the screens.
- Optional: [Lively Wallpaper](https://github.com/rocksdanister/lively) for the wallpaper
  (`winget install rocksdanister.LivelyWallpaper`), and galaxy-brain (`gb`) for code maps.

## Getting started

Clone the repo **inside your projects folder** (its sibling folders become the islands):

```bash
npm install
npm run terminado   # checks everything, builds the islands, the space and the bridge
npm run fondo       # sets it as your Lively wallpaper and adds "Enter infinite-desk" to the desktop right-click menu
```

Right-click the desktop → **Enter infinite-desk**. Click to step in and press **N** to bring in
your first window.

No Lively? It works too: open `wallpaper/index.html` in Edge.

## Controls

| Key | What it does |
|---|---|
| **WASD** + mouse | move and look · **Space** up · **C** down · **Shift** run |
| **N** | bring a window in as a new screen |
| **F** | open something from your desktop (and bring its window in) |
| **Enter** on a screen | work in it; click outside the screen to come back |
| hold **click** | move a screen · **wheel** resize · **X** close it |
| **G** · **V** | which code map a screen shows · hide or show it |
| **click** a node | its details: what it is, what uses it, which agents are touching it |
| **T** · **R** | code map ↔ folder tree · regenerate the islands |
| **H** · **Esc** | hide the help · release the mouse (twice: back to the desktop) |

As a wallpaper: drag to rotate, wheel to zoom, double-click an island to fly to it and
double-click empty space to go back up.

## How it works

The space is a web page (Three.js) that Edge opens full screen. Windows are captured with the
browser's screen-capture API (you pick each one once, with a click). A small C# program
(`puente/`, "bridge"), which only listens on your own machine and requires a token, does what a
web page can't: pass your keyboard and mouse to the real window, open files and regenerate the
islands. The design rules are in [ARCHITECTURE.md](ARCHITECTURE.md) and the reasoning behind each
decision in [docs/adr/](docs/adr/); everything measured, good and bad, is in
[docs/evidencia.md](docs/evidencia.md). The internal docs and code comments are in Spanish.

## Honest limits

- **Windows only** for now: the bridge uses the Windows window APIs.
- **Each new window takes one click** in the browser's picker: a web page can't capture windows
  without you choosing them.
- **Working in a screen is a mode**: while you type, WASD belongs to the window, not the space.
- A **minimized window can't be captured**; infinite-desk restores them when you step in.
