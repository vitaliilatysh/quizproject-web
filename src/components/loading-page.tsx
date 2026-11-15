export function LoadingPage({ eyebrow, title }: Readonly<{ eyebrow: string; title: string }>) {
  return (
    <section className="section-pad content-page">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <div className="result-skeleton" />
    </section>
  );
}
