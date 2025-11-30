
import React, { useEffect, useState, useRef } from 'react';
import { fetchAllDriversForAdmin, deleteDriver, updateDriverStatus, updateDriverVehicle, updateDriverPassword, fetchAppSettings, updateAppSettings, approveDriver, fetchMessages, subscribeToMessages, subscribeToProfiles, fetchBingoSettings, updateBingoSettings, drawBingoNumber, drawSpecificBingoNumber, resetBingo, fetchBingoRanking, subscribeToBingo, sendBroadcast, addSubscriptionDays } from '../services/supabaseClient';
import { UserProfile, DriverStatus, CallRecord, AppSettings, Message, BingoSettings, BingoRankingUser, AdminTab } from '../types';
import { soundService } from '../services/soundService';
import { checkSubscriptionStatus } from '../services/paymentService';
import { ChatWindow } from './ChatWindow'; // Importar ChatWindow

interface AdminDashboardProps {
  currentUser: UserProfile;
  onLogout: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ currentUser, onLogout }) => {
  const [drivers, setDrivers] = useState<UserProfile[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<DriverStatus | 'all' | 'pending'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<AdminTab>('details');
  
  // Mobile Responsive State
  const [showDetailMobile, setShowDetailMobile] = useState(false);

  // Chat State inside Admin
  const [driverMessages, setDriverMessages] = useState<Message[]>([]);

  // Vehicle Form State
  const [vehicleForm, setVehicleForm] = useState({ model: '', plate: '', color: '', type: 'car' as 'car' | 'motorcycle' });
  const [isSavingVehicle, setIsSavingVehicle] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  // Settings State
  const [appSettings, setAppSettings] = useState<AppSettings>({
      car_base_price: 0, car_price_km: 0, car_price_min: 0, car_start_distance_limit: 0,
      moto_base_price: 0, moto_price_km: 0, moto_price_min: 0, moto_start_distance_limit: 0,
      marquee_text: ''
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  
  // Broadcast State
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastTarget, setBroadcastTarget] = useState<'driver' | 'client' | 'all'>('all');
  const [isSendingBroadcast, setIsSendingBroadcast] = useState(false);

  // BINGO STATE
  const [bingoSettings, setBingoSettings] = useState<BingoSettings | null>(null);
  const [bingoRanking, setBingoRanking] = useState<BingoRankingUser[]>([]);
  const [bingoLoading, setBingoLoading] = useState(false);

  // Audio Simulation State
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  // Call Simulation States
  const [isCalling, setIsCalling] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [callHistory, setCallHistory] = useState<CallRecord[]>([]);

  // Google Map Refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null); // Google Map Instance
  const markerRef = useRef<any>(null); // Google Marker Instance
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    loadDrivers();
    loadSettings();
    loadBingoData();
    
    // Subscribe to profile changes (Real-time updates for new drivers)
    console.log("Admin assinando updates de perfil...");
    const sub = subscribeToProfiles(() => {
        console.log("Recebido update de perfil em tempo real");
        loadDrivers(); // Reload list when profiles change
    });
    
    return () => {
        sub.unsubscribe();
        soundService.stopAdminCallSound();
    };
  }, []);

  // Sync vehicle form when selected driver changes & Generate Mock History & Load Messages
  useEffect(() => {
    if (selectedDriver) {
      setVehicleForm({
        model: selectedDriver.vehicle_model || '',
        plate: selectedDriver.vehicle_plate || '',
        color: selectedDriver.vehicle_color || '',
        type: selectedDriver.vehicle_type || 'car'
      });
      setNewPassword(''); // Reset password field
      setIsPlayingAudio(false);
      
      // If we clicked on a driver, assume we want to see details first, unless we specifically went to chat from a notification (logic to be added later)
      // For now, if driver changes, default to details
      if (activeTab === 'chat') {
           loadDriverMessages(selectedDriver.id);
      } else {
           setActiveTab('details');
      }
      
      // Reset call state on driver switch
      setIsCalling(false); 
      setCallDuration(0);
      soundService.stopAdminCallSound(); 
      
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

  // Load Messages when entering Chat Tab
  useEffect(() => {
      if (activeTab === 'chat' && selectedDriver) {
          loadDriverMessages(selectedDriver.id);
          
          // Subscribe to new messages
          // DEDUPLICATED LISTENER: Check ID before adding
          const sub = subscribeToMessages(currentUser.id, (newMsg) => {
              if (selectedDriver && (newMsg.sender_id === selectedDriver.id || newMsg.receiver_id === selectedDriver.id)) {
                  setDriverMessages(prev => {
                      if (prev.some(m => m.id === newMsg.id)) return prev;
                      return [...prev, newMsg];
                  });
                  if (newMsg.sender_id === selectedDriver.id) {
                      soundService.playReceived();
                  }
              }
          });
          
          return () => {
              sub.unsubscribe();
          }
      }
  }, [activeTab, selectedDriver, currentUser.id]);

  // Bingo Sub
  useEffect(() => {
      if (activeTab === 'bingo') {
          loadBingoData();
          const sub = subscribeToBingo(() => {
             loadBingoData();
          });
          return () => { sub.unsubscribe(); }
      }
  }, [activeTab]);

  const loadDriverMessages = async (driverId: string) => {
      const msgs = await fetchMessages(currentUser.id, driverId);
      setDriverMessages(msgs);
  };

  const toggleCall = () => {
      if (isCalling) {
          setIsCalling(false);
          soundService.stopAdminCallSound();
      } else {
          setIsCalling(true);
          // Play loop sound
          soundService.playAdminCallSound();
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

  // Google Map Initialization & Update logic
  useEffect(() => {
    // Only init if tab is map and we have a container and the script is loaded
    if (activeTab === 'map' && mapContainerRef.current && driverLocation && window.google) {
      if (!mapInstanceRef.current) {
        // Init Google Map
        mapInstanceRef.current = new window.google.maps.Map(mapContainerRef.current, {
          center: { lat: driverLocation.lat, lng: driverLocation.lng },
          zoom: 15,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false
        });

        // Add Marker
        const iconUrl = selectedDriver?.vehicle_type === 'motorcycle' 
            ? 'https://cdn-icons-png.flaticon.com/512/3097/3097136.png' // Moto
            : 'https://cdn-icons-png.flaticon.com/512/3097/3097180.png'; // Car

        markerRef.current = new window.google.maps.Marker({
            position: { lat: driverLocation.lat, lng: driverLocation.lng },
            map: mapInstanceRef.current,
            title: selectedDriver?.username,
            icon: {
                url: iconUrl,
                scaledSize: new window.google.maps.Size(40, 40)
            },
            animation: window.google.maps.Animation.DROP
        });

        // Info Window
        const infoWindow = new window.google.maps.InfoWindow({
            content: `<div style="color:black"><b>${selectedDriver?.username}</b><br>Status: ${selectedDriver?.status}</div>`
        });

        markerRef.current.addListener('click', () => {
            infoWindow.open(mapInstanceRef.current, markerRef.current);
        });
        
        infoWindow.open(mapInstanceRef.current, markerRef.current);
      }
    }
    
    // Cleanup handled by useEffect teardown if necessary, but Maps instance is usually persistent for the component life
    return () => {
       // Optional: Clean up listeners if needed
    };
  }, [activeTab, selectedDriver]); 

  // Real-time location simulation (Updates the existing map)
  useEffect(() => {
    if (activeTab === 'map' && selectedDriver && window.google) {
       const interval = setInterval(() => {
          setDriverLocation(prev => {
             if (!prev) return null;
             // Move slightly
             const newLat = prev.lat + (Math.random() * 0.0002 - 0.0001);
             const newLng = prev.lng + (Math.random() * 0.0002 - 0.0001);
             
             // Update Google Marker Position
             if (markerRef.current) {
               const newPos = new window.google.maps.LatLng(newLat, newLng);
               markerRef.current.setPosition(newPos);
               if (mapInstanceRef.current) {
                   mapInstanceRef.current.panTo(newPos);
               }
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

  const loadSettings = async () => {
      const settings = await fetchAppSettings();
      setAppSettings(settings);
  };

  const loadBingoData = async () => {
      setBingoLoading(true);
      const settings = await fetchBingoSettings();
      setBingoSettings(settings);
      const rank = await fetchBingoRanking();
      setBingoRanking(rank);
      setBingoLoading(false);
  };

  const handleSaveSettings = async () => {
      setIsSavingSettings(true);
      await updateAppSettings(appSettings);
      alert("Configurações atualizadas!");
      setIsSavingSettings(false);
  };
  
  const handleSendBroadcast = async () => {
      if (!broadcastTitle.trim() || !broadcastMessage.trim()) {
          alert("Por favor, preencha o título e a mensagem.");
          return;
      }
      setIsSendingBroadcast(true);
      const success = await sendBroadcast(broadcastTitle, broadcastMessage, broadcastTarget);
      if (success) {
          alert("Notificação enviada para todos os usuários online!");
          setBroadcastTitle('');
          setBroadcastMessage('');
      } else {
          alert("Erro ao enviar notificação.");
      }
      setIsSendingBroadcast(false);
  };

  const handleSaveBingoSettings = async () => {
      if(!bingoSettings) return;
      await updateBingoSettings(bingoSettings);
      alert("Bingo atualizado!");
  };

  const handleDrawNumber = async () => {
      const num = await drawBingoNumber();
      if(!num) alert("Todos os números já foram sorteados!");
  };

  const handleManualDraw = async (num: number) => {
      if (!bingoSettings) return;
      if (bingoSettings.drawn_numbers.includes(num)) {
          alert(`Número ${num} já foi sorteado!`);
          return;
      }
      if (confirm(`Sortear o número ${num}?`)) {
          await drawSpecificBingoNumber(num);
      }
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

  const handleApprove = async (id: string) => {
    if (confirm("Deseja aprovar este motorista? Ele terá acesso imediato ao aplicativo.")) {
       const success = await approveDriver(id);
       if (success) {
           setDrivers(prev => prev.map(d => d.id === id ? { ...d, is_approved: true } : d));
           if (selectedDriver?.id === id) {
               setSelectedDriver(prev => prev ? { ...prev, is_approved: true } : null);
           }
           alert("Motorista aprovado com sucesso!");
       } else {
           alert("Erro ao aprovar motorista.");
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
    
    const vehicleSuccess = await updateDriverVehicle(selectedDriver.id, {
        vehicle_model: vehicleForm.model,
        vehicle_plate: vehicleForm.plate,
        vehicle_color: vehicleForm.color,
        vehicle_type: vehicleForm.type
    });

    let passwordSuccess = true;
    if (newPassword.trim()) {
        passwordSuccess = await updateDriverPassword(selectedDriver.id, newPassword);
    }
    
    if (vehicleSuccess && passwordSuccess) {
        setDrivers(prev => prev.map(d => d.id === selectedDriver.id ? { 
            ...d, 
            vehicle_model: vehicleForm.model,
            vehicle_plate: vehicleForm.plate,
            vehicle_color: vehicleForm.color,
            vehicle_type: vehicleForm.type
        } : d));
        setSelectedDriver(prev => prev ? { 
            ...prev, 
            vehicle_model: vehicleForm.model,
            vehicle_plate: vehicleForm.plate,
            vehicle_color: vehicleForm.color,
            vehicle_type: vehicleForm.type
        } : null);
        alert("Dados atualizados com sucesso!");
        setNewPassword('');
    } else {
        alert("Erro ao atualizar alguns dados.");
    }
    setIsSavingVehicle(false);
  };

  // Funcao para adicionar dias de assinatura
  const handleAddDays = async (days: number) => {
      if (!selectedDriver) return;
      if (confirm(`Deseja adicionar ${days} dias de acesso para ${selectedDriver.username}?`)) {
          const success = await addSubscriptionDays(selectedDriver.id, days);
          if (success) {
              alert("Assinatura atualizada com sucesso!");
              // Reload driver data
              const data = await fetchAllDriversForAdmin();
              setDrivers(data);
              const updated = data.find(d => d.id === selectedDriver.id);
              if (updated) setSelectedDriver(updated);
          } else {
              alert("Erro ao atualizar assinatura.");
          }
      }
  }

  const handleRemoveAccess = async () => {
      if (!selectedDriver) return;
      if (confirm(`Bloquear acesso de ${selectedDriver.username}? A assinatura será zerada.`)) {
          // Passando 0 dias para a função que implementa a lógica de "zerar"
          const success = await addSubscriptionDays(selectedDriver.id, 0); 
          if (success) {
              alert("Acesso bloqueado com sucesso!");
              const data = await fetchAllDriversForAdmin();
              setDrivers(data);
              const updated = data.find(d => d.id === selectedDriver.id);
              if (updated) setSelectedDriver(updated);
          } else {
              alert("Erro ao bloquear acesso.");
          }
      }
  }

  const filteredDrivers = drivers.filter(d => {
    const matchesSearch = d.username.toLowerCase().includes(searchTerm.toLowerCase());
    if (filterStatus === 'pending') {
        return matchesSearch && d.is_approved === false;
    }
    const matchesStatus = filterStatus === 'all' || d.status === filterStatus;
    return matchesSearch && matchesStatus;
  }).sort((a, b) => {
     // Always show unapproved drivers first
     if (a.is_approved === false && b.is_approved !== false) return -1;
     if (a.is_approved !== false && b.is_approved === false) return 1;
     return 0;
  });

  const pendingCount = drivers.filter(d => !d.is_approved).length;

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

  // Helper local para preview de vídeo (Sincronizado com BingoUserView)
  const getYoutubeId = (url: string) => {
    if(!url) return null;
    const regExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=|live\/|shorts\/)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regExp);
    return match ? match[1] : null;
  };

  const adminVideoId = getYoutubeId(bingoSettings?.youtube_link || '');

  // Sub status helper
  const getSubStatus = (driver: UserProfile) => {
      if (!driver.is_approved) return { label: 'Pendente', color: 'bg-yellow-100 text-yellow-800' };
      const status = checkSubscriptionStatus(driver.subscription_expires_at);
      if (status.isValid) {
          return { label: `${status.daysLeft} dias`, color: 'bg-green-100 text-green-800' };
      }
      return { label: 'Vencido', color: 'bg-red-100 text-red-800' };
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
                className="w-full pl-9 p-2 bg-gray-100 rounded-lg text-sm outline-none focus:ring-2 ring-whatsapp-green/50 text-gray-900"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
            />
           </div>

           <div className="flex gap-2 overflow-x-auto pb-1 mb-2">
             <button
                 onClick={() => setFilterStatus('all')}
                 className={`px-3 py-1.5 text-xs rounded-full capitalize border transition whitespace-nowrap ${
                    filterStatus === 'all' ? 'bg-whatsapp-green text-white border-whatsapp-green shadow-sm' : 'bg-white text-gray-600 border-gray-300'
                 }`}
             >
                 Todos
             </button>
             <button
                 onClick={() => setFilterStatus('pending')}
                 className={`px-3 py-1.5 text-xs rounded-full capitalize border transition whitespace-nowrap flex items-center gap-1 ${
                    filterStatus === 'pending' ? 'bg-yellow-500 text-white border-yellow-500 shadow-sm' : 'bg-white text-gray-600 border-gray-300'
                 }`}
             >
                 Pendentes
                 {pendingCount > 0 && (
                     <span className="bg-red-500 text-white text-[9px] px-1 rounded-full">{pendingCount}</span>
                 )}
             </button>
           </div>
           
           {/* MENU DE ABAS DE AÇÃO RÁPIDA */}
           <div className="grid grid-cols-2 gap-2 mt-2">
               {/* BOTÃO APROVAÇÕES DEDICADO */}
               <button 
                onClick={() => { setActiveTab('approvals'); setSelectedDriver(null); setShowDetailMobile(true); }}
                className="col-span-2 py-3 bg-yellow-50 hover:bg-yellow-100 rounded-lg text-xs font-bold text-yellow-700 flex items-center justify-center gap-2 border border-yellow-200 relative"
               >
                <span className="material-icons text-sm">how_to_reg</span> Aprovação de Motoristas
                {pendingCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 text-white rounded-full flex items-center justify-center text-[10px] shadow-sm animate-bounce">
                        {pendingCount}
                    </span>
                )}
               </button>

               <button 
                onClick={() => { setActiveTab('settings'); setSelectedDriver(null); setShowDetailMobile(true); }}
                className="py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-medium text-gray-700 flex items-center justify-center gap-2"
               >
                <span className="material-icons text-sm">settings</span> Ajustes
               </button>
               <button 
                onClick={() => { setActiveTab('bingo'); setSelectedDriver(null); setShowDetailMobile(true); }}
                className="py-2 bg-purple-100 hover:bg-purple-200 rounded-lg text-xs font-medium text-purple-700 flex items-center justify-center gap-2"
               >
                <span className="material-icons text-sm">casino</span> Bingo
               </button>
               <button 
                onClick={() => { setActiveTab('notifications'); setSelectedDriver(null); setShowDetailMobile(true); }}
                className="col-span-2 py-3 bg-blue-50 hover:bg-blue-100 rounded-lg text-xs font-bold text-blue-700 flex items-center justify-center gap-2 border border-blue-200"
               >
                <span className="material-icons text-sm">campaign</span> Enviar Notificações
               </button>
           </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {isLoading ? (
            <div className="p-8 text-center text-gray-400 animate-pulse">Carregando...</div>
          ) : filteredDrivers.length > 0 ? (
            filteredDrivers.map(driver => {
              const subInfo = getSubStatus(driver);
              return (
              <div 
                key={driver.id}
                onClick={() => handleDriverClick(driver)}
                className={`p-4 flex items-center cursor-pointer border-b border-gray-50 hover:bg-gray-50 transition relative ${selectedDriver?.id === driver.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''}`}
              >
                {!driver.is_approved && (
                    <div className="absolute top-0 right-0 bg-yellow-400 text-xs font-bold px-2 py-0.5 rounded-bl-lg text-white shadow-sm">
                        PENDENTE
                    </div>
                )}

                <div className="relative w-12 h-12 mr-4 group shrink-0">
                  <img src={driver.avatar_url || 'https://via.placeholder.com/40'} alt={driver.username} className={`w-full h-full rounded-full object-cover shadow-sm ${!driver.is_approved ? 'grayscale opacity-70' : ''}`} />
                  <span 
                    className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-white ${
                    driver.status === 'available' ? 'bg-green-500' : driver.status === 'busy' ? 'bg-red-500' : 'bg-gray-400'
                  }`}></span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <h3 className="text-sm font-semibold text-gray-800 truncate">{driver.username}</h3>
                    <span 
                        className={`material-icons text-xs ${driver.vehicle_type === 'motorcycle' ? 'text-orange-400' : 'text-blue-400'}`}
                        title={driver.vehicle_type === 'motorcycle' ? 'Moto' : 'Carro'}
                    >
                        {driver.vehicle_type === 'motorcycle' ? 'two_wheeler' : 'directions_car'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center mt-1">
                      <p className="text-xs text-gray-500">ID: {driver.id.slice(0, 4)}...</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${subInfo.color}`}>{subInfo.label}</span>
                  </div>
                </div>
                <span className="material-icons text-gray-300 text-sm">chevron_right</span>
              </div>
            )})
          ) : (
             <div className="h-full flex flex-col items-center justify-center text-center p-8 text-gray-500">
                <span className="material-icons text-6xl text-gray-300 mb-4">search_off</span>
                <h3 className="font-bold text-gray-800 text-lg">Nenhum Motorista Encontrado</h3>
                <p className="text-sm">Verifique os filtros aplicados ou o termo de busca.</p>
            </div>
          )}
        </div>
      </div>

      {/* Main Content (Detail View) */}
      <div className={`flex-1 bg-gray-50 overflow-y-auto ${showDetailMobile ? 'block absolute inset-0 z-20 bg-white' : 'hidden md:block static'}`}>
        
        {/* TELA DE APROVAÇÕES (NOVA) */}
        {activeTab === 'approvals' && !selectedDriver ? (
            <div className="max-w-4xl mx-auto p-4 md:p-8">
                {/* Mobile Back Button */}
                <div className="md:hidden bg-white p-2 border-b flex items-center shadow-sm mb-4 sticky top-0 z-10">
                    <button onClick={handleBackToList} className="p-2 mr-2 rounded-full hover:bg-gray-100 flex items-center gap-2">
                        <span className="material-icons text-gray-600">arrow_back</span>
                        <span className="font-bold text-gray-700">Voltar</span>
                    </button>
                </div>
                
                <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                     <span className="material-icons text-yellow-600">how_to_reg</span> Aprovação de Motoristas
                     <span className="bg-yellow-500 text-white text-xs px-2 py-1 rounded-full">{pendingCount} Pendentes</span>
                </h2>

                {pendingCount === 0 ? (
                    <div className="bg-white p-12 rounded-xl text-center shadow-sm border border-gray-200">
                        <span className="material-icons text-6xl text-green-100 mb-4">check_circle</span>
                        <h3 className="text-xl font-medium text-gray-800">Tudo em dia!</h3>
                        <p className="text-gray-500">Não há motoristas aguardando aprovação no momento.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {drivers.filter(d => !d.is_approved).map(pendingDriver => (
                            <div key={pendingDriver.id} className="bg-white rounded-xl shadow border border-yellow-200 overflow-hidden flex flex-col">
                                <div className="p-4 flex items-start gap-4">
                                    <img src={pendingDriver.avatar_url || 'https://via.placeholder.com/80'} className="w-16 h-16 rounded-full object-cover border-2 border-yellow-400" alt="" />
                                    <div className="flex-1">
                                        <h3 className="font-bold text-lg text-gray-800">{pendingDriver.username}</h3>
                                        <p className="text-xs text-gray-500 mb-2">Registrado em: {new Date(pendingDriver.created_at || '').toLocaleDateString()}</p>
                                        
                                        <div className="bg-gray-50 p-2 rounded text-sm space-y-1">
                                            <div className="flex items-center gap-2">
                                                <span className="material-icons text-xs text-gray-400">directions_car</span>
                                                <span className="font-medium">{pendingDriver.vehicle_model || 'Não info.'}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="material-icons text-xs text-gray-400">pin</span>
                                                <span className="font-mono bg-yellow-100 px-1 rounded text-yellow-800 font-bold">{pendingDriver.vehicle_plate || 'SEM PLACA'}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="material-icons text-xs text-gray-400">palette</span>
                                                <span>{pendingDriver.vehicle_color || 'Cor não info.'}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-gray-50 p-3 flex gap-2 mt-auto">
                                    <button 
                                        onClick={() => handleApprove(pendingDriver.id)}
                                        className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-bold flex items-center justify-center gap-2 shadow-sm active:scale-95 transition"
                                    >
                                        <span className="material-icons text-sm">check</span> Aprovar
                                    </button>
                                    <button 
                                        onClick={() => handleDelete(pendingDriver.id)}
                                        className="flex-1 bg-red-100 hover:bg-red-200 text-red-700 py-2 rounded-lg font-bold flex items-center justify-center gap-2 active:scale-95 transition"
                                    >
                                        <span className="material-icons text-sm">close</span> Rejeitar
                                    </button>
                                    <button 
                                        onClick={() => { setSelectedDriver(pendingDriver); setActiveTab('chat'); }}
                                        className="px-3 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg flex items-center justify-center"
                                        title="Conversar"
                                    >
                                        <span className="material-icons text-sm">chat</span>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        ) : activeTab === 'notifications' && !selectedDriver ? (
            <div className="max-w-4xl mx-auto p-4 md:p-8">
                {/* Mobile Back Button */}
                <div className="md:hidden bg-white p-2 border-b flex items-center shadow-sm mb-4 sticky top-0 z-10">
                    <button onClick={handleBackToList} className="p-2 mr-2 rounded-full hover:bg-gray-100 flex items-center gap-2">
                        <span className="material-icons text-gray-600">arrow_back</span>
                        <span className="font-bold text-gray-700">Voltar</span>
                    </button>
                </div>
                <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                     <span className="material-icons text-blue-600">campaign</span> Enviar Notificação Global
                </h2>
                
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Título da Notificação</label>
                            <input 
                                type="text"
                                value={broadcastTitle}
                                onChange={e => setBroadcastTitle(e.target.value)}
                                placeholder="Ex: Novo Sorteio!"
                                className="w-full p-2 border rounded text-gray-900" 
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Mensagem</label>
                            <textarea
                                value={broadcastMessage}
                                onChange={e => setBroadcastMessage(e.target.value)}
                                placeholder="Descreva a novidade aqui..."
                                className="w-full p-2 border rounded text-gray-900 h-24"
                            ></textarea>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Enviar Para:</label>
                            <div className="flex gap-4">
                                <label className="flex items-center gap-2">
                                    <input type="radio" name="target" value="all" checked={broadcastTarget === 'all'} onChange={() => setBroadcastTarget('all')} className="form-radio text-blue-600" />
                                    <span>Todos</span>
                                </label>
                                <label className="flex items-center gap-2">
                                    <input type="radio" name="target" value="driver" checked={broadcastTarget === 'driver'} onChange={() => setBroadcastTarget('driver')} className="form-radio text-blue-600" />
                                    <span>Apenas Motoristas</span>
                                </label>
                                <label className="flex items-center gap-2">
                                    <input type="radio" name="target" value="client" checked={broadcastTarget === 'client'} onChange={() => setBroadcastTarget('client')} className="form-radio text-blue-600" />
                                    <span>Apenas Clientes</span>
                                </label>
                            </div>
                        </div>
                        <div className="pt-4 border-t border-gray-100 flex justify-end">
                            <button
                                onClick={handleSendBroadcast}
                                disabled={isSendingBroadcast}
                                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg shadow-md flex items-center gap-2"
                            >
                                {isSendingBroadcast ? 'Enviando...' : 'Enviar Notificação'}
                                {!isSendingBroadcast && <span className="material-icons">send</span>}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        ) : activeTab === 'bingo' && !selectedDriver ? (
            <div className="max-w-4xl mx-auto p-4 md:p-8">
               {/* Mobile Back Button */}
               <div className="md:hidden bg-white p-2 border-b flex items-center shadow-sm mb-4 sticky top-0 z-10">
                    <button onClick={handleBackToList} className="p-2 mr-2 rounded-full hover:bg-gray-100 flex items-center gap-2">
                        <span className="material-icons text-gray-600">arrow_back</span>
                        <span className="font-bold text-gray-700">Voltar</span>
                    </button>
                </div>
                <div className="bg-purple-900 text-white p-6 rounded-2xl shadow-lg mb-8 relative overflow-hidden">
                    <div className="relative z-10 flex justify-between items-center">
                        <h2 className="text-3xl font-bold flex items-center gap-3">
                            <span className="material-icons text-4xl">casino</span> Gerenciar Bingo
                        </h2>
                        <button onClick={() => {if(confirm('Resetar jogo?')) resetBingo()}} className="bg-red-500 hover:bg-red-600 px-4 py-2 rounded text-sm font-bold">
                            Resetar Jogo
                        </button>
                    </div>
                    <div className="absolute right-0 top-0 h-full w-1/3 bg-white/10 transform skew-x-12"></div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Game Control */}
                    <div className="space-y-6">
                        <div className="bg-white p-6 rounded-xl shadow border border-gray-200">
                             <h3 className="font-bold text-gray-700 mb-4 border-b pb-2">Controle do Sorteio</h3>
                             
                             <div className="flex justify-center mb-6">
                                 <button 
                                    onClick={handleDrawNumber}
                                    className="w-40 h-40 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 text-white font-bold text-xl shadow-xl active:scale-95 transition flex flex-col items-center justify-center gap-2 border-4 border-purple-200"
                                 >
                                     <span className="material-icons text-4xl">refresh</span>
                                     SORTEAR
                                 </button>
                             </div>
                             
                             {/* GRID DE SORTEIO MANUAL */}
                             <div className="mt-4 border-t pt-4">
                                 <h4 className="text-xs text-gray-400 font-bold uppercase mb-2 text-center">Seleção Manual</h4>
                                 <div className="grid grid-cols-10 gap-1 text-[10px]">
                                     {Array.from({length: 75}, (_, i) => i + 1).map(num => {
                                         const isDrawn = bingoSettings?.drawn_numbers.includes(num);
                                         return (
                                            <button 
                                                key={num} 
                                                onClick={() => handleManualDraw(num)}
                                                disabled={isDrawn}
                                                className={`
                                                    aspect-square rounded flex items-center justify-center font-bold border
                                                    ${isDrawn 
                                                        ? 'bg-gray-200 text-gray-400 border-gray-200 cursor-not-allowed' 
                                                        : 'bg-white text-purple-700 border-purple-200 hover:bg-purple-100'
                                                    }
                                                `}
                                            >
                                                {num}
                                            </button>
                                         );
                                     })}
                                 </div>
                             </div>

                             <div className="mt-4">
                                 <h4 className="text-sm text-gray-500 uppercase font-bold mb-2">Números Sorteados ({bingoSettings?.drawn_numbers.length})</h4>
                                 <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-2 bg-gray-50 rounded-lg">
                                     {bingoSettings?.drawn_numbers.slice().reverse().map((n, i) => (
                                         <div key={i} className="w-8 h-8 rounded-full bg-purple-100 text-purple-800 font-bold flex items-center justify-center border border-purple-200 text-sm">
                                             {n}
                                         </div>
                                     ))}
                                 </div>
                             </div>
                        </div>

                        {/* Configurar Premio */}
                        <div className="bg-white p-6 rounded-xl shadow border border-gray-200">
                             <h3 className="font-bold text-gray-700 mb-4 border-b pb-2">Configurar Prêmio</h3>
                             <div className="space-y-3">
                                 <div>
                                     <label className="block text-xs font-bold text-gray-500 mb-1">Link da Imagem</label>
                                     <input type="text" value={bingoSettings?.prize_image} onChange={e => setBingoSettings(s => s ? {...s, prize_image: e.target.value} : null)} className="w-full p-2 border rounded text-sm text-gray-800" />
                                 </div>
                                 <div>
                                     <label className="block text-xs font-bold text-gray-500 mb-1">Descrição</label>
                                     <input type="text" value={bingoSettings?.prize_description} onChange={e => setBingoSettings(s => s ? {...s, prize_description: e.target.value} : null)} className="w-full p-2 border rounded text-sm text-gray-800" />
                                 </div>
                                 <div>
                                     <label className="block text-xs font-bold text-gray-500 mb-1">Link do YouTube</label>
                                     <input type="text" value={bingoSettings?.youtube_link} onChange={e => setBingoSettings(s => s ? {...s, youtube_link: e.target.value} : null)} className="w-full p-2 border rounded text-sm text-gray-800" />
                                 </div>
                                 
                                 {/* VIDEO PREVIEW */}
                                 {adminVideoId && (
                                     <div className="mt-2 rounded-lg overflow-hidden bg-black border border-gray-300">
                                         <p className="text-[10px] text-gray-500 bg-gray-100 p-1 text-center">Preview (Verifique se funciona)</p>
                                         <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                                              <iframe 
                                                  className="absolute top-0 left-0 w-full h-full"
                                                  src={`https://www.youtube.com/embed/${adminVideoId}?rel=0&modestbranding=1&origin=${encodeURIComponent(window.location.origin)}`}
                                                  title="YouTube video player" 
                                                  frameBorder="0" 
                                                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                                                  allowFullScreen
                                                  referrerPolicy="strict-origin-when-cross-origin"
                                              ></iframe>
                                         </div>
                                     </div>
                                 )}

                                 <button onClick={handleSaveBingoSettings} className="w-full bg-blue-600 text-white py-2 rounded font-bold hover:bg-blue-700">Salvar Dados</button>
                             </div>
                        </div>
                    </div>

                    {/* Ranking */}
                    <div className="bg-white p-6 rounded-xl shadow border border-gray-200">
                        <h3 className="font-bold text-gray-700 mb-4 border-b pb-2">Top 10 Jogadores</h3>
                        <div className="overflow-y-auto max-h-[500px]">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-gray-50 text-gray-500">
                                    <tr>
                                        <th className="p-2">#</th>
                                        <th className="p-2">Usuário</th>
                                        <th className="p-2 text-center">Acertos</th>
                                        <th className="p-2 text-center">Faltam</th>
                                        <th className="p-2 text-center">Ação</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {bingoRanking.map((user, idx) => (
                                        <tr key={idx} className={`border-b border-gray-100 ${idx < 3 ? 'bg-yellow-50' : ''}`}>
                                            <td className="p-2 font-bold text-gray-400">{idx + 1}</td>
                                            <td className="p-2 font-medium flex items-center gap-2">
                                                <img src={user.avatar_url} className="w-6 h-6 rounded-full" alt="" />
                                                {user.username}
                                            </td>
                                            <td className="p-2 text-center font-bold text-green-600">{user.hits}</td>
                                            <td className="p-2 text-center font-mono text-gray-500">{user.missing}</td>
                                            <td className="p-2 text-center">
                                                <button 
                                                    onClick={() => handleDriverClick({ id: user.user_id, username: user.username, role: 'client' } as UserProfile)}
                                                    className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs hover:bg-blue-200"
                                                >
                                                    Chat
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {bingoRanking.length === 0 && (
                                        <tr><td colSpan={5} className="p-4 text-center text-gray-400">Nenhum jogador ainda.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        ) : activeTab === 'settings' && !selectedDriver ? (
            <div className="max-w-4xl mx-auto p-4 md:p-8">
                 {/* Mobile Back Button */}
                 <div className="md:hidden bg-white p-2 border-b flex items-center shadow-sm mb-4 sticky top-0 z-10">
                    <button onClick={handleBackToList} className="p-2 mr-2 rounded-full hover:bg-gray-100 flex items-center gap-2">
                        <span className="material-icons text-gray-600">arrow_back</span>
                        <span className="font-bold text-gray-700">Voltar</span>
                    </button>
                 </div>
                 <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                     <span className="material-icons">settings</span> Configurações do Aplicativo
                 </h2>
                 
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                     {/* Car Rates */}
                     <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                         <div className="flex items-center gap-2 mb-4 text-blue-600 font-bold border-b pb-2">
                             <span className="material-icons">directions_car</span> Tarifas Carro
                         </div>
                         <div className="space-y-4">
                             <div>
                                 <label className="block text-sm font-medium text-gray-700 mb-1">Bandeirada (R$)</label>
                                 <input type="number" step="0.10" value={appSettings.car_base_price} onChange={e => setAppSettings({...appSettings, car_base_price: parseFloat(e.target.value)})} className="w-full p-2 border rounded text-gray-900" />
                             </div>
                             <div>
                                 <label className="block text-sm font-medium text-gray-700 mb-1">Preço por KM (R$)</label>
                                 <input type="number" step="0.10" value={appSettings.car_price_km} onChange={e => setAppSettings({...appSettings, car_price_km: parseFloat(e.target.value)})} className="w-full p-2 border rounded text-gray-900" />
                             </div>
                             <div>
                                 <label className="block text-sm font-medium text-gray-700 mb-1">Preço por Minuto (R$)</label>
                                 <input type="number" step="0.10" value={appSettings.car_price_min} onChange={e => setAppSettings({...appSettings, car_price_min: parseFloat(e.target.value)})} className="w-full p-2 border rounded text-gray-900" />
                             </div>
                             <div className="pt-2 border-t border-gray-100">
                                 <label className="block text-sm font-bold text-gray-700 mb-1">Distância Inicial (Inclusa na Bandeirada)</label>
                                 <div className="flex items-center">
                                    <input type="number" step="0.10" value={appSettings.car_start_distance_limit} onChange={e => setAppSettings({...appSettings, car_start_distance_limit: parseFloat(e.target.value)})} className="flex-1 p-2 border rounded text-gray-900" />
                                    <span className="ml-2 text-sm text-gray-500">km</span>
                                 </div>
                                 <p className="text-xs text-gray-400 mt-1">Ex: Se colocar 2, só cobra por KM após 2km rodados.</p>
                             </div>
                         </div>
                     </div>

                     {/* Moto Rates */}
                     <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                         <div className="flex items-center gap-2 mb-4 text-orange-600 font-bold border-b pb-2">
                             <span className="material-icons">two_wheeler</span> Tarifas Moto
                         </div>
                         <div className="space-y-4">
                             <div>
                                 <label className="block text-sm font-medium text-gray-700 mb-1">Bandeirada (R$)</label>
                                 <input type="number" step="0.10" value={appSettings.moto_base_price} onChange={e => setAppSettings({...appSettings, moto_base_price: parseFloat(e.target.value)})} className="w-full p-2 border rounded text-gray-900" />
                             </div>
                             <div>
                                 <label className="block text-sm font-medium text-gray-700 mb-1">Preço por KM (R$)</label>
                                 <input type="number" step="0.10" value={appSettings.moto_price_km} onChange={e => setAppSettings({...appSettings, moto_price_km: parseFloat(e.target.value)})} className="w-full p-2 border rounded text-gray-900" />
                             </div>
                             <div>
                                 <label className="block text-sm font-medium text-gray-700 mb-1">Preço por Minuto (R$)</label>
                                 <input type="number" step="0.10" value={appSettings.moto_price_min} onChange={e => setAppSettings({...appSettings, moto_price_min: parseFloat(e.target.value)})} className="w-full p-2 border rounded text-gray-900" />
                             </div>
                             <div className="pt-2 border-t border-gray-100">
                                 <label className="block text-sm font-bold text-gray-700 mb-1">Distância Inicial (Inclusa na Bandeirada)</label>
                                 <div className="flex items-center">
                                    <input type="number" step="0.10" value={appSettings.moto_start_distance_limit} onChange={e => setAppSettings({...appSettings, moto_start_distance_limit: parseFloat(e.target.value)})} className="flex-1 p-2 border rounded text-gray-900" />
                                    <span className="ml-2 text-sm text-gray-500">km</span>
                                 </div>
                                 <p className="text-xs text-gray-400 mt-1">Ex: Se colocar 2, só cobra por KM após 2km rodados.</p>
                             </div>
                         </div>
                     </div>

                     {/* Marquee Banner Settings (NOVO) */}
                     <div className="md:col-span-2 bg-gradient-to-r from-purple-900 to-indigo-900 p-6 rounded-xl shadow-lg border border-purple-700 text-white">
                         <div className="flex items-center gap-2 mb-4 text-yellow-300 font-bold border-b border-white/20 pb-2">
                             <span className="material-icons">campaign</span> Tarjeta de Avisos (Letreiro)
                         </div>
                         <div>
                             <label className="block text-sm font-medium text-gray-200 mb-2">Texto do Letreiro (passa no topo do app)</label>
                             <textarea 
                                rows={2}
                                value={appSettings.marquee_text} 
                                onChange={e => setAppSettings({...appSettings, marquee_text: e.target.value})} 
                                className="w-full p-3 border border-white/20 rounded-lg bg-black/30 text-white placeholder-gray-400 focus:ring-2 ring-yellow-400 outline-none"
                                placeholder="Digite o texto promocional aqui..."
                             />
                             <p className="text-xs text-gray-400 mt-2">Dica: Use emojis para chamar atenção. O texto se repete automaticamente.</p>
                         </div>
                     </div>
                 </div>

                 <div className="mt-8 flex justify-end">
                     <button 
                        onClick={handleSaveSettings} 
                        disabled={isSavingSettings}
                        className="bg-green-600 text-white px-6 py-3 rounded-lg font-bold shadow-md hover:bg-green-700 flex items-center gap-2"
                     >
                         {isSavingSettings ? 'Salvando...' : 'Salvar Alterações'}
                         <span className="material-icons">save</span>
                     </button>
                 </div>
            </div>
        ) : (
        selectedDriver ? (
          <div className="h-full flex flex-col">
            {/* ... rest of selected driver detail view ... */}
            {/* Mobile Back Button Header */}
            <div className="md:hidden bg-white p-2 border-b flex items-center shadow-sm sticky top-0 z-10">
                <button onClick={handleBackToList} className="p-2 mr-2 rounded-full hover:bg-gray-100 flex items-center gap-2">
                    <span className="material-icons text-gray-600">arrow_back</span>
                    <span className="font-bold text-gray-700">Voltar</span>
                </button>
            </div>

            {/* Cover */}
            <div className={`shrink-0 bg-gradient-to-r from-blue-600 to-indigo-600 relative ${activeTab === 'chat' ? 'h-16' : 'h-32 md:h-40'}`}>
               <div className={`absolute left-6 md:left-8 ${activeTab === 'chat' ? 'top-2 flex items-center gap-3' : '-bottom-10 md:-bottom-12'}`}>
                 <div className={`${activeTab === 'chat' ? 'w-12 h-12 border-2' : 'w-20 h-20 md:w-24 md:h-24 border-4'} rounded-full border-white bg-white overflow-hidden shadow-md`}>
                   <img src={selectedDriver.avatar_url} alt={selectedDriver.username} className={`w-full h-full object-cover ${!selectedDriver.is_approved ? 'grayscale' : ''}`} />
                 </div>
                 {activeTab === 'chat' && (
                     <h2 className="text-white font-bold text-lg">{selectedDriver.username}</h2>
                 )}
               </div>
               {activeTab !== 'chat' && (
                <div className="absolute top-4 right-4 flex gap-2">
                    <button onClick={() => handleDelete(selectedDriver.id)} className="p-2 bg-white/20 hover:bg-white/30 text-white rounded-lg backdrop-blur-sm transition" title="Deletar Motorista">
                    <span className="material-icons">delete</span>
                    </button>
                </div>
               )}
            </div>

            {/* Info and Tabs - Only show if NOT chat, or minimize header */}
            {activeTab !== 'chat' && (
            <div className="pt-12 md:pt-16 px-6 md:px-8 pb-2 shrink-0 bg-white">
               <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-4">
                 <div>
                   <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                       {selectedDriver.username}
                       <span 
                            className={`material-icons text-lg ${selectedDriver.vehicle_type === 'motorcycle' ? 'text-orange-500' : 'text-blue-500'}`}
                            title={selectedDriver.vehicle_type === 'motorcycle' ? 'Moto' : 'Carro'}
                        >
                            {selectedDriver.vehicle_type === 'motorcycle' ? 'two_wheeler' : 'directions_car'}
                        </span>
                   </h2>
                   {!selectedDriver.is_approved ? (
                        <div className="mt-2 inline-flex items-center gap-2 bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm font-bold border border-yellow-200">
                            <span className="material-icons text-sm">warning</span>
                            Aprovação Pendente
                        </div>
                   ) : (
                        <div className="flex items-center gap-2 mt-1">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium uppercase ${
                                selectedDriver.status === 'available' ? 'bg-green-100 text-green-800' :
                                selectedDriver.status === 'busy' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
                            }`}>
                            {selectedDriver.status}
                            </span>
                            <span className="text-gray-400 text-sm">•</span>
                            <span className="text-gray-500 text-sm">Motorista Aprovado</span>
                        </div>
                   )}
                 </div>
                 
                 {/* Quick Actions */}
                 <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0">
                   {!selectedDriver.is_approved && (
                       <button
                           onClick={() => handleApprove(selectedDriver.id)}
                           className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 shadow-md animate-pulse"
                       >
                           <span className="material-icons text-sm">check_circle</span>
                           <span className="text-sm font-bold">APROVAR AGORA</span>
                       </button>
                   )}

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
                    onClick={() => setActiveTab('chat')}
                    className="px-4 md:px-6 py-3 font-medium text-sm transition whitespace-nowrap flex items-center gap-2 text-gray-500 hover:text-gray-700"
                  >
                    Chat
                    <span className="bg-whatsapp-green text-white text-[10px] px-1.5 py-0.5 rounded-full">New</span>
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
            )}

            {/* Tab Content - Full Height for Chat */}
            <div className={`flex-1 ${activeTab === 'chat' ? 'bg-[#0b141a]' : 'bg-gray-50 p-4 md:p-8'} overflow-y-auto relative`}>
              
              {activeTab === 'chat' && (
                   <div className="h-full flex flex-col">
                       {/* Custom Header within Chat Tab to switch back */}
                       <div className="bg-gray-100 p-2 flex justify-between items-center text-xs text-gray-500 border-b">
                           <span>Falando com <b>{selectedDriver.username}</b></span>
                           <button onClick={() => setActiveTab('details')} className="underline">Voltar aos Detalhes</button>
                       </div>
                       <ChatWindow 
                           currentUser={currentUser}
                           chatPartner={selectedDriver}
                           messages={driverMessages}
                           onSendMessage={(msg) => setDriverMessages(prev => [...prev, msg])}
                       />
                   </div>
              )}

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

                        {/* Subscription Management (NOVO) */}
                        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 xl:col-span-2">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                <span className="material-icons text-sm text-yellow-600">monetization_on</span>
                                Gerenciar Assinatura (Plano)
                            </h3>
                            
                            <div className="flex flex-col md:flex-row gap-6 items-center">
                                <div className="flex-1 text-center md:text-left w-full">
                                    {(() => {
                                        const sub = checkSubscriptionStatus(selectedDriver.subscription_expires_at);
                                        return (
                                            <div className={`p-4 rounded-lg border-l-4 ${sub.isValid ? 'bg-green-50 border-green-500' : 'bg-red-50 border-red-500'}`}>
                                                <div className="text-sm font-bold text-gray-600 mb-1">Status Atual</div>
                                                <div className={`text-2xl font-bold ${sub.isValid ? 'text-green-700' : 'text-red-700'}`}>
                                                    {sub.isValid ? 'ATIVO' : 'VENCIDO'}
                                                </div>
                                                <div className="text-xs text-gray-500 mt-1">
                                                    {sub.isValid 
                                                        ? `Vence em: ${new Date(selectedDriver.subscription_expires_at || '').toLocaleDateString()} (${sub.daysLeft} dias restantes)` 
                                                        : 'Motorista sem acesso ao app.'}
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                                <div className="flex gap-2 flex-wrap justify-center w-full md:w-auto">
                                    <button onClick={() => handleAddDays(1)} className="px-4 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-xs font-bold border border-blue-200">+1 Dia</button>
                                    <button onClick={() => handleAddDays(7)} className="px-4 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-xs font-bold border border-blue-200">+7 Dias</button>
                                    <button onClick={() => handleAddDays(30)} className="px-4 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-xs font-bold border border-blue-200">+30 Dias</button>
                                    <button onClick={handleRemoveAccess} className="px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-xs font-bold border border-red-200 flex items-center gap-1">
                                        <span className="material-icons text-xs">block</span> Remover Acesso
                                    </button>
                                </div>
                            </div>
                        </div>
                        
                        {/* Vehicle Form & Password Reset */}
                        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 xl:col-span-2">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Dados do Veículo & Acesso</h3>
                                <span className="material-icons text-gray-300">directions_car</span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Tipo de Veículo</label>
                                    <select 
                                        value={vehicleForm.type}
                                        onChange={e => setVehicleForm({...vehicleForm, type: e.target.value as any})}
                                        className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 ring-whatsapp-green/20 outline-none bg-white text-gray-900"
                                    >
                                        <option value="car">Carro</option>
                                        <option value="motorcycle">Moto</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Modelo</label>
                                    <input 
                                        type="text" 
                                        value={vehicleForm.model}
                                        onChange={e => setVehicleForm({...vehicleForm, model: e.target.value})}
                                        placeholder="Ex: Toyota Corolla"
                                        className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 ring-whatsapp-green/20 outline-none text-gray-900"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Placa</label>
                                    <input 
                                        type="text" 
                                        value={vehicleForm.plate}
                                        onChange={e => setVehicleForm({...vehicleForm, plate: e.target.value})}
                                        placeholder="ABC-1234"
                                        className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 ring-whatsapp-green/20 outline-none uppercase text-gray-900"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Cor</label>
                                    <input 
                                        type="text" 
                                        value={vehicleForm.color}
                                        onChange={e => setVehicleForm({...vehicleForm, color: e.target.value})}
                                        placeholder="Ex: Prata"
                                        className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 ring-whatsapp-green/20 outline-none text-gray-900"
                                    />
                                </div>
                                {/* Password Field - HIGHLIGHTED */}
                                <div className="md:col-span-2 border-t pt-4 mt-2 bg-yellow-50 p-4 rounded-lg border-yellow-200">
                                    <label className="block text-xs font-bold text-yellow-800 mb-1 flex items-center gap-1">
                                        <span className="material-icons text-sm">lock_reset</span> Redefinir Senha do Motorista
                                    </label>
                                    <div className="flex gap-2">
                                        <input 
                                            type="text" 
                                            value={newPassword}
                                            onChange={e => setNewPassword(e.target.value)}
                                            placeholder="Digite a Nova Senha aqui..."
                                            className="flex-1 p-2 border border-yellow-300 rounded-lg text-sm focus:ring-2 ring-yellow-500/20 outline-none text-gray-900 bg-white"
                                        />
                                    </div>
                                    <p className="text-[10px] text-yellow-700 mt-1">
                                        Deixe em branco se não quiser alterar. O motorista usará esta senha no próximo login.
                                    </p>
                                </div>
                            </div>
                            <div className="mt-4 text-right">
                                <button 
                                    onClick={handleUpdateVehicle}
                                    disabled={isSavingVehicle}
                                    className="bg-whatsapp-green text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-600 transition flex items-center gap-2 ml-auto shadow-sm"
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
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden overflow-x-auto">
                      <table className="w-full text-left min-w-[500px]">
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
            <p className="text-lg">Selecione um motorista para ver detalhes ou acesse as Configurações.</p>
          </div>
        )
      )}
      </div>
    </div>
  );
}