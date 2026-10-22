<script setup lang="ts">
/**
 * Single inline-SVG icon set. Keeping them in one file avoids pulling an icon
 * package into the bundle and guarantees a consistent 24px grid everywhere.
 */
const props = defineProps<{ name: string; size?: number | string }>();

const paths: Record<string, string> = {
  games: '<rect x="2" y="6" width="20" height="12" rx="4"/><path d="M8 12h4"/><path d="M10 10v4"/><circle cx="16" cy="11" r="1"/><circle cx="18" cy="14" r="1"/>',
  queue: '<path d="M4 6h11"/><path d="M4 12h11"/><path d="M4 18h7"/><path d="m17 14 4 3-4 3z"/>',
  settings: '<path d="M4 7h10"/><path d="M18 7h2"/><path d="M4 17h4"/><path d="M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  developer: '<path d="m8 8-4 4 4 4"/><path d="m16 8 4 4-4 4"/><path d="m13 5-2 14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M6 6l12 12"/><path d="M18 6 6 18"/>',
  check: '<path d="m5 13 4 4L19 7"/>',
  play: '<path d="M8 5.5v13l11-6.5z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 4v5h-5"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m7 9 3 3-3 3"/><path d="M13 15h4"/>',
  chevronUp: '<path d="m6 15 6-6 6 6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronLeft: '<path d="m15 6-6 6 6 6"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  arrowUp: '<path d="M12 19V5"/><path d="m6 11 6-6 6 6"/>',
  arrowDown: '<path d="M12 5v14"/><path d="m6 13 6 6 6-6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2"/><path d="M12 19v2"/><path d="M3 12h2"/><path d="M19 12h2"/><path d="m5.6 5.6 1.4 1.4"/><path d="m17 17 1.4 1.4"/><path d="M18.4 5.6 17 7"/><path d="M7 17l-1.4 1.4"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18h1.5a2 2 0 0 0 1.4-3.4A2 2 0 0 1 16.4 15H19a2 2 0 0 0 2-2 9 9 0 0 0-9-10z"/><circle cx="7.5" cy="11.5" r="1"/><circle cx="10" cy="7.5" r="1"/><circle cx="15" cy="7.5" r="1"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="m4 17 5-4 4 3 3-2 4 3"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18"/><path d="M12 3a14 14 0 0 0 0 18"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  verified: '<path d="m12 3 2.2 1.6 2.7-.2.9 2.6 2.3 1.4-1 2.6 1 2.6-2.3 1.4-.9 2.6-2.7-.2L12 21l-2.2-1.6-2.7.2-.9-2.6L3.9 15.6l1-2.6-1-2.6 2.3-1.4.9-2.6 2.7.2z"/><path d="m9 12 2 2 4-4"/>',
  loop: '<path d="M4 12a8 8 0 0 1 13.7-5.6L20 8"/><path d="M20 4v4h-4"/><path d="M20 12a8 8 0 0 1-13.7 5.6L4 16"/><path d="M4 20v-4h4"/>',
  pause: '<path d="M9 5v14"/><path d="M15 5v14"/>',
  minimize: '<path d="M5 12h14"/>',
  maximize: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
  restore: '<rect x="5" y="7" width="12" height="12" rx="2"/><path d="M8 7V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-1"/>',
  spinner: '<path d="M12 3a9 9 0 1 0 9 9" />',
  grip: '<path d="M5 8h14"/><path d="M5 12h14"/><path d="M5 16h14"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  discord: '<path d="M19.5 5.5A16 16 0 0 0 15.4 4l-.5 1a14 14 0 0 1 4 1.5c-2-1-4-1.6-6.9-1.6s-4.9.6-6.9 1.6a14 14 0 0 1 4-1.5L9.6 4a16 16 0 0 0-4.1 1.5C2.7 9.2 2 12.8 2.3 16.4A16 16 0 0 0 7.2 19l1.1-1.7c-.7-.3-1.4-.6-2-1.1l.4-.3c3.8 1.8 7.8 1.8 11.6 0l.4.3c-.6.5-1.3.8-2 1.1L17.8 19a16 16 0 0 0 4.9-2.6c.4-4.2-.7-7.8-3.2-10.9z"/><circle cx="9.5" cy="11.5" r="1.2"/><circle cx="14.5" cy="11.5" r="1.2"/>',
  github: '<path d="M9 19c-4.3 1.3-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.3 4.3 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.3 4.3 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>',
};
</script>

<template>
  <svg
    :width="props.size ?? 18"
    :height="props.size ?? 18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    v-html="paths[props.name] ?? ''"
  />
</template>
