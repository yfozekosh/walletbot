export interface RuntimeConfig {
  sheetId: string;
  baseTab: string;
  sheetRange: string;
  transferCategoryId: string;
  sheetAccountToDb: Record<string, string>;
  envelopeToAccount: Record<string, string | null>;
  excludedCategories: string[];
  excludedNotes: string[];
  google: { scope: string; tokenUrl: string; baseUrl: string };
}

export const config: RuntimeConfig = {
  sheetId: "",
  baseTab: "Base",
  sheetRange: "A:AB",

  transferCategoryId: "244ba639-43e7-4c23-9af4-1787524a906c",

  sheetAccountToDb: {
    "Spar": "Sparkasse",
    "N26 (car space)": "Mazda 3",
    "Amor": "Amortization",
    "n26 salary (6722)": "Salary",
    "yura n26 food": "Food",
    "Spar/Mono": "Mono eur",
  } as Record<string, string>,

  envelopeToAccount: {
    "spar": "Sparkasse",
    "mazda car space(6075)": "Mazda 3",
    "n26 amort (5767)": "Amortization",
    "n26 salary (6722)": "Salary",
    "vika n26 (insur + car)": null,
    "yura n26 food": "Food",
    "mono": "Mono eur",
  } as Record<string, string | null>,

  excludedCategories: ["sport", "education"],
  excludedNotes: ["Георгій", "Софія"],

  google: {
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    tokenUrl: "https://oauth2.googleapis.com/token",
    baseUrl: "https://sheets.googleapis.com/v4/spreadsheets",
  },
};
