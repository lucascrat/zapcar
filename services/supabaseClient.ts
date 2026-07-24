
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants';
import { Message, UserProfile, UserRole, DriverStatus, AppSettings, BingoSettings, BingoCard, BingoRankingUser, BroadcastMessage, DriverPlan } from '../types';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  db: { schema: 'chegoja' },
});

// Helper for UUID compatibility (used for Optimistic UI in ChatWindow)
export const generateUUID = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// Centralized error handling helper
const handleDbError = (error: any, context: string): string => {
  // Log the full object for debugging
  console.error(`Detailed Error in ${context}:`, error);

  let msg = 'Erro desconhecido';

  if (error) {
    // Erro específico de Tabela não encontrada (Postgres 42P01)
    if (error.code === '42P01') {
      msg = "Tabela não encontrada no banco de dados. Por favor, execute o script SQL atualizado (supa.ts) no Supabase.";
    }
    else if (typeof error === 'string') {
      msg = error;
    } else if (error.message) {
      msg = error.message;
      // Adiciona detalhes se existirem (comum em erros Postgres)
      if (error.details) msg += ` (${error.details})`;
      if (error.hint) msg += ` - Dica: ${error.hint}`;
    } else if (error.error_description) {
      msg = error.error_description;
    } else {
      try {
        msg = JSON.stringify(error, null, 2); // Pretty print
        // Evita o [object Object] se o stringify falhar ou retornar genérico
        if (msg === '{}' || msg === '[object Object]') {
          msg = `Erro Genérico: ${String(error)}`;
        }
      } catch (e) {
        msg = String(error);
      }
    }
  }

  console.warn(`Database Error (${context}): ${msg}`);
  return msg;
};

// Nova função para buscar perfil individual (Útil para Auto-Open)
export const fetchUserProfile = async (userId: string): Promise<UserProfile | null> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.warn("Erro ao buscar perfil único:", error);
    return null;
  }
  return data as UserProfile;
};

export const fetchOnlineDrivers = async (): Promise<UserProfile[]> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', UserRole.DRIVER)
    .eq('is_approved', true) // Only approved drivers
    .neq('status', DriverStatus.OFFLINE)
    .order('status', { ascending: true }); // Disponíveis primeiro

  if (error) {
    handleDbError(error, "fetchOnlineDrivers");
    return [];
  }
  return data as UserProfile[];
};

export const fetchAllDriversForAdmin = async (): Promise<UserProfile[]> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', UserRole.DRIVER)
    .order('created_at', { ascending: false });

  if (error) {
    handleDbError(error, "fetchAllDriversForAdmin");
    return [];
  }
  return data as UserProfile[];
};

export const fetchAdminContact = async (): Promise<UserProfile | null> => {
  // Busca o primeiro admin disponível para o chat de suporte
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', UserRole.ADMIN)
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return data as UserProfile;
};

export const deleteDriver = async (driverId: string): Promise<boolean> => {
  const { error } = await supabase
    .from('profiles')
    .delete()
    .eq('id', driverId);

  if (error) {
    handleDbError(error, "deleteDriver");
    return false;
  }
  return true;
};

export const approveDriver = async (driverId: string): Promise<boolean> => {
  const { error } = await supabase
    .from('profiles')
    .update({ is_approved: true })
    .eq('id', driverId);

  if (error) {
    handleDbError(error, "approveDriver");
    return false;
  }
  return true;
};

export const updateDriverStatus = async (driverId: string, status: DriverStatus): Promise<boolean> => {
  const { error } = await supabase
    .from('profiles')
    .update({ status })
    .eq('id', driverId);

  if (error) {
    handleDbError(error, "updateDriverStatus");
    return false;
  }
  return true;
};

export const updateUserLocation = async (userId: string, lat: number, lng: number): Promise<boolean> => {
  const { error } = await supabase
    .from('profiles')
    .update({ lat, lng })
    .eq('id', userId);

  if (error) {
    // Silent fail for location updates usually
    console.warn("Location update failed", error);
    return false;
  }
  return true;
};

