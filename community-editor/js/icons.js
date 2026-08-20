/* ============================================================
   dika studio — SVG Icons Module
   ============================================================ */

// ─── Part 1: UI Icons ────────────────────────────────────────
const ICONS = {

  /* ── Icon Rail ── */
  tools: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',

  frame: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="3" x2="9" y2="21"/></svg>',

  templates: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',

  text: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9.5" y1="20" x2="14.5" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>',

  background: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>',

  logo: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>',

  icons: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>',

  shape: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',

  images: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',

  qrcode: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/><line x1="21" y1="14" x2="21" y2="14.01"/><line x1="21" y1="18" x2="21" y2="21"/><line x1="17" y1="21" x2="17" y2="21.01"/><line x1="14" y1="21" x2="14" y2="21.01"/></svg>',
  barcode: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="5" x2="4" y2="19"/><line x1="7" y1="5" x2="7" y2="19"/><line x1="10" y1="5" x2="10" y2="19"/><line x1="13" y1="5" x2="13" y2="19"/><line x1="17" y1="5" x2="17" y2="19"/><line x1="20" y1="5" x2="20" y2="19"/><line x1="4" y1="19" x2="20" y2="19"/></svg>',

  patterns: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18" opacity="0.5"/></svg>',

  animate: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><line x1="9" y1="18" x2="15" y2="18"/><line x1="10" y1="22" x2="14" y2="22"/></svg>',

  /* ── Topbar ── */
  undo: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>',

  redo: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10"/></svg>',

  gear: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1.08 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1.08z"/></svg>',

  pencil: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>',

  download: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  share: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>',
  layers: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
  folder: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
  package: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 9.4 7.55 4.24"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/></svg>',
  upload: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',

  /* ── Toolbar Actions ── */
  duplicate: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',

  bringForward: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 11 12 6 7 11"/><polyline points="17 18 12 13 7 18"/></svg>',

  sendBackward: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 13 12 18 17 13"/><polyline points="7 6 12 11 17 6"/></svg>',

  bringToFront: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 11 12 6 17 11"/><line x1="12" y1="6" x2="12" y2="20"/></svg>',

  sendToBack: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 13 12 18 7 13"/><line x1="12" y1="18" x2="12" y2="4"/></svg>',

  lock: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',

  unlock: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>',

  trash: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>',

  /* ── Element Tools ── */
  heading: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4v16"/><path d="M18 4v16"/><path d="M6 12h12"/></svg>',

  body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/></svg>',

  rectangle: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>',

  circle: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg>',

  triangle: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>',

  diamond: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4.93" y="4.93" width="14.14" height="14.14" rx="1" transform="rotate(45 12 12)"/></svg>',

  star: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',

  line: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>',

  oval: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="12" rx="10" ry="6"/></svg>',

  wave: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12c3-6 6 6 10 0s7-6 10 0"/></svg>',

  blob: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3c5 0 9 3 9 9s-5 9-9 9-9-4-9-9 4-9 9-9z"/></svg>',

  arrow: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 9h8V5l6 7-6 7v-4H5z"/></svg>',

  heart: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',

  hexagon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l8.5 5v10L12 22l-8.5-5V7z"/></svg>',

  pentagon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l9.5 7-3.6 11H6.1L2.5 9z"/></svg>',
  octagon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7.86 2h8.28L22 7.86v8.28L16.14 22H7.86L2 16.14V7.86z"/></svg>',
  cross: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 2h6v7h7v6h-7v7H9v-7H2V9h7z"/></svg>',
  ring: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="5"/></svg>',
  shield: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  badge: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15a7 7 0 1 0 0-14 7 7 0 0 0 0 14z"/><path d="M8.21 13.89L7 23l5-3 5 3-1.21-9.12"/></svg>',
  ribbon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12l3-3h14l3 3-3 3H5z"/></svg>',
  crown: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7z"/><path d="M3 20h18"/></svg>',
  lightning: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9z"/></svg>',
  leaf: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 20A7 7 0 0 1 9.8 6.9C15.5 4.9 17 3.5 19 2c1 2 2 4.5 2 8 0 5.5-4.78 10-10 10z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>',
  flame: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
  droplet: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>',
  sun: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
  moon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
  cloudShape: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>',
  spiral: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 12c0-3 2-5 5-5s5 2 5 5-3 8-8 8-8-3-8-8 4-10 10-10"/></svg>',
  frame: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><rect x="7" y="7" width="10" height="10" rx="1"/></svg>',
  arch: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 21V10a8 8 0 0 1 16 0v11"/></svg>',
  trapezoid: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4h12l4 16H2z"/></svg>',
  parallelogram: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 4h14l-6 16H2z"/></svg>',
  whiteboard: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="3"/><path d="M7 8h4M7 12h6M7 16h3" opacity="0.5"/><circle cx="17" cy="7" r="2" opacity="0.5"/></svg>',

  /* ── Charts ── */
  charts: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><rect x="6" y="12" width="3" height="6" rx="0.5" opacity="0.6"/><rect x="10.5" y="8" width="3" height="10" rx="0.5" opacity="0.6"/><rect x="15" y="5" width="3" height="13" rx="0.5" opacity="0.6"/></svg>',

  /* ── Wireframe ── */
  wireframe: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="18" rx="2"/><line x1="2" y1="7" x2="22" y2="7"/><line x1="8" y1="7" x2="8" y2="21"/><rect x="10" y="9" width="10" height="4" rx="1" opacity="0.4"/><rect x="10" y="15" width="6" height="4" rx="1" opacity="0.4"/></svg>',
  'wf-templates': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="18" rx="2"/><line x1="2" y1="7" x2="22" y2="7"/><rect x="4" y="9" width="7" height="5" rx="1" opacity="0.5"/><rect x="13" y="9" width="7" height="5" rx="1" opacity="0.5"/><rect x="4" y="16" width="16" height="3" rx="1" opacity="0.3"/></svg>',
  'wf-elements': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="9" height="6" rx="1.5"/><rect x="13" y="2" width="9" height="6" rx="1.5"/><rect x="2" y="10" width="9" height="6" rx="1.5"/><rect x="13" y="10" width="9" height="6" rx="1.5"/><rect x="2" y="18" width="20" height="4" rx="1.5" opacity="0.4"/></svg>',

  image: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',

  video: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>',

  icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>',

  qr: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/><line x1="21" y1="14" x2="21" y2="14.01"/><line x1="21" y1="18" x2="21" y2="21"/><line x1="17" y1="21" x2="17" y2="21.01"/></svg>',

  /* ── Structure Panel ── */
  eye: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',

  eyeOff: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>',

  layers: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',

  move: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>',

  /* ── Context Menu / Misc ── */
  forward: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>',

  backward: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',

  close: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',

  search: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',

  import: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',

  export: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',

  keyboard: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" ry="2"/><line x1="6" y1="8" x2="6" y2="8.01"/><line x1="10" y1="8" x2="10" y2="8.01"/><line x1="14" y1="8" x2="14" y2="8.01"/><line x1="18" y1="8" x2="18" y2="8.01"/><line x1="6" y1="12" x2="6" y2="12.01"/><line x1="10" y1="12" x2="10" y2="12.01"/><line x1="14" y1="12" x2="14" y2="12.01"/><line x1="18" y1="12" x2="18" y2="12.01"/><line x1="8" y1="16" x2="16" y2="16"/></svg>',

  info: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',

  'list-filter': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5h20"/><path d="M6 12h12"/><path d="M9 19h6"/></svg>',

  check: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',

  plus: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',

  minus: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>',

  zoomIn: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>',

  zoomOut: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>',

  save: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>',

  reset: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/></svg>',

  /* ── Product Type Icons ── */
  card: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="6" y1="10" x2="10" y2="10"/><line x1="6" y1="13" x2="14" y2="13"/><circle cx="18" cy="9" r="2"/></svg>',
  logo: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12l2.5 3L16 9"/></svg>',
  cv: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="13" y2="14"/><line x1="8" y1="18" x2="11" y2="18"/></svg>',
  invoice: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h8l4 4v14H5V3h2z"/><path d="M15 3v5h5"/><line x1="8" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="16" y2="15"/><line x1="8" y1="19" x2="13" y2="19"/></svg>',
  social: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1.5"/></svg>',
  story: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="3"/><line x1="10" y1="18" x2="14" y2="18"/></svg>',
  banner: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="6" width="22" height="12" rx="2"/><line x1="5" y1="10" x2="12" y2="10"/><line x1="5" y1="14" x2="9" y2="14"/></svg>',
  email: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="22 4 12 13 2 4"/></svg>',

  phone: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',

  globe: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',

  mapPin: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',

  user: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',

  briefcase: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',

  /* ── Social Media Platform Icons ── */
  linkedin: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 11v5"/><path d="M8 8v.01"/><path d="M12 16v-5"/><path d="M16 16v-3a2 2 0 0 0-4 0"/></svg>',
  instagram: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/></svg>',
  twitter: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4l6.5 8L4 20h2l5.5-6.8L16 20h4l-6.8-8.5L19.5 4H18l-5 6.2L9 4z"/></svg>',
  facebook: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>',

  custom: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="4 2"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="12" y1="9" x2="12" y2="15"/></svg>',
  pageAdd: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>',

  chevronRight: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',

  grip: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>',

  group: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="8" height="8" rx="1"/><rect x="14" y="14" width="8" height="8" rx="1"/><path d="M10 6h4M18 6h0M6 14v-4M6 18h0" opacity="0.4"/></svg>',

  /* ── Front / Back / Split ── */
  front: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="14" y2="12"/></svg>',

  back: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="12" y2="16"/></svg>',

  split: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/></svg>',

  folder: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
  folderPlus: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>',
  folderUp: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/><path d="M12 10v6"/><path d="m9 13 3-3 3 3"/></svg>',
  tag: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',
  clock: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
};


