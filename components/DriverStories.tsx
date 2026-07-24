
import React from 'react';
import { UserProfile, UserRole } from '../types';

interface DriverStoriesProps {
    drivers: UserProfile[];
    onSelectDriver: (driver: UserProfile) => void;
}

export const DriverStories: React.FC<DriverStoriesProps> = ({ drivers, onSelectDriver }) => {
    return (
        <div className="flex overflow-x-auto gap-4 p-4 no-scrollbar">
            {drivers.map((driver) => (
                <div
                    key={driver.id}
                    className="flex flex-col items-center shrink-0 cursor-pointer"
                    onClick={() => onSelectDriver(driver)}
                >
                    <div className="relative p-1 rounded-full bg-gradient-to-tr from-yellow-400 to-fuchsia-600">
                        <div className="w-16 h-16 rounded-full border-2 border-white overflow-hidden bg-gray-200">
                            <img
                                src={driver.avatar_url || `https://ui-avatars.com/api/?name=${driver.username}`}
                                alt={driver.username}
                                className="w-full h-full object-cover"
                            />
                        </div>
                        <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-sm">
                            <span className="material-icons text-[12px] text-blue-500">
                                {driver.vehicle_type === 'motorcycle' ? 'two_wheeler' : 'directions_car'}
                            </span>
                        </div>
                    </div>
                    <span className="text-[10px] mt-1 text-gray-200 font-medium truncate w-16 text-center">
                        {driver.username.split(' ')[0]}
                    </span>
                    <span className="text-[8px] text-gray-400 uppercase font-bold">
                        {driver.vehicle_type === 'motorcycle' ? 'Moto' : 'Carro'}
                    </span>
                </div>
            ))}
            {drivers.length === 0 && (
                <div className="flex flex-col items-center shrink-0 opacity-40">
                    <div className="w-16 h-16 rounded-full border-2 border-gray-600 flex items-center justify-center bg-gray-800">
                        <span className="material-icons text-gray-500">person_off</span>
                    </div>
                    <span className="text-[10px] mt-1 text-gray-500">Buscando...</span>
                </div>
            )}
        </div>
    );
};
