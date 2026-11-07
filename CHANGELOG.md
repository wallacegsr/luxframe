# Changelog

All notable changes to LuxFrame are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-11-07

### Added

- `card` tiles hold any Home Assistant card, custom cards included, on glass
  by default (`glass: false` keeps the card's own look). On the tablet,
  **Add tile → Home Assistant card** takes the card's YAML.
- Thermostat tiles show mode buttons on medium and large sizes.
- The thermostat panel adds fan modes, presets and swing where the thermostat
  has them.

### Changed

- Thermostat tiles stay glass instead of turning white while on. What it's
  doing ("Heat · Heating") shows in the mode's color, with a soft glow to
  match: orange for heat, blue for cool.
- A heat/cool thermostat's tile shows its range, such as 20–24.

## [0.1.0] - 2026-11-07

### Added

- `luxframe-card`: a full-height frame of pages you swipe between, with page
  dots, arrow keys and an idle return to page 1.
- Grid pages: `rows` × `columns` of tiles sized `s`, `w`, `m` or `l`, filling
  the screen. In portrait, `portrait_rows` keeps tiles close to square.
- Grid tiles: entity, thermostat (large target, ▼/▲, current temperature and
  area), weather, digital clock, and an analog clock drawn on the background.
- Clock, room and scenes pages.
- Entity tiles: icon centered over the name and the area, with the area
  dropped from the front of the name. Tap the icon to toggle, tap the name for
  details, and drag up or down to set a light's, shade's or fan's level. A
  running fan's icon spins at its speed. Locks and garage, door and gate
  covers only open their details. Holding a tile on a grid page starts
  editing; on room and scenes pages it opens the details.
- A dragged level stays on screen until the device reports it, for up to 5
  seconds, so fading bulbs don't jump back. Quick thermostat taps go to Home
  Assistant as one change.
- A frosted-glass default look inspired by visionOS: translucent blurred tiles
  on a soft gradient, white text, and bright tiles for things that are on, in
  light and dark variants.
- `background` option for your own wallpaper behind the pages, and `tint` for
  the glass color, which otherwise comes from the wallpaper's average color.
- Theming through Home Assistant: any HA theme can set `luxframe-*` variables,
  and `theme: ha` borrows the active HA theme's colors, corners, blur and font.
- Kiosk Satellite bridge: follows its theme, goes back to page 1 on wake, and
  fills the screen when HA's header is hidden.
- Version and commit stamped into the bundle and shown on the clock page.
- HACS metadata and a tag-triggered release workflow.
- Detail pages in LuxFrame's glass look for lights (brightness, white and
  color swatches, hue and warmth), fans (speed, presets, oscillation), shades
  (position, open, stop, close), thermostats (target or range, modes), locks
  and everything else. Unlocking and opening a garage, door or gate ask for a
  second tap. Close with ✕, a swipe down or Escape; ⋯ opens Home Assistant's
  own dialog.
- Editing on the tablet: hold a grid tile and the tiles wiggle. Drag to move,
  tap to resize, rename, change or remove, add tiles from a searchable list,
  and Customize pages (title, columns, rows, show/hide, order, add, delete),
  the theme, wallpaper and tint. Done saves to the dashboard for admins, and
  on that tablet for everyone else or on YAML dashboards.
- Suggested pages: one grid page for each Home Assistant area without one,
  built from the thermostat, lights, fans, shades, locks, switches, media and
  scenes in it.
- `hidden: true` on a page keeps it out of the frame.
- Quick panel, pulled down from the top edge or opened from its handle: now
  playing with previous / play-pause / next and volume (following whichever
  speaker is playing, Music Assistant first, or `media_player`), screen
  brightness, up to four pinned tiles, and Ask Home Assistant. Set it with
  `quick_panel` or under Customize.
- Screen brightness moves the backlight in Kiosk Satellite; elsewhere a dark
  veil dims the frame, remembered per tablet.
- Ask Home Assistant: hold the top edge, or tap Ask in the quick panel, and
  type a request to Assist. Follow-ups carry on the same conversation.
  `assist: false` hides it, and `assist: {agent_id}` picks the agent.
- Tiles: calendar (up next, or the month with busy days marked), now
  playing, camera stills, a photo slideshow from a media folder, sunrise and
  sunset, to-do lists you can tick off, and rooms (temperature and lights,
  with the icon switching the room's lights). Calendar and room tiles open
  their pages.
- Pages: weather (now, 12 hours, the week), a calendar agenda, cameras,
  full-screen photos with the time, and a dim night clock that drifts to
  spare the screen.
- Plain messages when something is missing, such as "No calendar" or "No
  photos in local/holiday".
- `style`: `glass`, `flat` (solid tiles, no blur), or `auto`, which goes flat
  on devices that can't blur or blur too slowly.
- The editor adds the new tiles (Widgets and Rooms) and pages (Weather,
  Calendar, Cameras, Photos, Night, Clock).

[Unreleased]: https://github.com/wallacegsr/luxframe/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/wallacegsr/luxframe/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/wallacegsr/luxframe/releases/tag/v0.1.0