// ─── Part 2: Canvas Icon Picker SVG Path Data ───────────────
const CANVAS_ICONS = {

  'Social Media': {
    'Facebook': {
      path: 'M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z',
      viewBox: '0 0 24 24'
    },
    'Instagram': {
      path: 'M17.5 6.5h.01 M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5z M16 11.37a4 4 0 1 1-7.914 1.174A4 4 0 0 1 16 11.37z',
      viewBox: '0 0 24 24'
    },
    'Twitter': {
      path: 'M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z',
      viewBox: '0 0 24 24'
    },
    'LinkedIn': {
      path: 'M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z M2 9h4v12H2z M4 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4z',
      viewBox: '0 0 24 24'
    },
    'YouTube': {
      path: 'M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19.1c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.43z M9.75 15.02l5.75-3.27-5.75-3.27v6.54z',
      viewBox: '0 0 24 24'
    },
    'TikTok': {
      path: 'M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5',
      viewBox: '0 0 24 24'
    },
    'GitHub': {
      path: 'M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22',
      viewBox: '0 0 24 24'
    },
    'Dribbble': {
      path: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M2.05 12.05h4.1 M8.54 2.82s1.84 4.28 2.1 9.18 M19.46 5.3S14.7 8.44 9.5 8.44 M21.95 12.05h-4.1 M15.46 21.18s-1.84-4.28-2.1-9.18 M4.54 18.7S9.3 15.56 14.5 15.56',
      viewBox: '0 0 24 24'
    },
    'WhatsApp': {
      path: 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2z',
      viewBox: '0 0 24 24'
    },
    'Telegram': {
      path: 'M22 2L11 13 M22 2l-7 20-4-9-9-4 20-7z',
      viewBox: '0 0 24 24'
    },
    'Pinterest': {
      path: 'M12 2a10 10 0 0 0-3.64 19.33c-.1-.83-.18-2.1.04-3l1.33-5.63s-.34-.68-.34-1.68c0-1.58.92-2.76 2.06-2.76.97 0 1.44.73 1.44 1.6 0 .98-.62 2.44-.94 3.8-.27 1.13.56 2.05 1.67 2.05 2 0 3.54-2.11 3.54-5.16 0-2.7-1.94-4.58-4.71-4.58-3.21 0-5.09 2.41-5.09 4.89 0 .97.37 2.01.84 2.57.09.11.1.21.08.32l-.31 1.28c-.05.21-.17.25-.38.15-1.4-.65-2.27-2.7-2.27-4.35 0-3.53 2.56-6.78 7.39-6.78 3.88 0 6.89 2.77 6.89 6.46 0 3.86-2.43 6.96-5.81 6.96-1.13 0-2.2-.59-2.57-1.29l-.7 2.66c-.25.98-.94 2.2-1.4 2.95A10 10 0 1 0 12 2z',
      viewBox: '0 0 24 24'
    },
    'Snapchat': {
      path: 'M12 2c-2.7 0-4.5 1.3-5.2 3.8-.3 1-.3 2.7-.1 4.2-1.1-.1-2.2-.4-2.5.4-.3.8.4 1.3 1.5 1.8.5.2 1.3.5 1.1 1-.3.8-1.5 2.8-3.5 3.5-.4.2-.6.5-.5.9.2.5.9.7 2 .8.5.1 1.1.1 1.2.6.1.3.1.7.6.9.6.3 1.5-.1 2.7-.1 1.5 0 2.3 1.2 4.7 1.2s3.2-1.2 4.7-1.2c1.2 0 2.1.4 2.7.1.5-.2.5-.6.6-.9.1-.5.7-.5 1.2-.6 1.1-.1 1.8-.3 2-.8.1-.4-.1-.7-.5-.9-2-.7-3.2-2.7-3.5-3.5-.2-.5.6-.8 1.1-1 1.1-.5 1.8-1 1.5-1.8-.3-.8-1.4-.5-2.5-.4.2-1.5.2-3.2-.1-4.2C16.5 3.3 14.7 2 12 2z',
      viewBox: '0 0 24 24'
    },
    'X': {
      path: 'M4 4l11.733 16H20L8.267 4H4z M4 20l6.768-6.768 M20 4l-6.768 6.768',
      viewBox: '0 0 24 24'
    },
    'Discord': {
      path: 'M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z',
      viewBox: '0 0 24 24'
    },
    'Reddit': {
      path: 'M12 8.5c-3.6 0-6.5 2-6.5 4.5 0 1.2.6 2.3 1.6 3.1-.1.4-.4 1.4-.4 1.4l1.8-.8c.5.2 1.1.3 1.7.4.5 0 1.2.1 1.8.1s1.3-.1 1.8-.1c.6-.1 1.2-.2 1.7-.4l1.8.8s-.3-1-.4-1.4c1-.8 1.6-1.9 1.6-3.1 0-2.5-2.9-4.5-6.5-4.5z M9.5 12a1 1 0 1 1 0 2 1 1 0 0 1 0-2z M14.5 12a1 1 0 1 1 0 2 1 1 0 0 1 0-2z M9.5 15.5s.8 1 2.5 1 2.5-1 2.5-1 M16.5 2.5l-2.5 5 M20 8a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z M4 8a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z',
      viewBox: '0 0 24 24'
    },
    'Spotify': {
      path: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M16.5 16.5c-.2.3-.6.4-.9.2-2.5-1.5-5.6-1.8-9.3-1-.4.1-.7-.1-.8-.5-.1-.4.1-.7.5-.8 4-1 7.5-.5 10.3 1.1.3.2.4.7.2 1z M17.8 13.7c-.3.3-.7.5-1.1.2-2.8-1.7-7.1-2.2-10.4-1.2-.4.1-.9-.1-1-.5-.1-.4.1-.9.5-1 3.8-1.2 8.5-.6 11.7 1.4.4.2.5.8.3 1.1z M17.9 10.8c-3.4-2-9-2.2-12.2-1.2-.5.2-1-.2-1.1-.7-.2-.5.2-1 .7-1.1 3.7-1.1 9.9-.9 13.8 1.4.5.3.6.8.4 1.3-.3.4-.9.5-1.3.3z',
      viewBox: '0 0 24 24'
    },
  },

  'Contact': {
    'Phone': {
      path: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z',
      viewBox: '0 0 24 24'
    },
    'Email': {
      path: 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6',
      viewBox: '0 0 24 24'
    },
    'Globe': {
      path: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M2 12h20 M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z',
      viewBox: '0 0 24 24'
    },
    'MapPin': {
      path: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 7a3 3 0 1 1 0 6 3 3 0 0 1 0-6z',
      viewBox: '0 0 24 24'
    },
    'Smartphone': {
      path: 'M17 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z M12 18h.01',
      viewBox: '0 0 24 24'
    },
    'MessageCircle': {
      path: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z',
      viewBox: '0 0 24 24'
    },
    'AtSign': {
      path: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-5.5 8.28',
      viewBox: '0 0 24 24'
    },
    'Link': {
      path: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
      viewBox: '0 0 24 24'
    },
    'Fax': {
      path: 'M6 9V2h12v7 M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2 M6 14h12v8H6z',
      viewBox: '0 0 24 24'
    },
    'Navigation': {
      path: 'M3 11l19-9-9 19-2-8-8-2z',
      viewBox: '0 0 24 24'
    },
    'Home': {
      path: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10',
      viewBox: '0 0 24 24'
    },
    'Mailbox': {
      path: 'M22 17H2a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3z M6 14V8a6 6 0 0 1 12 0v6 M12 14v3',
      viewBox: '0 0 24 24'
    },
  },

  'Business': {
    'Briefcase': {
      path: 'M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16',
      viewBox: '0 0 24 24'
    },
    'Building': {
      path: 'M3 21h18 M9 8h1 M9 12h1 M9 16h1 M14 8h1 M14 12h1 M14 16h1 M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16',
      viewBox: '0 0 24 24'
    },
    'CreditCard': {
      path: 'M21 4H3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z M1 10h22',
      viewBox: '0 0 24 24'
    },
    'DollarSign': {
      path: 'M12 1v22 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
      viewBox: '0 0 24 24'
    },
    'TrendingUp': {
      path: 'M23 6l-9.5 9.5-5-5L1 18 M17 6h6v6',
      viewBox: '0 0 24 24'
    },
    'Award': {
      path: 'M12 15a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M8.21 13.89L7 23l5-3 5 3-1.21-9.12',
      viewBox: '0 0 24 24'
    },
    'Shield': {
      path: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
      viewBox: '0 0 24 24'
    },
    'Key': {
      path: 'M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4',
      viewBox: '0 0 24 24'
    },
    'Clock': {
      path: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M12 6v6l4 2',
      viewBox: '0 0 24 24'
    },
    'Calendar': {
      path: 'M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z M16 2v4 M8 2v4 M3 10h18',
      viewBox: '0 0 24 24'
    },
    'Printer': {
      path: 'M6 9V2h12v7 M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2 M6 14h12v8H6z',
      viewBox: '0 0 24 24'
    },
    'FileText': {
      path: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
      viewBox: '0 0 24 24'
    },
  },

  'Creative': {
    'Camera': {
      path: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
      viewBox: '0 0 24 24'
    },
    'Music': {
      path: 'M9 18V5l12-2v13 M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0z M21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
      viewBox: '0 0 24 24'
    },
    'Palette': {
      path: 'M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.5-.75 1.5-1.5 0-.39-.15-.74-.38-1.01-.22-.26-.37-.6-.37-.99 0-.83.67-1.5 1.5-1.5H16c3.31 0 6-2.69 6-6 0-5.52-4.48-9-10-9z M6.5 11.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z M9.5 7.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z M14.5 7.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z M17.5 11.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z',
      viewBox: '0 0 24 24'
    },
    'PenTool': {
      path: 'M12 19l7-7 3 3-7 7-3-3z M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z M2 2l7.586 7.586 M11 13a2 2 0 1 1-4 0 2 2 0 0 1 4 0z',
      viewBox: '0 0 24 24'
    },
    'Lightbulb': {
      path: 'M9 18h6 M10 22h4 M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5',
      viewBox: '0 0 24 24'
    },
    'Monitor': {
      path: 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z M8 21h8 M12 17v4',
      viewBox: '0 0 24 24'
    },
    'Film': {
      path: 'M19.82 2H4.18A2.18 2.18 0 0 0 2 4.18v15.64A2.18 2.18 0 0 0 4.18 22h15.64A2.18 2.18 0 0 0 22 19.82V4.18A2.18 2.18 0 0 0 19.82 2z M7 2v20 M17 2v20 M2 12h20 M2 7h5 M2 17h5 M17 17h5 M17 7h5',
      viewBox: '0 0 24 24'
    },
    'Mic': {
      path: 'M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z M19 10v2a7 7 0 0 1-14 0v-2 M12 19v4 M8 23h8',
      viewBox: '0 0 24 24'
    },
    'Headphones': {
      path: 'M3 18v-6a9 9 0 0 1 18 0v6 M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z',
      viewBox: '0 0 24 24'
    },
    'Code': {
      path: 'M16 18l6-6-6-6 M8 6l-6 6 6 6',
      viewBox: '0 0 24 24'
    },
    'Cpu': {
      path: 'M9 9h6v6H9z M4 12h1 M19 12h1 M12 4v1 M12 19v1 M7.8 7.8L5.6 5.6 M18.4 5.6l-2.2 2.2 M7.8 16.2l-2.2 2.2 M18.4 18.4l-2.2-2.2 M6 2h12a4 4 0 0 1 4 4v12a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4z',
      viewBox: '0 0 24 24'
    },
    'Wifi': {
      path: 'M5 12.55a11 11 0 0 1 14.08 0 M1.42 9a16 16 0 0 1 21.16 0 M8.53 16.11a6 6 0 0 1 6.95 0 M12 20h.01',
      viewBox: '0 0 24 24'
    },
  },

  'Symbols': {
    'Heart': {
      path: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z',
      viewBox: '0 0 24 24'
    },
    'Star': {
      path: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
      viewBox: '0 0 24 24'
    },
    'Zap': {
      path: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
      viewBox: '0 0 24 24'
    },
    'Sun': {
      path: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z M12 1v2 M12 21v2 M4.22 4.22l1.42 1.42 M18.36 18.36l1.42 1.42 M1 12h2 M21 12h2 M4.22 19.78l1.42-1.42 M18.36 5.64l1.42-1.42',
      viewBox: '0 0 24 24'
    },
    'Moon': {
      path: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
      viewBox: '0 0 24 24'
    },
    'Sparkles': {
      path: 'M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z M5 3l.67 2L8 5.67 5.67 6.33 5 8.33l-.67-2L2 5.67l2.33-.67L5 3z M19 17l.67 2L22 19.67l-2.33.66L19 22.33l-.67-2L16 19.67l2.33-.67L19 17z',
      viewBox: '0 0 24 24'
    },
    'Flame': {
      path: 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z',
      viewBox: '0 0 24 24'
    },
    'Diamond': {
      path: 'M6 3h12l4 6-10 13L2 9z M2 9h20 M12 22L7.5 9 12 3l4.5 6L12 22z',
      viewBox: '0 0 24 24'
    },
    'Crown': {
      path: 'M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z M3 20h18',
      viewBox: '0 0 24 24'
    },
    'Infinity': {
      path: 'M18.178 8c5.096 0 5.096 8 0 8-5.095 0-7.133-8-12.739-8-4.585 0-4.585 8 0 8 5.606 0 7.644-8 12.74-8z',
      viewBox: '0 0 24 24'
    },
    'Target': {
      path: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
      viewBox: '0 0 24 24'
    },
    'Compass': {
      path: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z',
      viewBox: '0 0 24 24'
    },
  },

  'Arrows & UI': {
    'ArrowRight': {
      path: 'M5 12h14 M12 5l7 7-7 7',
      viewBox: '0 0 24 24'
    },
    'ArrowLeft': {
      path: 'M19 12H5 M12 19l-7-7 7-7',
      viewBox: '0 0 24 24'
    },
    'ArrowUp': {
      path: 'M12 19V5 M5 12l7-7 7 7',
      viewBox: '0 0 24 24'
    },
    'ArrowDown': {
      path: 'M12 5v14 M19 12l-7 7-7-7',
      viewBox: '0 0 24 24'
    },
    'ChevronRight': {
      path: 'M9 18l6-6-6-6',
      viewBox: '0 0 24 24'
    },
    'ChevronLeft': {
      path: 'M15 18l-6-6 6-6',
      viewBox: '0 0 24 24'
    },
    'Check': {
      path: 'M20 6L9 17l-5-5',
      viewBox: '0 0 24 24'
    },
    'CheckCircle': {
      path: 'M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4L12 14.01l-3-3',
      viewBox: '0 0 24 24'
    },
    'X': {
      path: 'M18 6L6 18 M6 6l12 12',
      viewBox: '0 0 24 24'
    },
    'Plus': {
      path: 'M12 5v14 M5 12h14',
      viewBox: '0 0 24 24'
    },
    'Minus': {
      path: 'M5 12h14',
      viewBox: '0 0 24 24'
    },
    'ExternalLink': {
      path: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6 M15 3h6v6 M10 14L21 3',
      viewBox: '0 0 24 24'
    },
  },

  'Nature': {
    'Leaf': {
      path: 'M11 20A7 7 0 0 1 9.8 6.9C15.5 4.9 17 3.5 19 2c1 2 2 4.5 2 8 0 5.5-4.78 10-10 10z M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12',
      viewBox: '0 0 24 24'
    },
    'Tree': {
      path: 'M12 22v-7 M17 8l-5-6-5 6h10z M20 14l-8-6-8 6h16z',
      viewBox: '0 0 24 24'
    },
    'Flower': {
      path: 'M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M12 6V2 M12 22v-6 M6.34 7.34l-2.12-2.12 M19.78 18.78l-2.12-2.12 M6 12H2 M22 12h-4 M6.34 16.66l-2.12 2.12 M19.78 5.22l-2.12 2.12',
      viewBox: '0 0 24 24'
    },
    'Cloud': {
      path: 'M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z',
      viewBox: '0 0 24 24'
    },
    'Droplet': {
      path: 'M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z',
      viewBox: '0 0 24 24'
    },
    'Mountain': {
      path: 'M8 3l4 8 5-5 7 14H2z',
      viewBox: '0 0 24 24'
    },
    'Umbrella': {
      path: 'M23 12a11.05 11.05 0 0 0-22 0 M12 12v9a3 3 0 0 0 6 0',
      viewBox: '0 0 24 24'
    },
    'Snowflake': {
      path: 'M12 2v20 M20.5 7l-17 10 M20.5 17l-17-10 M2 12h20 M7.5 4.5L12 7l4.5-2.5 M7.5 19.5L12 17l4.5 2.5',
      viewBox: '0 0 24 24'
    },
    'Sunrise': {
      path: 'M17 18a5 5 0 0 0-10 0 M12 2v7 M4.22 10.22l1.42 1.42 M1 18h2 M21 18h2 M18.36 11.64l1.42-1.42 M23 22H1 M8 6l4-4 4 4',
      viewBox: '0 0 24 24'
    },
    'Wind': {
      path: 'M9.59 4.59A2 2 0 1 1 11 8H2 M12.59 19.41A2 2 0 1 0 14 16H2 M17.73 7.73A2.5 2.5 0 1 1 19.5 12H2',
      viewBox: '0 0 24 24'
    },
    'Waves': {
      path: 'M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1 M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1 M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1',
      viewBox: '0 0 24 24'
    },
    'Feather': {
      path: 'M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z M16 8L2 22 M17.5 15H9',
      viewBox: '0 0 24 24'
    },
  },
};


