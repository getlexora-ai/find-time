import { Icon } from "@/components/ui/Icon";

const features = [
  {
    icon: "solar:sort-by-time-linear",
    title: "Real calendar mechanics",
    desc: "Hour-by-hour grid, not an abstraction — every block sits exactly where it happens.",
  },
  {
    icon: "solar:letter-linear",
    title: "Reads across every inbox",
    desc: "Connect more than one Gmail account. Context merges; nothing gets sent on your behalf.",
  },
  {
    icon: "solar:meditation-round-linear",
    title: "Protects deep work",
    desc: "Flexible blocks re-plan around new meetings. Protected time never moves without asking.",
  },
];

export function FeatureTriptych() {
  return (
    <div className="px-6 py-20 sm:px-10">
      <div className="mx-auto grid max-w-5xl gap-px overflow-hidden rounded-card border border-white/10 bg-white/10 md:grid-cols-3">
        {features.map((f) => (
          <div key={f.title} className="bg-blue-700 p-8">
            <Icon name={f.icon} size={22} className="mb-4 text-lime" />
            <p className="font-mono text-base font-medium text-white">{f.title}</p>
            <p className="mt-2 font-mono text-xs leading-relaxed text-white/60">{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
