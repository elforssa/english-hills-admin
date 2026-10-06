'use client';
import { useId, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
export default function SearchField({ label = 'Rechercher', value, onChange, onClear = () => onChange(''), className = '', ...props }) {
  const id = useId(), input = useRef(null);
  return <div className={`min-w-0 ${className}`}><label htmlFor={id} className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
    <div className="relative"><Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/>
      <input ref={input} id={id} type="search" className="operational-control pl-9 pr-12" value={value} onChange={e => onChange(e.target.value)} {...props}/>
      {value && <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0" aria-label={`Effacer · ${label}`} onClick={() => { onClear(); input.current?.focus(); }}><X/></Button>}
    </div>
  </div>;
}
