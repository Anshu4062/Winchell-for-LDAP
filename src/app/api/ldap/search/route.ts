import { NextRequest, NextResponse } from "next/server";
import { Client, SearchOptions } from "ldapts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchBody = {
  url: string;
  bindDN: string;
  password: string;
  baseDN: string;
  filter?: string;
  scope?: SearchOptions["scope"];
  attributes?: string[];
  sizeLimit?: number;
  tls?: {
    rejectUnauthorized?: boolean;
  };
};

export async function POST(req: NextRequest) {
  let body: SearchBody;
  try {
    body = (await req.json()) as SearchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    url,
    bindDN,
    password,
    baseDN,
    filter,
    scope,
    attributes,
    sizeLimit,
    tls,
  } = body || {};
  if (!url || !bindDN || typeof password !== "string" || !baseDN) {
    return NextResponse.json(
      { error: "Missing required fields: url, bindDN, password, baseDN" },
      { status: 400 }
    );
  }

  const client = new Client({ url, tlsOptions: tls });
  try {
    await client.bind(bindDN, password);
    const { searchEntries } = await client.search(baseDN, {
      scope: scope ?? "sub",
      filter: filter ?? "(objectClass=*)",
      attributes: attributes ?? undefined,
      sizeLimit: sizeLimit ?? 0,
    });
    return NextResponse.json({ ok: true, entries: searchEntries });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  } finally {
    try {
      await client.unbind();
    } catch {}
  }
}
