import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/cn";

interface DeltaProps {
  value: number | null;
  text: string;
  className?: string;
}

export default function Delta({ value, text, className }: DeltaProps) {
  value = value ?? 0;
  const tone =
    value > 0 ? "text-brand-500" : value < 0 ? "text-loss-500" : "text-ink-400";
  const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-medium tabular-nums",
        tone,
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {text}
    </span>
  );
}
