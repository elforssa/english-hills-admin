"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button, buttonVariants } from "@/components/ui/button";

const Pagination = ({
  className,
  ...props
}) => (
  <nav
    role="navigation"
    aria-label="Pagination"
    className={cn("mx-auto flex w-full justify-center", className)}
    {...props} />
)
Pagination.displayName = "Pagination"

const PaginationContent = React.forwardRef(({ className, ...props }, ref) => (
  <ul
    ref={ref}
    className={cn("flex flex-row items-center gap-1", className)}
    {...props} />
))
PaginationContent.displayName = "PaginationContent"

const PaginationItem = React.forwardRef(({ className, ...props }, ref) => (
  <li ref={ref} className={cn("", className)} {...props} />
))
PaginationItem.displayName = "PaginationItem"

const PaginationLink = ({
  className,
  isActive,
  size = "icon",
  ...props
}) => (
  <a
    aria-current={isActive ? "page" : undefined}
    className={cn(buttonVariants({
      variant: isActive ? "outline" : "ghost",
      size,
    }), className)}
    {...props} />
)
PaginationLink.displayName = "PaginationLink"

const PaginationPrevious = ({
  className,
  ...props
}) => (
  <PaginationLink
    aria-label="Page précédente"
    size="default"
    className={cn("gap-1 pl-2.5", className)}
    {...props}>
    <ChevronLeft className="h-4 w-4" />
    <span>Précédent</span>
  </PaginationLink>
)
PaginationPrevious.displayName = "PaginationPrevious"

const PaginationNext = ({
  className,
  ...props
}) => (
  <PaginationLink
    aria-label="Page suivante"
    size="default"
    className={cn("gap-1 pr-2.5", className)}
    {...props}>
    <span>Suivant</span>
    <ChevronRight className="h-4 w-4" />
  </PaginationLink>
)
PaginationNext.displayName = "PaginationNext"

const PaginationEllipsis = ({
  className,
  ...props
}) => (
  <span
    aria-hidden
    className={cn("flex h-9 w-9 items-center justify-center", className)}
    {...props}>
    <MoreHorizontal className="h-4 w-4" />
    <span className="sr-only">Autres pages</span>
  </span>
)
PaginationEllipsis.displayName = "PaginationEllipsis"

export {
  Pagination,
  PaginationContent,
  PaginationLink,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
}

// -----------------------------------------------------------------------------
// SimplePager — default export. Mirrors the `{page, total, pageSize, onChange}`
// API the existing Vite pages call against. Built on top of the shadcn
// primitives above so styling stays consistent.
// -----------------------------------------------------------------------------
function SimplePager({ page, total, pageSize, onChange, className, pending = false }) {
  const pageCount = Math.max(1, Math.ceil((total || 0) / (pageSize || 1)));
  if (pageCount <= 1) return null;

  const go = (p) => {
    const clamped = Math.min(Math.max(1, p), pageCount);
    if (clamped !== page) onChange?.(clamped);
  };

  // Compact window: current page ±2 with first/last anchors and ellipses.
  const pages = [];
  const window = 2;
  const lo = Math.max(2, page - window);
  const hi = Math.min(pageCount - 1, page + window);
  pages.push(1);
  if (lo > 2) pages.push('…-left');
  for (let i = lo; i <= hi; i++) pages.push(i);
  if (hi < pageCount - 1) pages.push('…-right');
  if (pageCount > 1) pages.push(pageCount);

  return <Pagination className={cn("operational flex-wrap gap-2 px-3 py-3 border-t border-border", className)}>
    <Button variant="outline" disabled={pending || page <= 1} onClick={() => go(page - 1)} aria-label="Page précédente">Précédent</Button>
    <span className="text-xs tabular-nums sm:hidden" aria-current="page">{page} / {pageCount}</span>
    <PaginationContent className="hidden sm:flex">{pages.map((p,i)=>typeof p === 'number' ? <PaginationItem key={`p-${p}`}><Button variant={p===page ? 'secondary' : 'ghost'} size="icon" aria-label={`Page ${p}`} aria-current={p===page ? 'page' : undefined} disabled={pending} onClick={()=>go(p)}>{p}</Button></PaginationItem> : <PaginationItem key={`e-${i}`}><PaginationEllipsis/></PaginationItem>)}</PaginationContent>
    <Button variant="outline" disabled={pending || page >= pageCount} onClick={() => go(page + 1)} aria-label="Page suivante">Suivant</Button>
  </Pagination>;
}

export default SimplePager;
