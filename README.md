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

1. HACS → ⋮ → **Custom repositories** → add this repo's URL as type **Dashboard**.
2. Install **LuxFrame** and reload the browser.

### Manual

1. Download `luxframe.js` from the latest release and copy it to `config/www/`.
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
- **Hold** for a second to open the details. On-tablet editing will use this
  gesture later.
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

### Card options

| Option       | Default                                    | Notes                                               |
| ------------ | ------------------------------------------ | --------------------------------------------------- |
| `pages`      | (required)                                 | At least one page.                                  |
| `theme`      | `auto`                                     | `auto`, `light`, `dark`, or `ha`. See [Theming](#theming). |
| `background` | a soft gradient                            | Any CSS background, e.g. `center / cover url('/local/wall.jpg')`. |
| `tint`       | the background image's average color       | The color the glass picks up, e.g. `"#e07a2c"`.      |
| `home_after` | `120`                                      | Seconds without a touch before going back to page 1. |
| `height`     | `calc(100dvh - var(--header-height, 0px))` | Becomes `100dvh` when Kiosk Satellite hides HA's header. |

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
- fills the whole screen when the app hides HA's header.

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
