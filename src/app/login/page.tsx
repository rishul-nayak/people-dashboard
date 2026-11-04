"use client";

import { useState } from "react";
import { Lock } from "lucide-react";

export default function Login() {
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(false);
    const next = new URLSearchParams(window.location.search).get("next") || "/";
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode: value, next }),
    });
    if (res.ok) {
      const body = await res.json();
      window.location.href = body.next || "/";
    } else {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <div className="text-clay-strong"><Lock size={28} aria-hidden /></div>
      <h1 className="font-serif text-[32px] leading-tight">Enter the passcode to see your people</h1>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          type="password"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Passcode"
          aria-label="Passcode"
          className="rounded-[10px] border border-line bg-card px-3 py-2.5 text-[16px]"
        />
        {error && <p className="text-[13px] text-bad" role="alert">Wrong passcode. Try again.</p>}
        <button type="submit" disabled={busy || !value} className="btn-main">
          {busy ? "Checking" : "Open"}
        </button>
      </form>
    </main>
  );
}
