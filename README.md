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

A tablet keeps running the version it loaded until its page reloads, which a
kiosk app may never do. LuxFrame checks for a newer version installed through
HACS soon after it loads, every half hour, and when the screen wakes, and then
offers **Reload**. The clock page's corner shows the version running.

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
        home_after: 120      # seconds idle before returning to the start page; 0 = off
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
| `room`   | `title`, `entities` (ids or `{entity, name, icon}`), `sensors` (shown as badges beside the title) |
| `scenes` | `title` (default "Scenes"), `scenes` (scene or script ids, or objects)       |
| `weather` | `entity` (default: your first weather entity). Now, the next 12 hours and the week. |
| `calendar` | `entities` (default: every calendar), `days` (default 7), `title`. An agenda by day. |
| `cameras` | `entities` (default: every camera), `title`. Stills every 10 s; tap one to stream it. |
| `photos` | `folder` (a media folder, default the whole local media folder), `interval` (seconds, default 30), `clock` (default `true`) |
| `night`  | `weather` (optional, for the temperature). A dim clock on black that drifts a little each minute. |

Any page can have `hidden: true` to keep it in the config but out of the frame.
The frame opens on the first page, and goes back to it after `home_after`
seconds without a touch; `home: true` on another page makes that one the start
page instead.

### Badges

Pages with a title bar (tile pages, rooms, Calendar, Cameras and Scenes) can
show badges beside the title: small pills with an entity's icon and state,
such as "21°" or "Brewing". A page's `badges` show on that page; `badges` on
the card itself show on every page with a title bar, after the page's own.

```yaml
type: custom:luxframe-card
badges:
  - alarm_control_panel.home          # on every page
pages:
  - type: grid
    title: Coffee
    badges:
      - sensor.kitchen_temperature      # the short form: an entity id
      - entity: light.kitchen
        tap: toggle                     # switch it, instead of opening details
      - entity: sensor.xbloom_studio_brew_status
        visibility:
          - condition: state
            entity_id: sensor.xbloom_studio_brew_status
            state: [brewing, grinding]
      - entity: script.start_brew       # scenes, scripts and buttons run on tap
        name: Start brew
    tiles: []
```

| Option       | What it does |
| ------------ | ------------ |
| `entity`     | The entity whose icon and state show. |
| `name`       | Shown before the state. Badges show only the state by default; one that runs something shows its name. |
| `show_name`  | `true` puts the name over the state, as Home Assistant's badges do; `false` hides it. |
| `show_state` | `false` hides the state, leaving the icon and name. |
| `show_icon`  | `false` hides the icon. |
| `state_content` | What the state part says: `state` (the default), `last_changed`, `last_updated` or an attribute's name, or a list of them. |
| `icon`       | Another icon, such as `mdi:coffee`. |
| `tap`        | `details` (default) opens the entity's details; `toggle` switches a light, switch, fan and so on. Locks, garage doors and gates still open their details. |
| `action`     | A service to call on tap, such as `script.turn_on`, with `data`. The badge shows its name and flashes Done. |
| `visibility` | Home Assistant's visibility conditions, as on [tiles](#home-assistant-cards). |

Scenes, scripts and buttons run when tapped, then show Done for a moment.
Holding a badge for a second starts editing, as holding a tile does. States are kept short:
"21.4 °C" shows as "21°", and an event's or a timestamp's time as "29 minutes
ago". A badge copied from a Home Assistant dashboard keeps its `show_*` and
`state_content` settings. Badges stay on one line, as on a Home Assistant
dashboard; when there are more than fit, swipe along them to see the rest.
When the tablet stands upright, they move to a line under the title. A room's `sensors` show
as badges first.

`badge_align` places them: `right` (the default), `left`, just after the
title, or `center`, in the middle of the page. `badge_style: plain` drops the
soft cell behind each badge, leaving the icon and text on the page; an active
badge then shows in the accent color. Customize sets both under Look for
every page; a page can set its own, under **This page**, or with the same
options on the page.

```yaml
pages:
  - type: grid
    title: Coffee
    badge_align: center
    badge_style: plain
    badges:
      - entity: event.front_door_camera_motion
        name: Front Door
        show_name: true
```

While editing, **+ Badge** in the title bar adds one, and tapping a badge sets
its name, what it shows (icon, name, state, and what the state says), what a
tap does, whether it shows on this page or every page, and its place. The badge's YAML is there too, for visibility conditions, an
action, or an icon: change it and tap **Apply**.

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
| `3x2` | Any columns × rows: up to the grid's columns wide and 8 rows tall |

A tile wider than the grid is cut to the grid's width. A tile in a custom size
lays itself out like the nearest preset: one row tall is wide, two or more rows
are medium (large from four columns), and one column is small however tall.

