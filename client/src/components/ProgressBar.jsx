export default function ProgressBar({
  progress = 0,
  height = 8,
  showPercent = true,
  color = 'var(--primary)',
  backgroundColor = 'var(--border)'
}) {
  const clampedProgress = Math.min(100, Math.max(0, progress));

  return (
    <div style={{ width: '100%' }}>
      <div
        style={{
          width: '100%',
          height: `${height}px`,
          backgroundColor,
          borderRadius: `${height / 2}px`,
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            width: `${clampedProgress}%`,
            height: '100%',
            backgroundColor: color,
            borderRadius: `${height / 2}px`,
            transition: 'width 0.2s ease-out'
          }}
        />
      </div>
      {showPercent && (
        <div style={{
          textAlign: 'center',
          fontSize: '0.75rem',
          color: 'var(--text-secondary)',
          marginTop: '0.25rem'
        }}>
          {clampedProgress}%
        </div>
      )}
    </div>
  );
}
