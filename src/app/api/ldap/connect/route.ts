import { NextRequest, NextResponse } from "next/server";
import { Client } from "ldapts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ConnectBody = {
  url: string;
  bindDN: string;
  password: string;
  tls?: {
    rejectUnauthorized?: boolean;
  };
};

export async function POST(req: NextRequest) {
  let body: ConnectBody;
  try {
    body = (await req.json()) as ConnectBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { url, bindDN, password, tls } = body || {};
  if (!url || !bindDN || typeof password !== "string") {
    return NextResponse.json(
      { error: "Missing required fields: url, bindDN, password" },
      { status: 400 }
    );
  }

  const client = new Client({ url, tlsOptions: tls });
  try {
    await client.bind(bindDN, password);
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 401 });
  } finally {
    try {
      await client.unbind();
    } catch {}
  }
}
