const baseUrl = process.env.APP_BASE_URL?.replace(/\/$/, "");
const secret = process.env.CRON_SECRET;

if (!baseUrl) {
  console.error("APP_BASE_URL is required");
  process.exit(1);
}

if (!secret || secret.length < 32) {
  console.error("CRON_SECRET must be configured with at least 32 characters");
  process.exit(1);
}

const response = await fetch(`${baseUrl}/api/internal/equipment-overdue`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${secret}`,
  },
});

const body = await response.text();
if (!response.ok) {
  console.error(`Equipment overdue monitor failed with HTTP ${response.status}: ${body}`);
  process.exit(1);
}

console.log(body);
