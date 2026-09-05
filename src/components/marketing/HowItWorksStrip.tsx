import { Icon } from "@/components/ui/Icon";

const stations = [
  { n: "01", label: "Connect", desc: "Link your Gmail accounts, calendars, and to-do lists.", icon: "solar:letter-linear" },
  { n: "02", label: "Extract", desc: "AI reads commitments and deadlines out of your inbox.", icon: "solar:magnifer-linear" },
  { n: "03", label: "Propose", desc: "A draft plan appears — nothing moves until you say so.", icon: "solar:magic-stick-3-linear" },
  { n: "04", label: "Protect", desc: "Deep work defends itself when new meetings land.", icon: "solar:shield-check-linear" },
];

export function HowItWorksStrip() {
  return (
    <div className="px-6 py-20 sm:px-10">
      <p className="mb-8 text-center font-mono text-xs uppercase tracking-eyebrow text-lime">
        How it works
      </p>
      <div className="mx-auto grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {stations.map((s) => (
          <div key={s.n} className="rounded-xl border border-white/10 bg-white/[0.05] p-5">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-mono text-xs text-white/35">{s.n}</span>
              <Icon name={s.icon} className="text-lime" />
            </div>
            <p className="font-mono text-sm font-medium text-white">{s.label}</p>
            <p className="mt-1.5 font-mono text-xs leading-relaxed text-white/55">{s.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
