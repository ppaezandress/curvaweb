"use client";

import { HelpCircle } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";

/** Ícono "?" junto a una métrica que, al pasar el mouse o enfocarlo, explica qué significa.
 *  Accesible por teclado (el Tooltip abre en hover Y focus). Texto corto, en lenguaje simple. */
export function MetricHint({ text, side = "top" }: { text: string; side?: "top" | "right" }) {
  return (
    <Tooltip content={text} side={side} multiline>
      <span
        tabIndex={0}
        role="button"
        aria-label={text}
        className="focus-ring -m-1 inline-flex rounded-full p-1 text-muted/50 transition hover:text-accent"
      >
        <HelpCircle size={13} />
      </span>
    </Tooltip>
  );
}
