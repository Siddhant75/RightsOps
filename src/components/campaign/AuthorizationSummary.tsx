import type { AuthorizationSummary as AuthorizationSummaryData } from "@/components/campaign/workspace-view";

interface AuthorizationSummaryProps {
  summary: AuthorizationSummaryData;
}

export function AuthorizationSummary({ summary }: AuthorizationSummaryProps) {
  return (
    <section
      aria-atomic="true"
      aria-labelledby="authorization-heading"
      aria-live="polite"
      className={`authorization authorization--${summary.tone}`}
    >
      <div>
        <p className="workspace-kicker">Authorization</p>
        <h2 id="authorization-heading">{summary.label}</h2>
      </div>
      <div className="authorization-meter" aria-hidden="true">
        {Array.from({ length: summary.requiredCount }, (_, index) => (
          <span className={index < summary.currentCount ? "is-current" : ""} key={index} />
        ))}
      </div>
      <p>{summary.reason}</p>
    </section>
  );
}
