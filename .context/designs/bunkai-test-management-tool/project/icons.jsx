// Tiny stroke-2 icon set. All 14px by default, accept size/color via props.
const I = (paths, vb = '0 0 24 24') => ({ size = 14, color = 'currentColor', style, ...rest }) => (
  <svg width={size} height={size} viewBox={vb} fill="none" stroke={color}
       strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
       style={{ flexShrink: 0, ...style }} {...rest}>{paths}</svg>
);

const Icon = {
  Home:       I(<><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></>),
  Folder:     I(<><path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z" /></>),
  FolderOpen: I(<><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2H3z" /><path d="M3 9h18l-2 9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z" /></>),
  Library:    I(<><path d="M4 4v16M9 4v16M14 4l5 16" /></>),
  Play:       I(<><polygon points="6 4 20 12 6 20 6 4" /></>),
  Bug:        I(<><path d="M8 6V4a4 4 0 0 1 8 0v2" /><rect x="5" y="6" width="14" height="13" rx="6" /><path d="M3 11h2M19 11h2M3 16h2M19 16h2M12 6v13" /></>),
  Chart:      I(<><path d="M4 20V8M10 20V4M16 20v-7M22 20H2" /></>),
  Settings:   I(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1A1.7 1.7 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h.1a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>),
  Search:     I(<><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>),
  Plus:       I(<><path d="M12 5v14M5 12h14" /></>),
  ChevronDown:I(<><polyline points="6 9 12 15 18 9" /></>),
  ChevronRight:I(<><polyline points="9 6 15 12 9 18" /></>),
  ChevronLeft:I(<><polyline points="15 6 9 12 15 18" /></>),
  Close:      I(<><path d="M6 6l12 12M18 6L6 18" /></>),
  Check:      I(<><polyline points="20 6 9 17 4 12" /></>),
  X:          I(<><path d="M18 6L6 18M6 6l12 12" /></>),
  Hash:       I(<><path d="M5 9h14M5 15h14M10 4L8 20M16 4l-2 16" /></>),
  Tree:       I(<><path d="M4 6h7M4 12h7M4 18h7M14 6h6M14 12h6M14 18h6" /></>),
  Table:      I(<><rect x="3" y="4" width="18" height="16" rx="1" /><path d="M3 10h18M3 16h18M9 4v16M15 4v16" /></>),
  Graph:      I(<><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><circle cx="6" cy="18" r="2.5" /><circle cx="12" cy="12" r="2.5" /><path d="M8 7l3 3.5M16 7l-3 3.5M16 17l-3-3.5M8 17l3-3.5" /></>),
  More:       I(<><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></>),
  GripV:      I(<><circle cx="9" cy="6" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="9" cy="18" r="1" /><circle cx="15" cy="6" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="18" r="1" /></>),
  Github:     I(<><path d="M9 19c-4 1.5-4-2-6-2.5M15 22v-3.9a3.4 3.4 0 0 0-.9-2.6c3.1-.4 6.4-1.6 6.4-7A5.4 5.4 0 0 0 19 4.8 5 5 0 0 0 18.9 1S17.7.7 15 2.5a13.4 13.4 0 0 0-7 0C5.3.7 4.1 1 4.1 1A5 5 0 0 0 4 4.8 5.4 5.4 0 0 0 2.5 8.5c0 5.4 3.3 6.6 6.4 7A3.4 3.4 0 0 0 8 18.1V22" /></>),
  Google:     I(<><path d="M21.8 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.5a4.7 4.7 0 0 1-2 3.1v2.6h3.3a10 10 0 0 0 3-7.5z" /><path d="M12 22a9.8 9.8 0 0 0 6.8-2.5L15.5 17a6 6 0 0 1-9-3.1H3.1v2.6A10 10 0 0 0 12 22z" /><path d="M6.5 13.9a6 6 0 0 1 0-3.8V7.5H3.1a10 10 0 0 0 0 9z" /><path d="M12 6a5.4 5.4 0 0 1 3.8 1.5l2.9-2.9A10 10 0 0 0 12 2 10 10 0 0 0 3.1 7.5l3.4 2.6A6 6 0 0 1 12 6z" /></>),
  Terminal:   I(<><polyline points="4 7 9 12 4 17" /><path d="M12 19h8" /></>),
  ArrowRight: I(<><path d="M5 12h14M13 6l6 6-6 6" /></>),
  ArrowUpRight: I(<><path d="M7 17L17 7M7 7h10v10" /></>),
  Clock:      I(<><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></>),
  Filter:     I(<><path d="M3 5h18l-7 9v6l-4-2v-4z" /></>),
  Sort:       I(<><path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4" /></>),
  Run:        I(<><polygon points="5 4 19 12 5 20 5 4" /></>),
  Stop:       I(<><rect x="5" y="5" width="14" height="14" rx="1" /></>),
  Edit:       I(<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z" /></>),
  Eye:        I(<><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" /><circle cx="12" cy="12" r="3" /></>),
  Link:       I(<><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></>),
  Sparkle:    I(<><path d="M12 3v6M12 15v6M3 12h6M15 12h6M5.6 5.6l4.2 4.2M14.2 14.2l4.2 4.2M5.6 18.4l4.2-4.2M14.2 9.8l4.2-4.2" /></>),
  CMD:        I(<><path d="M9 5a3 3 0 1 0-3 3h3V5zM9 8v8M9 16a3 3 0 1 1-3 3v-3h3zM15 5a3 3 0 1 1 3 3h-3V5zM15 8v8M15 16a3 3 0 1 0 3 3v-3h-3z M9 8h6M9 16h6" /></>),
  Branch:     I(<><circle cx="6" cy="6" r="2" /><circle cx="6" cy="18" r="2" /><circle cx="18" cy="6" r="2" /><path d="M6 8v8M18 8c0 6-12 4-12 10" /></>),
  Box:        I(<><rect x="3" y="3" width="18" height="18" rx="2" /></>),
  Doc:        I(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></>),
  ChevronUp:  I(<><polyline points="18 15 12 9 6 15" /></>),
  Refresh:    I(<><polyline points="23 4 23 10 17 10" /><path d="M20.5 15A9 9 0 1 1 19 5.6L23 10" /></>),
  Pin:        I(<><path d="M12 17v5M9 3h6l-1 6 3 3v3H7v-3l3-3z" /></>),
  Layers:     I(<><polygon points="12 2 22 8 12 14 2 8 12 2" /><polyline points="2 14 12 20 22 14" /></>),
};

window.Icon = Icon;
