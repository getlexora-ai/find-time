export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-blue text-white">
      <div className="text-center">
        <p className="font-mono text-xs uppercase tracking-[0.18rem] text-lime">
          Signal Lost // 404
        </p>
        <p className="mt-3 font-mono text-sm text-white/60">
          This page doesn&apos;t exist.
        </p>
      </div>
    </div>
  );
}
