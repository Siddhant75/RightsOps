import type { Asset, PublishReceipt } from "@/domain/types";

interface PublishReceiptViewProps {
  assets: Asset[];
  receipt: PublishReceipt;
}

export function PublishReceiptView({ assets, receipt }: PublishReceiptViewProps) {
  return (
    <section className="receipt-panel" aria-labelledby="receipt-heading">
      <div className="receipt-mark" aria-hidden="true">✓</div>
      <div>
        <p className="workspace-kicker">Simulated publish receipt</p>
        <h2 id="receipt-heading">Package accepted</h2>
        <p>
          The server consumed <strong>{receipt.manifestId}</strong> once and recorded
          the published asset set.
        </p>
        <ul>
          {receipt.publishedAssetIds.map((assetId) => (
            <li key={assetId}>{assets.find((asset) => asset.id === assetId)?.title ?? assetId}</li>
          ))}
        </ul>
        <code>{receipt.receiptHash}</code>
      </div>
    </section>
  );
}
