import { useEffect, useState } from 'react';
import {
  Building2,
  Coffee,
  Scissors,
  ShoppingBag,
  Sparkles,
  Store,
  Utensils,
} from 'lucide-react';
import type { CompanyLogoIcon } from '../utils/invoiceTemplate';

interface CompanyLogoBadgeProps {
  logoImageUrl?: string;
  logoIcon?: CompanyLogoIcon;
  logoText: string;
  alt: string;
  className?: string;
  iconClassName?: string;
  bgClassName?: string;
  textClassName?: string;
}

export function CompanyIconGlyph({
  icon,
  className = 'h-4 w-4',
}: {
  icon?: CompanyLogoIcon;
  className?: string;
}) {
  switch (icon) {
    case 'store':
      return <Store className={className} />;
    case 'coffee':
      return <Coffee className={className} />;
    case 'utensils':
      return <Utensils className={className} />;
    case 'sparkles':
      return <Sparkles className={className} />;
    case 'shopping_bag':
      return <ShoppingBag className={className} />;
    case 'scissors':
      return <Scissors className={className} />;
    case 'building':
      return <Building2 className={className} />;
    default:
      return null;
  }
}

export function CompanyLogoBadge({
  logoImageUrl,
  logoIcon = 'monogram',
  logoText,
  alt,
  className = 'h-10 w-10 rounded-lg',
  iconClassName = 'h-5 w-5',
  bgClassName = 'bg-[#08382D]',
  textClassName = 'text-white',
}: CompanyLogoBadgeProps) {
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [logoImageUrl]);

  const cleanUrl = (logoImageUrl || '').trim();
  if (cleanUrl && !imgFailed) {
    return (
      <img
        src={cleanUrl}
        alt={alt}
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
        className={`${className} shrink-0 object-cover border border-slate-200 bg-white`}
      />
    );
  }

  const glyph = <CompanyIconGlyph icon={logoIcon} className={iconClassName} />;

  return (
    <div
      aria-label={alt}
      className={`${className} shrink-0 flex items-center justify-center font-bold ${bgClassName} ${textClassName}`}
    >
      {logoIcon !== 'monogram' ? glyph : logoText}
    </div>
  );
}
