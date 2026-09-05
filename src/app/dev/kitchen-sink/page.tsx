"use client";

import * as React from "react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Chip } from "@/components/ui/Chip";
import { Badge, Dot } from "@/components/ui/Badge";
import { StatusDot } from "@/components/ui/StatusDot";
import { Card, StatCard } from "@/components/ui/Card";
import { Panel } from "@/components/ui/Panel";
import { Input, Textarea, Select, Switch, Field } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { ProgressMeter } from "@/components/ui/ProgressMeter";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { MarqueeTicker } from "@/components/motif/MarqueeTicker";
import { Icon } from "@/components/ui/Icon";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-b border-white/10 pb-10">
      <h2 className="font-mono text-xs uppercase tracking-widest text-lime">{title}</h2>
      <div className="flex flex-wrap items-start gap-4">{children}</div>
    </section>
  );
}

export default function KitchenSinkPage() {
  const { push } = useToast();
  const [modalOpen, setModalOpen] = React.useState(false);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [switchOn, setSwitchOn] = React.useState(true);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-12">
      <MarqueeTicker items={["Find time // kitchen sink", "Torch Genesis Broadcast", "All primitives, all states"]} />

      <h1 className="font-mono text-3xl font-medium tracking-tight text-white">Kitchen Sink</h1>

      <Section title="Buttons">
        <Button variant="primary">Primary</Button>
        <Button variant="inverse">Inverse</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="paper">Paper</Button>
        <Button variant="quiet">Quiet</Button>
        <Button variant="primary" icon="solar:magic-stick-3-linear">With icon</Button>
        <Button variant="primary" loading>Loading</Button>
        <Button variant="primary" disabled>Disabled</Button>
        <IconButton icon="solar:bell-linear" aria-label="Notifications" />
      </Section>

      <Section title="Chips, badges, dots">
        <Chip tone="lime">Deep work</Chip>
        <Chip tone="periwinkle">Design</Chip>
        <Chip tone="ember">Conflict</Chip>
        <Chip tone="amber">Admin</Chip>
        <Chip tone="paper">Paper</Chip>
        <Chip tone="outline">Outline</Chip>
        <Badge count={4} />
        <Dot tone="ember" />
        <Dot tone="lime" />
        <StatusDot tone="live" pulse />
        <StatusDot tone="alert" />
        <StatusDot tone="pending" />
        <StatusDot tone="idle" />
      </Section>

      <Section title="Cards">
        <Card tone="glass" className="w-64">Glass card</Card>
        <Card tone="ink" className="w-64">Ink card</Card>
        <Card tone="paper" className="w-64">Paper card</Card>
        <Card tone="periwinkle" className="w-64">Periwinkle card</Card>
        <StatCard
          label="Focus protected"
          value="3h 20m"
          delta="+40m"
          icon={<Icon name="solar:shield-check-linear" className="text-lime" />}
          className="w-64"
        />
      </Section>

      <Section title="Panel">
        <Panel
          title="Today's schedule"
          eyebrowChip={<Chip tone="lime">AI balanced</Chip>}
          actions={<Button size="sm" icon="solar:add-circle-linear">Add task</Button>}
          footer={<span className="font-mono text-xs text-white/35">4 CHANGES · 0 CONFLICTS</span>}
          className="w-full max-w-md"
        >
          <p className="font-mono text-sm text-white/70">Panel body content goes here.</p>
        </Panel>
      </Section>

      <Section title="Form controls">
        <Field label="Title" className="w-64">
          <Input placeholder="Add a focused task" />
        </Field>
        <Field label="Notes" className="w-64">
          <Textarea placeholder="Optional notes" />
        </Field>
        <Field label="Duration" className="w-64">
          <Select defaultValue="60">
            <option value="30">30 min</option>
            <option value="60">60 min</option>
            <option value="90">90 min</option>
          </Select>
        </Field>
        <Field label="Protect this time">
          <Switch checked={switchOn} onCheckedChange={setSwitchOn} />
        </Field>
      </Section>

      <Section title="Overlays">
        <Button onClick={() => setModalOpen(true)}>Open modal</Button>
        <Button onClick={() => setSheetOpen(true)}>Open sheet</Button>
        <Button
          onClick={() =>
            push({ message: "Task completed", variant: "success", actionLabel: "Undo", onAction: () => {} })
          }
        >
          Success toast
        </Button>
        <Button onClick={() => push({ message: "Thursday is over capacity", variant: "alert" })}>
          Alert toast
        </Button>
      </Section>

      <Section title="Progress, empty, skeleton">
        <ProgressMeter value={68} label="Weekly focus" delta="+12%" className="w-64" />
        <EmptyState
          icon="solar:inbox-line-linear"
          eyebrow="No signals yet"
          message="Connect an account to see AI-extracted context from your inbox."
          ctaLabel="Connect account"
          onCta={() => {}}
        />
        <div className="flex w-64 flex-col gap-2">
          <SkeletonBlock className="h-4 w-full" />
          <SkeletonBlock className="h-4 w-3/4" />
          <SkeletonBlock className="h-16 w-full" />
        </div>
      </Section>

      <Modal open={modalOpen} onOpenChange={setModalOpen} title="New block">
        <p className="font-mono text-sm text-white/70">Modal content.</p>
      </Modal>
      <Modal open={sheetOpen} onOpenChange={setSheetOpen} title="New block" sheet>
        <p className="font-mono text-sm text-white/70">Sheet content — bottom sheet on mobile.</p>
      </Modal>
    </div>
  );
}
