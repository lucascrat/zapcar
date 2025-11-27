
import React, { useState, useEffect } from 'react';
import { UserProfile, BingoSettings, BingoCard } from '../types';
import { fetchBingoSettings, getOrCreateBingoCard, subscribeToBingo } from '../services/supabaseClient';

interface BingoUserViewProps {
  currentUser: UserProfile;
  onClose: () => void;
}

export const BingoUserView: React.FC<BingoUserViewProps> = ({ currentUser, onClose }) => {
  const [settings, setSettings] = useState<BingoSettings | null>(null);
  const [card, setCard] = useState<BingoCard | null>(null);
  const [drawnSet, setDrawnSet] = useState<Set<number>>(new Set());

  useEffect(() => {
    loadData();

    const sub = subscribeToBingo(() => {
       loadData(); // Atualiza se sortearem numero
    });
    return () => { sub.unsubscribe(); }
  }, []);

  const loadData = async () => {
      const s = await fetchBingoSettings();
      setSettings(s);
      setDrawnSet(new Set(s.drawn_numbers));

      const c = await getOrCreateBingoCard(currentUser.id);
      setCard(c);
  };

  const getYoutubeId = (url: string) => {
     if(!url) return null;
     // Regex mais robusto para capturar ID de vários formatos de URL do Youtube
     const regExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
     const match = url.match(regExp);
     return match ? match[1] : null;
  };

  if (!settings || !card) return <div className="text-white p-8">Carregando Bingo...</div>;

  const hits = card.numbers.filter(n => drawnSet.has(n)).length;
  const isWinner = hits >= card.numbers.length;
  const videoId = getYoutubeId(settings.youtube_link);

  return (
    <div className="flex-1 flex flex-col h-full bg-[#111b21] text-white relative overflow-y-auto custom-scrollbar">
       {/* Header */}
       <div className="bg-purple-900 p-4 flex justify-between items-center shadow-lg shrink-0">
           <div className="flex items-center gap-2">
               <span className="material-icons text-yellow-400 text-3xl">casino</span>
               <h1 className="text-xl font-bold text-white tracking-wider">PRÊMIOS CHEGOJÁ</h1>
           </div>
           <button onClick={onClose} className="text-white hover:text-gray-300">
               <span className="material-icons">close</span>
           </button>
       </div>

       <div className="flex flex-col lg:flex-row gap-6 p-4 max-w-6xl mx-auto w-full">
           
           {/* Left Column: Prize Info */}
           <div className="lg:w-1/2 space-y-6">
                <div className="bg-[#1f2c34] rounded-xl overflow-hidden shadow-lg border border-gray-700">
                    <img src={settings.prize_image} alt="Prêmio" className="w-full h-48 object-cover" />
                    <div className="p-4">
                        <h2 className="text-2xl font-bold text-yellow-400 mb-2">{settings.prize_description}</h2>
                        <div className="flex items-center justify-between text-sm text-gray-400">
                            <span>Sorteio ativo</span>
                            <span>{settings.drawn_numbers.length} números chamados</span>
                        </div>
                    </div>
                </div>

                {videoId && (
                    <div className="bg-[#1f2c34] rounded-xl overflow-hidden shadow-lg border border-gray-700">
                        {/* Wrapper para garantir 16:9 responsivo sem plugins extras */}
                        <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                             <iframe 
                                 className="absolute top-0 left-0 w-full h-full"
                                 src={`https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&origin=${encodeURIComponent(window.location.origin)}`}
                                 title="YouTube video player" 
                                 frameBorder="0" 
                                 allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                                 allowFullScreen
                                 referrerPolicy="strict-origin-when-cross-origin"
                             ></iframe>
                        </div>
                    </div>
                )}
           </div>

           {/* Right Column: The Card */}
           <div className="lg:w-1/2">
               <div className="bg-white rounded-xl p-4 shadow-2xl relative">
                   <div className="absolute -top-3 -right-3 bg-red-600 text-white w-12 h-12 rounded-full flex items-center justify-center font-bold shadow-lg animate-bounce z-10">
                       {hits}/{card.numbers.length}
                   </div>
                   
                   <h3 className="text-center text-gray-800 font-bold text-lg mb-4 uppercase tracking-widest border-b pb-2">Minha Cartela</h3>
                   
                   <div className="grid grid-cols-5 gap-2">
                       {card.numbers.map((num, idx) => {
                           const marked = drawnSet.has(num);
                           return (
                               <div 
                                 key={idx}
                                 className={`
                                    aspect-square flex items-center justify-center text-lg sm:text-2xl font-bold rounded-full transition-all duration-500 border-2
                                    ${marked 
                                        ? 'bg-purple-600 text-white border-purple-800 scale-105 shadow-md' 
                                        : 'bg-gray-100 text-gray-800 border-gray-200 hover:bg-gray-200'
                                    }
                                 `}
                               >
                                   {num}
                               </div>
                           );
                       })}
                   </div>

                   {isWinner && (
                       <div className="mt-6 bg-green-500 text-white p-4 rounded-lg text-center font-bold text-xl animate-pulse shadow-lg border-4 border-green-600">
                           🎉 BINGO! VOCÊ GANHOU! 🎉
                       </div>
                   )}
               </div>

               {/* Last called numbers */}
               <div className="mt-6">
                   <h4 className="text-gray-400 text-sm mb-2 uppercase">Últimos Sorteados</h4>
                   <div className="flex gap-2 flex-wrap">
                       {settings.drawn_numbers.slice(-8).reverse().map((n, i) => (
                           <div key={i} className="w-10 h-10 rounded-full bg-[#2a3942] border border-gray-600 flex items-center justify-center font-mono text-yellow-400 font-bold shadow-sm">
                               {n}
                           </div>
                       ))}
                   </div>
               </div>
           </div>
       </div>
    </div>
  );
};
