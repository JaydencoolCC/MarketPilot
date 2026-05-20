import { NextResponse } from "next/server";
import { deleteModelIntegrationSecret } from "@/lib/db/store";
import { toErrorResponse } from "@/lib/domain/errors";

export async function DELETE() {
  try {
    const setting = await deleteModelIntegrationSecret();
    return NextResponse.json({ data: setting });
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
