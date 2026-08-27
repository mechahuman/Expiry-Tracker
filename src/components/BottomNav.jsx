import { NavLink, useNavigate } from 'react-router-dom'
import './BottomNav.css'

/**
 * The five-slot tab bar from the design: four destinations either side of a
 * raised "Add Food" button.
 *
 * Icons are inline SVG rather than emoji. The rest of the design leans on
 * emoji heavily, but emoji render differently on every platform and at nav
 * size that inconsistency is very visible -- these need to look identical on
 * Android, iOS and desktop.
 */
export default function BottomNav() {
  const navigate = useNavigate()

  return (
    <nav className="bottom-nav" aria-label="Main">
      <Tab to="/home" label="Home" icon={IconHome} />
      <Tab to="/food" label="My Food" icon={IconList} />

      <button
        type="button"
        className="nav-fab"
        onClick={() => navigate('/add')}
        aria-label="Add food"
      >
        <IconPlus />
      </button>

      <Tab to="/alerts" label="Alerts" icon={IconBell} />
      <Tab to="/rewards" label="Progress" icon={IconChart} />
    </nav>
  )
}

function Tab({ to, label, icon: Icon }) {
  return (
    <NavLink to={to} className={({ isActive }) => `nav-tab${isActive ? ' active' : ''}`}>
      <Icon />
      <span>{label}</span>
    </NavLink>
  )
}

/* 24px stroke icons, sharing one set of attributes so their weights match. */
const svg = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
}

function IconHome() {
  return (
    <svg {...svg}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20h14V9.5" />
    </svg>
  )
}

function IconList() {
  return (
    <svg {...svg}>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
    </svg>
  )
}

function IconPlus() {
  return (
    <svg {...svg} strokeWidth={2.5}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function IconBell() {
  return (
    <svg {...svg}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  )
}

function IconChart() {
  return (
    <svg {...svg}>
      <path d="M3 20h18" />
      <path d="M7 20v-6M12 20V7M17 20v-9" />
    </svg>
  )
}
