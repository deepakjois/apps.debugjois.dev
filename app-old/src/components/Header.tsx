export default function Header() {
  return (
    <header className="site-header">
      <div className="page-wrap site-header__inner">
        <div className="site-header__copy">
          <p className="eyebrow">TanStack Start</p>
          <p className="site-header__title">Minimal SSR + RSC app</p>
        </div>
        <div className="site-header__actions">
          <a
            href="https://tanstack.com/start/latest/docs/framework/react/overview"
            className="site-link"
            target="_blank"
            rel="noreferrer"
          >
            Docs
          </a>
        </div>
      </div>
    </header>
  );
}
