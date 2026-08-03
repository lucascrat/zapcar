import React, { useState } from 'react';

interface MarqueeProps {
    text: string;
}

export const MarqueeBanner: React.FC<MarqueeProps> = ({ text }) => {
    const [dismissed, setDismissed] = useState(false);

    if (dismissed) return null;

    return (
        <div className="bg-[#1a2530] border-b border-white/5 overflow-hidden relative h-7 flex items-center z-30 shrink-0">
            <div className="animate-marquee whitespace-nowrap flex gap-10 items-center flex-1 min-w-0">
                <span className="text-accent-400 font-bold text-xs flex items-center gap-2">
                    <span className="material-icons text-xs">stars</span>
                    {text}
                </span>
                <span className="text-gray-400 font-medium text-xs">Instale o App e participe dos sorteios exclusivos.</span>
                <span className="text-accent-400 font-bold text-xs flex items-center gap-2">
                    <span className="material-icons text-xs">emoji_events</span>
                    SORTEIO ATIVO AGORA!
                </span>
                <span className="text-gray-400 font-medium text-xs">Clique no ícone do Bingo para ver sua cartela.</span>
                <span className="text-accent-400 font-bold text-xs flex items-center gap-2 ml-10">
                    <span className="material-icons text-xs">stars</span>
                    {text}
                </span>
                <span className="text-gray-400 font-medium text-xs">Instale o App e participe dos sorteios exclusivos.</span>
            </div>
            <button
                onClick={() => setDismissed(true)}
                aria-label="Fechar aviso"
                className="shrink-0 w-7 h-7 flex items-center justify-center text-gray-500 hover:text-gray-300 transition-colors"
            >
                <span className="material-icons text-sm">close</span>
            </button>
        </div>
    );
};