| Tile type      | Options                                   | Default size |
| -------------- | ----------------------------------------- | ------------ |
| `entity`       | `entity`, `name`, `icon`. A bare entity id is shorthand for this. | `s` |
| `thermostat`   | `entity` (a `climate.*`), `name`. Glass, with what it's doing in the mode's color; medium and large tiles add mode buttons. | `m` |
| `weather`      | `entity` (default: your first weather entity) | `s`      |
| `clock`        |                                           | `s`          |
| `analog-clock` | Drawn on the background, with no glass    | `s`          |
| `calendar`     | `entities` (default: every calendar), `view`: `upcoming` or `month`. A tap opens the calendar page. | `m` |
| `now-playing`  | `entity` (default: whichever speaker is playing, Music Assistant first). A tap opens the [speaker's details](#detail-pages). | `w` |
| `camera`       | `entity`. A tap streams it in Home Assistant's dialog. | `m` |
| `photo`        | `folder`, `interval` (seconds, default 30) | `m`         |
| `sun`          | `entity` (default `sun.sun`). Next sunrise or sunset; an arc on bigger tiles. | `s` |
| `todo`         | `entity` (a `todo.*`). Tap a circle to tick an item off. | `m` |
| `room`         | `area` (id or name). Temperature and lights; the icon switches the room's lights, the rest opens the page with the room's name. | `s` |
| `card`         | `card` (any Home Assistant card's config), `glass` (default `true`), `fit` (`stretch`, `cover` or `contain`). See [Home Assistant cards](#home-assistant-cards). | `m` |

When something a tile or page needs isn't there, it says so plainly: "No
weather", "No calendar", "No camera", "No photos in local/holiday".
Picking a calendar, camera, to-do list, speaker or the sun on the tablet gives
it its own tile kind, and **Add tile → Rooms** adds a room tile.

### Home Assistant cards

A `card` tile holds any Home Assistant card, built by Home Assistant itself, so
built-in cards and custom cards from HACS both work:

```yaml
- type: card
  size: l
  card:
    type: thermostat
    entity: climate.my_ecobee
    features:
      - type: climate-fan-modes
      - type: climate-hvac-modes
```

The card's background gives way to LuxFrame's glass and its text takes
LuxFrame's colors. Cards that draw their own background, such as a picture,
keep it. `glass: false` leaves the card looking as it does on other
dashboards, glows and shadows included: they reach past the tile's edge into
the gap around it, except with `fit: scroll` or `cover`, which need the edge.

On the tablet, a card tile's settings switch between **Visual editor** and
**YAML**. The visual editor is the card's own, as Home Assistant's card dialog
shows it, so a card's layouts and other options can be changed in place;
custom cards from HACS that have an editor work too. A card with no visual
editor, or settings its editor can't show, opens in YAML.

Visibility conditions work as they do on a dashboard: the tile shows only
while they're all met, and the tiles after it close up. A card copied from a
dashboard keeps its `visibility`, and any tile can have one of its own:

```yaml
- type: card
  size: 4x2
  visibility:
    - condition: state
      entity_id: sensor.xbloom_studio_brew_status
      state: [brewing, grinding]
  card:
    type: custom:plotly-graph
    # …
```

LuxFrame checks `state`, `numeric_state`, `screen`, `user`, `time`, and
`and`/`or`/`not`. While editing, a tile that's hidden right now shows faded,
so it can still be moved or changed.

`fit` decides how a card meets its tile:

| `fit`     | What it does |
| --------- | ------------ |
| `stretch` | The default. The card gets the tile's size, so one that can grow fills it; one still taller than the tile shrinks, as a whole, until it fits. |
| `scroll`  | Fills the tile like `stretch`, but a card taller than the tile keeps its size and scrolls inside it. Good for long lists. |
| `cover`   | Fills the tile. Home Assistant's picture cards (`picture`, `picture-entity`, `picture-glance`, `picture-elements`) crop their picture to the tile's shape, and badges over it stay inside. Any other card scales evenly until it fills the tile, centered, and loses what runs past the edges. |
| `contain` | Shows all of the card, centered, shrunk if it's taller than the tile. |

For a picture card, `cover` hands the card the tile's shape as its
`aspect_ratio`, and follows the tile when it's resized or the tablet turns.
Badges are placed as a share of the card, so they land a little differently
on the cropped picture, but never outside it. A card that sets its own
`aspect_ratio` keeps it and is scaled like any other card. When a card is
scaled, everything moves together, and anything close to the trimmed edges
can be cut off; a tile closer to the card's shape trims less. The tile editor
has the same three choices under **Fit**.

On the tablet, **Add tile → From your dashboards** lists the cards on your
other dashboards, with the dashboard and view each is on. A tap copies the
card into a new tile, sized from its place in a sections view (a card 4 or more
rows tall starts medium, or large at full width). The copy doesn't follow later
changes to the original. Dashboards Home Assistant generates itself, and ones
only admins may open when you aren't one, aren't listed.

**Paste a card's YAML**, at the top of the same list, takes any card. In Home
Assistant, open the card's editor and choose **Show code editor** to copy it.
Layout keys such as `grid_options` can stay; LuxFrame ignores them.

Holding a card still starts editing after a second, unless the card opens a
dialog of its own first.

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
  page. On room and scenes pages, holding a tile opens its details; holding the
  page around the tiles starts editing.
- Locks, and garage, door and gate covers, never act on one tap. The icon opens
  their details instead.
- On the thermostat, **▼ / ▲** change the target. Several quick taps go to
  Home Assistant as a single change. On medium and large tiles, the row of
  mode buttons switches between off, heat, cool and the rest.

### Detail pages

Details open on a LuxFrame glass page over the frame:

- **Light**: a tall brightness slider in the bulb's color, white and color
  swatches, hue and warmth sliders, and Turn On/Off.
- **Fan**: speed in the fan's own steps, presets, oscillation, Turn On/Off.
- **Shade**: a position slider with Open, Stop and Close. Garage, door and
  gate covers open only after a second tap.
- **Thermostat**: a large target with ▼/▲ (Low and High for a range), its
  modes, and its fan modes, presets and swing where it has them.
- **Lock**: Lock at once; Unlock only after a second tap.
- **Speaker**: big artwork, a bar to drag through the song, shuffle,
  previous / play-pause / next, repeat, and volume with mute. Beside it are
  your speakers: where they can group, tick one to play along, and each one
  playing gets its own volume. Tap a speaker to show it instead. Tapping
  what's playing, on a tile or in the quick panel, opens it.
- **Speaker, with Music Assistant**: a heart adds the song to its favorites,
  the next song shows under the controls, and **Move here** takes the music,
  queue and all, to another speaker. **Library** plays your favorites,
  playlists, albums, artists and radio, and searches Music Assistant.
- **Anything else**: its state, when it last changed, and Turn On/Off or Run.

Close with ✕, by swiping down, or with Escape. **⋯** opens Home Assistant's own
dialog for history, settings and attributes.

### Editing on the tablet

Hold any tile on a grid page for a second. The tiles wiggle, and a bar appears
at the top. On every other page (clock, weather, calendar, cameras, photos,
night), hold anywhere for a second; on room and scenes pages, hold the page
around the tiles. There the bar has Customize, Cancel and Done, with no Add
tile.

- **Drag** a tile to move it. The others make room.
- **Drag the corner handle** (bottom right) to resize a tile a whole column or
  row at a time. Its size shows in the middle while you drag.
- **Tap** a tile to set its size (Small, Wide, Medium, Large, or any width and
  height), rename it, change what it shows, move it earlier or later, or
  remove it.
- **−** on a tile's corner removes it. **+ Add tile**, or the dashed tile at
  the end, adds one: a card from one of your dashboards, a widget such as a
  clock, a room, or any entity, searchable by name or room. Thermostats and
  weather entities get their own tile kinds.
- **Customize** sets the page's columns and rows; renames, shows, hides,
  reorders, adds and deletes pages; picks the start page (⌂); adds a page for each room in Home
  Assistant that doesn't have one; and sets the theme, wallpaper and glass
  tint. A page's name is its heading, typed straight into the list of pages:
  tile pages, rooms, Calendar, Cameras and Scenes have one, while Weather,
  Clock, Photos and Night fill the screen and don't. **+ Blank page** adds an
  empty page of tiles, turns to it and asks for its name; then **+ Add tile**
  fills it.
- **Done** saves, **Cancel** drops the changes.

Where Done saves:

- **Signed in as an admin**: into the dashboard's own config, so every tablet
  on that dashboard gets the change. The YAML you wrote is the starting point;
  after a save the dashboard's raw config shows the result. If the dashboard
  changed since LuxFrame loaded it, LuxFrame saves over its own card: the only
  LuxFrame card on the dashboard, or the only one in the view on screen.
- **Otherwise**, or on a dashboard managed in YAML: on this tablet only, and
  LuxFrame says so. When the dashboard's config changes, the tablet goes back
  to it. **Customize → Use the dashboard's layout** does that by hand.

If neither will take the change, because the browser won't store it either,
LuxFrame says so and stays in editing, so nothing is lost.

### Quick panel and Assist

**Pull down from the top edge**, or tap the small handle there, for the quick
panel. The whole band above the page title counts, and a short flick is
enough.

Along its top runs the **dock**, a row of glass icons, each opening its own
view on the stage under it. Tap another icon to switch, or the open one to
fold the stage away. The dock can hold:

- **What's playing** (`media`): artwork, title and artist, previous /
  play-pause / next, and volume. It follows whichever speaker is playing,
  Music Assistant's players first, unless you set `media_player`. Buttons the
  speaker can't use are dimmed, and the icon shows the artwork. Tap the
  artwork or title for the [speaker's details](#detail-pages).
- **A device's controls** (its entity id): the same controls as its details
  page, a little smaller, such as a thermostat's temperature and modes or a
  light's brightness and color. A speaker shows what's playing on it, like
  What's playing does.
- **Any Home Assistant card** (`card`), custom cards too, in LuxFrame's glass
  at its own height. `glass: false` keeps the card's own look.
- **Any LuxFrame tile** (`tile`), such as a camera, the weather or a room.
  `height` sets how tall it is, 300 pixels by default.

Out of the box the dock holds what's playing alone, and with only one item
there's no row of icons: it just shows.

Beside them, or under them when the tablet is upright:

- **Screen brightness**: in Kiosk Satellite this moves the tablet's backlight.
  Anywhere else LuxFrame dims itself with a dark veil, remembered per tablet.
  `brightness: false` hides it.
- **Pinned tiles**: up to eight, e.g. a light, a lock and a scene. They work
  like any tile.
- **Ask Home Assistant**.

The panel is as tall as what it shows, and grows or shrinks as you switch.
Taller than the screen, it scrolls.

Swipe the panel back up, tap below it, or press Escape to put it away. When it
scrolls, swipe up once you're at the end.

**Hold the top edge** for a second to go straight to **Ask Home Assistant**:
type a request ("turn off the kitchen lights") and read the answer. It uses
Assist (`conversation/process`), so follow-ups like "and the hallway" carry
on the same conversation. Voice stays with Kiosk Satellite or Voice Satellite.

```yaml
quick_panel:
  media_player: media_player.living_room   # optional
  dock:
    - media
    - climate.living_room                  # its controls
    - name: Front door
      tile:
        type: camera
        entity: camera.front_door
      height: 260
    - name: Coffee
      icon: mdi:coffee
      card:
        type: button
        entity: switch.coffee_maker
    - entity: cover.garage
      open: true                           # opens first while it shows
      visibility:
        - condition: state
          entity: cover.garage
          state: open
  pinned:
    - light.porch
    - lock.front_door
    - scene.movie
  brightness: false                        # hides the slider
assist:
  agent_id: conversation.home_assistant   # optional; true/false also work
```

Every dock item can have its own `name` and `icon`. The first one opens when
the panel comes down, unless another has `open: true`. `visibility` takes Home
Assistant's visibility conditions, as on [tiles](#home-assistant-cards): the
icon shows only while they're met. Without its own, a card's or tile's
`visibility` counts.

The dock, the pinned tiles, the brightness slider and the speaker can also be
set on the tablet, under **Customize → Quick panel**. **Add to the dock**
offers the same choices as adding a tile, and **Edit** sets an item's name,
icon and card, whether it opens first, and its YAML.

### Card options

| Option       | Default                                    | Notes                                               |
| ------------ | ------------------------------------------ | --------------------------------------------------- |
| `pages`      | (required)                                 | At least one page.                                  |
| `theme`      | `auto`                                     | `auto`, `light`, `dark`, or `ha`. See [Theming](#theming). |
| `background` | a soft gradient                            | Any CSS background, e.g. `center / cover url('/local/wall.jpg')`. |
| `tint`       | the background image's average color       | The color the glass picks up, e.g. `"#e07a2c"`.      |
| `home_after` | `120`                                      | Seconds without a touch before going back to the start page. |
| `height`     | `calc(100dvh - var(--header-height, 0px))` | Becomes `100dvh` when Kiosk Satellite hides HA's header. |
| `quick_panel` | on: what's playing, nothing pinned        | `dock`, `pinned`, `brightness`, `media_player`; `false` turns the panel off. See [Quick panel](#quick-panel-and-assist). |
| `badges`     | none                                       | [Badges](#badges) on every page with a title bar.    |
| `badge_align` | `right`                                   | `left`, `center` or `right`: where badges sit in the title bar. A page's own `badge_align` wins. |
| `badge_style` | `pill`                                    | `plain` shows badges with no background. A page's own `badge_style` wins. |
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
`luxframe.js`, and uses the version's changelog section as the release notes,
which Home Assistant shows with the update. `node scripts/release-notes.mjs
vX.Y.Z` prints them.