// ─── Part 3: Icon Picker Logic ──────────────────────────────

let currentIconCategory = 'Arrows & Navigation';

function initIconPicker() {
  renderIconTabs();
  renderIconGridItems();
}

function renderIconTabs() {
  const container = document.getElementById('icon-tabs');
  if (!container) return;
  container.innerHTML = '';
  Object.keys(CANVAS_ICONS).forEach(function (cat) {
    const tab = document.createElement('button');
    tab.className = 'icon-tab' + (cat === currentIconCategory ? ' active' : '');
    tab.textContent = cat;
    tab.addEventListener('click', function () {
      currentIconCategory = cat;
      renderIconTabs();
      renderIconGridItems();
    });
    container.appendChild(tab);
  });
}

function renderIconGridItems() {
  const container = document.getElementById('icon-grid');
  if (!container) return;
  container.innerHTML = '';
  const icons = CANVAS_ICONS[currentIconCategory] || {};
  Object.entries(icons).forEach(function ([name, data]) {
    const cell = document.createElement('div');
    cell.className = 'icon-cell';
    cell.title = name;
    cell.innerHTML = getCanvasIconSvgMarkup(data, 20, 'currentColor');
    cell.addEventListener('click', function () {
      addIconToCanvas(name, data);
    });
    container.appendChild(cell);
  });
}

