"use client";

import type { CatalogEntry } from "@/lib/catalog";

interface ResultCardProps {
  recommendation: CatalogEntry;
  colorAdvice: string;
}

export default function ResultCard({ recommendation, colorAdvice }: ResultCardProps) {
  const { faceShapeLabel, faceShapeDesc, brow, eyeliner, lip } = recommendation;

  return (
    <div className="w-full flex flex-col gap-4">
      {/* Yüz şekli */}
      <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 p-5 shadow-sm">
        <p className="text-xs font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wide mb-1">
          Tespit Edilen Yüz Şekli
        </p>
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50 mb-2">{faceShapeLabel}</h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">{faceShapeDesc}</p>
      </div>

      {/* Renk analizi */}
      {colorAdvice && (
        <div className="rounded-2xl bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 p-4">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide mb-1">
            Renk Analizi
          </p>
          <p className="text-sm text-amber-900 dark:text-amber-200 leading-relaxed">{colorAdvice}</p>
        </div>
      )}

      {/* Kaş önerisi */}
      <RecommendationBlock
        category="Kaş Tasarımı"
        accent="rose"
        name={brow.name}
        description={brow.description}
        tip={brow.tip}
      />

      {/* Eyeliner önerisi */}
      <RecommendationBlock
        category="Eyeliner Hattı"
        accent="violet"
        name={eyeliner.name}
        description={eyeliner.description}
        tip={eyeliner.tip}
      />

      {/* Dudak önerisi */}
      <RecommendationBlock
        category="Dudak Dolgusu"
        accent="pink"
        name={lip.name}
        description={lip.description}
        tip={lip.tip}
      />
    </div>
  );
}

interface BlockProps {
  category: string;
  accent: "rose" | "violet" | "pink";
  name: string;
  description: string;
  tip: string;
}

const accentClasses = {
  rose: {
    bg: "bg-rose-50 dark:bg-rose-950",
    border: "border-rose-200 dark:border-rose-800",
    label: "text-rose-600 dark:text-rose-400",
    title: "text-rose-900 dark:text-rose-200",
    tip: "bg-rose-100 dark:bg-rose-900 text-rose-800 dark:text-rose-200",
  },
  violet: {
    bg: "bg-violet-50 dark:bg-violet-950",
    border: "border-violet-200 dark:border-violet-800",
    label: "text-violet-600 dark:text-violet-400",
    title: "text-violet-900 dark:text-violet-200",
    tip: "bg-violet-100 dark:bg-violet-900 text-violet-800 dark:text-violet-200",
  },
  pink: {
    bg: "bg-pink-50 dark:bg-pink-950",
    border: "border-pink-200 dark:border-pink-800",
    label: "text-pink-600 dark:text-pink-400",
    title: "text-pink-900 dark:text-pink-200",
    tip: "bg-pink-100 dark:bg-pink-900 text-pink-800 dark:text-pink-200",
  },
};

function RecommendationBlock({ category, accent, name, description, tip }: BlockProps) {
  const cls = accentClasses[accent];
  return (
    <div className={`rounded-2xl ${cls.bg} border ${cls.border} p-5`}>
      <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${cls.label}`}>
        {category}
      </p>
      <h3 className={`text-lg font-bold mb-2 ${cls.title}`}>{name}</h3>
      <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed mb-3">{description}</p>
      <div className={`rounded-xl px-3 py-2 text-xs leading-relaxed ${cls.tip}`}>
        <span className="font-semibold">Uygulama ipucu: </span>
        {tip}
      </div>
    </div>
  );
}
