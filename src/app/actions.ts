"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { checkPassword, normaliseEmail } from "@/lib/password-rules";
import { issueVerification, verificationRequired } from "@/lib/verification";
import { buildReviewLinks, buildRetailLinks } from "@/lib/links";
import { refreshShoePrices } from "@/lib/refresh";
import { refreshShoeReviews } from "@/lib/reviews";
import { calendarDate } from "@/lib/shoe";
import {
  convert,
  defaultLifespan,
  parseUnit,
  unitName,
  type Unit,
} from "@/lib/units";

export type ActionResult = {
  error?: string;
  /** Set once a confirmation link has gone out, so the form can say so. */
  sentTo?: string;
  /** True when no mail provider is configured and the link was only logged. */
  notDelivered?: boolean;
};

/**
 * Creates an email-and-password account.
 *
 * With REQUIRE_EMAIL_VERIFICATION off — the default — the account is usable
 * straight away and this signs in. With it on, the account is created with
 * `emailVerified` null, a confirmation link is emailed, and no session is
 * issued until that link is opened.
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

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, emailVerified: true },
  });

  const mustConfirm = verificationRequired();

  if (existing) {
    // An unconfirmed account can be nudged again — that is the same person
    // finishing the job, not a new registration.
    if (mustConfirm && existing.passwordHash && existing.emailVerified === null) {
      const issued = await issueVerification(existing.id, email);
      if (!issued.ok) {
        return {
          error: `A link was just sent. Try again in ${issued.retryInSeconds}s.`,
        };
      }
      return { sentTo: email, notDelivered: !issued.delivered };
    }

    // Otherwise the same line whether it is a password or Google account, so
    // this is not a way to discover which addresses are registered.
    return { error: "That email already has an account. Sign in instead." };
  }

  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash: await hashPassword(password),
      // With confirmation off the address is taken at face value, so the
      // account is usable immediately and `authorize` has nothing to refuse.
      emailVerified: mustConfirm ? null : new Date(),
    },
    select: { id: true },
  });

  if (mustConfirm) {
    const issued = await issueVerification(user.id, email);
    return {
      sentTo: email,
      notDelivered: issued.ok ? !issued.delivered : false,
    };
  }

  // Throws a redirect on success, so nothing after this runs.
  await signIn("credentials", { email, password, redirectTo: "/dashboard" });
  return {};
}

/** Sends another confirmation link for an address that has not confirmed. */
export async function resendVerification(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  if (!verificationRequired()) return {};

  const email = normaliseEmail(String(formData.get("email") ?? ""));
  if (!email) return { error: "Enter a valid email address." };

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, emailVerified: true },
  });

  // Always reports success. Saying "no such account" here would turn the
  // resend form into an address checker.
  if (!user || !user.passwordHash || user.emailVerified !== null) {
    return { sentTo: email };
  }

  const issued = await issueVerification(user.id, email);
  if (!issued.ok) {
    return { error: `A link was just sent. Try again in ${issued.retryInSeconds}s.` };
  }
  return { sentTo: email, notDelivered: !issued.delivered };
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
    // Auth.js puts our subclass's `code` on the error, which is the only way
    // to tell "not confirmed yet" apart from "wrong password".
    const code = (err as { code?: unknown })?.code;
    if (code === "email_not_verified") {
      return {
        error:
          "Confirm your email first. Check your inbox, or send a new link below.",
      };
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

/** The browser downscales first, so anything larger than this is not a photo. */
const MAX_IMAGE_BYTES = 900_000;

/**
 * Narrows a form entry to an uploaded file by shape rather than by class.
 *
 * `instanceof File` looks like the obvious check and is a portability trap:
 * `File` only became a Node global in v20, so it throws ReferenceError on
 * older runtimes. Duck-typing works on every version, and `Blob` is used here
 * as a type only, which erases at compile time.
 */
function isUpload(value: FormDataEntryValue | null): value is File {
  return (
    !!value &&
    typeof value !== "string" &&
    typeof (value as File).arrayBuffer === "function" &&
    typeof (value as File).size === "number"
  );
}

/**
 * Stores an uploaded shoe photo, if one came with the form.
 *
 * The type is taken from the bytes rather than the client-supplied MIME, since
 * that value is trivially spoofed and gets echoed back by the image route.
 */
async function saveShoeImage(shoeId: string, formData: FormData): Promise<void> {
  const file = formData.get("photo");
  if (!isUpload(file) || file.size === 0) return;
  if (file.size > MAX_IMAGE_BYTES) return;

  const bytes = Buffer.from(await file.arrayBuffer());
  const sniffed = sniffImageType(bytes);
  if (!sniffed) return;

  await prisma.shoeImage.upsert({
    where: { shoeId },
    create: { shoeId, data: bytes, mimeType: sniffed },
    update: { data: bytes, mimeType: sniffed },
  });
}

/** Magic-number check. Returns null for anything that is not a real image. */
function sniffImageType(b: Buffer): string | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47
  )
    return "image/png";
  if (
    b.toString("ascii", 0, 4) === "RIFF" &&
    b.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  return null;
}

