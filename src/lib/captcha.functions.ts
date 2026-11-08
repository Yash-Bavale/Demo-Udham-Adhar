import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Returns the public reCAPTCHA site key so the client can render the widget. */
export const getCaptchaSiteKey = createServerFn({ method: "GET" }).handler(async () => {
  return { siteKey: process.env.RECAPTCHA_SITE_KEY ?? "" };
});

/** Verifies a reCAPTCHA token server-side. Throws on failure. */
export const verifyCaptcha = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ token: z.string().min(10).max(4000) }).parse(i))
  .handler(async ({ data }) => {
    const secret = process.env.RECAPTCHA_SECRET_KEY;
    if (!secret) throw new Error("Captcha not configured on server.");
    const body = new URLSearchParams({ secret, response: data.token });
    const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const json = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
    if (!json.success) {
      throw new Error("Captcha verification failed. Please try again.");
    }
    return { ok: true };
  });
