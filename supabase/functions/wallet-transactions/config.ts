export const config = {
  transferCategoryId: "244ba639-43e7-4c23-9af4-1787524a906c",
  defaultCurrency: "EUR",
  hiddenAccountIds: [
    "702fc112-a710-4588-97fd-c6b9e23711ff", // Extra
    "bf21dc0a-c9df-463f-b2a5-7779cf9d9955", // Income adjust
    "47165c8c-d24a-48bc-b653-1d3ee1b31103", // USDT TRX
  ] as string[],
  telegramApiBase: "https://api.telegram.org",
  allowedChatIds: ["-5173723108", "-5232612476"],
} as const;
