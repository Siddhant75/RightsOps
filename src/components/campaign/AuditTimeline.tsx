import type { AuditEvent } from "@/domain/types";

interface AuditTimelineProps {
  events: AuditEvent[];
}

export function AuditTimeline({ events }: AuditTimelineProps) {
  const visibleEvents = [...events].reverse().slice(0, 6);

  return (
    <section className="audit-panel" aria-labelledby="audit-heading">
      <div className="section-heading section-heading--compact">
        <div>
          <p className="workspace-kicker">Causal record</p>
          <h2 id="audit-heading">Audit rail</h2>
        </div>
        <p>Latest {visibleEvents.length}</p>
      </div>
      <ol className="audit-list">
        {visibleEvents.map((event) => (
          <li key={event.id}>
            <span className={`actor actor--${event.actor.toLowerCase()}`}>{event.actor}</span>
            <div>
              <strong>{event.kind.replaceAll("_", " ")}</strong>
              <p>{event.summary}</p>
            </div>
            <time dateTime={event.createdAt}>
              {new Date(event.createdAt).toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
          </li>
        ))}
      </ol>
    </section>
  );
}