function addIconToCanvas(name, data) {
  if (typeof fabric === 'undefined' || typeof canvas === 'undefined') return;

  // For Lucide icons (multi-element), always use loadSVGFromString for correct rendering
  if (data && data.lucide) {
    var svgStr = getCanvasIconSvgMarkup(data, 60, '#ffffff');
    if (!svgStr) return;
    fabric.loadSVGFromString(svgStr, function (objects, options) {
      var group = fabric.util.groupSVGElements(objects, options);
      group.set({
        left: canvas.getWidth() / 2 - 30,
        top: canvas.getHeight() / 2 - 30,
        scaleX: 1,
        scaleY: 1,
        _iconName: name,
        _groupName: name,
        _lucideName: data.lucide
      });
      group.setCoords();
      canvas.add(group);
      canvas.setActiveObject(group);
      canvas.renderAll();
      if (typeof snap === 'function') snap();
    });
    return;
  }

  // For non-Lucide icons with simple path data
  var pathData = _canvasIconPathStringFromData(data);
  var vb = _canvasIconViewBoxSize(data && data.viewBox);
  if (pathData && vb) {
    var iconPath = new fabric.Path(pathData, {
      fill: '',
      stroke: '#ffffff',
      strokeWidth: 2,
      strokeLineCap: 'round',
      strokeLineJoin: 'round',
      left: canvas.getWidth() / 2,
      top: canvas.getHeight() / 2,
      originX: 'center',
      originY: 'center',
      _iconName: name,
      _lucideName: data && data.lucide ? data.lucide : null
    });
    var baseW = Math.max(1, iconPath.width || vb.w || 24);
    var baseH = Math.max(1, iconPath.height || vb.h || 24);
    var scale = Math.min(60 / baseW, 60 / baseH);
    iconPath.set({
      scaleX: scale,
      scaleY: scale
    });
    iconPath.setCoords();
    canvas.add(iconPath);
    canvas.setActiveObject(iconPath);
    canvas.renderAll();
    var pathPicker = document.getElementById('icon-picker');
    if (pathPicker) pathPicker.classList.remove('show');
    return;
  }
  var svgStr = getCanvasIconSvgMarkup(data, 60, '#ffffff');
  if (!svgStr) return;

  fabric.loadSVGFromString(svgStr, function (objects, options) {
    var group = fabric.util.groupSVGElements(objects, options);
    group.set({
      left: canvas.getWidth() / 2 - 30,
      top: canvas.getHeight() / 2 - 30,
      scaleX: 1,
      scaleY: 1,
      _iconName: name,
      _groupName: name,
      _lucideName: data && data.lucide ? data.lucide : null
    });
    group.setCoords();
    canvas.add(group);
    canvas.setActiveObject(group);
    canvas.renderAll();

    var picker = document.getElementById('icon-picker');
    if (picker) picker.classList.remove('show');
  });
}


