import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatINR(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

export function maskUTR(utr: string | null | undefined) {
  if (!utr) return "—";
  if (utr.length <= 4) return utr;
  return `XXXX-XXXX-${utr.slice(-4)}`;
}
