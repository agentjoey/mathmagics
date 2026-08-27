interface ProgressDimensionCardProps {
  title: string;
  value: string;
  detail: string;
}

export function ProgressDimensionCard({ title, value, detail }: ProgressDimensionCardProps) {
  return (
    <article className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-stone-500">{title}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-stone-900">{value}</p>
      <p className="mt-2 text-sm leading-6 text-stone-600">{detail}</p>
    </article>
  );
}
