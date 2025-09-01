import { NextRequest, NextResponse } from "next/server";
import { Change, Client, Attribute } from "ldapts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ModifyOperation = {
  type: "add" | "delete" | "replace";
  attribute: string;
  values: unknown[];
};

type ModifyBody = {
  url: string;
  bindDN: string;
  password: string;
  entryDN: string;
  changes: ModifyOperation[];
  tls?: { rejectUnauthorized?: boolean };
};

export async function POST(req: NextRequest) {
  let body: ModifyBody;
  try {
    body = (await req.json()) as ModifyBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { url, bindDN, password, entryDN, changes, tls } = body || {};
  if (
    !url ||
    !bindDN ||
    typeof password !== "string" ||
    !entryDN ||
    !changes?.length
  ) {
    return NextResponse.json(
      {
        error:
          "Missing required fields: url, bindDN, password, entryDN, changes",
      },
      { status: 400 }
    );
  }

  const mapped: Change[] = changes.map(
    (c) =>
      new Change({
        operation: c.type,
        modification: new Attribute({
          type: c.attribute,
          values: (c.values as string[]) ?? [],
        }),
      })
  );

  const client = new Client({ url, tlsOptions: tls });
  try {
    await client.bind(bindDN, password);
    await client.modify(entryDN, mapped);
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
