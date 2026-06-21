import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { refreshAccess, spotifyConfigured } from "@/lib/spotify";

export const dynamic = "force-dynamic";

// Devuelve la canción que suena ahora + géneros del artista.
export async function GET() {
  if (!spotifyConfigured()) return NextResponse.json({ connected: false });
  const jar = await cookies();
  const refresh = jar.get("sp_refresh")?.value;
  if (!refresh) return NextResponse.json({ connected: false });

  try {
    const ref = await refreshAccess(refresh);
    const access_token = ref.access_token;
    if (!access_token) return NextResponse.json({ connected: false });
    const H = { Authorization: `Bearer ${access_token}` };

    const r = await fetch("https://api.spotify.com/v1/me/player/currently-playing", { headers: H, cache: "no-store" });
    if (r.status === 204 || r.status === 202) return NextResponse.json({ connected: true, playing: false });
    if (!r.ok) return NextResponse.json({ connected: true, playing: false });
    const data = await r.json();
    const item = data?.item;
    if (!item) return NextResponse.json({ connected: true, playing: false });

    const artistId = item.artists?.[0]?.id;
    let genres: string[] = [];
    if (artistId) {
      const ar = await fetch(`https://api.spotify.com/v1/artists/${artistId}`, { headers: H, cache: "no-store" });
      if (ar.ok) genres = (await ar.json()).genres || [];
    }

    return NextResponse.json({
      connected: true,
      playing: !!data.is_playing,
      track: item.name,
      artist: (item.artists || []).map((a: { name: string }) => a.name).join(", "),
      genres,
    });
  } catch {
    return NextResponse.json({ connected: false });
  }
}
