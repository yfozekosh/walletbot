export const config = {
  telegramApiBase: "https://api.telegram.org",
  allowedChatIds: ["-5173723108", "-5232612476"],
  supabaseFunctionsUrl: (projectRef: string) => `https://${projectRef}.supabase.co/functions/v1`,
};