export const updateDriverVehicle = async (
  driverId: string,
  vehicleData: {
    vehicle_model?: string,
    vehicle_plate?: string,
    vehicle_color?: string,
    vehicle_type?: 'car' | 'motorcycle'
  }
): Promise<boolean> => {
  const { error } = await supabase
    .from('profiles')
    .update(vehicleData)
    .eq('id', driverId);

  if (error) {
    handleDbError(error, "updateDriverVehicle");
    return false;
  }
  return true;
};

export const updateDriverPassword = async (driverId: string, newPassword: string): Promise<boolean> => {
  const { error } = await supabase
    .from('profiles')
    .update({ password: newPassword })
    .eq('id', driverId);

  if (error) {
    handleDbError(error, "updateDriverPassword");
    return false;
  }
  return true;
};

// --- Gerenciamento de Assinatura (Admin) ---
export const addSubscriptionDays = async (driverId: string, days: number): Promise<boolean> => {
  try {
    // 1. Pega usuário atual
    const { data: user, error: fetchError } = await supabase
      .from('profiles')
      .select('subscription_expires_at')
      .eq('id', driverId)
      .single();

    if (fetchError) {
      handleDbError(fetchError, "addSubscriptionDays_fetch");
      return false;
    }

    const now = new Date();
    let baseDate = now;

    // Se a assinatura ainda é válida, adiciona ao final. Se não, começa de agora.
    if (user.subscription_expires_at) {
      const currentExpire = new Date(user.subscription_expires_at);
      if (currentExpire > now) {
        baseDate = currentExpire;
      }
    }

    // Se estiver removendo dias (negativo), a lógica é apenas subtrair
    // Se a intenção for resetar (ex: dias = -999 ou zerar), tratamos como expirar agora
    let newExpire = new Date(baseDate);

    if (days === 0) {
      // ZERAR (Expirar imediatamente)
      newExpire = new Date();
      newExpire.setDate(newExpire.getDate() - 1); // Ontem
    } else {
      newExpire.setDate(newExpire.getDate() + days);
    }

    const { error } = await supabase
      .from('profiles')
      .update({ subscription_expires_at: newExpire.toISOString() })
      .eq('id', driverId);

    if (error) {
      handleDbError(error, "addSubscriptionDays_update");
      return false;
    }
    return true;
  } catch (e) {
    handleDbError(e, "addSubscriptionDays_EXCEPTION");
    return false;
  }
};

export const fetchMyClients = async (driverId: string): Promise<UserProfile[]> => {
  try {
    // Find users who have exchanged messages with this driver
    // We look for messages where driver is receiver OR sender to be thorough
    const { data, error } = await supabase
      .from('messages')
      .select('sender_id, receiver_id')
      .or(`receiver_id.eq.${driverId},sender_id.eq.${driverId}`)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      handleDbError(error, "fetchMyClients (messages)");
      return [];
    }

    if (!data || data.length === 0) return [];

    // Extract IDs that are NOT the driver's ID
    const contactIds = new Set<string>();
    data.forEach((m: any) => {
      if (m.sender_id !== driverId) contactIds.add(m.sender_id);
      if (m.receiver_id !== driverId) contactIds.add(m.receiver_id);
    });

    const idsArray = Array.from(contactIds);
    if (idsArray.length === 0) return [];

    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .in('id', idsArray);

    if (profileError) {
      handleDbError(profileError, "fetchMyClients (profiles)");
      return [];
    }

    return profiles as UserProfile[] || [];
  } catch (e) {
    handleDbError(e, "fetchMyClients_EXCEPTION");
    return [];
  }
};

