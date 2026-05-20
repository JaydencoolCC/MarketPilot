import { NextResponse } from "next/server";
import { listPublicIntegrations } from "@/lib/db/store";

export async function GET() {
  return NextResponse.json({ data: await listPublicIntegrations() });
}
