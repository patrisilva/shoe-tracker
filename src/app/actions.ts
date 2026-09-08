"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { checkPassword, normaliseEmail } from "@/lib/password-rules";
import { buildReviewLinks, buildRetailLinks } from "@/lib/links";
import { refreshShoePrices } from "@/lib/refresh";
import { calendarDate } from "@/lib/shoe";
import {
  convert,
  defaultLifespan,
  parseUnit,
  unitName,
  type Unit,
} from "@/lib/units";

export type ActionResult = { error?: string };

/**
 * Creates an email-and-password account, then signs it in.
 *
 * Credentials sign-in bypasses the Prisma adapter's user creation, so the row
 * is written here and `authorize` only ever verifies an existing one.
 */
export async function signUpWithPassword(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const email = normaliseEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim() || null;

  if (!email) return { error: "Enter a valid email address." };

  const badPassword = checkPassword(password);
  if (badPassword) return { error: badPassword };

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Says the same thing whether the account is password or Google backed,
    // so this is not a way to enumerate which emails are registered.
    return {
      error: "That email already has an account. Sign in instead.",
    };
  }

  await prisma.user.create({
    data: { email, name, passwordHash: await hashPassword(password) },
  });

  // Throws a redirect on success, so nothing after this runs.
  await signIn("credentials", {
    email,
    password,
    redirectTo: "/dashboard",
  });

  return {};
}

/** Signs in an existing email-and-password account. */
export async function signInWithPassword(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const email = normaliseEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");

  if (!email || !password)
    return { error: "Enter your email and password." };

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/dashboard",
    });
  } catch (err) {
    // next/navigation signals a successful redirect by throwing, so that one
    // has to be rethrown rather than reported as a failed sign-in.
    if (
      err &&
      typeof err === "object" &&
      "digest" in err &&
      String((err as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")
    ) {
      throw err;
    }
    return { error: "That email and password do not match an account." };
  }

  return {};
}

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  return session.user.id;
}

/** The account's unit. Every distance the user types or sees is in this unit. */
async function currentUnit(userId: string): Promise<Unit> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { unit: true },
  });
  return user?.unit ?? "MI";
}

/** Every mutation re-checks that the row belongs to the signed-in user. */
async function ownedShoe(shoeId: string, userId: string) {
  const shoe = await prisma.shoe.findFirst({ where: { id: shoeId, userId } });
  if (!shoe) throw new Error("Shoe not found");
  return shoe;
}

export async function addShoe(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const userId = await requireUserId();
  const unit = await currentUnit(userId);

  const brand = String(formData.get("brand") ?? "").trim();
  const model = String(formData.get("model") ?? "").trim();
  const nickname = String(formData.get("nickname") ?? "").trim() || null;
  const startingDistance = Number(formData.get("startingDistance") ?? 0);
  const lifespanDistance = Number(
    formData.get("lifespanDistance") ?? defaultLifespan(unit)
  );
  const purchasedOnRaw = String(formData.get("purchasedOn") ?? "").trim();

  if (!brand) return { error: "Add a brand, for example Brooks." };
  if (!model) return { error: "Add a model, for example Ghost 16." };
  if (!Number.isFinite(startingDistance) || startingDistance < 0)
    return { error: `Starting ${unitName(unit)} must be zero or more.` };
  if (!Number.isFinite(lifespanDistance) || lifespanDistance <= 0)
    return { error: `Replace at must be more than zero ${unitName(unit)}.` };

  const shoe = await prisma.shoe.create({
    data: {
      userId,
      brand,
      model,
      nickname,
      startingDistance,
      lifespanDistance,
      purchasedOn: purchasedOnRaw ? calendarDate(purchasedOnRaw) : null,
      links: {
        create: [...buildReviewLinks(brand, model), ...buildRetailLinks(brand, model)],
      },
    },
  });

  // Seed today's prices so the shoe page has something on first view.
  await refreshShoePrices(shoe.id).catch(() => undefined);

  revalidatePath("/dashboard");
  redirect(`/shoes/${shoe.id}`);
}

export async function logRun(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const userId = await requireUserId();
  const unit = await currentUnit(userId);
  const shoeId = String(formData.get("shoeId") ?? "");
  const distance = Number(formData.get("distance") ?? 0);
  const ranOnRaw = String(formData.get("ranOn") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!Number.isFinite(distance) || distance <= 0)
    return { error: "Enter a distance greater than zero." };

  // Sanity ceiling on a single run, a little over the longest road ultras.
  const ceiling = unit === "KM" ? 320 : 200;
  if (distance > ceiling)
    return { error: `That is over ${ceiling} ${unitName(unit)}. Check the number.` };

  await ownedShoe(shoeId, userId);

  await prisma.run.create({
    data: {
      shoeId,
      userId,
      distance,
      // Falls back to today if the date box was cleared.
      ranOn: (ranOnRaw && calendarDate(ranOnRaw)) || calendarDate(new Date())!,
      notes,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/shoes/${shoeId}`);
  return {};
}

export async function deleteRun(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const runId = String(formData.get("runId") ?? "");

  const run = await prisma.run.findFirst({ where: { id: runId, userId } });
  if (!run) return;

  await prisma.run.delete({ where: { id: runId } });
  revalidatePath("/dashboard");
  revalidatePath(`/shoes/${run.shoeId}`);
}

export async function toggleRetired(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const shoeId = String(formData.get("shoeId") ?? "");
  const shoe = await ownedShoe(shoeId, userId);

  await prisma.shoe.update({
    where: { id: shoeId },
    data: { retiredAt: shoe.retiredAt ? null : new Date() },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/shoes/${shoeId}`);
}

export async function deleteShoe(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const shoeId = String(formData.get("shoeId") ?? "");
  await ownedShoe(shoeId, userId);

  await prisma.shoe.delete({ where: { id: shoeId } });
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

/**
 * Switches the account's unit and converts everything already stored.
 *
 * Distances live in the account's unit rather than a canonical one, so the
 * change has to be applied to the rows as well as the setting. Doing both in a
 * transaction means a failure leaves the numbers and the label in agreement.
 */
export async function setUnit(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const next = parseUnit(formData.get("unit"));
  if (!next) return;

  const from = await currentUnit(userId);
  if (from === next) return;

  const shoes = await prisma.shoe.findMany({
    where: { userId },
    select: { id: true, startingDistance: true, lifespanDistance: true },
  });
  const runs = await prisma.run.findMany({
    where: { userId },
    select: { id: true, distance: true },
  });

  await prisma.$transaction([
    ...shoes.map((s) =>
      prisma.shoe.update({
        where: { id: s.id },
        data: {
          startingDistance: convert(s.startingDistance, from, next),
          lifespanDistance: convert(s.lifespanDistance, from, next),
        },
      })
    ),
    ...runs.map((r) =>
      prisma.run.update({
        where: { id: r.id },
        data: { distance: convert(r.distance, from, next) },
      })
    ),
    prisma.user.update({ where: { id: userId }, data: { unit: next } }),
  ]);

  revalidatePath("/dashboard");
  for (const shoe of shoes) revalidatePath(`/shoes/${shoe.id}`);
}
