"use client";

import * as React from "react";
import { useConnections } from "@/lib/hooks/useConnections";
import { useConnectionActions } from "@/components/accounts/useConnectionActions";
import { useToast } from "@/components/ui/Toast";
import { ConnectedAccountRow } from "@/components/accounts/ConnectedAccountRow";
import { AccountConnectCard } from "@/components/accounts/AccountConnectCard";
import { ImapConnectForm } from "@/components/accounts/ImapConnectForm";
import { OAuthConsentDialog } from "@/components/accounts/OAuthConsentDialog";
import { PROVIDER_META, pickMockEmail } from "@/components/accounts/providerMeta";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import type { AccountProvider } from "@/lib/types";

const CONNECTABLE_PROVIDERS = Object.keys(PROVIDER_META) as AccountProvider[];

export function AccountsManager() {
  const { data, isLoading } = useConnections();
  const { connect, syncNow, reconnect, disconnect } = useConnectionActions();
  const { push } = useToast();
  const [connecting, setConnecting] = React.useState<AccountProvider | null>(null);
  const [consentProvider, setConsentProvider] = React.useState<AccountProvider | null>(null);
  const [showGrid, setShowGrid] = React.useState(false);
  const [showImapForm, setShowImapForm] = React.useState(false);

  const accounts = React.useMemo(() => data?.accounts ?? [], [data]);

  React.useEffect(() => {
    if (!isLoading && accounts.length === 0) setShowGrid(true);
  }, [isLoading, accounts.length]);

  function handleConnect(provider: AccountProvider) {
    const meta = PROVIDER_META[provider];
    if (meta.soon) return;
    if (provider === "imap") {
      setShowImapForm(true);
      return;
    }
    setConsentProvider(provider);
  }

  async function confirmConnect(provider: AccountProvider) {
    const meta = PROVIDER_META[provider];
    setConsentProvider(null);
    setConnecting(provider);
    await new Promise((resolve) => window.setTimeout(resolve, 1100));
    const email = pickMockEmail(provider, accounts.length);
    const account = await connect(provider, email, meta.label);
    setConnecting(null);
    setShowGrid(false);
    push({ message: `Connected ${account.email}`, variant: "success" });
  }

  async function handleImapConnect(payload: { host: string; username: string }) {
    const email = payload.username.includes("@") ? payload.username : `${payload.username}@${payload.host}`;
    const account = await connect("imap", email, "Custom");
    setShowImapForm(false);
    setShowGrid(false);
    push({ message: `Connected ${account.email}`, variant: "success" });
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <SkeletonBlock className="h-16 w-full" />
        <SkeletonBlock className="h-16 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {accounts.length > 0 && (
        <div className="flex flex-col gap-2">
          {accounts.map((account) => (
            <ConnectedAccountRow
              key={account.id}
              account={account}
              onSyncNow={() => syncNow(account.id)}
              onReconnect={() => reconnect(account.id)}
              onDisconnect={() => {
                disconnect(account.id);
                push({ message: `Disconnected ${account.email}`, variant: "alert" });
              }}
            />
          ))}
        </div>
      )}

      {accounts.length >= 2 && (
        <div className="flex items-start gap-2.5 rounded-control border border-lime/30 bg-lime/10 px-4 py-3 font-mono text-xs text-lime">
          <Icon name="solar:magic-stick-3-linear" size={15} className="mt-0.5 shrink-0" />
          <span>
            {accounts.length} sources linked. Find Time will merge context across all of them and keep them
            visually separated.
          </span>
        </div>
      )}

      {!showGrid && (
        <button
          type="button"
          onClick={() => setShowGrid(true)}
          className="flex items-center justify-center gap-2 rounded-card border border-dashed border-white/20 px-4 py-4 font-mono text-xs uppercase tracking-wider text-white/50 transition-colors hover:border-lime/50 hover:text-lime"
        >
          <Icon name="solar:add-circle-linear" size={16} />
          Add another account
        </button>
      )}

      {showGrid && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CONNECTABLE_PROVIDERS.map((provider) => (
              <AccountConnectCard
                key={provider}
                label={PROVIDER_META[provider].label}
                icon={PROVIDER_META[provider].icon}
                description={PROVIDER_META[provider].description}
                soon={PROVIDER_META[provider].soon}
                connecting={connecting === provider}
                onClick={() => handleConnect(provider)}
              />
            ))}
          </div>

          {showImapForm && (
            <ImapConnectForm onCancel={() => setShowImapForm(false)} onConnect={handleImapConnect} />
          )}

          {accounts.length > 0 && !showImapForm && (
            <Button
              variant="quiet"
              size="sm"
              className="self-start"
              onClick={() => setShowGrid(false)}
            >
              Cancel
            </Button>
          )}
        </div>
      )}

      {consentProvider && (
        <OAuthConsentDialog
          open={!!consentProvider}
          onOpenChange={(open) => {
            if (!open) setConsentProvider(null);
          }}
          meta={PROVIDER_META[consentProvider]}
          onConfirm={() => confirmConnect(consentProvider)}
        />
      )}
    </div>
  );
}
