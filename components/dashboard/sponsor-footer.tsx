"use client";

import {
  Search,
  Globe,
  Database,
  Cpu,
  Shield,
  Video,
  Bot,
  Feather,
  Triangle,
  type LucideIcon,
} from "lucide-react";

const SPONSORS: { name: string; icon: LucideIcon }[] = [
  { name: "Featherless.ai Agents", icon: Feather },
  { name: "Elastic + JINA", icon: Search },
  { name: "Browserbase", icon: Globe },
  { name: "BrightData", icon: Database },
  { name: "Runpod", icon: Cpu },
  { name: "Cloudflare", icon: Shield },
  { name: "HeyGen", icon: Video },
  { name: "Fetch.ai", icon: Bot },
  { name: "Vercel", icon: Triangle },
];

export function SponsorFooter() {
  return (
    <div className="flex shrink-0 items-center justify-center gap-3 border-t border-border/30 bg-background/40 px-5 py-2">
      <span className="shrink-0 text-[9px] text-muted-foreground/30 uppercase tracking-[0.15em]">
        LingHacks VII build stack
      </span>
      <div className="h-2.5 w-px bg-border/20" />
      <div className="flex flex-wrap items-center justify-center gap-x-3.5 gap-y-0.5">
        {SPONSORS.map(({ name, icon: Icon }) => (
          <span
            key={name}
            className="flex items-center gap-1 text-[9px] text-muted-foreground/30 transition-colors duration-200 hover:text-muted-foreground/70"
          >
            <Icon className="h-2.5 w-2.5" />
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}
