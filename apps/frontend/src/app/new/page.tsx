"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiPath } from "@/lib/api";

type FormState = {
  jobTitle: string;
  company: string;
  jobDescription: string;
  userSkills: string;
  salaryExpectation: string;
  otherContext: string;
};

const INITIAL: FormState = {
  jobTitle: "",
  company: "",
  jobDescription: "",
  userSkills: "",
  salaryExpectation: "",
  otherContext: "",
};

export default function NewScenarioPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(apiPath("/api/scenarios"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed: ${res.status}`);
      }
      const { scenario } = await res.json();
      router.push(`/rehearsal/${scenario.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <main className="flex-1 px-6 py-12">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-300">
          ← Back
        </Link>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">New rehearsal</h1>
        <p className="mt-2 text-neutral-400">
          Job interview. Fill in what you know — the more detail, the more realistic the sims.
        </p>

        <form className="mt-10 space-y-6" onSubmit={onSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field
              label="Job title"
              id="jobTitle"
              value={form.jobTitle}
              onChange={(v) => update("jobTitle", v)}
              placeholder="Senior Software Engineer"
              required
            />
            <Field
              label="Company"
              id="company"
              value={form.company}
              onChange={(v) => update("company", v)}
              placeholder="Acme Robotics"
              required
            />
          </div>

          <TextArea
            label="Job description"
            id="jobDescription"
            value={form.jobDescription}
            onChange={(v) => update("jobDescription", v)}
            placeholder="Paste the JD here. Responsibilities, requirements, nice-to-haves."
            rows={6}
            required
          />

          <TextArea
            label="Your relevant skills / background"
            id="userSkills"
            value={form.userSkills}
            onChange={(v) => update("userSkills", v)}
            placeholder="Paste a resume summary or bullets. Years of experience, languages, notable projects."
            rows={6}
            required
          />

          <Field
            label="Salary expectation (optional)"
            id="salaryExpectation"
            value={form.salaryExpectation}
            onChange={(v) => update("salaryExpectation", v)}
            placeholder="$180k base + equity"
          />

          <TextArea
            label="Anything else? (optional)"
            id="otherContext"
            value={form.otherContext}
            onChange={(v) => update("otherContext", v)}
            placeholder="Why you want this role, concerns, gaps you're worried they'll ask about."
            rows={4}
          />

          {error ? (
            <div className="rounded-md border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-300">
              {error}
            </div>
          ) : null}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center rounded-md bg-white px-5 py-2.5 text-sm font-medium text-neutral-950 transition hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Creating…" : "Create rehearsal"}
            </button>
            <span className="text-xs text-neutral-500">
              Next step: run your first simulation turn.
            </span>
          </div>
        </form>
      </div>
    </main>
  );
}

function Field(props: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label htmlFor={props.id} className="block">
      <span className="block text-sm font-medium text-neutral-300 mb-1.5">
        {props.label}
        {props.required ? <span className="text-neutral-500"> *</span> : null}
      </span>
      <input
        id={props.id}
        type="text"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        required={props.required}
        className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-600"
      />
    </label>
  );
}

function TextArea(props: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  required?: boolean;
}) {
  return (
    <label htmlFor={props.id} className="block">
      <span className="block text-sm font-medium text-neutral-300 mb-1.5">
        {props.label}
        {props.required ? <span className="text-neutral-500"> *</span> : null}
      </span>
      <textarea
        id={props.id}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        rows={props.rows ?? 4}
        required={props.required}
        className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-600 resize-y"
      />
    </label>
  );
}
