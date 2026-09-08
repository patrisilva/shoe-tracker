import { auth } from "@/auth";
import { prisma } from "@/lib/db";

/**
 * Serves a shoe's uploaded photo.
 *
 * Ownership is checked on every request rather than trusting the id: shoe ids
 * are cuids and unguessable in practice, but a photo is user content and one
 * account's rack should not be readable from another's session.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return new Response("Not authorised", { status: 401 });

  const shoe = await prisma.shoe.findFirst({
    where: { id, userId: session.user.id },
    select: { image: { select: { data: true, mimeType: true, updatedAt: true } } },
  });
  if (!shoe?.image) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(shoe.image.data), {
    headers: {
      "content-type": shoe.image.mimeType,
      // Private: it is one user's photo, so no shared cache should hold it.
      "cache-control": "private, max-age=3600",
      etag: `"${shoe.image.updatedAt.getTime()}"`,
    },
  });
}
