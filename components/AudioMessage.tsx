import React, { useState, useRef, useEffect } from 'react';

interface AudioMessageProps {
    src: string;
    duration?: number; // Optional, if we have it
}

export const AudioMessage: React.FC<AudioMessageProps> = ({ src }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [playbackRate, setPlaybackRate] = useState(1);

    const audioRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const updateProgress = () => {
            setCurrentTime(audio.currentTime);
            setProgress((audio.currentTime / audio.duration) * 100);
        };

        const handleLoadedMetadata = () => {
            setDuration(audio.duration);
        };

        const handleEnded = () => {
            setIsPlaying(false);
            setProgress(0);
            setCurrentTime(0);
        };

        audio.addEventListener('timeupdate', updateProgress);
        audio.addEventListener('loadedmetadata', handleLoadedMetadata);
        audio.addEventListener('ended', handleEnded);

        return () => {
            audio.removeEventListener('timeupdate', updateProgress);
            audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
            audio.removeEventListener('ended', handleEnded);
        };
    }, []);

    const togglePlay = () => {
        if (audioRef.current) {
            if (isPlaying) {
                audioRef.current.pause();
            } else {
                audioRef.current.play();
            }
            setIsPlaying(!isPlaying);
        }
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = Number(e.target.value);
        if (audioRef.current) {
            const newTime = (val / 100) * audioRef.current.duration;
            audioRef.current.currentTime = newTime;
            setProgress(val);
        }
    };

    const toggleSpeed = () => {
        const newRate = playbackRate === 1 ? 1.5 : playbackRate === 1.5 ? 2 : 1;
        setPlaybackRate(newRate);
        if (audioRef.current) {
            audioRef.current.playbackRate = newRate;
        }
    };

    const formatTime = (time: number) => {
        if (isNaN(time)) return "0:00";
        const min = Math.floor(time / 60);
        const sec = Math.floor(time % 60);
        return `${min}:${sec < 10 ? '0' : ''}${sec}`;
    };

    return (
        <div className="flex items-center gap-3 w-full min-w-[240px] max-w-[300px] py-1">
            {/* Avatar/Icon Placeholder (Optional, can be passed as prop if needed) */}
            <div className="relative">
                <button
                    onClick={togglePlay}
                    className="w-10 h-10 rounded-full bg-gray-500/20 flex items-center justify-center hover:bg-gray-500/30 transition"
                >
                    <span className="material-icons text-gray-200 text-2xl ml-1">
                        {isPlaying ? 'pause' : 'play_arrow'}
                    </span>
                </button>
            </div>

            <div className="flex-1 flex flex-col justify-center gap-1">
                {/* Seek Bar */}
                <input
                    type="range"
                    min="0"
                    max="100"
                    value={progress || 0}
                    onChange={handleSeek}
                    className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-green-500"
                    style={{
                        background: `linear-gradient(to right, #22c55e ${progress}%, #4b5563 ${progress}%)`
                    }}
                />

                {/* Time & Speed */}
                <div className="flex justify-between items-center text-[11px] text-gray-400 font-medium">
                    <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
                    {/* <button onClick={toggleSpeed} className="bg-gray-700 px-1.5 rounded text-[10px] hover:bg-gray-600 transition">
             {playbackRate}x
          </button> */}
                </div>
            </div>

            <audio ref={audioRef} src={src} preload="metadata" className="hidden" />
        </div>
    );
};
