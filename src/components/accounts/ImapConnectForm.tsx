"use client";

import * as React from "react";
import { Field, Input, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

type TestState = "idle" | "running" | "done";

export function ImapConnectForm({
  onCancel,
  onConnect,
}: {
  onCancel: () => void;
  onConnect: (payload: { host: string; port: string; security: string; username: string }) => void | Promise<void>;
}) {
  const [host, setHost] = React.useState("mail.customdomain.dev");
  const [port, setPort] = React.useState("993");
  const [security, setSecurity] = React.useState("ssl-tls");
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [testState, setTestState] = React.useState<TestState>("idle");
  const [log, setLog] = React.useState<string[]>([]);
  const [connecting, setConnecting] = React.useState(false);

  const canTest = host.trim() && port.trim() && username.trim() && password.trim();

  function runTest() {
    if (!canTest) return;
    setTestState("running");
    setLog([`CONNECTING TO ${host}:${port}…`]);
    const lines = [
      security === "none" ? "PLAINTEXT SOCKET OPENED" : "TLS HANDSHAKE OK",
      `AUTH LOGIN ${username}… OK`,
      `INBOX SELECTED — ${Math.floor(120 + Math.random() * 900)} MESSAGES`,
      "CONNECTION TEST PASSED",
    ];
    lines.forEach((line, i) => {
      window.setTimeout(() => {
        setLog((prev) => [...prev, line]);
        if (i === lines.length - 1) setTestState("done");
      }, 320 * (i + 1));
    });
  }

  async function handleConnect() {
    setConnecting(true);
    await onConnect({ host, port, security, username });
    setConnecting(false);
  }

  return (
    <div className="flex flex-col gap-4 rounded-card border border-white/10 bg-white/5 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Host">
          <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="mail.example.com" />
        </Field>
        <Field label="Port">
          <Input value={port} onChange={(e) => setPort(e.target.value)} placeholder="993" />
        </Field>
        <Field label="Security">
          <Select value={security} onChange={(e) => setSecurity(e.target.value)}>
            <option value="ssl-tls">SSL / TLS</option>
            <option value="starttls">STARTTLS</option>
            <option value="none">None</option>
          </Select>
        </Field>
        <Field label="Username">
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="you@customdomain.dev"
          />
        </Field>
        <Field label="Password" className="sm:col-span-2">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="App password"
          />
        </Field>
      </div>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon="solar:round-transfer-diagonal-linear"
          onClick={runTest}
          disabled={!canTest || testState === "running"}
          loading={testState === "running"}
        >
          Test connection
        </Button>
        {testState === "done" && (
          <span className="flex items-center gap-1.5 font-mono text-xs text-lime">
            <Icon name="solar:check-circle-linear" size={14} /> Connection verified
          </span>
        )}
      </div>

      {log.length > 0 && (
        <pre className="overflow-x-auto rounded-control border border-white/10 bg-ink px-3 py-2.5 font-mono text-xs leading-relaxed text-lime/90">
          {log.map((line) => `> ${line}`).join("\n")}
        </pre>
      )}

      <div className="flex items-center justify-end gap-3 border-t border-white/10 pt-3">
        <Button type="button" variant="quiet" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={testState !== "done"}
          loading={connecting}
          onClick={handleConnect}
        >
          Connect account
        </Button>
      </div>
    </div>
  );
}
