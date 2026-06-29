const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_FREE_BUSY_URL = "https://www.googleapis.com/calendar/v3/freeBusy";
const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

function pemToArrayBuffer(pem) {
  const normalized = String(pem || "")
    .replace(/\\n/g, "\n")
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

function toBase64Url(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";

  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function signJwt(unsignedToken, privateKeyPem) {
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKeyPem),
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsignedToken)
  );

  return `${unsignedToken}.${toBase64Url(new Uint8Array(signature))}`;
}

async function getServiceAccountAccessToken(config) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: config.googleServiceAccountEmail,
    scope: GOOGLE_CALENDAR_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat: issuedAt,
    exp: issuedAt + 3600
  };
  const unsignedToken = `${toBase64Url(JSON.stringify(header))}.${toBase64Url(JSON.stringify(claim))}`;
  const jwt = await signJwt(unsignedToken, config.googlePrivateKey);
  const params = new URLSearchParams();

  params.set("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer");
  params.set("assertion", jwt);

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString()
  });
  const payload = await response.json();

  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || "Google service account token request failed.");
  }

  return payload.access_token;
}

async function getOAuthRefreshAccessToken(config) {
  const params = new URLSearchParams();

  params.set("grant_type", "refresh_token");
  params.set("client_id", config.googleOAuthClientId);
  params.set("client_secret", config.googleOAuthClientSecret);
  params.set("refresh_token", config.googleOAuthRefreshToken);

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString()
  });
  const payload = await response.json();

  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || "Google OAuth refresh token request failed.");
  }

  return payload.access_token;
}

async function getGoogleAccessToken(config) {
  if (config.googleServiceAccountEmail && config.googlePrivateKey) {
    return getServiceAccountAccessToken(config);
  }

  if (config.googleOAuthClientId && config.googleOAuthClientSecret && config.googleOAuthRefreshToken) {
    return getOAuthRefreshAccessToken(config);
  }

  throw new Error("Google Calendar credentials are not configured.");
}

export async function getGoogleCalendarBusyIntervals({ config, startIso, endIso }) {
  const accessToken = await getGoogleAccessToken(config);
  const response = await fetch(GOOGLE_FREE_BUSY_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      timeMin: startIso,
      timeMax: endIso,
      items: [{ id: config.googleCalendarId }]
    })
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error?.message || "Google Calendar free/busy request failed.");
  }

  const busy = payload.calendars?.[config.googleCalendarId]?.busy || [];
  return busy.map((item) => ({
    startIso: new Date(item.start).toISOString(),
    endIso: new Date(item.end).toISOString()
  }));
}

function sanitizeCalendarText(value) {
  return String(value || "").trim();
}

function buildEventDescription(booking, config) {
  const lines = [
    "Paid AIssisted Consulting reservation confirmed through Stripe.",
    "",
    `Booking ID: ${booking.id}`,
    booking.prospectName ? `Name: ${booking.prospectName}` : "",
    booking.prospectEmail ? `Email: ${booking.prospectEmail}` : "",
    booking.prospectPhone ? `Phone: ${booking.prospectPhone}` : "",
    booking.prospectCompany ? `Company: ${booking.prospectCompany}` : "",
    booking.intakeSummary ? `Intake: ${booking.intakeSummary}` : "",
    "",
    `Reservation deposit: ${(booking.reservationAmount / 100).toLocaleString("en-US", {
      style: "currency",
      currency: booking.currency || config.currency || "usd"
    })}`
  ];

  return lines.filter(Boolean).join("\n");
}

export async function createGoogleCalendarBookingEvent({ config, booking }) {
  const accessToken = await getGoogleAccessToken(config);
  const sendUpdates = ["all", "externalOnly", "none"].includes(config.googleCalendarSendUpdates)
    ? config.googleCalendarSendUpdates
    : "all";
  const calendarId = encodeURIComponent(config.googleCalendarId);
  const url = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?sendUpdates=${encodeURIComponent(sendUpdates)}`;
  const attendeeEmail = sanitizeCalendarText(booking.prospectEmail);
  const attendees = attendeeEmail
    ? [{
        email: attendeeEmail,
        displayName: sanitizeCalendarText(booking.prospectName)
      }]
    : [];
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      summary: `AIssisted consult - ${sanitizeCalendarText(booking.prospectName || booking.prospectCompany || "Paid booking")}`,
      description: buildEventDescription(booking, config),
      start: {
        dateTime: booking.selectedTimeWindowStart,
        timeZone: booking.selectedTimeZone || config.timezone
      },
      end: {
        dateTime: booking.selectedTimeWindowEnd,
        timeZone: booking.selectedTimeZone || config.timezone
      },
      attendees,
      extendedProperties: {
        private: {
          aissistedBookingId: booking.id,
          stripeCheckoutSessionId: booking.stripeCheckoutSessionId || "",
          source: "aissisted-website-booking"
        }
      }
    })
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error?.message || "Google Calendar event creation failed.");
  }

  return {
    eventId: payload.id || "",
    htmlLink: payload.htmlLink || ""
  };
}
