'use client';
export function IGotItButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-4 py-2 bg-emerald-500 text-white rounded-full text-sm hover:bg-emerald-600 disabled:opacity-40"
    >
      我懂了 🎉
    </button>
  );
}
