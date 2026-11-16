import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import { Icon, type IconName } from './Icon';
import { Spinner } from './Spinner';
import { buttonClass, cx, type ButtonSize, type ButtonVariant } from './styles';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and disables the button. */
  loading?: boolean;
  /** Full width. */
  block?: boolean;
  /** Leading icon. */
  icon?: IconName;
}

export function Button({ variant = 'primary', size = 'md', loading, block, icon, className, children, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type} className={cx(buttonClass(variant, size, block), className)}
      disabled={disabled || loading} aria-busy={loading || undefined} {...rest}
    >
      {loading ? <Spinner size={size === 'lg' ? 22 : 18} /> : icon && <Icon name={icon} size={size === 'lg' ? 22 : 20} />}
      {children}
    </button>
  );
}

export interface LinkButtonProps extends Omit<LinkProps, 'className'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  icon?: IconName;
  className?: string;
  children?: ReactNode;
}

/** A router <Link> that looks like a Button. */
export function LinkButton({ variant = 'primary', size = 'md', block, icon, className, children, ...rest }: LinkButtonProps) {
  return (
    <Link className={cx(buttonClass(variant, size, block), className)} {...rest}>
      {icon && <Icon name={icon} size={size === 'lg' ? 22 : 20} />}
      {children}
    </Link>
  );
}

/** Round icon-only button (44×44). `label` is required for screen readers. */
export function IconButton({ icon, label, className, variant = 'ghost', ...rest }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & { icon: IconName; label: string; variant?: ButtonVariant }) {
  return (
    <button type="button" aria-label={label} title={label} className={cx(buttonClass(variant, 'sm'), 'size-11 !px-0 rounded-full', className)} {...rest}>
      <Icon name={icon} />
    </button>
  );
}
