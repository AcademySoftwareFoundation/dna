import logoIcon from '../assets/Logo.svg';
import logoFullDark from '../assets/logo-full-dark.svg';
import logoFullLight from '../assets/logo-full-light.svg';
import { useThemeMode } from '../contexts';

interface LogoProps {
  showText?: boolean;
  width?: number | string;
}

export function Logo({ showText = false, width = 32 }: LogoProps) {
  const { mode } = useThemeMode();
  const logoFull = mode === 'light' ? logoFullLight : logoFullDark;
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
