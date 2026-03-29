import type { Database } from "@/lib/supabase/database.types";

type CartCategory = Database["public"]["Enums"]["menu_category"];

const VALID_CATEGORIES: readonly CartCategory[] = [
  "appetizers",
  "entrees",
  "desserts",
  "drinks",
  "lunch",
  "breakfast",
  "specials",
] as const;

export function normalizeMenuCategory(input: string): CartCategory {
  if (VALID_CATEGORIES.includes(input as CartCategory)) {
    return input as CartCategory;
  }

  // fallback (choose your safest default)
  return "entrees";
}