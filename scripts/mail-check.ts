/**
 * Checks the mail setup from wherever it is run.
 *
 *   npm run mail:check                 # config + connectivity only
 *   npm run mail:check you@example.com # also sends a real test message
 *
 * Worth running *inside* the deployment rather than locally: `railway run`
 * executes on your own machine with the deployment's variables, which proves
 * the credentials are valid but not that the host can reach the mail server.
 * Several platforms drop outbound SMTP silently, and that difference is
 * invisible from a laptop.
 */
import net from "net";
import { mailerConfigured, sendMail } from "../src/lib/mailer";

function probe(host: string, port: number, ms = 6000): Promise<string> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port, timeout: ms });
    const done = (result: string) => {
      socket.destroy();
      resolve(result);
    };
    socket.on("connect", () => done("open"));
    socket.on("timeout", () => done("timed out — the port is likely blocked"));
    socket.on("error", (e: NodeJS.ErrnoException) => done(e.code ?? "error"));
  });
}

async function main() {
  const to = process.argv[2];

  console.log("configured:", mailerConfigured());
  console.log("SMTP_URL set:", Boolean(process.env.SMTP_URL));
  console.log("RESEND_API_KEY set:", Boolean(process.env.RESEND_API_KEY));
  console.log("MAIL_FROM:", process.env.MAIL_FROM ?? "(derived from SMTP username)");
  console.log("AUTH_URL:", process.env.AUTH_URL ?? "(unset)");

  const smtpUrl = process.env.SMTP_URL?.trim();
  if (smtpUrl) {
    let host = "";
    let port = 0;
    try {
      const u = new URL(smtpUrl);
      host = u.hostname;
      port = Number(u.port || 587);
      // Never print the password.
      console.log(`\nSMTP target: ${host}:${port} as ${decodeURIComponent(u.username)}`);
    } catch {
      console.log("\nSMTP_URL could not be parsed");
      return;
    }

    console.log(`reachability of ${host}:${port}:`, await probe(host, port));
    // The usual alternatives, so a blocked port suggests its own fix.
    for (const alt of [587, 465, 2525].filter((p) => p !== port)) {
      console.log(`  also ${host}:${alt}:`, await probe(host, alt));
    }
    console.log("  https to api.resend.com:443:", await probe("api.resend.com", 443));
  }

  if (!to) {
    console.log("\nPass an address to send a real test message.");
    return;
  }

  console.log(`\nsending a test message to ${to}…`);
  const result = await sendMail({
    to,
    subject: "Shoe Rack mail check",
    text: "If you are reading this, outbound mail works from this deployment.",
    html: "<p>If you are reading this, outbound mail works from this deployment.</p>",
  });
  console.log("result:", JSON.stringify(result));
  if (!result.delivered) {
    console.log("Not delivered. The reason is on the [mail] line above.");
    process.exitCode = 1;
  }
}

main();
