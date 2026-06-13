import { LogoIcon } from "@/components/navigation/LangSafeLogo";

// --- Data ---

const MOCK_EVENTS = [
  { time: "14:23:07", agent: "DISCOVERY", color: "#1E40AF", action: "found source", detail: "Jejueo Dictionary Online" },
  { time: "14:23:12", agent: "DISCOVERY", color: "#1E40AF", action: "crawling", detail: "UNESCO Atlas of Languages" },
  { time: "14:23:18", agent: "EXTRACTION", color: "#047857", action: "processing", detail: "extracted 47 vocabulary entries" },
  { time: "14:23:24", agent: "EXTRACTION", color: "#047857", action: "save vocabulary", detail: "+47 entries" },
  { time: "14:23:28", agent: "EXTRACTION", color: "#047857", action: "save grammar", detail: "+3 patterns" },
  { time: "14:23:31", agent: "CROSS-REF", color: "#6D28D9", action: "merging", detail: "deduplicated 12 entries" },
  { time: "14:23:35", agent: "CROSS-REF", color: "#6D28D9", action: "verified", detail: "reliability score: 0.94" },
  { time: "14:23:38", agent: "ORCHESTRATOR", color: "#2563EB", action: "complete", detail: "pipeline finished" },
];

const AGENT_DOTS = [
  { color: "#1E40AF", label: "Discovery" },
  { color: "#047857", label: "Extraction" },
  { color: "#6D28D9", label: "Cross-Ref" },
  { color: "#2563EB", label: "Orchestrator" },
];

const STATS = [
  { label: "Sources", value: "23", color: "#1E40AF" },
  { label: "Vocab", value: "847", color: "#047857" },
  { label: "Audio", value: "12", color: "#6D28D9" },
];

// Dot-grid world map — approximate continent positions in 1200x800 viewBox
// Each dot: { x, y, intensity } where intensity 0=base, 1=vulnerable, 2=endangered, 3=critical
const MAP_DOTS: { x: number; y: number; intensity: number }[] = [
  // North America
  { x: 180, y: 220, intensity: 1 }, { x: 210, y: 250, intensity: 0 }, { x: 240, y: 230, intensity: 1 },
  { x: 200, y: 280, intensity: 0 }, { x: 260, y: 260, intensity: 0 }, { x: 230, y: 300, intensity: 1 },
  { x: 280, y: 280, intensity: 0 }, { x: 300, y: 310, intensity: 0 }, { x: 270, y: 330, intensity: 1 },
  { x: 310, y: 340, intensity: 0 }, { x: 250, y: 350, intensity: 0 }, { x: 320, y: 300, intensity: 0 },
  { x: 190, y: 260, intensity: 2 }, { x: 160, y: 240, intensity: 2 },
  // Central America
  { x: 260, y: 380, intensity: 2 }, { x: 280, y: 395, intensity: 2 },
  // South America
  { x: 310, y: 430, intensity: 2 }, { x: 330, y: 460, intensity: 3 }, { x: 340, y: 490, intensity: 2 },
  { x: 320, y: 510, intensity: 3 }, { x: 350, y: 530, intensity: 2 }, { x: 330, y: 550, intensity: 1 },
  { x: 340, y: 580, intensity: 1 }, { x: 310, y: 600, intensity: 0 }, { x: 350, y: 470, intensity: 3 },
  { x: 360, y: 500, intensity: 2 }, { x: 300, y: 450, intensity: 2 }, { x: 370, y: 540, intensity: 1 },
  // Europe
  { x: 540, y: 240, intensity: 0 }, { x: 560, y: 220, intensity: 0 }, { x: 580, y: 250, intensity: 0 },
  { x: 600, y: 230, intensity: 0 }, { x: 570, y: 270, intensity: 0 }, { x: 550, y: 260, intensity: 0 },
  { x: 590, y: 280, intensity: 0 }, { x: 620, y: 260, intensity: 0 }, { x: 530, y: 250, intensity: 0 },
  // Africa
  { x: 560, y: 340, intensity: 1 }, { x: 580, y: 370, intensity: 2 }, { x: 600, y: 400, intensity: 2 },
  { x: 590, y: 430, intensity: 3 }, { x: 570, y: 450, intensity: 3 }, { x: 610, y: 420, intensity: 2 },
  { x: 580, y: 480, intensity: 2 }, { x: 600, y: 510, intensity: 1 }, { x: 620, y: 460, intensity: 2 },
  { x: 560, y: 410, intensity: 2 }, { x: 630, y: 440, intensity: 1 }, { x: 590, y: 530, intensity: 0 },
  { x: 610, y: 350, intensity: 1 }, { x: 640, y: 380, intensity: 1 },
  // Middle East / Central Asia
  { x: 660, y: 290, intensity: 1 }, { x: 690, y: 310, intensity: 1 }, { x: 720, y: 300, intensity: 0 },
  { x: 650, y: 320, intensity: 1 },
  // South Asia
  { x: 750, y: 340, intensity: 1 }, { x: 780, y: 360, intensity: 2 }, { x: 760, y: 380, intensity: 2 },
  { x: 790, y: 340, intensity: 1 }, { x: 770, y: 320, intensity: 0 },
  // East Asia
  { x: 850, y: 280, intensity: 0 }, { x: 880, y: 300, intensity: 0 }, { x: 870, y: 260, intensity: 0 },
  { x: 830, y: 310, intensity: 1 }, { x: 900, y: 290, intensity: 0 },
  // Southeast Asia
  { x: 830, y: 380, intensity: 2 }, { x: 860, y: 400, intensity: 2 }, { x: 850, y: 420, intensity: 3 },
  { x: 880, y: 430, intensity: 3 }, { x: 900, y: 410, intensity: 2 },
  // Papua / Oceania — highest density of endangered languages
  { x: 920, y: 440, intensity: 3 }, { x: 950, y: 450, intensity: 3 }, { x: 940, y: 470, intensity: 3 },
  { x: 970, y: 460, intensity: 3 }, { x: 960, y: 480, intensity: 3 }, { x: 990, y: 470, intensity: 3 },
  { x: 930, y: 490, intensity: 2 }, { x: 1000, y: 450, intensity: 2 }, { x: 1010, y: 490, intensity: 2 },
  { x: 980, y: 500, intensity: 2 }, { x: 1030, y: 470, intensity: 1 },
  // Australia
  { x: 930, y: 540, intensity: 2 }, { x: 960, y: 560, intensity: 2 }, { x: 990, y: 550, intensity: 1 },
  { x: 950, y: 580, intensity: 1 }, { x: 980, y: 590, intensity: 0 }, { x: 1010, y: 570, intensity: 1 },
  { x: 940, y: 520, intensity: 2 }, { x: 1000, y: 530, intensity: 1 },
  // Pacific Islands
  { x: 1050, y: 440, intensity: 2 }, { x: 1080, y: 460, intensity: 1 }, { x: 1060, y: 500, intensity: 1 },
];

