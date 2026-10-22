import type { Game } from '@/types/types';

const STEAM_CDN = 'https://cdn.cloudflare.steamstatic.com/steam/apps';
const DISCORD_CDN = 'https://cdn.discordapp.com/app-icons';

/** Steam exposes the same app id Discord stores as a third-party SKU. */
function steamAppId(game: Game): string | null {
  const sku = game.third_party_skus?.find(
    (s) => s.distributor === 'steam' && /^\d{3,8}$/.test(s.id),
  );
  return sku?.id ?? null;
}

/**
 * Candidate artwork, ordered best-first: store art (wide, pretty) wins over the
 * square application icon. Callers walk the list as each URL fails to load.
 */
export function artCandidates(game: Game): string[] {
  const urls: string[] = [];
  const steam = steamAppId(game);
  if (steam) urls.push(`${STEAM_CDN}/${steam}/header.jpg`);
  if (game.icon_hash) urls.push(`${DISCORD_CDN}/${game.id}/${game.icon_hash}.png`);
  return urls;
}

/** Best single artwork URL (null when the game only has a gradient fallback). */
export function primaryArtUrl(game: Game | null | undefined): string | null {
  return game ? (artCandidates(game)[0] ?? null) : null;
}

/**
 * Square application icon used for the taskbar / session window. This is the
 * Discord app icon, deliberately not the wide Steam header: the header is a
 * banner, and Windows squeezes it into an unrecognisable little square.
 */
export function gameIconUrl(game: Game | null | undefined): string | null {
  if (!game?.icon_hash) return null;
  return `${DISCORD_CDN}/${game.id}/${game.icon_hash}.png?size=256`;
}

/** Official store page when the game ships a Steam SKU, else a store search. */
export function storePageUrl(game: Game | null | undefined): string | null {
  if (!game) return null;
  const steam = steamAppId(game);
  if (steam) return `https://store.steampowered.com/app/${steam}`;
  return `https://store.steampowered.com/search/?term=${encodeURIComponent(game.name)}`;
}

/** Deterministic 0-360 hue so the fallback tile looks the same on every launch. */
export function fallbackHue(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) % 360;
  return hash;
}
