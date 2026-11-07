import './tile';
import './tiles/clocks';
import './tiles/thermostat';
import './tiles/weather';
import './tiles/calendar';
import './tiles/media';
import './tiles/home';
import './tiles/card';
import './pages/clock';
import './pages/grid';
import './pages/room';
import './pages/scenes';
import './pages/weather';
import './pages/calendar';
import './pages/scenery';
import './slider';
import './detail/detail';
import './detail/light';
import './detail/fan';
import './detail/cover';
import './detail/climate';
import './detail/lock';
import './detail/generic';
import './luxframe-card';
import { kiosk } from './kiosk';
import { BUILD } from './version';

declare global {
  interface Window {
    customCards?: Array<{ type: string; name: string; description: string; preview?: boolean }>;
  }
}

window.customCards = window.customCards ?? [];
if (!window.customCards.some((card) => card.type === 'luxframe-card')) {
  window.customCards.push({
    type: 'luxframe-card',
    name: 'LuxFrame',
    description: 'A calm, swipeable wall-tablet dashboard.',
  });
}

console.info(
  `%c LuxFrame %c ${BUILD}${kiosk ? ` · Kiosk Satellite ${kiosk.version}` : ''} `,
  'background:#e39b2f;color:#1d1c1a;font-weight:600;border-radius:3px 0 0 3px',
  'background:#1d1c1a;color:#f3f1ec;border-radius:0 3px 3px 0',
);
