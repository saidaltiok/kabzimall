const STEPS: [string, string][] = [
  ['CONFIRMED', 'Onaylandı'],
  ['PREPARING', 'Hazırlanıyor'],
  ['READY', 'Hazır'],
  ['OUT_FOR_DELIVERY', 'Yolda'],
  ['DELIVERED', 'Teslim edildi'],
];

export default function OrderTimeline({ status }: { status: string }) {
  if (status === 'CANCELLED') {
    return <div className="error" style={{ marginTop: 0 }}>Bu sipariş iptal edildi.</div>;
  }
  const curIdx = STEPS.findIndex((s) => s[0] === status);
  return (
    <div className="track">
      {STEPS.map(([key, label], i) => {
        const cls = i < curIdx ? 'done' : i === curIdx ? 'cur' : 'todo';
        return (
          <div className={`tstep ${cls}`} key={key}>
            <div className="tdot">{i < curIdx ? '✓' : i === curIdx ? '●' : ''}</div>
            <div>
              <div className="nm">{label}</div>
              {i === curIdx && <div className="sub">şu an bu aşamada</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
