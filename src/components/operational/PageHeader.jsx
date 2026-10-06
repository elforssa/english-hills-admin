export default function PageHeader({ title, description, breadcrumb, actions, headingRef }) {
  return <header className="mb-6 flex min-w-0 flex-col items-start justify-between gap-4 sm:flex-row sm:flex-wrap">
    <div className="min-w-0 w-full flex-1 sm:w-auto">{breadcrumb && <div className="mb-2 text-xs text-muted-foreground">{breadcrumb}</div>}
      <h1 ref={headingRef} tabIndex={headingRef ? -1 : undefined} className="break-words text-xl font-semibold leading-7 md:text-2xl md:leading-8">{title}</h1>
      {description && <div className="mt-1 text-sm text-muted-foreground">{description}</div>}
    </div>{actions && <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div>}
  </header>;
}
