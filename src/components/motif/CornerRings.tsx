export function CornerRings() {
  return (
    <div className="pointer-events-none absolute -right-6 -top-6 h-36 w-36">
      <div className="absolute inset-0 rounded-full border border-lime/20" />
      <div className="absolute inset-4 rounded-full border border-lime/30" />
    </div>
  );
}
