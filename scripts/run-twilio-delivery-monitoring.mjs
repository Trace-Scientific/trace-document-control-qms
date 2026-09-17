const baseUrl = process.env.APP_BASE_URL?.replace(/\/$/, "");
const secret = process.env.CRON_SECRET;

if (!baseUrl) {
  console.error("APP_BASE_URL is required");
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(baseUrl);
} catch {
  console.error("APP_BASE_URL must be a valid URL");
  process.exit(1);
}

if (parsed.protocol !== "https:") {
  console.error("APP_BASE_URL must use HTTPS");
  process.exit(1);
}

if (!secret || secret.length < 32) {
  console.error("CRON_SECRET must be configured with at least 32 characters");
  process.exit(1);
}

const response = await fetch(`${baseUrl}/api/internal/platform/twilio-delivery-monitoring`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${secret}`,
  },
  redirect: "error",
});

const body = await response.text();
if (!response.ok) {
  console.error(`Twilio delivery-status monitor failed with HTTP ${response.status}: ${body.slice(0, 1000)}`);
  process.exit(1);
}

console.log(body.slice(0, 4000));
