"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  resendVerification,
  signInWithPassword,
  signUpWithPassword,
  type ActionResult,
} from "@/app/actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-rules";

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      className="btn btn-solid"
      type="submit"
      disabled={pending}
      style={{ width: "100%" }}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

/** Shown after a confirmation link goes out, in place of the form. */
function CheckYourInbox({
  email,
  notDelivered,
  onBack,
}: {
  email: string;
  notDelivered?: boolean;
  onBack: () => void;
}) {
  return (
    <div className="inbox-note">
      <h3>Check your inbox</h3>
      <p>
        We sent a link to <strong>{email}</strong>. Open it to confirm the
        address, then sign in. The link lasts 24 hours.
      </p>
      {notDelivered && (
        <p className="error">
          No mail provider is configured on the server, so nothing was actually
          sent. The link was written to the server log instead.
        </p>
      )}
      <button className="btn btn-quiet" type="button" onClick={onBack}>
        Back to sign in
      </button>
    </div>
  );
}

/**
 * Email and password, in two modes on one form.
 *
 * Sign-up does not sign anyone in — it sends a confirmation link and swaps the
 * form for a "check your inbox" panel. Signing in before confirming reports
 * that specifically, with a resend button, rather than looking like a wrong
 * password.
 */
export function EmailAuthForm({
  requireVerification = false,
}: {
  requireVerification?: boolean;
}) {
  const [mode, setMode] = useState<"signup" | "signin">("signup");

  const [signUpState, signUpAction] = useActionState<ActionResult, FormData>(
    signUpWithPassword,
    {}
  );
  const [signInState, signInAction] = useActionState<ActionResult, FormData>(
    signInWithPassword,
    {}
  );
  const [resendState, resendAction] = useActionState<ActionResult, FormData>(
    resendVerification,
    {}
  );

  const isSignUp = mode === "signup";
  const state = isSignUp ? signUpState : signInState;

  // Either route can end in "we sent you a link".
  const sentTo = signUpState.sentTo ?? resendState.sentTo;
  if (sentTo) {
    return (
      <CheckYourInbox
        email={sentTo}
        notDelivered={signUpState.notDelivered ?? resendState.notDelivered}
        onBack={() => {
          setMode("signin");
          // useActionState has no reset, so a full reload is the honest way to
          // clear a submitted state rather than shadowing it with more state.
          window.location.href = "/";
        }}
      />
    );
  }

  const needsConfirming = state.error?.startsWith("Confirm your email");

  return (
    <>
      <form action={isSignUp ? signUpAction : signInAction}>
        {state.error && <p className="error">{state.error}</p>}
        {resendState.error && <p className="error">{resendState.error}</p>}

        {isSignUp && (
          <label className="field">
            <span>Name</span>
            <input name="name" autoComplete="name" placeholder="Your name" />
          </label>
        )}

        <label className="field">
          <span>Email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
          />
        </label>

        <label className="field">
          <span>Password</span>
          <input
            name="password"
            type="password"
            required
            minLength={isSignUp ? MIN_PASSWORD_LENGTH : undefined}
            autoComplete={isSignUp ? "new-password" : "current-password"}
            placeholder={isSignUp ? `At least ${MIN_PASSWORD_LENGTH} characters` : ""}
          />
        </label>
        {isSignUp && (
          <p className="hint">
            {MIN_PASSWORD_LENGTH} characters or more. Length beats symbols.
          </p>
        )}

        <Submit
          label={isSignUp ? "Create account" : "Sign in"}
          pendingLabel={
            isSignUp
              ? requireVerification
                ? "Sending link…"
                : "Creating account…"
              : "Signing in…"
          }
        />
      </form>

      {/* Its own form, so resending does not need the password field filled. */}
      {needsConfirming && (
        <form action={resendAction} style={{ marginTop: "0.75rem" }}>
          <label className="field">
            <span>Send a new link to</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
            />
          </label>
          <button className="btn" type="submit" style={{ width: "100%" }}>
            Send a new link
          </button>
        </form>
      )}

      <p className="auth-toggle">
        {isSignUp ? "Already have an account? " : "New here? "}
        <button
          type="button"
          className="btn btn-quiet"
          onClick={() => setMode(isSignUp ? "signin" : "signup")}
        >
          {isSignUp ? "Sign in" : "Create an account"}
        </button>
      </p>
    </>
  );
}
