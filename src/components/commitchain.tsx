import { Link, useLocation } from "@tanstack/react-router";
import {
  ArrowRight,
  Check,
  CircleHelp,
  Copy,
  ExternalLink,
  Github,
  Menu,
  ShieldCheck,
  WalletCards,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { sepolia } from "wagmi/chains";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Commitment, CommitmentStatus } from "@/services/mockData";

function shortAddress(address?: string) {
  if (!address) {
    return "Connect wallet";
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5" aria-label="PromiseChain home">
      <span className="grid size-7 place-items-center bg-ink font-display text-[11px] font-bold text-lime">
        CC
      </span>
      <span className="text-[15px] font-bold tracking-tight">PromiseChain</span>
    </Link>
  );
}

export function WalletButton() {
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { address, isConnected } = useAccount();
  const { connectors, connectAsync, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const wrongNetwork = isConnected && chainId !== sepolia.id;

  // Filter and deduplicate connectors
  const hasRealProvider =
    typeof window !== "undefined" &&
    Boolean((window as unknown as { ethereum?: unknown }).ethereum);
  const namedConnectors = connectors.filter(
    (c) => c.name.toLowerCase() !== "injected" && c.name.toLowerCase() !== "mock",
  );
  const injectedConnector =
    connectors.find(
      (c) => c.name.toLowerCase() === "injected" || c.name.toLowerCase() === "mock",
    ) || connectors[0];

  const availableConnectors =
    namedConnectors.length > 0
      ? namedConnectors
      : hasRealProvider && injectedConnector
        ? [injectedConnector]
        : [];

  async function handleConnect(connector: (typeof connectors)[number]) {
    setError(null);
    setBusy(true);
    try {
      await connectAsync({ connector });
      setPickerOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to connect wallet");
    } finally {
      setBusy(false);
    }
  }

  async function handleWalletAction() {
    setError(null);
    if (busy) {
      return;
    }

    if (isConnected) {
      if (wrongNetwork) {
        setBusy(true);
        try {
          await switchChainAsync({ chainId: sepolia.id });
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Failed to switch network");
        } finally {
          setBusy(false);
        }
        return;
      }
      disconnect();
      return;
    }

    if (availableConnectors.length === 1 && availableConnectors[0]) {
      await handleConnect(availableConnectors[0]);
    } else if (availableConnectors.length > 1) {
      setPickerOpen((prev) => !prev);
    }
  }

  return (
    <div className="relative inline-block">
      <Button
        variant="accent"
        size="sm"
        onClick={handleWalletAction}
        disabled={busy || isConnecting || isSwitching}
      >
        <WalletCards className="size-3.5" />
        {!isConnected && availableConnectors.length === 0
          ? "Install a compatible wallet"
          : wrongNetwork
            ? "Switch to Sepolia"
            : shortAddress(isConnected ? address : undefined)}
      </Button>

      {pickerOpen && !isConnected && availableConnectors.length > 1 && (
        <div className="absolute right-0 top-full z-50 mt-2 w-56 border border-rule bg-panel p-2 shadow-lg">
          <div className="mb-2 px-2 py-1 text-xs font-semibold text-muted-foreground">
            Select Wallet
          </div>
          <div className="space-y-1">
            {availableConnectors.map((connector) => (
              <button
                key={connector.uid || connector.id || connector.name}
                onClick={() => handleConnect(connector)}
                disabled={busy}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium hover:bg-lime/20 focus:bg-lime/20 outline-none"
              >
                <WalletCards className="size-3.5 text-lime-soft" />
                <span>{connector.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {error && (
        <div className="absolute right-0 top-full z-50 mt-1 max-w-xs text-right font-mono text-[10px] text-danger">
          {error}
        </div>
      )}
    </div>
  );
}

export function Navbar() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const links = [
    { label: "Commitments", to: "/dashboard" as const },
    { label: "Reputation", to: "/profile" as const },
  ];
  return (
    <header className="sticky top-0 z-30 border-b border-rule bg-background/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center gap-5 px-5 py-3 sm:px-8">
        <Logo />
        <nav className="ml-5 hidden items-center gap-6 text-[13px] font-medium text-muted-foreground md:flex">
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={cn(
                "transition-colors hover:text-foreground",
                location.pathname.startsWith(link.to) && "text-foreground",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto hidden items-center gap-3 sm:flex">
          <span className="hidden font-mono text-[10px] font-medium text-faint lg:block">
            network: Sepolia
          </span>
          <WalletButton />
        </div>
        <button
          className="ml-auto grid size-9 place-items-center border border-rule md:hidden"
          onClick={() => setOpen((value) => !value)}
          aria-label="Toggle navigation"
        >
          {open ? <X className="size-4" /> : <Menu className="size-4" />}
        </button>
      </div>
      {open && (
        <div className="border-t border-rule px-5 py-4 md:hidden">
          <nav className="flex flex-col gap-3 text-sm font-semibold">
            {links.map((link) => (
              <Link key={link.to} to={link.to} onClick={() => setOpen(false)}>
                {link.label}
              </Link>
            ))}
            <Link to="/create" onClick={() => setOpen(false)}>
              Create a commitment
            </Link>
            <WalletButton />
          </nav>
        </div>
      )}
    </header>
  );
}

export function PageFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-h-screen bg-background text-foreground antialiased", className)}>
      {children}
    </div>
  );
}

export function StatusBadge({ status }: { status: CommitmentStatus }) {
  const labels = { active: "ACTIVE", completed: "COMPLETED", failed: "FAILED" };
  return (
    <span
      className={cn(
        "cc-tag inline-flex px-2.5 py-1 text-[10px] font-bold tracking-[0.12em]",
        status === "active"
          ? "bg-lime text-ink"
          : status === "completed"
            ? "bg-ink text-lime"
            : "bg-danger text-danger-foreground",
      )}
    >
      {labels[status]}
    </span>
  );
}

export function ProgressBar({ value }: { value: number }) {
  const bucket = Math.max(0, Math.min(100, Math.round(value / 10) * 10));
  return (
    <div
      className="h-1.5 w-full bg-ink/10"
      aria-label={`${value}% complete`}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={cn("h-full bg-lime transition-[width] duration-500", `progress-${bucket}`)} />
    </div>
  );
}

export function CommitmentCard({
  commitment,
  compact = false,
}: {
  commitment: Commitment;
  compact?: boolean;
}) {
  return (
    <article
      className={cn(
        "border border-rule bg-panel p-5 transition-transform duration-200 hover:-translate-y-0.5",
        compact ? "" : "sm:p-6",
      )}
    >
      <div className="flex items-center gap-2">
        <StatusBadge status={commitment.status} />
        {commitment.daysRemaining ? (
          <span className="font-mono text-[11px] font-medium text-faint">
            {commitment.daysRemaining} days remaining
          </span>
        ) : null}
        <span className="ml-auto font-mono text-[11px] font-medium text-muted-foreground">
          {commitment.reference}
        </span>
      </div>
      <div className="mt-4 flex items-start justify-between gap-4">
        <h3 className="text-lg font-bold tracking-tight sm:text-[21px]">{commitment.title}</h3>
        <div className="shrink-0 text-right">
          <p className="font-mono text-lg font-bold tracking-tight">{commitment.amount}</p>
          <p className="text-[11px] font-semibold text-muted-foreground">{commitment.token}</p>
        </div>
      </div>
      <div className="mt-4 border-t border-rule pt-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
          Success condition
        </p>
        <p className="mt-1 text-sm font-semibold">{commitment.condition}</p>
      </div>
      <div className="mt-5">
        <div className="mb-1.5 flex items-center justify-between font-mono text-[11px]">
          <span className="font-medium text-muted-foreground">Progress</span>
          <span>{commitment.progress}%</span>
        </div>
        <ProgressBar value={commitment.progress} />
      </div>
      {!compact && (
        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-rule pt-4 text-[12px]">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">Deadline</p>
            <p className="mt-0.5 font-semibold">{commitment.deadlineShort}</p>
          </div>
          <div className="text-right">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
              Beneficiary
            </p>
            <p className="mt-0.5 font-mono font-medium">{commitment.beneficiary}</p>
          </div>
        </div>
      )}
      <div className="mt-5 flex items-center justify-between border-t border-rule pt-4">
        <span className="font-mono text-[10px] text-faint">creator {commitment.creator}</span>
        <Link
          to="/commitments/$id"
          params={{ id: commitment.id }}
          className="inline-flex items-center gap-1 text-xs font-bold text-lime-soft hover:text-foreground"
        >
          View commitment <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </article>
  );
}

export function StatCard({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "neutral" | "accent" | "danger";
}) {
  return (
    <div
      className={cn(
        "border border-rule bg-panel p-4",
        tone === "accent" && "border-lime/40",
        tone === "danger" && "border-danger/30",
      )}
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">{label}</p>
      <p className="mt-1 text-[24px] font-bold tracking-tight">{value}</p>
      {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}
export function SectionEyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
      {children}
    </p>
  );
}
export function StepFlow() {
  const steps = ["Create", "Lock", "Deliver", "Verify", "Resolve"];
  return (
    <div className="mt-10">
      <SectionEyebrow>The paper trail</SectionEyebrow>
      <ol className="mt-3 flex flex-wrap items-center gap-x-1 gap-y-3">
        {steps.map((step, index) => (
          <li key={step} className="flex items-center gap-2 text-[13px] font-semibold">
            <span
              className={cn(
                "grid size-5 place-items-center text-[10px] font-bold",
                index === 0 ? "bg-lime text-ink" : "bg-ink text-lime",
              )}
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            {step}
            {index < steps.length - 1 && <span className="ml-1 h-px w-5 bg-rule" />}
          </li>
        ))}
      </ol>
    </div>
  );
}
export function Footer() {
  return (
    <footer className="border-t border-rule">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 font-mono text-[11px] sm:px-8">
        <span className="text-muted-foreground">PromiseChain / ETH escrow / on-chain resolver</span>
        <span className="text-faint">Sepolia ready / GitHub evidence metadata</span>
      </div>
    </footer>
  );
}
export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="border border-dashed border-rule px-6 py-12 text-center">
      <CircleHelp className="mx-auto size-6 text-muted-foreground" />
      <h3 className="mt-3 font-bold">{title}</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
export function TransactionRow({
  label,
  hash,
  status = "Confirmed",
  href,
}: {
  label: string;
  hash: string;
  status?: string;
  href?: string | undefined;
}) {
  const linked = Boolean(href && hash !== "Unavailable");

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule py-3 last:border-0">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">{label}</p>
        <p className="mt-1 flex items-center gap-2 font-mono text-xs font-semibold">
          {hash}
          <Copy className="size-3 text-muted-foreground" />
        </p>
      </div>
      {linked ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs font-semibold text-lime-soft hover:text-foreground"
        >
          {status}
          <ExternalLink className="size-3" />
        </a>
      ) : (
        <span className="text-xs font-semibold text-muted-foreground">{status}</span>
      )}
    </div>
  );
}
export function EvidencePanel({
  commitment,
  verified = commitment.mergeStatus === "merged",
}: {
  commitment: Commitment;
  verified?: boolean;
}) {
  return (
    <section className="border border-rule bg-panel p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center bg-ink text-lime">
            <Github className="size-4" />
          </span>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">Evidence</p>
            <h2 className="font-bold">GitHub evidence</h2>
          </div>
        </div>
        {verified ? (
          <span className="inline-flex items-center gap-1.5 bg-lime/20 px-2.5 py-1 text-[10px] font-bold tracking-[0.08em] text-lime-soft">
            <ShieldCheck className="size-3.5" /> Evidence verified
          </span>
        ) : (
          <span className="bg-danger-soft px-2.5 py-1 text-[10px] font-bold tracking-[0.08em] text-danger">
            Missing evidence
          </span>
        )}
      </div>
      <div className="mt-5 border-t border-rule pt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
              Repository
            </p>
            <p className="mt-1 text-sm font-bold">{commitment.repository}</p>
          </div>
          <div className="text-left sm:text-right">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
              Reference
            </p>
            <p className="mt-1 break-words font-mono text-xs font-bold">{commitment.condition}</p>
          </div>
        </div>
        <h3 className="mt-5 text-base font-bold">{commitment.pullRequestTitle}</h3>
        <div className="mt-4 grid gap-4 border-t border-rule pt-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Author</p>
            <p className="mt-1 font-semibold">{commitment.author}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Created</p>
            <p className="mt-1 font-semibold">{commitment.createdDate}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Merge status</p>
            <p className={cn("mt-1 font-semibold", verified ? "text-lime-soft" : "text-danger")}>
              {verified
                ? `Verified / ${commitment.mergeDate ?? "GitHub"}`
                : commitment.mergeStatus === "open"
                  ? "Open"
                  : "Not submitted"}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
export function Timeline({ commitment }: { commitment: Commitment }) {
  const events = [
    ["Commitment created", commitment.createdAt, true],
    ["Funds locked", commitment.lockedAt, true],
    [
      "Work submitted",
      commitment.submittedAt ?? "Awaiting submission",
      Boolean(commitment.submittedAt),
    ],
    [
      "Evidence verified",
      commitment.verifiedAt ?? "Awaiting verification",
      Boolean(commitment.verifiedAt),
    ],
    [
      "Funds released",
      commitment.resolvedAt ?? "Pending resolution",
      Boolean(commitment.resolvedAt),
    ],
  ] as const;
  return (
    <section>
      <div className="flex items-center justify-between">
        <div>
          <SectionEyebrow>Audit trail</SectionEyebrow>
          <h2 className="mt-2 text-2xl font-bold tracking-tight">Timeline</h2>
        </div>
        <span className="font-mono text-[10px] text-faint">{commitment.reference}</span>
      </div>
      <ol className="mt-6">
        {events.map(([title, date, done], index) => (
          <li key={title} className="relative flex gap-4 pb-6 last:pb-0">
            <div className="relative flex w-6 shrink-0 justify-center">
              <span
                className={cn(
                  "z-10 grid size-6 place-items-center border",
                  done ? "border-lime bg-lime text-ink" : "border-rule bg-background text-faint",
                )}
              >
                {done ? <Check className="size-3.5" /> : <span className="size-1.5 bg-faint" />}
              </span>
              {index < events.length - 1 && <span className="absolute top-6 h-full w-px bg-rule" />}
            </div>
            <div className="-mt-0.5">
              <p className={cn("text-sm font-bold", !done && "text-muted-foreground")}>{title}</p>
              <p className="mt-1 font-mono text-[11px] text-faint">{date}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
export function DetailHeader({ commitment }: { commitment: Commitment }) {
  return (
    <div className="border-b border-rule bg-panel">
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={commitment.status} />
          {commitment.daysRemaining && (
            <span className="font-mono text-[11px] text-muted-foreground">
              {commitment.daysRemaining} days remaining
            </span>
          )}
          <span className="ml-auto font-mono text-[11px] text-faint">{commitment.reference}</span>
        </div>
        <div className="mt-5 grid gap-8 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-8">
            <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
              {commitment.title}
            </h1>
            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
              {commitment.description}
            </p>
          </div>
          <div className="lg:col-span-4 lg:text-right">
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-faint">
              Escrowed amount
            </p>
            <p className="mt-1 text-4xl font-bold tracking-tight">
              {commitment.amount}{" "}
              <span className="text-base text-muted-foreground">{commitment.token}</span>
            </p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              deadline / {commitment.deadline}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
export function Shell({ children }: { children: ReactNode }) {
  return (
    <PageFrame>
      <Navbar />
      {children}
      <Footer />
    </PageFrame>
  );
}
