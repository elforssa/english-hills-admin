'use client';
import { Button } from '@/components/ui/button';
export default function CursorPager({ hasPrevious, hasMore, pending, onPrevious, onNext, label = 'Pagination', previousLabel = 'Précédent', nextLabel = 'Suivant' }) {
  return <nav aria-label={label} className="flex flex-wrap gap-2"><Button variant="outline" disabled={!hasPrevious || pending} onClick={onPrevious}>{previousLabel}</Button><Button variant="outline" disabled={!hasMore || pending} onClick={onNext}>{nextLabel}</Button></nav>;
}