// ─── Part 4: Helper ─────────────────────────────────────────

function getIcon(name, size) {
  size = size || 24;
  var svg = ICONS[name];
  if (svg) {
    return svg
      .replace(/width="\d+"/, 'width="' + size + '"')
      .replace(/height="\d+"/, 'height="' + size + '"');
  }
  // Fallback: try Lucide library
  var iconNode = _getLucideIconNode(name);
  if (iconNode) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + iconNode.map(_renderLucideChild).join('') + '</svg>';
  }
  return '';
}

function _lucideToPascalCase(name) {
  return String(name || '')
    .split('-')
    .map(function (part) { return part ? part.charAt(0).toUpperCase() + part.slice(1) : ''; })
    .join('');
}

function _getLucideIconNode(name) {
  if (typeof lucide === 'undefined' || !lucide || !lucide.icons) return null;
  return lucide.icons[_lucideToPascalCase(name)] || null;
}

function _escapeSvgAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function _renderLucideChild(node) {
  if (!node || !node.length) return '';
  var tag = node[0];
  var attrs = node[1] || {};
  var chunks = [];
  Object.keys(attrs).forEach(function (key) {
    if (attrs[key] == null) return;
    chunks.push(key + '="' + _escapeSvgAttr(attrs[key]) + '"');
  });
  return '<' + tag + (chunks.length ? ' ' + chunks.join(' ') : '') + '></' + tag + '>';
}

