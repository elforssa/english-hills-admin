'use client';
import { cloneElement, useId } from 'react';
export default function FormField({ label, help, error, children }) {
  const generated = useId(), id = children.props.id || generated;
  const describedBy = [children.props['aria-describedby'], help && `${id}-help`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  return <div className="min-w-0 space-y-1 text-sm"><label className="block font-medium" htmlFor={id}>{label}</label>
    {cloneElement(children, { id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : children.props['aria-invalid'] })}
    {help && <p id={`${id}-help`} className="text-xs text-muted-foreground">{help}</p>}
    {error && <p id={`${id}-error`} role="alert" className="text-xs text-red-800">{error}</p>}
  </div>;
}
