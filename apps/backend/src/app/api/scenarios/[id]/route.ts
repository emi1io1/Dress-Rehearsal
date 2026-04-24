import { NextResponse } from "next/server";
import { getScenario, listSimulationRuns } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const scenario = await getScenario(id);
  if (!scenario) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const runs = await listSimulationRuns(id);
  return NextResponse.json({ scenario, runs });
}
