import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";

const tenantSchema = z.object({
  name: z.string().trim().min(1).max(120),
  legalName: z.string().trim().min(1).max(200),
  street: z.string().trim().min(1).max(200),
  zip: z.string().trim().min(1).max(20),
  city: z.string().trim().min(1).max(120),
  country: z.string().trim().length(2).optional(),
  taxId: z.string().trim().max(100).optional(),
  vatId: z.string().trim().max(100).optional(),
});

const registrationSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(72),
  name: z.string().trim().max(120).optional(),
  tenant: tenantSchema.optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const parsed = registrationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Bitte prüfe E-Mail, Passwort und Unternehmensangaben." },
      { status: 400 },
    );
  }

  const { email: rawEmail, password, name, tenant } = parsed.data;
  const email = rawEmail.toLowerCase();
  if (Buffer.byteLength(password, "utf8") > 72) {
    return NextResponse.json(
      { error: "Das Passwort darf höchstens 72 Bytes lang sein." },
      { status: 400 },
    );
  }

  try {
    const passwordHash = await hash(password, 12);
    const user = await db.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: { email, passwordHash, name: name || null },
        select: { id: true, email: true, name: true },
      });

      if (tenant) {
        await tx.tenant.create({
          data: {
            ...tenant,
            country: tenant.country?.toUpperCase() ?? "DE",
            memberships: {
              create: { userId: createdUser.id, role: "OWNER" },
            },
          },
        });
      }

      return createdUser;
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Für diese E-Mail-Adresse besteht bereits ein Konto." },
        { status: 409 },
      );
    }
    console.error("Registration failed", error);
    return NextResponse.json(
      { error: "Das Konto konnte gerade nicht erstellt werden." },
      { status: 500 },
    );
  }
}
