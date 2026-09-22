'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { recordHref, safeReturnTo } from '@/lib/navigation.mjs';

function ActiveContextLink({ href, children, ...props }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const source = safeReturnTo(`${pathname}${query ? `?${query}` : ''}`, pathname);
  return <Link href={recordHref(href, source)} {...props}>{children}</Link>;
}

export default function ContextLink({ href, children, ...props }) {
  return <Suspense fallback={<span className={props.className}>{children}</span>}>
    <ActiveContextLink href={href} {...props}>{children}</ActiveContextLink>
  </Suspense>;
}
