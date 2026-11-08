# Changelog

All notable changes to LuxFrame are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- A card tile with its own background (`glass: false`) shows the card's glow
  and shadow past the tile's edge, as on a dashboard, instead of cutting them
  off. `fit: scroll` and `fit: cover` still keep to the tile.

## [0.8.3] - 2026-11-08

### Added

- When a newer LuxFrame is installed through HACS, a notice offers to reload,
  so a kiosk tablet that never refreshes picks up the update. It checks soon
  after loading, every half hour and when the screen wakes; ✕ puts it away
  until the next version. It's hidden while editing.

### Fixed

- Starting or finishing editing keeps the page on screen. When Home
  Assistant moved LuxFrame as it laid the dashboard out again, the browser
  put the pages back at the first one, and LuxFrame took that for a swipe.
  It also stopped following the tablet turning after such a move.

## [0.8.2] - 2026-11-08

### Added

- A card tile's settings switch between **Visual editor**, the card's own
  editor as Home Assistant shows it, and **YAML**. Custom cards with an
  editor work too; a card without one opens in YAML.
- A badge's settings include its YAML, so visibility conditions, an action
  and an icon can be set on the tablet.

### Fixed

- After Done, the frame stays on the page that was being edited. Saving to
  the dashboard makes Home Assistant rebuild LuxFrame, which used to open on
  the start page.

## [0.8.1] - 2026-11-08

### Added

- `badge_align` (`left`, `center`, `right`) places the badges in the title
  bar, and `badge_style: plain` shows them with no background. Both are under
  Look in Customize.

## [0.8.0] - 2026-11-08

### Added

- Badges in the title bar of tile pages, rooms, Calendar, Cameras and Scenes:
  an entity's icon and short state ("21°"), set per page or for every page.
  A tap opens details, switches the entity (`tap: toggle`), or runs a scene,
  script, button or `action`, then shows Done; holding opens Home Assistant's
  dialog. They take visibility conditions. While editing, **+ Badge** adds
  one, and tapping one sets its name, tap, pages and place.

### Changed

- A room's `sensors` show as badges, which open their details when tapped.

## [0.7.0] - 2026-11-08

### Added

- Tiles honor Home Assistant's visibility conditions (`state`,
  `numeric_state`, `screen`, `user`, `time`, `and`/`or`/`not`): a tile shows
  only while they're met, and the tiles after it close up. A card copied from
  a dashboard keeps its `visibility`, and any tile can have its own. While
  editing, a hidden tile shows faded.
- A start page: `home: true` on a page, or ⌂ in Customize's list of pages.
  The frame opens on it and goes back to it when idle, instead of the first
  page.
- `fit: scroll` (**Scroll** in the tile editor) keeps a tall card full size
  and scrolls it inside its tile, as `stretch` used to.

### Changed

- A card tile taller than its tile shrinks to fit (`fit: stretch`, the
  default) instead of scrolling, so nothing is cut off on a tablet with
  shorter rows. It fills the tile again once there's room.

## [0.6.0] - 2026-11-07

### Added

- Pages can be renamed from Customize, straight in the list of pages: tile
  pages, rooms, Calendar, Cameras and Scenes, which show their name as a
  heading. Clearing a name brings back the default heading; a room keeps its
  name.
- **+ Blank page** (formerly **+ Tiles**) adds an empty page of tiles, turns
  to it and puts its name field ready to type in. Any page added from
  Customize is turned to.

### Changed

- The title field moved from Customize's This page section into the list
  of pages, where every page that has a heading can be named.

## [0.5.3] - 2026-11-07

### Fixed

- Swiping sideways on a Home Assistant card turns the page, as it does on
  LuxFrame's own tiles. A card taller than its tile used to keep the swipe
  for itself. Scrolling up and down inside the card works as before.
- The analog clock fits a tile that's wider than it is tall, such as on a
  landscape tablet, instead of running off the bottom.

## [0.5.2] - 2026-11-07

### Fixed

- A second save in a row could miss the dashboard and land on the tablet
  only ("LuxFrame couldn't find itself in the dashboard"), and a refresh then
  lost it. LuxFrame now treats what it saved as its starting point, and when
  its card in the dashboard has changed since it loaded, it saves over it:
  the only LuxFrame card on the dashboard, or the only one in the view on
  screen. The browser console lists what had changed.
- When the browser won't store a tablet-only save, LuxFrame says the change
  wasn't saved and stays in editing, instead of reporting it saved.

## [0.5.1] - 2026-11-07

### Changed

- `fit: cover` on Home Assistant's picture cards (`picture`,
  `picture-entity`, `picture-glance`, `picture-elements`) crops the picture
  to the tile's shape instead of scaling the whole card, so badges near the
  edges stay inside the tile. It follows the tile when it's resized or the
  tablet turns. A card with its own `aspect_ratio` is scaled as before.

## [0.5.0] - 2026-11-07

### Added

- `fit` for card tiles: `cover` scales the whole card to fill the tile and
  trims the edges, `contain` shows all of it centered, and `stretch` (the
  default) works as before. With `cover`, a picture card with badges fills
  its tile instead of leaving empty glass below the picture. The tile editor
  has the same choice under Fit.

## [0.4.0] - 2026-11-07

### Added

- Tiles can be any size: `size: 3x2` is three columns by two rows, up to the
  grid's width and 8 rows tall. The presets still work.
- While editing, each tile has a corner handle; drag it to resize the tile a
  column or row at a time.
- The tile editor has Width and Height steppers beside the presets.

## [0.3.1] - 2026-11-07

### Added

- Holding still for a second on a clock, weather, calendar, cameras, photos or
  night page, or on a room or scenes page around its tiles, starts editing, so
  Customize can be reached from every page.

## [0.3.0] - 2026-11-07

### Added

- **Add tile → From your dashboards** lists the cards on your dashboards; a
  tap copies one into a card tile, sized from its place in a sections view.

### Changed

- **Paste a card's YAML** moved from Widgets to the top of From your
  dashboards.

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

[Unreleased]: https://github.com/wallacegsr/luxframe/compare/v0.8.3...HEAD
[0.8.3]: https://github.com/wallacegsr/luxframe/compare/v0.8.2...v0.8.3
[0.8.2]: https://github.com/wallacegsr/luxframe/compare/v0.8.1...v0.8.2
[0.8.1]: https://github.com/wallacegsr/luxframe/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/wallacegsr/luxframe/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/wallacegsr/luxframe/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/wallacegsr/luxframe/compare/v0.5.3...v0.6.0
[0.5.3]: https://github.com/wallacegsr/luxframe/compare/v0.5.2...v0.5.3
[0.5.2]: https://github.com/wallacegsr/luxframe/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/wallacegsr/luxframe/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/wallacegsr/luxframe/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/wallacegsr/luxframe/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/wallacegsr/luxframe/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/wallacegsr/luxframe/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/wallacegsr/luxframe/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/wallacegsr/luxframe/releases/tag/v0.1.0
