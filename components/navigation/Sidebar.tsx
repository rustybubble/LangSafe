"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { fetchLanguages } from "@/lib/api";
import {
  LayoutDashboard,
  Globe,
  Info,
  GraduationCap,
  ClipboardCheck,
  ChevronLeft,
  ChevronRight,
  Shield,
  Search,
} from "lucide-react";
import { LogoIcon } from "./LangSafeLogo";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/languages", label: "Languages", icon: Globe },
  { href: "/studio", label: "Studio", icon: GraduationCap },
  { href: "/judge-brief", label: "Judge Brief", icon: ClipboardCheck },
  { href: "/about", label: "About", icon: Info },
];

const STORAGE_KEY = "langsafe-sidebar-collapsed";

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [preservedCount, setPreservedCount] = useState<number | null>(null);

  // Hydrate collapse state from localStorage
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored !== null) setCollapsed(stored === "true");
      setMounted(true);
    });

    return () => cancelAnimationFrame(frame);
  }, []);

  // Fetch preserved languages count
  useEffect(() => {
    fetchLanguages({ limit: 1 }).then((data) => {
      setPreservedCount(data.stats.with_preservation_data);
    });
  }, []);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(STORAGE_KEY, String(next));
  };

  const isActive = (href: string) => {
    return pathname.startsWith(href);
  };

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-sidebar-border/70 bg-sidebar/92 shadow-[10px_0_34px_rgba(15,23,42,0.04)] backdrop-blur-xl transition-[width] duration-200 ease-out overflow-hidden",
        collapsed ? "w-14" : "w-[216px] max-md:w-14"
      )}
      // Prevent layout flash before hydration
      style={mounted ? undefined : { width: 216 }}
    >
      {/* ── Logo ──────────────────────────────────────────────── */}
      <div className="flex h-14 shrink-0 items-center border-b border-sidebar-border/60 px-3.5">
        <Link href="/" className="flex items-center gap-2 overflow-hidden">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <LogoIcon size={22} />
          </span>
          <span
            className={cn(
              "text-[15px] font-semibold tracking-tight whitespace-nowrap select-none transition-all duration-200 overflow-hidden",
              collapsed
                ? "max-w-0 opacity-0"
                : "max-w-[140px] opacity-100 max-md:max-w-0 max-md:opacity-0"
            )}
          >
            <span className="text-foreground">Lang</span>
            <span className="text-primary">Safe</span>
          </span>
        </Link>
      </div>

      {/* ── Search Trigger ─────────────────────────────────────── */}
      <div className="px-2 pt-2">
        <button
          onClick={() => {
            document.dispatchEvent(
              new KeyboardEvent("keydown", {
                key: "k",
                metaKey: true,
                bubbles: true,
              })
            );
          }}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg border border-sidebar-border/70 bg-white/65 px-2.5 py-2 text-xs text-sidebar-foreground/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] transition-colors hover:border-primary/25 hover:bg-sidebar-accent hover:text-sidebar-foreground overflow-hidden cursor-pointer"
          )}
        >
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span
            className={cn(
              "flex-1 text-left whitespace-nowrap transition-all duration-200 overflow-hidden",
              collapsed
                ? "max-w-0 opacity-0"
                : "max-w-[80px] opacity-100 max-md:max-w-0 max-md:opacity-0"
            )}
          >
            Search...
          </span>
          <kbd
            className={cn(
              "rounded border border-sidebar-border/80 bg-sidebar-accent/50 px-1 py-0.5 font-mono text-[10px] shrink-0 transition-all duration-200",
              collapsed
                ? "max-w-0 opacity-0 px-0 border-0 overflow-hidden"
                : "opacity-100 max-md:max-w-0 max-md:opacity-0 max-md:px-0 max-md:border-0 max-md:overflow-hidden"
            )}
          >
            ⌘K
          </kbd>
        </button>
      </div>

      {/* ── Navigation ────────────────────────────────────────── */}
      <nav className="flex flex-1 flex-col gap-1 px-2 py-3">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
              "group relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-all overflow-hidden",
                active
                  ? "bg-primary text-primary-foreground shadow-[0_8px_22px_rgba(10,132,255,0.20)]"
                  : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />

              <span
                className={cn(
                  "whitespace-nowrap transition-all duration-200 overflow-hidden",
                  collapsed
                    ? "max-w-0 opacity-0"
                    : "max-w-[120px] opacity-100 max-md:max-w-0 max-md:opacity-0"
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* ── Preserved Counter ───────────────────────────────────── */}
      {preservedCount !== null && (
        <div className="shrink-0 px-2 mb-1">
          <div className="rounded-lg border border-sidebar-border/60 bg-white/65 px-2.5 py-2 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] overflow-hidden">
            <div className="flex items-center justify-center gap-1.5">
              <Shield className="h-3 w-3 shrink-0 text-emerald-600" />
              <span className="text-sm font-bold tabular-nums text-sidebar-foreground">
                {preservedCount}
              </span>
            </div>
            <p
              className={cn(
                "text-[9px] uppercase tracking-wider text-sidebar-foreground/40 whitespace-nowrap transition-all duration-200",
                collapsed
                  ? "max-h-0 opacity-0 mt-0"
                  : "max-h-4 opacity-100 mt-0.5 max-md:max-h-0 max-md:opacity-0 max-md:mt-0"
              )}
            >
              preserved
            </p>
          </div>
        </div>
      )}

      {/* ── Collapse Toggle ───────────────────────────────────── */}
      <div className="shrink-0 border-t border-sidebar-border/60 px-2 py-2">
        <button
          onClick={toggle}
          className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-xs text-sidebar-foreground/45 transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-foreground/75 overflow-hidden"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4 shrink-0" />
          ) : (
            <ChevronLeft className="h-4 w-4 shrink-0" />
          )}
          <span
            className={cn(
              "whitespace-nowrap transition-all duration-200 overflow-hidden",
              collapsed
                ? "max-w-0 opacity-0"
                : "max-w-[80px] opacity-100 max-md:max-w-0 max-md:opacity-0"
            )}
          >
            Collapse
          </span>
        </button>
      </div>
    </aside>
  );
}
