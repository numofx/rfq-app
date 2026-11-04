export const getReadableAuthError = (message: string) => {
  const normalized = message.toLowerCase();
  const domainNotVerifiedMatch = message.match(/550 The ([^ ]+) domain is not verified/i);

  if (domainNotVerifiedMatch) {
    const failedDomain = domainNotVerifiedMatch[1];
    return `Email sender domain mismatch: ${failedDomain} is not verified in Resend. In Supabase Auth email settings, use a sender from your verified domain/subdomain (for example @noreply.numofx.com), or verify ${failedDomain} in Resend.`;
  }

  if (normalized.includes("confirmation email") || normalized.includes("smtp")) {
    return "We couldn't send the verification email. Check your Supabase Auth email provider/SMTP settings and try again.";
  }
  if (normalized.includes("rate limit")) {
    return "Too many attempts. Please wait a minute and try again.";
  }
  // Chrome reports "Failed to fetch", Safari "Load failed" and Firefox "NetworkError...".
  if (normalized.includes("network") || normalized.includes("failed to fetch") || normalized.includes("load failed")) {
    return "Network error while reaching authentication services. Please try again.";
  }

  return message;
};

export const getReadableResetError = (message: string) => {
  const normalized = message.toLowerCase();

  // No session (page opened directly), a code from another browser, or a used or expired link.
  if (
    normalized.includes("auth session missing") ||
    normalized.includes("code verifier") ||
    normalized.includes("flow state") ||
    normalized.includes("expired")
  ) {
    return "This reset link has expired or was opened in a different browser. Request a new one from the login page.";
  }

  return getReadableAuthError(message);
};
