"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
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

/**
 * Email and password, in two modes on one form. The toggle keeps sign-up and
 * sign-in in the same place rather than sending people to a second page, which
 * matters when the difference is one extra field.
 */
export function EmailAuthForm() {
  const [mode, setMode] = useState<"signup" | "signin">("signup");

  const [signUpState, signUpAction] = useActionState<ActionResult, FormData>(
    signUpWithPassword,
    {}
  );
  const [signInState, signInAction] = useActionState<ActionResult, FormData>(
    signInWithPassword,
    {}
  );

  const isSignUp = mode === "signup";
  const state = isSignUp ? signUpState : signInState;

  return (
    <>
      <form action={isSignUp ? signUpAction : signInAction}>
        {state.error && <p className="error">{state.error}</p>}

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
          {isSignUp && (
            <p className="hint">
              {MIN_PASSWORD_LENGTH} characters or more. Length beats symbols.
            </p>
          )}
        </label>

        <Submit
          label={isSignUp ? "Create account" : "Sign in"}
          pendingLabel={isSignUp ? "Creating account…" : "Signing in…"}
        />
      </form>

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
