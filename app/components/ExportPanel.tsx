"use client";

import { useRef, useState } from "react";
import type { Library } from "@/lib/analysis";
import { downloadCsvZip, downloadJson, readExport, type LibraryExport } from "@/lib/export";
import type { Clusters } from "@/lib/graph";
import { Button, Collapsible } from "./controls";

interface Props {
  library: Library;
  artistGenres: Map<string, string[]> | null;
  clusters: Clusters;
  genreStatus: string | null;
  exportPng: (whole: boolean) => Promise<void>;
  onImport: (data: LibraryExport) => void;
}

export default function ExportPanel({ library, artistGenres, clusters, genreStatus, exportPng, onImport }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const run = async (label: string, fn: () => unknown) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const genreCount = artistGenres ? [...artistGenres.values()].filter((g) => g.length).length : 0;
  const rows = [...library.playlists.values()].reduce((s, p) => s + p.tracks.length, 0);

  return (
    <div className="text-sm">
      <Collapsible title="Image">
        <p className="text-xs text-zinc-500">PNG of the graph with the current colours, filters and labels.</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => run("view", () => exportPng(false))} disabled={!!busy}>
            {busy === "view" ? "Rendering…" : "Current view"}
          </Button>
          <Button onClick={() => run("full", () => exportPng(true))} disabled={!!busy}>
            {busy === "full" ? "Rendering…" : "Whole graph (high-res)"}
          </Button>
        </div>
      </Collapsible>

      <Collapsible title="Data">
        <p className="text-xs text-zinc-500">
          A zip of CSV files that open in Excel, Numbers or Google Sheets, plus the raw JSON.
        </p>
        <ul className="space-y-1 font-mono text-[11px] text-zinc-400">
          <li>playlists.csv <span className="text-zinc-600">· {library.playlists.size} rows</span></li>
          <li>tracks.csv <span className="text-zinc-600">· {library.tracks.size} rows</span></li>
          <li>artists.csv <span className="text-zinc-600">· {library.artists.size} rows</span></li>
          <li>genres.csv <span className="text-zinc-600">· from {genreCount} artists with genres</span></li>
          <li>playlist_tracks.csv <span className="text-zinc-600">· {rows} rows</span></li>
          <li>playlist_similarity.csv <span className="text-zinc-600">· {library.pairs.size} rows</span></li>
          <li>library.json</li>
        </ul>
        {genreStatus && <p className="text-xs text-zinc-500">{genreStatus} — export now or wait for all genres.</p>}
        <div className="flex flex-wrap gap-2">
          <Button primary onClick={() => run("csv", () => downloadCsvZip(library, artistGenres, clusters))} disabled={!!busy}>
            Download CSV (.zip)
          </Button>
          <Button onClick={() => run("json", () => downloadJson(library, artistGenres))} disabled={!!busy}>
            JSON only
          </Button>
        </div>
      </Collapsible>

      <Collapsible title="Open an export" defaultOpen={false}>
        <p className="text-xs text-zinc-500">
          Load a <code>.json</code> export (or <code>library.json</code> from the zip) to explore it without Spotify.
        </p>
        <input
          ref={file}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) run("import", async () => onImport(await readExport(f)));
            e.target.value = "";
          }}
        />
        <Button onClick={() => file.current?.click()} disabled={!!busy}>
          Choose file…
        </Button>
      </Collapsible>

      {error && <p className="px-4 py-3 text-xs text-red-300">{error}</p>}
    </div>
  );
}
