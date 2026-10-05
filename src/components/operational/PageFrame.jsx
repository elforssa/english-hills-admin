import { cn } from '@/lib/utils';
const widths = { standard: 'max-w-standard', detail: 'max-w-detail', form: 'max-w-form', wide: 'max-w-wide' };
export default function PageFrame({ width = 'standard', className, children, ...props }) {
  return <div className={cn('operational mx-auto w-full min-w-0 px-4 py-6 md:px-6', widths[width], className)} {...props}>{children}</div>;
}