var CANVAS_ICON_CATEGORY_ORDER = [
  'Arrows & Navigation',
  'Communication & Social',
  'Files & Folders',
  'Text, Layout & Editing',
  'Business & Finance',
  'Charts & Data',
  'Devices & Media',
  'People & Accessibility',
  'Security & Alerts',
  'Travel & Maps',
  'Nature & Weather',
  'Commerce & Shopping',
  'Home & Food',
  'Shapes & Symbols',
  'Miscellaneous'
];

var CANVAS_ICON_CATEGORY_META = {
  'Arrows & Navigation': { icon: 'forward', desc: 'Directions, chevrons, movement, nav flow' },
  'Communication & Social': { icon: 'social', desc: 'Chat, mail, share, microphones, social' },
  'Files & Folders': { icon: 'folder', desc: 'Files, folders, archives, storage, documents' },
  'Text, Layout & Editing': { icon: 'text', desc: 'Typography, align, crop, edit, layout tools' },
  'Business & Finance': { icon: 'card', desc: 'Briefcase, buildings, money, work, invoices' },
  'Charts & Data': { icon: 'charts', desc: 'Charts, database, activity, analytics' },
  'Devices & Media': { icon: 'images', desc: 'Camera, image, video, devices, playback' },
  'People & Accessibility': { icon: 'user', desc: 'Users, accessibility, health, community' },
  'Security & Alerts': { icon: 'shield', desc: 'Lock, shield, alerts, scans, safety' },
  'Travel & Maps': { icon: 'mapPin', desc: 'Maps, transport, route, location, travel' },
  'Nature & Weather': { icon: 'leaf', desc: 'Sun, moon, cloud, plant, weather, terrain' },
  'Commerce & Shopping': { icon: 'tag', desc: 'Cart, store, package, discounts, delivery' },
  'Home & Food': { icon: 'background', desc: 'Home, furniture, food, kitchen, living' },
  'Shapes & Symbols': { icon: 'star', desc: 'Stars, hearts, badges, geometric marks' },
  'Miscellaneous': { icon: 'icons', desc: 'Everything else from the Lucide library' }
};

