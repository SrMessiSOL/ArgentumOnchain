import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import config from "../config";

type PasswordResetEmailInput = {
  to: string;
  displayName: string;
  resetUrl: string;
  locale?: "en" | "es";
};

let sesClient: SESv2Client | null = null;

function getSesClient(): SESv2Client {
  if (!config.sesRegion || !config.sesAccessKeyId || !config.sesSecretAccessKey || !config.sesFromEmail) {
    throw new Error("Amazon SES is not configured");
  }

  if (!sesClient) {
    sesClient = new SESv2Client({
      region: config.sesRegion,
      credentials: {
        accessKeyId: config.sesAccessKeyId,
        secretAccessKey: config.sesSecretAccessKey,
      },
    });
  }

  return sesClient;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildPasswordResetHtml({ displayName, resetUrl, locale = "en" }: PasswordResetEmailInput): string {
  const safeName = escapeHtml(displayName);
  const safeUrl = escapeHtml(resetUrl);

  return `
<!DOCTYPE html>
<html lang="${locale}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${locale === "es" ? "Recuperar contraseña" : "Reset password"}</title>
  </head>
  <body style="margin:0;padding:0;background:#09090b;font-family:Arial,sans-serif;color:#e7e5e4;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:radial-gradient(circle at top,#1f293755,transparent 35%),linear-gradient(180deg,#0c0a09,#111827);padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#111827;border:1px solid rgba(255,255,255,0.08);border-radius:28px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,0.45);">
            <tr>
              <td style="padding:28px 28px 20px;background:radial-gradient(circle at top,#f59e0b33,transparent 55%),linear-gradient(135deg,#1c1917,#0f172a);">
                <div style="font-size:11px;letter-spacing:0.34em;text-transform:uppercase;color:#fde68a;opacity:0.85;">AOWeb</div>
                <h1 style="margin:14px 0 8px;font-size:30px;line-height:1.2;color:#fafaf9;">${locale === "es" ? "Recupera tu acceso" : "Recover your account"}</h1>
                <p style="margin:0;font-size:15px;line-height:1.7;color:#d6d3d1;">${locale === "es" ? "Hola" : "Hello"} ${safeName}, ${locale === "es" ? "recibimos un pedido para cambiar la contraseña de tu cuenta." : "we received a request to reset your account password."}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#d6d3d1;">${locale === "es" ? "El enlace vence en 30 minutos y solo sirve una vez." : "This link expires in 30 minutes and can only be used once."}</p>
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 20px;">
                  <tr>
                    <td align="center" bgcolor="#fde68a" style="border-radius:16px;">
                      <a href="${safeUrl}" style="display:inline-block;padding:14px 22px;font-size:15px;font-weight:700;color:#111827;text-decoration:none;">${locale === "es" ? "Cambiar contraseña" : "Reset password"}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 10px;font-size:13px;line-height:1.7;color:#a8a29e;">${locale === "es" ? "Si el boton no funciona, copia y pega este link en tu navegador:" : "If the button does not work, copy and paste this link into your browser:"}</p>
                <p style="margin:0 0 20px;word-break:break-word;font-size:13px;line-height:1.7;color:#67e8f9;">${safeUrl}</p>
                <div style="border-radius:18px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.03);padding:16px;">
                  <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#fef3c7;">${locale === "es" ? "Seguridad" : "Security"}</p>
                  <p style="margin:0;font-size:13px;line-height:1.7;color:#d6d3d1;">${locale === "es" ? "Si no fuiste vos, ignora este mensaje. Tu contraseña actual seguira funcionando hasta que completes el cambio." : "If you did not request this, ignore this message. Your current password will keep working until you complete the reset."}</p>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim();
}

export function buildPasswordResetText({ displayName, resetUrl, locale = "en" }: PasswordResetEmailInput): string {
  return [
    `${locale === "es" ? "Hola" : "Hello"} ${displayName},`,
    "",
    (locale === "es" ? "Recibimos un pedido para cambiar la password de tu cuenta de AOWeb." : "We received a request to reset your AOWeb account password."),
    "",
    (locale === "es" ? "Abre este link para elegir una nueva password:" : "Open this link to choose a new password:"),
    resetUrl,
    "",
    (locale === "es" ? "El enlace vence en 30 minutos y solo se puede usar una vez." : "This link expires in 30 minutes and can only be used once."),
    (locale === "es" ? "Si no fuiste vos, ignora este email." : "If you did not request this, ignore this email."),
  ].join("\n");
}

export async function sendPasswordResetEmail(input: PasswordResetEmailInput): Promise<void> {
  const client = getSesClient();

  await client.send(new SendEmailCommand({
    FromEmailAddress: `${config.sesFromName} <${config.sesFromEmail}>`,
    Destination: {
      ToAddresses: [input.to],
    },
    Content: {
      Simple: {
        Subject: {
          Data: input.locale === "es" ? "AOWeb | Recuperacion de contraseña" : "AOWeb | Password reset",
          Charset: "UTF-8",
        },
        Body: {
          Html: {
            Data: buildPasswordResetHtml(input),
            Charset: "UTF-8",
          },
          Text: {
            Data: buildPasswordResetText(input),
            Charset: "UTF-8",
          },
        },
      },
    },
  }));
}