/** Replaces the photo on a shoe the caller owns. */
export async function setShoePhoto(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const shoeId = String(formData.get("shoeId") ?? "");
  await ownedShoe(shoeId, userId);

  await saveShoeImage(shoeId, formData);
  revalidatePath("/dashboard");
  revalidatePath(`/shoes/${shoeId}`);
}

export async function removeShoePhoto(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const shoeId = String(formData.get("shoeId") ?? "");
  await ownedShoe(shoeId, userId);

  await prisma.shoeImage.deleteMany({ where: { shoeId } });
  revalidatePath("/dashboard");
  revalidatePath(`/shoes/${shoeId}`);
}

/**
 * Searches the review sites for a shoe on demand.
 *
 * Called from the shoe page when `reviewsCheckedAt` is null, which is how
 * shoes added before the finder existed pick up their articles. Runs from the
 * client after paint rather than during render, so four network round trips
 * never delay the page.
 */
export async function findReviewsNow(shoeId: string): Promise<void> {
  const session = await auth();
  const userId = session?.user?.id;

  // Returns quietly rather than throwing when the caller has no business
  // here. This runs from an effect after paint, so by the time it lands the
  // shoe may have been deleted or the session may have gone — neither is
  // worth turning into an error, and `requireUserId` would redirect while
  // `ownedShoe` would throw, both of which reach the browser as an uncaught
  // rejection and surface as "a client-side exception".
  if (!userId) return;
  const owned = await prisma.shoe.findFirst({
    where: { id: shoeId, userId },
    select: { id: true },
  });
  if (!owned) return;

  try {
    await refreshShoeReviews(shoeId);
  } catch {
    // Stamp it anyway so a persistently failing source does not make every
    // page view retry four sites.
    await prisma.shoe.update({
      where: { id: shoeId },
      data: { reviewsCheckedAt: new Date() },
    });
  }

  revalidatePath(`/shoes/${shoeId}`);
}

/** Edits a logged run. Distance, date and notes are all changeable. */
export async function editRun(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const userId = await requireUserId();
  const unit = await currentUnit(userId);
  const runId = String(formData.get("runId") ?? "");
  const distance = Number(formData.get("distance") ?? 0);
  const ranOnRaw = String(formData.get("ranOn") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!Number.isFinite(distance) || distance <= 0)
    return { error: "Enter a distance greater than zero." };

  const ceiling = unit === "KM" ? 320 : 200;
  if (distance > ceiling)
    return { error: `That is over ${ceiling} ${unitName(unit)}. Check the number.` };

  const run = await prisma.run.findFirst({ where: { id: runId, userId } });
  if (!run) return { error: "That run no longer exists." };

  await prisma.run.update({
    where: { id: runId },
    data: {
      distance,
      ranOn: (ranOnRaw && calendarDate(ranOnRaw)) || run.ranOn,
      notes,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/shoes/${run.shoeId}`);
  return {};
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

  await saveShoeImage(shoe.id, formData);

  // Seed prices and look for real review articles so the shoe page has
  // something on first view. Both reach out over the network, so neither is
  // allowed to fail the creation — the page degrades to search links.
  await Promise.allSettled([
    refreshShoePrices(shoe.id),
    refreshShoeReviews(shoe.id),
  ]);

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

/**
 * Corrects a pair's details after the fact.
 *
 * There was no way to do this: a pair could be added, retired or deleted, but
 * never fixed. A typo in the model, or a replacement threshold entered as 401
 * because the old form rejected 400, was permanent short of deleting the pair
 * and losing every run with it.
 *
 * Distances are in the account's unit, same as everywhere else.
 */
export async function editShoe(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const userId = await requireUserId();
  const unit = await currentUnit(userId);
  const shoeId = String(formData.get("shoeId") ?? "");
  await ownedShoe(shoeId, userId);

  const brand = String(formData.get("brand") ?? "").trim();
  const model = String(formData.get("model") ?? "").trim();
  const nickname = String(formData.get("nickname") ?? "").trim() || null;
  const startingDistance = Number(formData.get("startingDistance") ?? 0);
  const lifespanDistance = Number(formData.get("lifespanDistance") ?? 0);
  const purchasedOnRaw = String(formData.get("purchasedOn") ?? "").trim();

  if (!brand) return { error: "Add a brand, for example Brooks." };
  if (!model) return { error: "Add a model, for example Ghost 16." };
  if (!Number.isFinite(startingDistance) || startingDistance < 0)
    return { error: `Starting ${unitName(unit)} must be zero or more.` };
  if (!Number.isFinite(lifespanDistance) || lifespanDistance <= 0)
    return { error: `Replace at must be more than zero ${unitName(unit)}.` };

  await prisma.shoe.update({
    where: { id: shoeId },
    data: {
      brand,
      model,
      nickname,
      startingDistance,
      lifespanDistance,
      purchasedOn: purchasedOnRaw ? calendarDate(purchasedOnRaw) : null,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/shoes/${shoeId}`);
  return {};
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
