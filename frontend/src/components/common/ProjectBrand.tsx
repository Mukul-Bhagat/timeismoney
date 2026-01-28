import { useState } from 'react';

type ProjectBrandProps = {
  name: string;
  logoUrl?: string;
  size?: number;
  onClick?: () => void;
};

export function ProjectBrand({
  name,
  logoUrl,
  size = 32,
  onClick,
}: ProjectBrandProps) {
  const [imageError, setImageError] = useState(false);

  const handleImageError = () => {
    setImageError(true);
  };

  const logoContent = () => {
    // If logo URL exists and image hasn't errored, show logo
    if (logoUrl && !imageError) {
      return (
        <img
          src={logoUrl}
          alt={name}
          width={size}
          height={size}
          className="rounded-full object-cover"
          style={{
            borderRadius: '50%',
            objectFit: 'cover',
            flexShrink: 0,
          }}
          onError={handleImageError}
        />
      );
    }
    // Fallback: show first letter avatar
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          backgroundColor: '#e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: size * 0.5,
          fontWeight: 600,
          color: '#475569',
          flexShrink: 0,
        }}
      >
        {name.charAt(0).toUpperCase()}
      </div>
    );
  };

  const content = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      {onClick ? (
        <div
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          style={{ cursor: 'pointer' }}
        >
          {logoContent()}
        </div>
      ) : (
        logoContent()
      )}
      <span style={{ fontWeight: 500, color: '#1e293b' }}>{name}</span>
    </div>
  );

  return content;
}
