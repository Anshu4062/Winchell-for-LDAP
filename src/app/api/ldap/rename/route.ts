import { NextRequest, NextResponse } from "next/server";
import { Client } from "ldapts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RenameBody = {
  url: string;
  bindDN: string;
  password: string;
  entryDN: string;
  newRdn: string;
  deleteOldRdn?: boolean;
  newSuperior?: string;
  tls?: { rejectUnauthorized?: boolean };
};

export async function POST(req: NextRequest) {
  let body: RenameBody;
  try {
    body = (await req.json()) as RenameBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { url, bindDN, password, entryDN, newRdn, newSuperior, tls } =
    body || {};
  if (!url || !bindDN || typeof password !== "string" || !entryDN || !newRdn) {
    return NextResponse.json(
      {
        error:
          "Missing required fields: url, bindDN, password, entryDN, newRdn",
      },
      { status: 400 }
    );
  }

  const client = new Client({ url, tlsOptions: tls });
  try {
    await client.bind(bindDN, password);
    // modifyDN(dn, newRdn, controls?) — to move, use rename with newSuperior via separate call if supported.
    await client.modifyDN(entryDN, newRdn);
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  } finally {
    try {
      await client.unbind();
    } catch {}
  }
}