export const fetchMessages = async (user1: string, user2: string): Promise<Message[]> => {
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${user1},receiver_id.eq.${user2}),and(sender_id.eq.${user2},receiver_id.eq.${user1})`)
      .order('created_at', { ascending: true });

    if (error) {
      handleDbError(error, "fetchMessages");
      return [];
    }
    return data as Message[];
  } catch (e) {
    handleDbError(e, "fetchMessages_EXCEPTION");
    return [];
  }
};

export const sendMessage = async (message: Partial<Message>) => {
  // We allow the UI to generate the ID for optimistic updates, 
  // but we ensure the object passed matches the table structure.
  const { data, error } = await supabase
    .from('messages')
    .insert([message])
    .select()
    .single();

  if (error) {
    handleDbError(error, "sendMessage");
    return null;
  }
  return data as Message;
};

// --- Settings Functions (Taximeter & App) ---

export const fetchAppSettings = async (): Promise<AppSettings> => {
  const { data, error } = await supabase
    .from('app_settings')
    .select('*')
    .limit(1)
    .single();

  const defaultSettings: AppSettings = {
    car_base_price: 5.0,
    car_price_km: 2.5,
    car_price_min: 0.5,
    car_start_distance_limit: 0,
    moto_base_price: 3.5,
    moto_price_km: 1.8,
    moto_price_min: 0.3,
    moto_start_distance_limit: 0,
    marquee_text: 'ENTRE E CONCORRA A PRÊMIOS TODA SEMANA! - PRÊMIOS CHEGOJÁ'
  };

  if (error || !data) {
    return defaultSettings;
  }

  // Ensure new fields exist even if DB record is old
  return {
    ...defaultSettings,
    ...data,
    // Priority to DB data, but fallback for undefined new fields
    marquee_text: data.marquee_text || defaultSettings.marquee_text
  } as AppSettings;
};

export const updateAppSettings = async (settings: AppSettings): Promise<boolean> => {
  // Extract ID to prevent updating it manually
  const { id, ...updates } = settings;

  // Check if exists row, if not insert, else update
  const { data: existing } = await supabase.from('app_settings').select('id').limit(1);

  let error;

  if (existing && existing.length > 0) {
    const { error: upError } = await supabase
      .from('app_settings')
      .update(updates)
      .eq('id', existing[0].id);
    error = upError;
  } else {
    const { error: inError } = await supabase
      .from('app_settings')
      .insert([updates]);
    error = inError;
  }

  if (error) {
    handleDbError(error, "updateAppSettings");
    return false;
  }
  return true;
};

// --- Driver Plans Functions ---

export const fetchDriverPlans = async (): Promise<DriverPlan[]> => {
  const { data, error } = await supabase
    .from('driver_plans')
    .select('*')
    .order('price', { ascending: true });

  if (error) {
    handleDbError(error, "fetchDriverPlans");
    return [];
  }
  return data as DriverPlan[];
};

export const updateDriverPlan = async (plan: DriverPlan): Promise<boolean> => {
  const { error } = await supabase
    .from('driver_plans')
    .update({
      title: plan.title,
      description: plan.description,
      price: plan.price,
      days: plan.days
    })
    .eq('id', plan.id);

  if (error) {
    handleDbError(error, "updateDriverPlan");
    return false;
  }
  return true;
};

// --- BINGO FUNCTIONS ---

export const fetchBingoSettings = async (): Promise<BingoSettings> => {
  const { data, error } = await supabase.from('bingo_settings').select('*').limit(1).maybeSingle();

  if (error) {
    // Se a tabela não existir, o erro já foi logado. Retornamos null para evitar crash.
    handleDbError(error, "fetchBingoSettings");
  }

  if (!data) {
    // Retorna padrão se não existir ou se der erro
    return {
      prize_image: 'https://placehold.co/600x400/png?text=Pr%C3%AAmio',
      prize_description: 'Prêmio do Sorteio',
      youtube_link: '',
      drawn_numbers: [],
      is_active: true
    };
  }
  return data as BingoSettings;
};

export const updateBingoSettings = async (settings: Partial<BingoSettings>): Promise<boolean> => {
  const { data: existing, error: fetchError } = await supabase.from('bingo_settings').select('id').limit(1);

  if (fetchError && fetchError.code === '42P01') {
    alert("A tabela do Bingo não foi criada. Execute o SQL em 'supa.ts'.");
    return false;
  }

  let error;
  if (existing && existing.length > 0) {
    const { error: up } = await supabase.from('bingo_settings').update(settings).eq('id', existing[0].id);
    error = up;
  } else {
    const { error: ins } = await supabase.from('bingo_settings').insert([settings]);
    error = ins;
  }

  if (error) {
    handleDbError(error, "updateBingoSettings");
    return false;
  }
  return true;
};

export const drawBingoNumber = async (): Promise<number | null> => {
  const settings = await fetchBingoSettings();
  if (!settings) return null;

  let available = [];
  for (let i = 1; i <= 75; i++) {
    if (!settings.drawn_numbers.includes(i)) available.push(i);
  }

  if (available.length === 0) return null;

  const randomIndex = Math.floor(Math.random() * available.length);
  const newNumber = available[randomIndex];
  const newDrawn = [...settings.drawn_numbers, newNumber];

  await updateBingoSettings({ drawn_numbers: newDrawn });
  return newNumber;
};

export const drawSpecificBingoNumber = async (numberToDraw: number): Promise<boolean> => {
  const settings = await fetchBingoSettings();
  if (!settings) return false;

  // Se já foi sorteado, ignora
  if (settings.drawn_numbers.includes(numberToDraw)) return false;

  const newDrawn = [...settings.drawn_numbers, numberToDraw];
  return await updateBingoSettings({ drawn_numbers: newDrawn });
};

export const resetBingo = async (): Promise<boolean> => {
  return await updateBingoSettings({ drawn_numbers: [] });
};

export const getOrCreateBingoCard = async (userId: string): Promise<BingoCard | null> => {
  // 1. Check exists
  const { data, error } = await supabase.from('bingo_cards').select('*').eq('user_id', userId).maybeSingle();

  if (error) {
    handleDbError(error, "getBingoCard_check");
    // Se a tabela não existir, o erro já foi logado. Retornamos null para evitar crash.
    return null;
  }

  if (data) return data as BingoCard;

  // 2. Create new card
  // Gera 25 números aleatórios únicos entre 1 e 75 para preencher o grid 5x5
  const numbers = new Set<number>();
  while (numbers.size < 25) {
    numbers.add(Math.floor(Math.random() * 75) + 1);
  }
  const numbersArray = Array.from(numbers).sort((a, b) => a - b);

  const { data: newCard, error: createError } = await supabase
    .from('bingo_cards')
    .insert([{ user_id: userId, numbers: numbersArray }])
    .select()
    .single();

  if (createError) {
    handleDbError(createError, "createBingoCard");
    return null;
  }
  return newCard as BingoCard;
};

export const fetchBingoRanking = async (): Promise<BingoRankingUser[]> => {
  // Busca settings para saber numeros sorteados
  const settings = await fetchBingoSettings();
  const drawnSet = new Set(settings.drawn_numbers);

  // Busca todas as cartelas com info do usuario
  const { data: cards, error } = await supabase
    .from('bingo_cards')
    .select('*, profiles:user_id(username, id, avatar_url)');

  if (error) {
    handleDbError(error, "fetchBingoRanking");
    return [];
  }

  if (!cards) return [];

  const ranking: BingoRankingUser[] = cards.map((card: any) => {
    const myNumbers: number[] = card.numbers;
    const hits = myNumbers.filter(n => drawnSet.has(n)).length;
    return {
      username: card.profiles?.username || 'Desconhecido',
      user_id: card.profiles?.id,
      avatar_url: card.profiles?.avatar_url,
      hits: hits,
      missing: myNumbers.length - hits
    };
  });

  // Ordena por acertos (Decrescente)
  return ranking.sort((a, b) => b.hits - a.hits).slice(0, 10); // Top 10
};

export const subscribeToBingo = (onUpdate: () => void) => {
  return supabase
    .channel('public:bingo')
    .on('postgres_changes', { event: '*', schema: 'chegoja', table: 'bingo_settings' }, onUpdate)
    .on('postgres_changes', { event: '*', schema: 'chegoja', table: 'bingo_cards' }, onUpdate)
    .subscribe();
};

// --- Storage Functions ---

export const uploadFile = async (file: Blob, folder: 'audio' | 'images', extension?: string): Promise<string | null> => {
  try {
    let fileExt = extension;

    // Fallback defaults if no extension provided
    if (!fileExt) {
      if (file.type === 'image/jpeg') fileExt = 'jpg';
      else if (file.type === 'image/png') fileExt = 'png';
      else if (file.type.includes('audio')) fileExt = 'webm'; // Default legacy
      else fileExt = 'bin';
    }

    // Sanitize extension (remove leading dot if exists)
    fileExt = fileExt.replace(/^\./, '');

    const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

    // Ensure we pass the correct content type if possible
    const options: any = {
      cacheControl: '3600',
      upsert: false
    };

    if (file.type) {
      options.contentType = file.type;
    }

    const { data, error } = await supabase.storage
      .from('chat-media')
      .upload(fileName, file, options);

    if (error) {
      handleDbError(error, "uploadFile");
      return null;
    }

    // Get Public URL
    const { data: { publicUrl } } = supabase.storage
      .from('chat-media')
      .getPublicUrl(fileName);

    return publicUrl;
  } catch (e) {
    handleDbError(e, "uploadFile_EXCEPTION");
    return null;
  }
};

export const subscribeToMessages = (
  userId: string,
  onMessage: (msg: Message) => void
) => {
  return supabase
    .channel('public:messages')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'chegoja', table: 'messages', filter: `receiver_id=eq.${userId}` },
      (payload) => {
        onMessage(payload.new as Message);
      }
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'chegoja', table: 'messages', filter: `sender_id=eq.${userId}` },
      (payload) => {
        onMessage(payload.new as Message);
      }
    )
    .subscribe();
};

export const subscribeToProfiles = (
  onUpdate: () => void
) => {
  return supabase
    .channel('public:profiles')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'chegoja', table: 'profiles' }, // Apenas novos registros
      () => {
        onUpdate();
      }
    )
    .subscribe();
}

// --- BROADCAST FUNCTIONS (NOVO) ---
export const sendBroadcast = async (title: string, message: string, target_role: 'client' | 'driver' | 'all'): Promise<boolean> => {
  const { error } = await supabase
    .from('broadcasts')
    .insert([{ title, message, target_role }]);

  if (error) {
    handleDbError(error, "sendBroadcast");
    return false;
  }
  return true;
};

export const subscribeToBroadcasts = (
  onBroadcast: (broadcast: BroadcastMessage) => void
) => {
  return supabase
    .channel('public:broadcasts')
    .on('postgres_changes', { event: 'INSERT', schema: 'chegoja', table: 'broadcasts' }, (payload) => {
      onBroadcast(payload.new as BroadcastMessage);
    })
    .subscribe();
};

// Updated Client Registration/Login
export const registerClientWithPhoto = async (username: string, phone: string, avatarFile?: File): Promise<UserProfile | null> => {
  try {
    // 1. Tentar encontrar usuário pelo telefone
    const { data: existing, error: findError } = await supabase
      .from('profiles')
      .select('*')
      .eq('phone', phone)
      .eq('role', UserRole.CLIENT)
      .maybeSingle();

    if (existing) {
      return existing as UserProfile;
    }

    // 2. Se não existe, fazer upload da foto (se houver)
    let avatar_url = `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=25D366&color=fff`;

    if (avatarFile) {
      // Detectar extensão simples
      const ext = avatarFile.name.split('.').pop() || 'jpg';
      const url = await uploadFile(avatarFile, 'images', ext);
      if (url) avatar_url = url;
    }

    // 3. Criar perfil
    const profileInsert = {
      username,
      phone,
      role: UserRole.CLIENT,
      status: DriverStatus.AVAILABLE,
      is_approved: true, // CLIENTES JÁ NASCEM APROVADOS
      avatar_url
    };

    const { data, error } = await supabase
      .from('profiles')
      .insert([profileInsert])
      .select()
      .single();

    if (error) {
      handleDbError(error, "registerClientWithPhoto");
      return null;
    }

    return data as UserProfile;
  } catch (err: any) {
    console.error("Exceção no cadastro cliente:", err);
    alert(`Erro ao processar: ${err?.message || 'Erro desconhecido'}`);
    return null;
  }
};

// Mantido para compatibilidade, mas redireciona para o novo
export const registerTempClient = async (username: string): Promise<UserProfile | null> => {
  return registerClientWithPhoto(username, "00000000");
};

export const registerDriver = async (
  username: string,
  password: string,
  vehicleType: 'car' | 'motorcycle',
  vehicleModel?: string,
  vehiclePlate?: string,
  vehicleColor?: string,
  avatarFile?: File
): Promise<UserProfile | null> => {
  try {
    // 1. Check if username exists
    const { data: existing, error: checkError } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username)
      .maybeSingle();

    if (checkError) {
      const msg = handleDbError(checkError, "registerDriver_checkUser");
      alert(`Erro ao verificar usuário: ${msg}`);
      return null;
    }

    if (existing) {
      alert("Nome de usuário já existe. Tente outro ou faça login.");
      return null;
    }

    // 2. Upload Avatar if provided
    let avatar_url = `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=00a884&color=fff`;
    if (avatarFile) {
      try {
        const ext = avatarFile.name.split('.').pop() || 'jpg';
        const url = await uploadFile(avatarFile, 'images', ext);
        if (url) avatar_url = url;
      } catch (e) {
        console.warn("Falha no upload do avatar, usando padrão.", e);
      }
    }

    // 3. Prepare Insert Data
    // Ensure string fields are never null/undefined if possible
    const profileInsert = {
      username: username.trim(),
      password: password, // Save password
      role: UserRole.DRIVER,
      status: DriverStatus.OFFLINE, // MOTORISTAS COMEÇAM OFFLINE
      is_approved: false, // MOTORISTA PRECISA DE APROVAÇÃO
      vehicle_type: vehicleType,
      vehicle_model: vehicleModel || '',
      vehicle_plate: (vehiclePlate || '').toUpperCase(),
      vehicle_color: vehicleColor || '',
      avatar_url
    };

    console.log("Tentando registrar motorista:", profileInsert);

    const { data, error } = await supabase
      .from('profiles')
      .insert([profileInsert])
      .select()
      .single();

    if (error) {
      const msg = handleDbError(error, "registerDriver");

      // Mensagens amigáveis para erros comuns
      if (msg.includes('duplicate key') || msg.includes('unique constraint')) {
        alert("Erro: Este nome de usuário ou placa já está cadastrado.");
      } else if (msg.includes('column') && msg.includes('does not exist')) {
        alert("Erro de Sistema: O banco de dados está desatualizado. Por favor, contate o suporte para rodar o script de atualização (password/is_approved).");
      } else {
        alert(`Erro ao salvar motorista: ${msg}`);
      }
      return null;
    }
    return data as UserProfile;
  } catch (err: any) {
    console.error("Exceção no cadastro motorista:", err);
    alert(`Erro inesperado ao cadastrar: ${err?.message || JSON.stringify(err)}`);
    return null;
  }
};

export const loginDriver = async (username: string, password?: string): Promise<UserProfile | null> => {
  try {
    let query = supabase
      .from('profiles')
      .select('*')
      .eq('username', username)
      .eq('role', UserRole.DRIVER);

    if (password) {
      query = query.eq('password', password);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      handleDbError(error, "loginDriver");
      return null;
    }

    if (data) {
      // If logging in, ensure they are set to available IF approved
      if (data.is_approved) {
        updateDriverStatus(data.id, DriverStatus.AVAILABLE).catch(e =>
          console.warn("Non-critical: Failed to update status on login", e)
        );
        return { ...data, status: DriverStatus.AVAILABLE } as UserProfile;
      }

      return data as UserProfile;
    }

    return null;
  } catch (e) {
    handleDbError(e, "loginDriver_EXCEPTION");
    return null;
  }
};

export const checkUserExists = async (field: 'username' | 'phone', value: string): Promise<boolean> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq(field, value)
    .maybeSingle();

  if (error) {
    console.warn(`Error checking ${field} existence:`, error);
    return false;
  }

  return !!data;
};

export const updateUserAvatar = async (userId: string, avatarFile: File): Promise<string | null> => {
  try {
    const ext = avatarFile.name.split('.').pop() || 'jpg';
    const url = await uploadFile(avatarFile, 'images', ext);

    if (!url) {
      console.error("Failed to upload avatar file");
      return null;
    }

    const { error } = await supabase
      .from('profiles')
      .update({ avatar_url: url })
      .eq('id', userId);

    if (error) {
      handleDbError(error, "updateUserAvatar");
      return null;
    }

    return url;
  } catch (e) {
    handleDbError(e, "updateUserAvatar_EXCEPTION");
    return null;
  }
};
