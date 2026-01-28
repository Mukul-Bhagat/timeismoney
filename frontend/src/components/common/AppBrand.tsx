type AppBrandProps = {
  logoUrl: string;
  size?: number;
  showText?: boolean;
  className?: string;
};

export function AppBrand({
  logoUrl,
  size = 120,
  showText = false,
  className = '',
}: AppBrandProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: showText ? '8px' : '0',
      }}
      className={className}
    >
      <img
        src={logoUrl}
        alt="TimeIsMoney"
        width={size}
        height="auto"
        style={{
          objectFit: 'contain',
          maxWidth: '100%',
        }}
      />
      {showText && (
        <span
          style={{
            fontSize: '20px',
            fontWeight: 700,
            color: '#2563eb',
          }}
        >
          TimeIsMoney
        </span>
      )}
    </div>
  );
}
