# Roadmap

What LuxFrame takes from Rehome (rehome-app/rehome-addons, its docs and
changelog, and a demo video), and in what order. LuxFrame matches what Rehome
does, with its own names and look. It doesn't copy Rehome's wallpapers,
artwork or face names.

## Decisions

- **Layout:** a new `grid` page type (rows × columns, tiles sized Small, Wide,
  Medium or Large, any tile kind). The `clock`, `room` and `scenes` pages stay
  as they are.
- **Gestures:** tap a tile's icon to toggle. Tap its name to open LuxFrame's
  own full-screen detail page. Drag up or down on a light, shade or fan to set
  its level. Hold for 1 s to rearrange.
- **Editing:** the dashboard's YAML is the base. Changes made on the tablet
  save back to Home Assistant, so every tablet on that dashboard shares them.
  Saving needs an admin login.
- **Tile style:** the icon centered above the name and the area. The glass is
  tinted by the background, and tiles for things that are on turn opaque.

## Phase 1: grid foundation (done)

- `grid` page: `rows`, `columns`, and tiles with `size: s | w | m | l`.
- New tile style: centered icon, name and area subtitle, tinted glass, an
  "on" state that turns opaque, and a spinning fan icon while the fan runs.
- Tile kinds: entity, thermostat (large setpoint, ▲/▼, current temperature
  and area), analog clock (drawn on the background, no glass), digital clock,
  weather.
- Gestures: icon toggles, name opens the detail view (HA's dialog until
  phase 2), drag to set a level.
- Area names from Home Assistant's area registry.
- Also added: `portrait_rows` for an upright tablet, and the glass tint taken
  from the wallpaper's average color, or the `tint` option.

## Phase 2: detail pages (done)

- LuxFrame's own glass pages for light (brightness, color and white, Turn
  On/Off), fan (speed), shade (position), thermostat (setpoint and mode), lock
  (with confirmation) and a generic fallback.
- A round ✕ at the top left, and swiping down also closes the page.
- Show the value you chose until the device reports it, so a bulb that fades
  doesn't seem to jump back.

## Phase 3: editing on the tablet (done)

- Hold a tile for 1 s: tiles wiggle; drag to move, tap to resize (S/W/M/L) or
  change what it shows; **+** adds a tile; **Customize** sets rows, the
  background and which pages show; **Done** saves.
- Saves the card's config back to the dashboard (`lovelace/config/save`).
  Without admin rights the edit is kept on that tablet and LuxFrame says so.
- Suggested layouts built from Home Assistant's areas.

## Phase 4: quick panel and Assist (done)

- Pull down from the top edge: now playing, a screen-dim slider (Kiosk
  Satellite brightness when present, otherwise a dimming overlay), speaker
  volume, a pinned light, lock and scene.
- Ask Home Assistant: hold the top of a page or tap the button in the quick
  panel, then type a request (`conversation/process`). Voice stays with Kiosk
  Satellite and Voice Satellite.

## Phase 5: more tiles and pages

- Tiles: calendar (up next, month), now playing (following one speaker, Music
  Assistant first, with buttons dimmed when the speaker can't do them),
  camera, photo (from HA's media folder), sunrise and sunset, to-do lists,
  room (one tile per area).
- Pages: weather, calendar, cameras, photos, and a calm night page.
- Clear messages when something is missing: "No weather", "No calendar".
- `style: flat` (solid tiles, no blur), chosen automatically when the device
  can't blur or animations stutter.

## Not planned

- Rehome's licensing, its add-on server, pairing old iPads, and direct access
  on port 8099. LuxFrame runs inside Home Assistant's own frontend, and Kiosk
  Satellite opens it on the tablet.
- Classic mode for very old Safari. The target is Android WebView.
- Music-account setup screens. Accounts stay in Home Assistant and Music
  Assistant.
- An iPad-style home screen of apps (Timers, Lists and so on). Possible later
  as extra pages.
- Intercom. Rehome removed it too.
