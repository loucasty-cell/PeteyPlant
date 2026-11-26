import {
  CalendarCheck,
  Camera,
  Home,
  MoreHorizontal,
  Plus,
  Sprout,
} from 'lucide-react';
import { PeteyLogo } from './PeteyLogo';
import type { PrimaryView } from './gardenShellShared';

export function GardenSidebar({
  view,
  plantsCount,
  alertsCount,
  connectionReady,
  onNavigate,
  onAddPlant,
}: {
  view: PrimaryView;
  plantsCount: number;
  alertsCount: number;
  connectionReady: boolean;
  onNavigate: (view: PrimaryView) => void;
  onAddPlant: () => void;
}) {
  return (
    <aside className="petey-sidebar" aria-label="Main navigation">
      <div>
        <button type="button" className="petey-sidebar-brand" onClick={() => onNavigate('home')}>
          <PeteyLogo size={32} title="Petey Plant logo" />
          <span>Petey Plant</span>
        </button>

        <nav className="petey-sidebar-nav" aria-label="Primary">
          <button
            type="button"
            className="petey-sidebar-item"
            aria-current={view === 'home' || view === 'detail' ? 'page' : undefined}
            onClick={() => onNavigate('home')}
          >
            <span className="petey-sidebar-item-left">
              <Home className="h-4 w-4" aria-hidden="true" /> Home
            </span>
          </button>

          <button
            type="button"
            className="petey-sidebar-item"
            aria-current={view === 'garden' ? 'page' : undefined}
            onClick={() => onNavigate('garden')}
          >
            <span className="petey-sidebar-item-left">
              <Sprout className="h-4 w-4" aria-hidden="true" /> My Garden
            </span>
            {plantsCount > 0 && <span className="text-caption font-mono opacity-75">{plantsCount}</span>}
          </button>

          <button
            type="button"
            className="petey-sidebar-item petey-sidebar-lens"
            aria-current={view === 'lens' ? 'page' : undefined}
            onClick={() => onNavigate('lens')}
          >
            <span className="petey-sidebar-item-left">
              <Camera className="h-4 w-4" aria-hidden="true" /> Petey Lens
            </span>
          </button>

          <button
            type="button"
            className="petey-sidebar-item"
            aria-current={view === 'care' ? 'page' : undefined}
            onClick={() => onNavigate('care')}
          >
            <span className="petey-sidebar-item-left">
              <CalendarCheck className="h-4 w-4" aria-hidden="true" /> Care & Alerts
            </span>
            {alertsCount > 0 && <span className="petey-sidebar-count">{alertsCount}</span>}
          </button>

          <button
            type="button"
            className="petey-sidebar-item"
            aria-current={view === 'more' ? 'page' : undefined}
            onClick={() => onNavigate('more')}
          >
            <span className="petey-sidebar-item-left">
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" /> More
            </span>
          </button>
        </nav>
      </div>

      <div className="petey-stack">
        <button
          type="button"
          className="hs-btn-subtle w-full"
          disabled={!connectionReady}
          onClick={onAddPlant}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add plant
        </button>
      </div>
    </aside>
  );
}

export function GardenBottomNav({
  view,
  alertsCount,
  onNavigate,
}: {
  view: PrimaryView;
  alertsCount: number;
  onNavigate: (view: PrimaryView) => void;
}) {
  return (
    <nav className="petey-bottom-nav" aria-label="Primary mobile navigation">
      <button
        type="button"
        className="petey-nav-tab"
        aria-current={view === 'home' || view === 'detail' ? 'page' : undefined}
        onClick={() => onNavigate('home')}
      >
        <Home className="h-5 w-5" aria-hidden="true" />
        <span>Home</span>
      </button>

      <button
        type="button"
        className="petey-nav-tab"
        aria-current={view === 'garden' ? 'page' : undefined}
        onClick={() => onNavigate('garden')}
      >
        <Sprout className="h-5 w-5" aria-hidden="true" />
        <span>My Garden</span>
      </button>

      <button
        type="button"
        className="petey-nav-lens-tab"
        aria-current={view === 'lens' ? 'page' : undefined}
        onClick={() => onNavigate('lens')}
        aria-label="Open Petey Lens camera identification"
      >
        <span className="petey-nav-lens-disc" aria-hidden="true">
          <Camera className="h-5 w-5" />
        </span>
        <span>Petey Lens</span>
      </button>

      <button
        type="button"
        className="petey-nav-tab"
        aria-current={view === 'care' ? 'page' : undefined}
        onClick={() => onNavigate('care')}
      >
        <CalendarCheck className="h-5 w-5" aria-hidden="true" />
        <span>Care</span>
        {alertsCount > 0 && <span className="petey-nav-badge">{alertsCount}</span>}
      </button>

      <button
        type="button"
        className="petey-nav-tab"
        aria-current={view === 'more' ? 'page' : undefined}
        onClick={() => onNavigate('more')}
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
        <span>More</span>
      </button>
    </nav>
  );
}
