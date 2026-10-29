"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-full bg-navy px-5 py-2 text-sm font-semibold text-white hover:bg-navy-900">
      Print or save as PDF
    </button>
  );
}