// Connection lines between nearby dots (indices into MAP_DOTS)
const MAP_LINES: [number, number][] = [
  [0, 2], [1, 3], [4, 7], [6, 9], [16, 17], [17, 18], [19, 20], [21, 22],
  [29, 30], [39, 40], [41, 42], [44, 45], [55, 56], [57, 58],
  [64, 65], [66, 67], [68, 69], [70, 71], [72, 73],
];

function dotColor(intensity: number): string {
  switch (intensity) {
    case 1: return "rgba(234, 179, 8, 0.12)";
    case 2: return "rgba(249, 115, 22, 0.15)";
    case 3: return "rgba(239, 68, 68, 0.18)";
    default: return "rgba(255, 252, 247, 0.04)";
  }
}

// --- Component ---

export default function ThumbnailPage() {
  return (
    <div
      className="relative overflow-hidden"
      style={{
        width: "1200px",
        height: "800px",
        backgroundColor: "#0F172A",
        display: "grid",
        gridTemplateColumns: "55% 45%",
      }}
    >
      {/* Layer 1: Dot-grid world map */}
      <svg
        className="pointer-events-none absolute inset-0"
        viewBox="0 0 1200 800"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Connection lines */}
        {MAP_LINES.map(([a, b], i) => (
          <line
            key={`line-${i}`}
            x1={MAP_DOTS[a].x}
            y1={MAP_DOTS[a].y}
            x2={MAP_DOTS[b].x}
            y2={MAP_DOTS[b].y}
            stroke="rgba(255, 252, 247, 0.03)"
            strokeWidth="0.5"
          />
        ))}
        {/* Dots */}
        {MAP_DOTS.map((dot, i) => (
          <circle
            key={`dot-${i}`}
            cx={dot.x}
            cy={dot.y}
            r={dot.intensity >= 2 ? 2.5 : 1.8}
            fill={dotColor(dot.intensity)}
          />
        ))}
      </svg>

      {/* Layer 2: Blue editorial wash */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: [
            "linear-gradient(115deg, rgba(10, 132, 255, 0.18), transparent 52%)",
            "linear-gradient(270deg, rgba(37, 99, 235, 0.14), transparent 58%)",
          ].join(", "),
        }}
      />

      {/* Layer 3: Grain texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat",
          backgroundSize: "128px 128px",
        }}
      />

      {/* LEFT COLUMN — Brand + Impact */}
      <div className="relative z-10 flex flex-col justify-center gap-8 pl-16 pr-8">
        {/* Logo with glow */}
        <div className="relative w-fit">
          <div
            className="absolute inset-0 blur-2xl"
            style={{
              backgroundColor: "rgba(10, 132, 255, 0.25)",
              transform: "scale(2.5)",
            }}
          />
          <LogoIcon size={140} className="relative text-[#0A84FF]" />
        </div>

        {/* Title */}
        <h1
          className="font-serif tracking-tight"
          style={{ fontSize: "88px", lineHeight: 1 }}
        >
          <span style={{ color: "#FFFFFF" }}>Lang</span>
          <span
            style={{
              color: "#0A84FF",
              textShadow: "0 2px 40px rgba(10, 132, 255, 0.3)",
            }}
          >
            Safe
          </span>
        </h1>

        {/* Dramatic stat */}
        <div className="flex flex-col gap-2">
          <p
            className="font-serif tabular-nums"
            style={{
              fontSize: "56px",
              lineHeight: 1,
              color: "#FFFFFF",
            }}
          >
            5,352
          </p>
          <p
            className="font-sans text-xs font-semibold uppercase"
            style={{
              letterSpacing: "0.2em",
              color: "rgba(255, 252, 247, 0.45)",
            }}
          >
            endangered languages mapped
          </p>
        </div>

        {/* Tagline */}
        <div className="flex flex-col gap-1">
          <p
            className="text-base"
            style={{ color: "rgba(255, 252, 247, 0.55)" }}
          >
            AI agents that discover, extract, and preserve
          </p>
          <p
            className="font-serif text-base italic"
            style={{ color: "rgba(255, 252, 247, 0.35)" }}
          >
            the world&apos;s disappearing languages.
          </p>
        </div>
      </div>

      {/* RIGHT COLUMN — Agent Pipeline Mockup */}
      <div className="relative z-10 flex flex-col items-center justify-center pr-12">
        {/* Pipeline card */}
        <div
          className="flex w-[400px] flex-col rounded-xl"
          style={{
            backgroundColor: "rgba(255, 252, 247, 0.025)",
            border: "1px solid rgba(255, 252, 247, 0.06)",
          }}
        >
          {/* Card header */}
          <div
            className="flex items-center justify-between px-5 py-3.5"
            style={{ borderBottom: "1px solid rgba(255, 252, 247, 0.06)" }}
          >
            <span
              className="font-mono text-[9px] font-semibold uppercase"
              style={{
                letterSpacing: "0.2em",
                color: "rgba(255, 252, 247, 0.4)",
              }}
            >
              Agent Pipeline
            </span>
            <div className="flex items-center gap-2">
              {AGENT_DOTS.map((dot) => (
                <div
                  key={dot.label}
                  className="rounded-full"
                  style={{
                    width: "6px",
                    height: "6px",
                    backgroundColor: dot.color,
                    boxShadow: `0 0 6px ${dot.color}60`,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Mock events */}
          <div className="flex flex-col py-2">
            {MOCK_EVENTS.map((event, i) => {
              const isLast = i >= MOCK_EVENTS.length - 2;
              return (
                <div
                  key={i}
                  className="flex items-start gap-3 px-5 py-[7px]"
                  style={{
                    borderLeft: `2px solid ${event.color}`,
                    marginLeft: "18px",
                    opacity: isLast ? 0.4 : i >= MOCK_EVENTS.length - 3 ? 0.65 : 1,
                  }}
                >
                  <span
                    className="font-mono text-[9px] shrink-0"
                    style={{ color: "rgba(255, 252, 247, 0.25)" }}
                  >
                    {event.time}
                  </span>
                  <span
                    className="font-mono text-[9px] font-semibold uppercase shrink-0"
                    style={{
                      color: event.color,
                      letterSpacing: "0.05em",
                      minWidth: "85px",
                    }}
                  >
                    {event.agent}
                  </span>
                  <span
                    className="text-[10px] truncate"
                    style={{ color: "rgba(255, 252, 247, 0.4)" }}
                  >
                    {event.action}
                    <span style={{ color: "rgba(255, 252, 247, 0.25)" }}>
                      {" — "}
                      {event.detail}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Stats row */}
        <div
          className="mt-4 flex items-center gap-6"
        >
          {STATS.map((stat) => (
            <div key={stat.label} className="flex items-center gap-2">
              <div
                className="rounded-full"
                style={{
                  width: "5px",
                  height: "5px",
                  backgroundColor: stat.color,
                  boxShadow: `0 0 4px ${stat.color}50`,
                }}
              />
              <span
                className="font-mono text-[10px]"
                style={{ color: "rgba(255, 252, 247, 0.35)" }}
              >
                {stat.label}{" "}
                <span style={{ color: "rgba(255, 252, 247, 0.55)" }}>
                  {stat.value}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
