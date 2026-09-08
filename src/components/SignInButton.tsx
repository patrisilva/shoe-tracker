import { signIn } from "@/auth";

/**
 * Google's four-colour "G". Google's branding terms require the mark to be
 * shown unaltered, so the paths are the official ones and it is never recoloured
 * to match the page.
 */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18c-.44-1.32-.69-2.73-.69-4.18s.25-2.86.69-4.18v-5.7H4.34A21.99 21.99 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  );
}

/** Apple's mark, drawn in a single colour as their guidelines require. */
function AppleMark() {
  return (
    <svg viewBox="0 0 384 512" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M318.7 268.7c-.2-36.7 16.4-64.4 49.3-84.9-18.4-26.3-46.1-40.8-82.7-43.6-34.8-2.7-72.9 20.2-86.6 20.2-14.4 0-48.2-19.2-74.7-19.2C60.1 141.2 0 184.3 0 272.4c0 26.1 4.8 53 14.4 80.8 12.8 36.5 29.5 68.9 50.2 97.1 17.8 24.1 32.4 36.2 43.9 36.2 15.6 0 23.4-8.4 44.9-8.4 21.1 0 28.3 8.4 44.9 8.4 11.9 0 26.6-12.6 44.1-37.7 20.6-29.6 35-58.2 43.2-85.9-33.8-16-50.1-42.6-50.1-95.5zM256.6 91.5c15.4-18.6 23-40.6 23-65.9 0-3.4-.2-6.9-.7-10.4-14.9.6-30.1 8.1-45.7 22.5-15.3 14.2-23 30.2-23 48 0 3.1.3 6.4.9 9.9 25.4 1.9 39.7-.5 44.6-4.1z"
      />
    </svg>
  );
}

const PROVIDERS = {
  google: { label: "Continue with Google", Mark: GoogleMark },
  apple: { label: "Continue with Apple", Mark: AppleMark },
} as const;

export type ProviderId = keyof typeof PROVIDERS;

export function SignInButton({ provider }: { provider: ProviderId }) {
  const { label, Mark } = PROVIDERS[provider];

  return (
    <form
      action={async () => {
        "use server";
        await signIn(provider, { redirectTo: "/dashboard" });
      }}
    >
      <button className={`provider-btn provider-${provider}`} type="submit">
        <span className="provider-mark">
          <Mark />
        </span>
        <span className="provider-label">{label}</span>
      </button>
    </form>
  );
}
