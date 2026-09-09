"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { checkPassword, normaliseEmail } from "@/lib/password-rules";
import { ACCESS_DENIED_MESSAGE, isAllowed } from "@/lib/access";
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

  // Checked here as well as in the signIn callback so the form can say why
  // inline, rather than bouncing through an error page after the account has
  // already been created.
  if (!isAllowed(email)) return { error: ACCESS_DENIED_MESSAGE };

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
  const userId = await requireUserId();
  await ownedShoe(shoeId, userId);

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
