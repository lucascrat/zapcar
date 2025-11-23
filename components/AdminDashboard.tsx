

import React, { useEffect, useState, useRef } from 'react';
import { fetchAllDriversForAdmin, deleteDriver, updateDriverStatus, updateDriverVehicle } from '../services/supabaseClient';
import { UserProfile, DriverStatus, CallRecord } from '../types';
import { soundService } from '../services/soundService';

// Declare Leaflet globally since it's imported via CDN
declare const L: any;

interface AdminDashboardProps {
  currentUser: UserProfile;
  onLogout: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ currentUser, onLogout }) => {
  const [drivers, setDrivers] = useState<UserProfile[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<DriverStatus | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'details' | 'map' | 'history'>('details');
  
  // Mobile Responsive State
  const [showDetailMobile, setShowDetailMobile] = useState(false);

  // Vehicle Form State
  const [vehicleForm, setVehicleForm] = useState({ model: '', plate: '', color: '' });
  const [isSavingVehicle, setIsSavingVehicle] = useState(false);

  // Audio Simulation State
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  // Call Simulation States
  const [isCalling, setIsCalling] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [callHistory, setCallHistory] = useState<CallRecord[]>([]);

  // Map Refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    loadDrivers();
  }, []);

  // Cleanup on unmount - Stop Ringtone!
  useEffect(() => {
      return () => {
          soundService.stopRingtone();
      }
  }, []);

  // Sync vehicle form when selected driver changes & Generate Mock History
  useEffect(() => {
    if (selectedDriver) {
      setVehicleForm({
        model: selectedDriver.vehicle_model || '',
        plate: selectedDriver.vehicle_plate || '',
        color: selectedDriver.vehicle_color || ''
      });
      setIsPlayingAudio(false);
      setActiveTab('details'); // Reset tab on new selection
      
      // Reset call state on driver switch
      setIsCalling(false); 
      setCallDuration(0);
      soundService.stopRingtone(); 
      
      // Initialize mock location if none exists
      if (selectedDriver.lat && selectedDriver.lng) {
        setDriverLocation({ lat: selectedDriver.lat, lng: selectedDriver.lng });
      } else {
        // Default to São Paulo center with slight random offset
        setDriverLocation({ 
          lat: -23.5505 + (Math.random() * 0.01 - 0.005), 
          lng: -46.6333 + (Math.random() * 0.01 - 0.005) 
        });
      }

      // Generate Mock Call History
      const mockHistory: CallRecord[] = Array.from({ length: 8 }).map((_, i) => {
        const isMissed = Math.random() > 0.8;
        return {
            id: `call-${i}-${Date.now()}`,
            direction: (Math.random() > 0.5 ? 'incoming' : 'outgoing') as 'incoming' | 'outgoing',
            status: (isMissed ? 'missed' : 'completed') as 'completed' | 'missed' | 'rejected',
            timestamp: new Date(Date.now() - Math.floor(Math.random() * 10 * 24 * 60 * 60 * 1000)).toISOString(),
            duration: isMissed ? 0 : Math.floor(Math.random() * 600) + 20,
            clientName: `Cliente ${Math.floor(Math.random() * 1000)}`
        };
      }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      setCallHistory(mockHistory);
    }
  }, [selectedDriver]);

  const toggleCall = () => {
      if (isCalling) {
          setIsCalling(false);
          soundService.stopRingtone();
      } else {
          setIsCalling(true);
          // Play loop sound
          soundService.playRingtone();
      }
  };

  // Timer for active call
  useEffect(() => {
    let interval: any;
    if (isCalling) {
      interval = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => clearInterval(interval);
  }, [isCalling]);

  // Map Initialization & Update logic
  useEffect(() => {
    // Only init if tab is map and we have a container
    if (activeTab === 'map' && mapContainerRef.current && driverLocation) {
      if (!mapInstanceRef.current) {
        // Init Map
        mapInstanceRef.current = L.map(mapContainerRef.current).setView([driverLocation.lat, driverLocation.lng], 13);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors'
        }).addTo(mapInstanceRef.current);

        const customIcon = L.icon({
          iconUrl: 'https://cdn-icons-png.flaticon.com/512/3097/3097180.png', // Car icon
          iconSize: [40, 40],
          iconAnchor: [20, 20],
          popupAnchor: [0, -20]
        });

        markerRef.current = L.marker([driverLocation.lat, driverLocation.lng], { icon: customIcon }).addTo(mapInstanceRef.current);
        markerRef.current.bindPopup(`<b>${selectedDriver?.username}</b><br>Status: ${selectedDriver?.status}`).openPopup();
        
        // Fix for map rendering in tabs/modals
        setTimeout(() => {
            mapInstanceRef.current?.invalidateSize();
        }, 100);
      }
    }
    
    // Cleanup: Destroy map when leaving tab or changing driver
    return () => {
       if (mapInstanceRef.current) {
         mapInstanceRef.current.remove();
         mapInstanceRef.current = null;
       }
    };
  }, [activeTab, selectedDriver]); 

  // Real-time location simulation
  useEffect(() => {
    if (activeTab === 'map' && selectedDriver) {
       const interval = setInterval(() => {
          setDriverLocation(prev => {
             if (!prev) return null;
             // Move slightly
             const newLat = prev.lat + (Math.random() * 0.0002 - 0.0001);
             const newLng = prev.lng + (Math.random() * 0.0002 - 0.0001);
             
             // Update Leaflet Marker
             if (markerRef.current) {
               markerRef.current.setLatLng([newLat, newLng]);
             }
             
             return { lat: newLat, lng: newLng };
          });
       }, 3000); // Update every 3 seconds

       return () => clearInterval(interval);
    }
  }, [activeTab, selectedDriver]);


  const loadDrivers = async () => {
    setIsLoading(true);
    const data = await fetchAllDriversForAdmin();
    setDrivers(data);
    setIsLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (confirm("Tem certeza que deseja remover este motorista permanentemente?")) {
        const success = await deleteDriver(id);
        if (success) {
            setDrivers(prev => prev.filter(d => d.id !== id));
            if (selectedDriver?.id === id) {
                setSelectedDriver(null);
                setShowDetailMobile(false);
            }
        } else {
            alert("Erro ao deletar motorista.");
        }
    }
  };

  const handleStatusChange = async (status: DriverStatus) => {
    if (!selectedDriver) return;
    
    const success = await updateDriverStatus(selectedDriver.id, status);
    if (success) {
        setDrivers(prev => prev.map(d => d.id === selectedDriver.id ? { ...d, status } : d));
        setSelectedDriver(prev => prev ? { ...prev, status } : null);
    }
  };

  const handleUpdateVehicle = async () => {
    if (!selectedDriver) return;
    setIsSavingVehicle(true);
    const success = await updateDriverVehicle(selectedDriver.id, {
        vehicle_model: vehicleForm.model,
        vehicle_plate: vehicleForm.plate,
        vehicle_color: vehicleForm.color
    });
    
    if (success) {
        setDrivers(prev => prev.map(d => d.id === selectedDriver.id ? { 
            ...d, 
            vehicle_model: vehicleForm.model,
            vehicle_plate: vehicleForm.plate,
            vehicle_color: vehicleForm.color
        } : d));
        setSelectedDriver(prev => prev ? { 
            ...prev, 
            vehicle_model: vehicleForm.model,
            vehicle_plate: vehicleForm.plate,
            vehicle_color: vehicleForm.color
        } : null);
        alert("Veículo atualizado!");
    }
    setIsSavingVehicle(false);
  };

  const filteredDrivers = drivers.filter(d => {
    const matchesSearch = d.username.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || d.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const formatDuration = (sec: number) => {
    const min = Math.floor(sec / 60);
    const s = sec % 60;
    return `${min}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleDriverClick = (driver: UserProfile) => {
      setSelectedDriver(driver);
      setShowDetailMobile(true);
  };

  const handleBackToList = () => {
      setShowDetailMobile(false);
  };

  return (
    <div className="flex h-[100dvh] bg-gray-100 overflow-hidden relative">
      {/* Sidebar List */}
      <div className={`w-full md:w-80 bg-white border-r border-gray-200 flex flex-col z-10 shadow-lg ${showDetailMobile ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 border-b border-gray-100 shrink-0">
           <div className="flex items-center justify-between mb-4">
             <h1 className="text-xl font-bold text-gray-800">Admin Painel</h1>
             <button onClick={onLogout} className="text-gray-400 hover:text-red-500">
               <span className="material-icons">logout</span>
             </button>
           </div>
           
           <div className="relative mb-3">
             <span className="material-icons absolute left-3 top-2.5 text-gray-400 text-sm">search</span>
             <input 
                type="text"
                placeholder="Buscar motorista..."
                className="w-full pl-9 p-2 bg-gray-100 rounded-lg text-sm outline-none focus:ring-2 ring-whatsapp-green/50"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
            />
           </div>

           <div className="flex gap-2 overflow-x-auto pb-1">
             {['all', DriverStatus.AVAILABLE, DriverStatus.BUSY, DriverStatus.OFFLINE].map(st => (
               <button
                 key={st}
                 onClick={() => setFilterStatus(st as any)}
                 className={`px-3 py-1.5 text-xs rounded-full capitalize border transition whitespace-nowrap ${
                    filterStatus === st 
                    ? 'bg-whatsapp-green text-white border-whatsapp-green shadow-sm' 
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                 }`}
               >
                 {st === 'all' ? 'Todos' : st === 'available' ? 'Livre' : st === 'busy' ? 'Ocup' : 'Off'}
               </button>
             ))}
           </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {isLoading ? (
             <div className="p-8 text-center text-gray-400 animate-pulse">Carregando...</div>
          ) : (
            filteredDrivers.map(driver => (
              <div 
                key={driver.id}
                onClick={() => handleDriverClick(driver)}
                className={`p-4 flex items-center cursor-pointer border-b border-gray-50 hover:bg-gray-50 transition ${selectedDriver?.id === driver.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''}`}
              >
                <div className="relative w-12 h-12 mr-4 group">
                  <img src={driver.avatar_url || 'https://via.placeholder.com/40'} alt={driver.username} className="w-full h-full rounded-full object-cover shadow-sm" />
                  <span 
                    className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-white ${
                    driver.status === 'available' ? 'bg-green-500' : driver.status === 'busy' ? 'bg-red-500' : 'bg-gray-400'
                  }`}></span>
                  
                  {/* Tooltip for status on hover */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black text-white text-xs rounded opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap z-20">
                    {driver.status === DriverStatus.AVAILABLE ? 'Disponível' : driver.status === DriverStatus.BUSY ? 'Ocupado' : 'Offline'}
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-gray-800">{driver.username}</h3>
                  <p className="text-xs text-gray-500">ID: {driver.id.slice(0, 8)}...</p>
                </div>
                <span className="material-icons text-gray-300 text-sm">chevron_right</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Content (Detail View) */}
      <div className={`flex-1 bg-gray-50 overflow-y-auto ${showDetailMobile ? 'block absolute inset-0 z-20 bg-white' : 'hidden md:block static'}`}>
        {selectedDriver ? (
          <div className="h-full flex flex-col">
            {/* Mobile Back Button Header */}
            <div className="md:hidden bg-white p-2 border-b flex items-center shadow-sm">
                <button onClick={handleBackToList} className="p-2 mr-2 rounded-full hover:bg-gray-100">
                    <span className="material-icons text-gray-600">arrow_back</span>
                </button>
                <span className="font-bold text-gray-700">Detalhes do Motorista</span>
            </div>

            {/* Cover */}
            <div className="h-32 md:h-40 bg-gradient-to-r from-blue-600 to-indigo-600 relative shrink-0">
               <div className="absolute -bottom-10 md:-bottom-12 left-6 md:left-8">
                 <div className="w-20 h-20 md:w-24 md:h-24 rounded-full border-4 border-white bg-white overflow-hidden shadow-md">
                   <img src={selectedDriver.avatar_url} alt={selectedDriver.username} className="w-full h-full object-cover" />
                 </div>
               </div>
               <div className="absolute top-4 right-4 flex gap-2">
                 <button onClick={() => handleDelete(selectedDriver.id)} className="p-2 bg-white/20 hover:bg-white/30 text-white rounded-lg backdrop-blur-sm transition" title="Deletar Motorista">
                   <span className="material-icons">delete</span>
                 </button>
               </div>
            </div>

            <div className="pt-12 md:pt-16 px-6 md:px-8 pb-2 shrink-0 bg-white">
               <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-4">
                 <div>
                   <h2 className="text-2xl font-bold text-gray-800">{selectedDriver.username}</h2>
                   <div className="flex items-center gap-2 mt-1">
                     <span className={`px-2 py-0.5 rounded text-xs font-medium uppercase ${
                        selectedDriver.status === 'available' ? 'bg-green-100 text-green-800' :
                        selectedDriver.status === 'busy' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
                     }`}>
                       {selectedDriver.status}
                     </span>
                     <span className="text-gray-400 text-sm">•</span>
                     <span className="text-gray-500 text-sm">Motorista</span>
                   </div>
                 </div>
                 
                 {/* Quick Actions */}
                 <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0">
                   <button 
                     onClick={() => setIsPlayingAudio(!isPlayingAudio)}
                     className={`flex items-center gap-2 px-3 py-2 rounded-lg transition whitespace-nowrap ${isPlayingAudio ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                   >
                     <span className="material-icons text-sm">{isPlayingAudio ? 'pause' : 'mic'}</span>
                     <span className="text-sm font-medium">Monitorar</span>
                   </button>
                   
                   <button 
                     onClick={toggleCall}
                     className={`flex items-center gap-2 px-3 py-2 rounded-lg transition whitespace-nowrap shadow-md ${
                         isCalling 
                         ? 'bg-red-500 text-white animate-pulse ring-4 ring-red-200' 
                         : 'bg-blue-600 text-white hover:bg-blue-700'
                     }`}
                   >
                     <span className={`material-icons text-sm ${isCalling ? 'animate-bounce' : ''}`}>
                         {isCalling ? 'call_end' : 'call'}
                     </span>
                     <span className="text-sm font-medium">
                         {isCalling ? `Em Chamada (${formatDuration(callDuration)})` : 'Ligar'}
                     </span>
                   </button>
                 </div>
               </div>
               
               {/* Tabs */}
               <div className="flex border-b border-gray-200 mt-2 overflow-x-auto hide-scrollbar">
                  <button 
                    onClick={() => setActiveTab('details')}
                    className={`px-4 md:px-6 py-3 font-medium text-sm transition whitespace-nowrap ${activeTab === 'details' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    Detalhes
                  </button>
                  <button 
                    onClick={() => setActiveTab('map')}
                    className={`px-4 md:px-6 py-3 font-medium text-sm transition whitespace-nowrap ${activeTab === 'map' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    Mapa
                  </button>
                  <button 
                    onClick={() => setActiveTab('history')}
                    className={`px-4 md:px-6 py-3 font-medium text-sm transition whitespace-nowrap ${activeTab === 'history' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    Chamadas
                  </button>
               </div>
            </div>

            {/* Tab Content */}
            <div className="flex-1 bg-gray-50 p-4 md:p-8 overflow-y-auto">
              
              {activeTab === 'details' && (
                <div className="animate-fade-in max-w-4xl mx-auto">
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
                        
                        {/* Core Details */}
                        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Informações Básicas</h3>
                            <div className="space-y-4">
                                <div className="flex justify-between items-center py-2 border-b border-gray-50">
                                    <span className="text-gray-600 text-sm">ID</span>
                                    <span className="font-mono text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">{selectedDriver.id}</span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b border-gray-50">
                                    <span className="text-gray-600 text-sm">Usuário</span>
                                    <span className="font-medium text-gray-800">{selectedDriver.username}</span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b border-gray-50">
                                    <span className="text-gray-600 text-sm">Registrado em</span>
                                    <span className="text-sm text-gray-800">
                                    {selectedDriver.created_at 
                                        ? new Date(selectedDriver.created_at).toLocaleDateString('pt-BR') 
                                        : 'N/A'
                                    }
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Status Management */}
                        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Gerenciar Status</h3>
                            <div className="space-y-2">
                                {Object.values(DriverStatus).map((status) => (
                                    <button
                                        key={status}
                                        onClick={() => handleStatusChange(status)}
                                        disabled={selectedDriver.status === status}
                                        className={`w-full p-3 rounded-lg border text-left flex items-center transition ${
                                            selectedDriver.status === status 
                                            ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500 relative z-10' 
                                            : 'border-gray-200 hover:border-gray-300 bg-white'
                                        } ${selectedDriver.status === status ? 'opacity-100' : 'opacity-80 hover:opacity-100'}`}
                                    >
                                        <div className={`w-3 h-3 rounded-full mr-3 shrink-0 ${
                                            status === DriverStatus.AVAILABLE ? 'bg-green-500' :
                                            status === DriverStatus.BUSY ? 'bg-red-500' : 'bg-gray-500'
                                        }`}></div>
                                        <span className="flex-1 font-medium text-gray-700 capitalize text-sm">
                                            {status === DriverStatus.AVAILABLE ? 'Disponível' : status === DriverStatus.BUSY ? 'Ocupado' : 'Offline'}
                                        </span>
                                        {selectedDriver.status === status && <span className="material-icons text-blue-500 text-sm">check_circle</span>}
                                    </button>
                                ))}
                            </div>
                        </div>
                        
                        {/* Vehicle Form */}
                        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 xl:col-span-2">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Dados do Veículo</h3>
                                <span className="material-icons text-gray-300">directions_car</span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Modelo</label>
                                    <input 
                                        type="text" 
                                        value={vehicleForm.model}
                                        onChange={e => setVehicleForm({...vehicleForm, model: e.target.value})}
                                        placeholder="Ex: Toyota Corolla"
                                        className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 ring-whatsapp-green/20 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Placa</label>
                                    <input 
                                        type="text" 
                                        value={vehicleForm.plate}
                                        onChange={e => setVehicleForm({...vehicleForm, plate: e.target.value})}
                                        placeholder="ABC-1234"
                                        className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 ring-whatsapp-green/20 outline-none uppercase"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Cor</label>
                                    <input 
                                        type="text" 
                                        value={vehicleForm.color}
                                        onChange={e => setVehicleForm({...vehicleForm, color: e.target.value})}
                                        placeholder="Ex: Prata"
                                        className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 ring-whatsapp-green/20 outline-none"
                                    />
                                </div>
                            </div>
                            <div className="mt-4 text-right">
                                <button 
                                    onClick={handleUpdateVehicle}
                                    disabled={isSavingVehicle}
                                    className="bg-whatsapp-green text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-600 transition flex items-center gap-2 ml-auto"
                                >
                                    {isSavingVehicle ? 'Salvando...' : 'Salvar Alterações'}
                                    {!isSavingVehicle && <span className="material-icons text-sm">save</span>}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
              )}

              {activeTab === 'map' && (
                  <div className="h-full w-full rounded-xl overflow-hidden shadow-sm border border-gray-300 bg-gray-200 relative">
                      <div ref={mapContainerRef} className="absolute inset-0 z-0"></div>
                      <div className="absolute top-4 right-4 z-[400] bg-white p-2 rounded-lg shadow-lg">
                          <div className="text-xs text-gray-500 mb-1">Atualizado há instantes</div>
                          <div className="font-mono text-sm">Lat: {driverLocation?.lat.toFixed(4)}</div>
                          <div className="font-mono text-sm">Lng: {driverLocation?.lng.toFixed(4)}</div>
                      </div>
                  </div>
              )}

              {activeTab === 'history' && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                      <table className="w-full text-left">
                          <thead className="bg-gray-50 border-b border-gray-200">
                              <tr>
                                  <th className="p-4 text-xs font-bold text-gray-500 uppercase">Tipo</th>
                                  <th className="p-4 text-xs font-bold text-gray-500 uppercase">Cliente</th>
                                  <th className="p-4 text-xs font-bold text-gray-500 uppercase">Duração</th>
                                  <th className="p-4 text-xs font-bold text-gray-500 uppercase">Horário</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                              {callHistory.map(call => (
                                  <tr key={call.id} className="hover:bg-gray-50 transition">
                                      <td className="p-4">
                                          <div className="flex items-center gap-2">
                                              <span className={`material-icons text-sm ${
                                                  call.status === 'missed' ? 'text-red-500' : 
                                                  call.direction === 'incoming' ? 'text-green-500' : 'text-blue-500'
                                              }`}>
                                                  {call.status === 'missed' ? 'call_missed' : 
                                                   call.direction === 'incoming' ? 'call_received' : 'call_made'}
                                              </span>
                                              <span className="text-sm text-gray-700 capitalize">{call.status === 'missed' ? 'Perdida' : call.direction === 'incoming' ? 'Recebida' : 'Efetuada'}</span>
                                          </div>
                                      </td>
                                      <td className="p-4 text-sm text-gray-800">{call.clientName}</td>
                                      <td className="p-4 text-sm text-gray-600 font-mono">{call.duration > 0 ? formatDuration(call.duration) : '--'}</td>
                                      <td className="p-4 text-sm text-gray-500">{new Date(call.timestamp).toLocaleString()}</td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
              )}

            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-gray-400 p-8">
            <span className="material-icons text-6xl mb-4 text-gray-300">directions_car</span>
            <p className="text-lg">Selecione um motorista para ver detalhes.</p>
          </div>
        )}
      </div>
    </div>
  );
}