export const dynamic = "force-dynamic";

export default function Home() {
  const host = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
    ? `https://${process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL}`
    : "http://localhost:3000";

  const webhookUrl = `${host}/api/telegram/webhook`;
  const supabaseConfigured = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL !== "placeholder");
  const botConfigured = !!process.env.TELEGRAM_BOT_TOKEN;
  const geminiConfigured = !!process.env.GOOGLE_API_KEY;
  const acharyaSlug = process.env.NEXT_PUBLIC_ACHARYA_SLUG || "cowherd";
  const acharyaSchema = process.env.NEXT_PUBLIC_ACHARYA_SCHEMA || "acharya_cowherd";

  return (
    <main style={{ fontFamily: "monospace", padding: "2rem", maxWidth: "600px" }}>
      <h1>Cowherd Acharya — Telegram Bot</h1>

      <h2>Status</h2>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <tbody>
          <tr>
            <td style={{ padding: "4px 8px" }}>Telegram Bot Token</td>
            <td style={{ padding: "4px 8px" }}>{botConfigured ? "✅ configured" : "❌ missing TELEGRAM_BOT_TOKEN"}</td>
          </tr>
          <tr>
            <td style={{ padding: "4px 8px" }}>Supabase</td>
            <td style={{ padding: "4px 8px" }}>{supabaseConfigured ? "✅ configured" : "❌ missing NEXT_PUBLIC_SUPABASE_URL"}</td>
          </tr>
          <tr>
            <td style={{ padding: "4px 8px" }}>Gemini API</td>
            <td style={{ padding: "4px 8px" }}>{geminiConfigured ? "✅ configured" : "❌ missing GOOGLE_API_KEY"}</td>
          </tr>
          <tr>
            <td style={{ padding: "4px 8px" }}>Acharya slug</td>
            <td style={{ padding: "4px 8px" }}>{acharyaSlug}</td>
          </tr>
          <tr>
            <td style={{ padding: "4px 8px" }}>Acharya schema</td>
            <td style={{ padding: "4px 8px" }}>{acharyaSchema}</td>
          </tr>
        </tbody>
      </table>

      <h2>Webhook URL</h2>
      <pre style={{ background: "#f4f4f4", padding: "1rem", overflowX: "auto" }}>{webhookUrl}</pre>
      <p>Register with Telegram:</p>
      <pre style={{ background: "#f4f4f4", padding: "1rem", overflowX: "auto", fontSize: "0.85em" }}>
        {`curl -X POST https://api.telegram.org/bot<TOKEN>/setWebhook \\\n  -d url=${webhookUrl}`}
      </pre>
    </main>
  );
}
