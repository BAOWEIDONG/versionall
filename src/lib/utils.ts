import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDateTime(dateStr: string | undefined | null) {
  if (!dateStr) return '';
  try {
    const normalized = dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T');
    return format(new Date(normalized), 'yyyy年MM月dd日 HH:mm:ss');
  } catch (e) {
    return dateStr;
  }
}
