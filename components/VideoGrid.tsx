"use client";

import { useState } from "react";
import { ExternalLink, Play } from "lucide-react";
import type { VideoDTO } from "@/lib/types";

interface Props {
  videos: VideoDTO[];
  searchUrl?: string;
  title?: string;
}

/** Miniaturas de YouTube que se reproducen en la propia página al pulsarlas. */
export default function VideoGrid({ videos, searchUrl, title = "Videos para estudiar" }: Props) {
  const [playing, setPlaying] = useState<string | null>(null);
  if (videos.length === 0) return null;

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        {searchUrl && (
          <a
            href={searchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-brand-700 hover:underline"
          >
            Ver más en YouTube <ExternalLink className="size-3" />
          </a>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {videos.map((v) => (
          <div key={v.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {playing === v.id ? (
              <iframe
                className="aspect-video w-full"
                src={`https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1`}
                title={v.title}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <button
                onClick={() => setPlaying(v.id)}
                className="group relative block w-full"
                aria-label={`Reproducir ${v.title}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={v.thumbnail} alt="" className="aspect-video w-full object-cover" />
                <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/20">
                  <span className="flex size-11 items-center justify-center rounded-full bg-black/70 text-white">
                    <Play className="ml-0.5 size-5" fill="currentColor" />
                  </span>
                </span>
              </button>
            )}
            <div className="p-2 text-xs">
              <p className="line-clamp-2 font-medium">{v.title}</p>
              <p className="text-slate-500">{v.channel}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