function _lucideExportToKebabCase(name) {
  return String(name || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase();
}

function _lucideFriendlyLabel(name) {
  var pretty = String(name || '').replace(/-/g, ' ');
  var acronyms = {
    ai: 'AI',
    id: 'ID',
    qr: 'QR',
    hd: 'HD',
    cpu: 'CPU',
    usb: 'USB',
    rss: 'RSS',
    tv: 'TV',
    lcd: 'LCD',
    app: 'App',
    git: 'Git',
    otp: 'OTP',
    sms: 'SMS',
    vpn: 'VPN',
    pdf: 'PDF',
    csv: 'CSV',
    api: 'API',
    sql: 'SQL',
    ui: 'UI',
    ux: 'UX'
  };
  return pretty.split(' ').map(function(part) {
    var lower = String(part || '').toLowerCase();
    if (!lower) return '';
    if (acronyms[lower]) return acronyms[lower];
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }).join(' ');
}

function _lucideIconCategoryFor(slug) {
  var rules = [
    { key: 'Arrows & Navigation', re: /(arrow|chevron|move-|move$|between-|corner-|navigation|route|waypoint|signpost|locate|compass|crosshair|grab|grab-|panel-|fold-|unfold|flip-|undo|redo|rotate|refresh-cw|refresh-ccw|maximize|minimize)/ },
    { key: 'Communication & Social', re: /(message|messages|mail|send|reply|forward|phone|contact|inbox|outbox|at-sign|hash|mic|microphone|audio-|headphones|headset|voicemail|podcast|radio|captions|languages|share|link-|link$|unlink|badge-help|circle-help|help-circle|smile|frown|laugh|annoyed|angry|meh|party-popper)/ },
    { key: 'Files & Folders', re: /(file|folder|archive|book|bookmark|newspaper|receipt|clipboard|copy|scissors|signature|stamp|save|hard-drive|database|server|cloud|download|upload|import|scan-text|notebook|files)/ },
    { key: 'Text, Layout & Editing', re: /(align|baseline|bold|italic|underline|strikethrough|pilcrow|type|text|heading|list|indent|outdent|wrap-|case-|space-|gallery-|layout|columns|rows|grid|ruler|crop|slice|lasso|mouse-pointer|pen-|pen$|pencil|brush|paint|palette|pipette|frame|square-dashed|rectangle-|focus|inspect)/ },
    { key: 'Business & Finance', re: /(briefcase|building|factory|wallet|landmark|banknote|coins?|dollar|receipt|calculator|piggy-bank|badge-dollar-sign|circle-dollar-sign|credit-card|hand-coins|presentation|target|award|medal|trophy|handshake|badge-percent|file-chart-column|file-chart-line)/ },
    { key: 'Charts & Data', re: /(chart|pie-|area-chart|bar-chart|activity|gauge|database|binary|sigma|workflow|git-|kanban|table-|blocks|cable|radar|network)/ },
    { key: 'Devices & Media', re: /(camera|image|images|video|film|clapperboard|monitor|tv|smartphone|tablet|laptop|pc-|cpu|keyboard|mouse|screen|speaker|volume|play|pause|rewind|fast-forward|skip|disc|music|cassette|album|webcam|projector)/ },
    { key: 'People & Accessibility', re: /(user|users|person|baby|accessibility|hand-|hand$|brain|heart-pulse|stethoscope|hospital|pill|syringe|badge-check|badge-plus|ear|eye|glasses|shirt|footprints)/ },
    { key: 'Security & Alerts', re: /(lock|unlock|shield|key|keys|fingerprint|scan-|shield-|triangle-alert|circle-alert|octagon-alert|alarm|siren|bug|flame|bomb|shield-check|shield-alert|shield-x)/ },
    { key: 'Travel & Maps', re: /(map|map-pin|navigation|plane|car|bus|bike|train|tram|ship|boat|fuel|route|ticket|luggage|tent|mountain-cable|plane-|parking-circle|parking-square)/ },
    { key: 'Nature & Weather', re: /(leaf|flower|tree|trees|sprout|sun|moon|cloud|rain|snow|wind|umbrella|thermometer|mountain|waves|droplet|droplets|bolt|rainbow|snowflake|sunrise|sunset|orbit)/ },
    { key: 'Commerce & Shopping', re: /(shopping|cart|store|package|boxes|truck|tag|tags|gift|ticket|badge-percent|package-check|package-open|package-plus|package-search|package-x)/ },
    { key: 'Home & Food', re: /(house|home|bed|bath|shower|sofa|lamp|chef-hat|utensils|pizza|sandwich|salad|cup-soda|coffee|beer|wine|refrigerator|microwave|washing-machine|armchair|warehouse)/ },
    { key: 'Shapes & Symbols', re: /(star|heart|circle$|square$|triangle$|diamond|hexagon|octagon|badge|sparkles|sparkle|asterisk|plus$|minus$|equal|slash|percent|radiation|biohazard|infinity)/ }
  ];
  var i;
  for (i = 0; i < rules.length; i++) {
    if (rules[i].re.test(slug)) return rules[i].key;
  }
  return 'Miscellaneous';
}

function getCanvasIconSvgMarkup(data, size, color) {
  size = size || 20;
  color = color || 'currentColor';
  if (!data) return '';

  if (data.lucide) {
    var iconNode = _getLucideIconNode(data.lucide);
    if (!iconNode) return '';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + iconNode.map(_renderLucideChild).join('') + '</svg>';
  }

  if (data.svg) {
    return data.svg
      .replace(/width="\d+"/, 'width="' + size + '"')
      .replace(/height="\d+"/, 'height="' + size + '"')
      .replace(/stroke="currentColor"/g, 'stroke="' + color + '"')
      .replace(/fill="currentColor"/g, 'fill="' + color + '"');
  }

  if (data.path && data.viewBox) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + data.viewBox + '" width="' + size + '" height="' + size + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="' + data.path + '"/></svg>';
  }
  return '';
}

