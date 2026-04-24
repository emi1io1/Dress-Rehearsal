import { NextResponse } from "next/server";
import { z } from "zod";
import { createScenario } from "@/lib/store";

export const runtime = "nodejs";

const BodySchema = z.object({
  jobTitle: z.string().min(1),
  company: z.string().min(1),
  jobDescription: z.string().min(1),
  userSkills: z.string().min(1),
  salaryExpectation: z.string().default(""),
  otherContext: z.string().default(""),
  userGoals: z.array(z.string()).default([]),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const goals = parsed.data.userGoals.length
    ? parsed.data.userGoals
    : [
        "Show up as a strong fit for the role",
        "Surface specific impact I've had in past roles",
        parsed.data.salaryExpectation
          ? `Negotiate toward ${parsed.data.salaryExpectation}`
          : "Clarify compensation expectations",
      ];

  const scenario = await createScenario({
    userId: "demo-user",
    context: {
      jobTitle: parsed.data.jobTitle,
      company: parsed.data.company,
      jobDescription: parsed.data.jobDescription,
      userSkills: parsed.data.userSkills,
      salaryExpectation: parsed.data.salaryExpectation,
      otherContext: parsed.data.otherContext,
    },
    userGoals: goals,
  });

  return NextResponse.json({ scenario });
}
