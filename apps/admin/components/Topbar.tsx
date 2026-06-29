export default function Topbar({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="topbar">
      <div>
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      <div className="who">
        <div className="meta">
          <div style={{ fontWeight: 600 }}>Said Zoroğlu</div>
          <div className="role">Fiyat yöneticisi</div>
        </div>
        <div className="av">S</div>
      </div>
    </div>
  );
}
