import React from 'react';

interface MarqueeProps {
    text: string;
}

export const MarqueeBanner: React.FC<MarqueeProps> = ({ text }) => (
    <div className="bg-gradient-to-r from-purple-900 via-indigo-800 to-purple-900 overflow-hidden relative h-8 flex items-center shadow-md z-30 shrink-0">
        <div className="animate-marquee whitespace-nowrap flex gap-10 items-center w-full">
            <span className="text-yellow-300 font-bold text-sm flex items-center gap-2">
                <span className="material-icons text-sm">stars</span>
                {text}
            </span>
            <span className="text-white font-medium text-xs">Instale o App e participe dos sorteios exclusivos.</span>
            <span className="text-yellow-300 font-bold text-sm flex items-center gap-2">
                <span className="material-icons text-sm">emoji_events</span>
                SORTEIO ATIVO AGORA!
            </span>
            <span className="text-white font-medium text-xs">Clique no ícone do Bingo para ver sua cartela.</span>
            <span className="text-yellow-300 font-bold text-sm flex items-center gap-2 ml-10">
                <span className="material-icons text-sm">stars</span>
                {text}
            </span>
            <span className="text-white font-medium text-xs">Instale o App e participe dos sorteios exclusivos.</span>
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent w-1/2 h-full -skew-x-12 animate-shimmer pointer-events-none"></div>
    </div>
);
