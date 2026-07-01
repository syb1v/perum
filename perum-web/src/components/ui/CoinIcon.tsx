export function CoinIcon({ id = 'coinGradient', className = '', size = 18 }: { id?: string, className?: string, size?: number }) {
    return (
        <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ verticalAlign: 'middle', marginLeft: '4px' }}>
            <circle cx="12" cy="12" r="10" fill={`url(#${id})`} stroke="#F59E0B" strokeWidth="1.5" />
            <path d="M12 7L13.5 10.5L17 11L14.5 13.5L15 17L12 15L9 17L9.5 13.5L7 11L10.5 10.5L12 7Z" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="0.5" />
            <defs>
                <linearGradient id={id} x1="12" y1="2" x2="12" y2="22">
                    <stop offset="0%" stopColor="#FCD34D" />
                    <stop offset="100%" stopColor="#F59E0B" />
                </linearGradient>
            </defs>
        </svg>
    );
}
