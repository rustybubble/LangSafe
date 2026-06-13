"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, useInView } from "framer-motion";
import {
  ArrowRight,
  BookOpenCheck,
  ChevronDown,
  GitMerge,
  Search,
  ShieldCheck,
} from "lucide-react";
import { LogoIcon } from "@/components/navigation/LangSafeLogo";
import { SponsorFooter } from "@/components/dashboard/sponsor-footer";
import { fetchLanguages } from "@/lib/api";

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.2 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.25, 0.1, 0.25, 1] as const },
  },
};

function AnimatedCount({
  target,
  suffix = "",
}: {
  target: number;
  suffix?: string;
}) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  useEffect(() => {
    if (!inView || target === 0) return;
    const duration = 1600;
    const start = performance.now();

    function step(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  }, [inView, target]);

  return (
    <span ref={ref}>
      {count.toLocaleString()}
      {suffix}
    </span>
  );
}

const FEATURES = [
  {
    icon: Search,
    title: "Discover",
    description:
      "Agents locate dictionaries, papers, recordings, and community archives for endangered languages.",
    color: "#1E40AF",
  },
  {
    icon: GitMerge,
    title: "Cross-reference",
    description:
      "Vocabulary and grammar are merged across sources with provenance, confidence, and semantic graph links.",
    color: "#6D28D9",
  },
  {
    icon: BookOpenCheck,
    title: "Revitalize",
    description:
      "Community review turns archive entries into lesson packs, flashcards, and oral-history prompts.",
    color: "#047857",
  },
];

export default function SplashPage() {
  const [stats, setStats] = useState({
    totalEndangered: 3142,
    criticallyEndangered: 577,
    preserved: 4,
  });

  useEffect(() => {
    fetchLanguages({ limit: 1 }).then((data) => {
      setStats({
        totalEndangered: data.stats.total_endangered,
        criticallyEndangered: data.stats.critically_endangered,
        preserved: data.stats.with_preservation_data,
      });
    });
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <section className="relative flex min-h-[86svh] flex-col justify-center overflow-hidden px-6 py-16">
        <Image
          src="/assets/linghacks-hero.png"
          alt="An elder speaker and student documenting language at an archive table"
          fill
          priority
          className="object-cover object-center"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(4,22,49,0.92),rgba(6,40,82,0.72)_38%,rgba(10,132,255,0.18)_72%,rgba(10,132,255,0.08))]" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background to-transparent" />

        <motion.div
          className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-start gap-7"
          variants={stagger}
          initial="hidden"
          animate="visible"
        >
          <motion.div
            variants={fadeUp}
            className="inline-flex items-center gap-2 rounded-full border border-white/18 bg-white/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-white/78 backdrop-blur-md"
          >
            <ShieldCheck className="h-3 w-3 text-[#66B3FF]" />
            LingHacks VII · June 13-14, 2026
          </motion.div>

          <motion.div variants={fadeUp} className="max-w-2xl">
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/12 text-[#66B3FF] backdrop-blur-md">
                <LogoIcon size={34} />
              </span>
              <span className="text-lg font-semibold tracking-tight text-white/78">
                LangSafe
              </span>
            </div>
            <h1 className="font-serif text-5xl leading-[0.96] tracking-tight text-white md:text-7xl">
              LangSafe{" "}
              <span className="block text-[#66B3FF]">LingHacks</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-white/72 md:text-lg">
              AI agents preserve endangered-language fragments from the web,
              then communities verify them and turn them into learning material.
            </p>
          </motion.div>

          <motion.div
            variants={fadeUp}
            className="flex flex-col gap-3 sm:flex-row"
          >
            <Link
              href="/dashboard"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#0A84FF] px-6 text-sm font-medium text-white shadow-[0_14px_34px_rgba(10,132,255,0.28)] transition-colors hover:bg-[#0071E3]"
            >
              Open Demo
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/studio"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/8 px-6 text-sm font-medium text-white/82 backdrop-blur-sm transition-colors hover:bg-white/14 hover:text-white"
            >
              Revitalization Studio
            </Link>
          </motion.div>

          <motion.div
            variants={fadeUp}
            className="grid w-full max-w-2xl grid-cols-3 gap-3 pt-2"
          >
            {[
              { value: stats.totalEndangered, suffix: "+", label: "at risk" },
              { value: stats.criticallyEndangered, suffix: "", label: "critical" },
              { value: stats.preserved, suffix: "", label: "demo archives" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="border-t border-white/16 pt-3 text-white"
              >
                <div className="font-serif text-3xl tabular-nums">
                  <AnimatedCount target={stat.value} suffix={stat.suffix} />
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-white/48">
                  {stat.label}
                </div>
              </div>
            ))}
          </motion.div>
        </motion.div>

        <motion.div
          className="absolute bottom-5 left-1/2 z-10 -translate-x-1/2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4, duration: 0.8 }}
        >
          <ChevronDown className="h-5 w-5 text-white/25" />
        </motion.div>
      </section>

      <section className="bg-background py-14">
        <div className="mx-auto max-w-5xl px-6">
          <div className="mb-8 flex items-center gap-4">
            <div className="h-px flex-1 bg-border/40" />
            <p className="shrink-0 text-[10px] uppercase tracking-[0.2em] text-muted-foreground/45">
              LingHacks demo loop
            </p>
            <div className="h-px flex-1 bg-border/40" />
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {FEATURES.map((feature, i) => (
              <motion.div
                key={feature.title}
                className="relative rounded-lg border border-border/50 bg-card/70 p-6"
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.45, delay: i * 0.08 }}
              >
                <div
                  className="absolute left-6 right-6 top-0 h-px"
                  style={{ backgroundColor: feature.color, opacity: 0.4 }}
                />
                <div
                  className="mb-4 flex h-9 w-9 items-center justify-center rounded-md"
                  style={{ backgroundColor: `${feature.color}12` }}
                >
                  <feature.icon className="h-4 w-4" style={{ color: feature.color }} />
                </div>
                <h3 className="font-serif text-base tracking-tight">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <SponsorFooter />
    </div>
  );
}