function _canvasIconViewBoxSize(viewBox) {
  var parts = String(viewBox || '0 0 24 24').trim().split(/\s+/);
  if (parts.length !== 4) return { w: 24, h: 24 };
  return {
    w: Math.max(1, parseFloat(parts[2]) || 24),
    h: Math.max(1, parseFloat(parts[3]) || 24)
  };
}

function _svgNum(val, fallback) {
  var num = parseFloat(val);
  return isFinite(num) ? num : fallback;
}

function _svgShapeToPath(tag, attrs) {
  attrs = attrs || {};
  if (tag === 'path') return attrs.d || '';
  if (tag === 'line') {
    return 'M ' + _svgNum(attrs.x1, 0) + ' ' + _svgNum(attrs.y1, 0) +
      ' L ' + _svgNum(attrs.x2, 0) + ' ' + _svgNum(attrs.y2, 0);
  }
  if (tag === 'polyline' || tag === 'polygon') {
    var pts = String(attrs.points || '').trim().split(/\s+/).map(function(pair) {
      return pair.split(',');
    }).filter(function(pair) {
      return pair.length === 2;
    });
    if (!pts.length) return '';
    var path = 'M ' + _svgNum(pts[0][0], 0) + ' ' + _svgNum(pts[0][1], 0);
    for (var i = 1; i < pts.length; i++) {
      path += ' L ' + _svgNum(pts[i][0], 0) + ' ' + _svgNum(pts[i][1], 0);
    }
    if (tag === 'polygon') path += ' Z';
    return path;
  }
  if (tag === 'rect') {
    var x = _svgNum(attrs.x, 0);
    var y = _svgNum(attrs.y, 0);
    var w = _svgNum(attrs.width, 0);
    var h = _svgNum(attrs.height, 0);
    return 'M ' + x + ' ' + y + ' H ' + (x + w) + ' V ' + (y + h) + ' H ' + x + ' Z';
  }
  if (tag === 'circle') {
    var cx = _svgNum(attrs.cx, 0);
    var cy = _svgNum(attrs.cy, 0);
    var r = _svgNum(attrs.r, 0);
    return 'M ' + (cx - r) + ' ' + cy +
      ' A ' + r + ' ' + r + ' 0 1 0 ' + (cx + r) + ' ' + cy +
      ' A ' + r + ' ' + r + ' 0 1 0 ' + (cx - r) + ' ' + cy;
  }
  if (tag === 'ellipse') {
    var ecx = _svgNum(attrs.cx, 0);
    var ecy = _svgNum(attrs.cy, 0);
    var rx = _svgNum(attrs.rx, 0);
    var ry = _svgNum(attrs.ry, 0);
    return 'M ' + (ecx - rx) + ' ' + ecy +
      ' A ' + rx + ' ' + ry + ' 0 1 0 ' + (ecx + rx) + ' ' + ecy +
      ' A ' + rx + ' ' + ry + ' 0 1 0 ' + (ecx - rx) + ' ' + ecy;
  }
  return '';
}

function _canvasIconPathStringFromData(data) {
  if (!data) return '';
  if (data.path) return data.path;
  if (!data.lucide || typeof _getLucideIconNode !== 'function') return '';
  var iconNode = _getLucideIconNode(data.lucide);
  if (!iconNode || !iconNode.map) return '';
  return iconNode.map(function(child) {
    if (!child) return '';
    if (Array.isArray(child)) return _svgShapeToPath(child[0], child[1] || {});
    if (child.attrs) return _svgShapeToPath(child.tag, child.attrs);
    return '';
  }).filter(function(part) {
    return !!part;
  }).join(' ');
}

function _installLucideCanvasIcons() {
  if (typeof CANVAS_ICONS === 'undefined' || typeof lucide === 'undefined' || !lucide || !lucide.icons) return;
  var buckets = {};
  var seen = {};
  var seenSignature = {};
  CANVAS_ICON_CATEGORY_ORDER.forEach(function(category) {
    buckets[category] = [];
  });

  Object.keys(lucide.icons).forEach(function(exportName) {
    var iconNode = lucide.icons[exportName];
    if (!iconNode || !iconNode.map) return;
    var slug = _lucideExportToKebabCase(exportName);
    var signature = JSON.stringify(iconNode);
    if (!slug || seen[slug]) return;
    if (signature && seenSignature[signature]) return;
    seen[slug] = true;
    if (signature) seenSignature[signature] = true;
    var category = _lucideIconCategoryFor(slug);
    buckets[category].push({
      label: _lucideFriendlyLabel(slug),
      data: {
        lucide: slug,
        viewBox: '0 0 24 24',
        keywords: slug.replace(/-/g, ' ') + ' ' + category.toLowerCase()
      }
    });
  });

  Object.keys(CANVAS_ICONS).forEach(function(category) {
    delete CANVAS_ICONS[category];
  });

  CANVAS_ICON_CATEGORY_ORDER.forEach(function(category) {
    var list = buckets[category] || [];
    list.sort(function(a, b) {
      return a.label.localeCompare(b.label);
    });
    if (!list.length) return;
    CANVAS_ICONS[category] = {};
    list.forEach(function(item) {
      CANVAS_ICONS[category][item.label] = item.data;
    });
  });

  window.CANVAS_ICON_CATEGORY_META = CANVAS_ICON_CATEGORY_META;
  window.CANVAS_ICON_CATEGORY_ORDER = CANVAS_ICON_CATEGORY_ORDER.slice();
  if (!CANVAS_ICONS[currentIconCategory]) currentIconCategory = CANVAS_ICON_CATEGORY_ORDER[0];
}

_installLucideCanvasIcons();
