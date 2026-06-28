export class TelegramClient {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  private get baseUrl(): string {
    return "https://api.telegram.org/bot" + this.token;
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    const url = this.baseUrl + "/sendMessage";
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
      }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error("sendMessage failed: " + resp.status + ": " + body);
    }
  }
}
