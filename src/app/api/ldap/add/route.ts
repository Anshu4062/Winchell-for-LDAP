import { NextRequest, NextResponse } from "next/server";
import { Client } from "ldapts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AddBody = {
  url: string;
  bindDN: string;
  password: string;
  entryDN: string;
  attributes: Record<string, string | string[]>;
  tls?: { rejectUnauthorized?: boolean };
};

export async function POST(req: NextRequest) {
  let body: AddBody;
  try {
    body = (await req.json()) as AddBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { url, bindDN, password, entryDN, attributes, tls } = body || {};
  if (
    !url ||
    !bindDN ||
    typeof password !== "string" ||
    !entryDN ||
    !attributes
  ) {
    return NextResponse.json(
      {
        error:
          "Missing required fields: url, bindDN, password, entryDN, attributes",
      },
      { status: 400 }
    );
  }

  const client = new Client({ url, tlsOptions: tls });
  try {
    await client.bind(bindDN, password);
    await client.add(entryDN, attributes);
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
