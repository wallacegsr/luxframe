# LuxFrame

A calm, minimalist wall-tablet dashboard for Home Assistant. You swipe between
full-screen pages: grids of glass tiles, a big clock, one page per room, your
scenes. It's built to
live on an Android tablet in Kiosk Satellite, but it runs in any browser that
can open a Home Assistant dashboard.

LuxFrame is a single Lovelace card that fills a panel view. Pages swipe with
native scroll-snap, so it feels right on touch and also works with a trackpad,
the page dots, or the arrow keys.

## Install

### HACS (custom repository)

1. HACS → ⋮ → **Custom repositories** → add `https://github.com/wallacegsr/luxframe`
   as type **Dashboard**.
2. Install **LuxFrame** and reload the browser.

### Manual

1. Download `luxframe.js` from the
   [latest release](https://github.com/wallacegsr/luxframe/releases/latest) and
   copy it to `config/www/`.
2. Settings → Dashboards → ⋮ → **Resources** → add `/local/luxframe.js` as a
   JavaScript module.

## Set up a dashboard

Create a new dashboard for the tablet, open its raw configuration editor and
paste something like this:

```yaml
views:
  - title: Home
    type: panel
    cards:
      - type: custom:luxframe-card
        theme: auto          # auto | light | dark | ha
        home_after: 120      # seconds idle before returning to page 1; 0 = off
        pages:
          - type: grid
            tiles:
              - type: thermostat
                entity: climate.living_room
              - type: analog-clock
              - light.bedside
              - type: weather
              - lock.front_door
              - scene.arrive_home
              - fan.bedroom
              - cover.bedroom_shades
              - light.porch
          - type: clock
            weather: weather.home
          - type: room
            title: Living room
            sensors: [sensor.living_temperature, sensor.living_humidity]
            entities:
              - light.living_room
              - light.floor_lamp
              - entity: fan.ceiling
                name: Fan
          - type: scenes
            scenes: [scene.morning, scene.movie, scene.goodnight, script.leave_home]
```

### Pages

| Type     | Options                                                                      |
| -------- | ---------------------------------------------------------------------------- |
| `grid`   | `tiles`, `columns` (default 4), `rows` (default 3), `portrait_rows` (default `rows` + 2), `title` |
| `clock`  | `weather` (a `weather.*` entity), `greeting` (default `true`)                |
| `room`   | `title`, `entities` (ids or `{entity, name, icon}`), `sensors` (shown as chips) |
| `scenes` | `title` (default "Scenes"), `scenes` (scene or script ids, or objects)       |
| `weather` | `entity` (default: your first weather entity). Now, the next 12 hours and the week. |
| `calendar` | `entities` (default: every calendar), `days` (default 7), `title`. An agenda by day. |
| `cameras` | `entities` (default: every camera), `title`. Stills every 10 s; tap one to stream it. |
| `photos` | `folder` (a media folder, default the whole local media folder), `interval` (seconds, default 30), `clock` (default `true`) |
| `night`  | `weather` (optional, for the temperature). A dim clock on black that drifts a little each minute. |

Any page can have `hidden: true` to keep it in the config but out of the frame.

### Grid pages

A grid page is `rows` × `columns` cells, and every row is the same height, so a
page of tiles fills the screen edge to edge. Tiles past the last row scroll.
When the tablet stands upright, the grid uses `portrait_rows` instead, so
tiles stay close to square. Tiles pack in order and fill gaps where they can.

Each tile takes a `size`:

| Size | Cells          |
| ---- | -------------- |
| `s`  | 1 × 1          |
| `w`  | 2 × 1 (wide)   |
| `m`  | 2 × 2          |
| `l`  | 4 × 2 (large)  |

| Tile type      | Options                                   | Default size |
| -------------- | ----------------------------------------- | ------------ |
| `entity`       | `entity`, `name`, `icon`. A bare entity id is shorthand for this. | `s` |
| `thermostat`   | `entity` (a `climate.*`), `name`          | `m`          |
| `weather`      | `entity` (default: your first weather entity) | `s`      |
| `clock`        |                                           | `s`          |
| `analog-clock` | Drawn on the background, with no glass    | `s`          |
| `calendar`     | `entities` (default: every calendar), `view`: `upcoming` or `month`. A tap opens the calendar page. | `m` |
| `now-playing`  | `entity` (default: whichever speaker is playing, Music Assistant first) | `w` |
| `camera`       | `entity`. A tap streams it in Home Assistant's dialog. | `m` |
| `photo`        | `folder`, `interval` (seconds, default 30) | `m`         |
| `sun`          | `entity` (default `sun.sun`). Next sunrise or sunset; an arc on bigger tiles. | `s` |
| `todo`         | `entity` (a `todo.*`). Tap a circle to tick an item off. | `m` |
| `room`         | `area` (id or name). Temperature and lights; the icon switches the room's lights, the rest opens the page with the room's name. | `s` |

When something a tile or page needs isn't there, it says so plainly: "No
weather", "No calendar", "No camera", "No photos in local/holiday".
Picking a calendar, camera, to-do list, speaker or the sun on the tablet gives
it its own tile kind, and **Add tile → Rooms** adds a room tile.

Entity tiles show the icon, the name and the entity's area. If an entity's
name starts with its area ("Bedroom Bedside Lamp"), the area part is dropped.
A light, shade or fan that's on also shows its level, and a running fan's icon
spins faster the higher its speed.

### Tile gestures

- **Tap the icon** to switch the entity on or off. Scenes and scripts run from
  a tap anywhere on the tile.
- **Tap the name**, or anywhere else on the tile, to open its details.
- **Drag up or down** on a dimmable light, a shade or a fan to set its level.
  A full tile height covers 0–100%.
- **Hold** for a second to start [editing](#editing-on-the-tablet) on a grid
  page. On room and scenes pages, holding opens the details.
- Locks, and garage, door and gate covers, never act on one tap. The icon opens
  their details instead.
- On the thermostat, **▼ / ▲** change the target. Several quick taps go to
  Home Assistant as a single change.

### Detail pages

Details open on a LuxFrame glass page over the frame:

- **Light**: a tall brightness slider in the bulb's color, white and color
  swatches, hue and warmth sliders, and Turn On/Off.
- **Fan**: speed in the fan's own steps, presets, oscillation, Turn On/Off.
- **Shade**: a position slider with Open, Stop and Close. Garage, door and
  gate covers open only after a second tap.
- **Thermostat**: a large target with ▼/▲ (Low and High for a range) and its
  modes.
- **Lock**: Lock at once; Unlock only after a second tap.
- **Anything else**: its state, when it last changed, and Turn On/Off or Run.

Close with ✕, by swiping down, or with Escape. **⋯** opens Home Assistant's own
dialog for history, settings and attributes.

### Editing on the tablet

Hold any tile on a grid page for a second. The tiles wiggle, and a bar appears
at the top.

- **Drag** a tile to move it. The others make room.
- **Tap** a tile to set its size (Small, Wide, Medium, Large), rename it,
  change what it shows, move it earlier or later, or remove it.
- **−** on a tile's corner removes it. **+ Add tile**, or the dashed tile at
  the end, adds one: a clock, or any entity, searchable by name or room.
  Thermostats and weather entities get their own tile kinds.
- **Customize** sets the page's title, columns and rows; shows, hides,
  reorders, adds and deletes pages; adds a page for each room in Home
  Assistant that doesn't have one; and sets the theme, wallpaper and glass
  tint.
- **Done** saves, **Cancel** drops the changes.

Where Done saves:

- **Signed in as an admin**: into the dashboard's own config, so every tablet
  on that dashboard gets the change. The YAML you wrote is the starting point;
  after a save the dashboard's raw config shows the result.
- **Otherwise**, or on a dashboard managed in YAML: on this tablet only, and
  LuxFrame says so. When the dashboard's config changes, the tablet goes back
  to it. **Customize → Use the dashboard's layout** does that by hand.

### Quick panel and Assist

**Pull down from the top edge**, or tap the small handle there, for the quick
panel:

- **Now playing**: artwork, title and artist, previous / play-pause / next,
  and volume. It follows whichever speaker is playing, Music Assistant's
  players first, unless you set `media_player`. Buttons the speaker can't use
  are dimmed.
- **Screen brightness**: in Kiosk Satellite this moves the tablet's backlight.
  Anywhere else LuxFrame dims itself with a dark veil, remembered per tablet.
- **Pinned tiles**: up to four, e.g. a light, a lock and a scene. They work
  like any tile.
- **Ask Home Assistant**.

Swipe the panel back up, tap below it, or press Escape to put it away.

**Hold the top edge** for a second to go straight to **Ask Home Assistant**:
type a request ("turn off the kitchen lights") and read the answer. It uses
Assist (`conversation/process`), so follow-ups like "and the hallway" carry
on the same conversation. Voice stays with Kiosk Satellite or Voice Satellite.

```yaml
quick_panel:
  media_player: media_player.living_room   # optional
  pinned:
    - light.porch
    - lock.front_door
    - scene.movie
assist:
  agent_id: conversation.home_assistant   # optional; true/false also work
```

The pinned tiles and the speaker can also be set on the tablet, under
**Customize → Quick panel**.

### Card options

| Option       | Default                                    | Notes                                               |
| ------------ | ------------------------------------------ | --------------------------------------------------- |
| `pages`      | (required)                                 | At least one page.                                  |
| `theme`      | `auto`                                     | `auto`, `light`, `dark`, or `ha`. See [Theming](#theming). |
| `background` | a soft gradient                            | Any CSS background, e.g. `center / cover url('/local/wall.jpg')`. |
| `tint`       | the background image's average color       | The color the glass picks up, e.g. `"#e07a2c"`.      |
| `home_after` | `120`                                      | Seconds without a touch before going back to page 1. |
| `height`     | `calc(100dvh - var(--header-height, 0px))` | Becomes `100dvh` when Kiosk Satellite hides HA's header. |
| `quick_panel` | on, nothing pinned                        | `media_player`, `pinned`; `false` turns the panel off. |
| `assist`     | `true`                                     | `false` hides Ask; `{agent_id}` picks the conversation agent. |
| `style`      | `auto`                                     | `glass`, or `flat` for solid tiles with no blur. `auto` goes flat on a device that can't blur, or blurs below 30 frames a second (checked once per tablet). |

## Theming

LuxFrame's own look is frosted glass, inspired by visionOS: translucent,
blurred tiles over a soft gradient, white text, and bright tiles for anything
that's on. It looks best over a photo, so try setting `background` to a
wallpaper in `/local/`. The glass then takes on the wallpaper's color
automatically. Set `tint` to choose that color yourself.

- `theme: auto` uses the glass look and picks light or dark from Kiosk
  Satellite, then Home Assistant, then the device. `light` and `dark` force one.
- `theme: ha` drops LuxFrame's colors and borrows the active Home Assistant
  theme instead: `lovelace-background`, `ha-card-background`,
  `ha-card-backdrop-filter`, `ha-card-box-shadow`, `ha-card-border-radius`,
  `primary-text-color`, `secondary-text-color`, `state-icon-active-color` and
  the theme's font. Glass-style HA themes, such as the
  [visionOS theme](https://github.com/Nezz/homeassistant-visionos-theme), carry
  straight over.

Whichever you pick, any Home Assistant theme can fine-tune LuxFrame by setting
`luxframe-*` variables. These win over everything else, and they can differ
between the theme's light and dark modes:

```yaml
# themes/my-theme.yaml
My theme:
  luxframe-accent: "#32d74b"
  luxframe-radius: 28px
  modes:
    dark:
      luxframe-backdrop: "center / cover no-repeat url('/local/night.jpg')"
```

| Variable                     | What it colors                         |
| ---------------------------- | -------------------------------------- |
| `luxframe-backdrop`          | The background behind every page       |
| `luxframe-tint`              | The color mixed into the glass         |
| `luxframe-surface`           | Tiles and pills (replaces the tint mix) |
| `luxframe-surface-active`    | Tiles for things that are on           |
| `luxframe-blur`              | The `backdrop-filter` on tiles         |
| `luxframe-shadow`            | Tile shadow and edge highlight         |
| `luxframe-text`              | Main text                              |
| `luxframe-muted`             | Secondary text and sensor chips        |
| `luxframe-faint`             | Page dots and the version label        |
| `luxframe-text-active`       | Text on an "on" tile                   |
| `luxframe-muted-active`      | State text on an "on" tile             |
| `luxframe-accent`            | Icons of things that are on            |
| `luxframe-radius`            | Tile corner radius                     |
| `luxframe-font`              | Font family                            |

## Kiosk Satellite

[Kiosk Satellite](https://github.com/jxlarrea/kiosk-satellite) handles the
tablet side: wake on motion, screensavers, screen power, voice. When LuxFrame
finds `window.kioskSatellite`, it:

- follows the app's Home Assistant light/dark setting, live;
- goes back to page 1 when the screen turns on or the screensaver ends;
- fills the whole screen when the app hides HA's header;
- moves the tablet's backlight from the quick panel's brightness slider.

Outside Kiosk Satellite none of this runs and the card behaves normally.

## Develop

```bash
npm install
npm run dev        # open /dev/ for the page with a mock Home Assistant
npm run build      # typecheck, then write dist/luxframe.js
```

Add `?wall` to the dev URL to put a sample wallpaper behind the pages, `?dark`
to preview dark mode, `?theme=ha` to preview against
a stand-in Home Assistant theme, or `?override` to see a `luxframe-*` variable
take effect. The clock page shows the
version and commit in its corner, and the browser console logs them too, so a
stale install on a tablet is easy to spot.

Releases: bump `version` in `package.json` and the changelog together, tag
`vX.Y.Z`, and push the tag. The release workflow builds and attaches
`luxframe.js`.
