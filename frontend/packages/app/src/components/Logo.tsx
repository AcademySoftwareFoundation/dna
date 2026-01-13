import logoIcon from '../assets/Logo.svg';
import logoFull from '../assets/logo-full-dark.svg';

interface LogoProps {
  showText?: boolean;
  width?: number | string;
}

export function Logo({ showText = false, width = 32 }: LogoProps) {
  const src = showText ? logoFull : logoIcon;
  const alt = showText ? 'DNA - Dailies Notes Assistant' : 'DNA';

  return (
    <img
      src={src}
      alt={alt}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: 'auto',
      }}
    />
  );
}
