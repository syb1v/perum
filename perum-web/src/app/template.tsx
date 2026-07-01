
'use client';

import { useEffect, useState } from 'react';

export default function Template({ children }: { children: React.ReactNode }) {
    const [opacity, setOpacity] = useState(0);

    useEffect(() => {
        // Trigger fade-in
        setOpacity(1);
    }, []);

    return (
        <div
            style={{
                opacity: opacity,
                transition: 'opacity 0.3s ease-in-out',
                width: '100%',
            }}
        >
            {children}
        </div>
    );
}
