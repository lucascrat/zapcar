import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SCHEMA } from '../constants';
import { Message, UserProfile, UserRole, DriverStatus, AppSettings, BingoSettings, BingoCard, BingoRankingUser, BroadcastMessage, DriverPlan, Ride, Banner, Coupon, StoreProduct, WalletTransaction, StoreOrder, AppPaymentRequest, RewardTier, RewardsConfig, DriverRankingEntry, ChatContact } from '../types';
import { hashPassword } from '../utils/passwordHash';

// Colunas de `profiles` seguras para devolver ao cliente depois de um INSERT/UPDATE.
// Não inclui `password`: desde a migration 20260819_login_rpc_and_password_lockdown.sql,
// a role `anon` não tem mais SELECT nessa coluna (só a RPC verify_login lê). Um
// `.select()` sem argumentos pede "*" implicitamente (é o que vira o RETURNING do
// INSERT/UPDATE no PostgREST) e falha com "permission denied" se password entrar
// nessa lista - por isso todo insert/update em `profiles` que precisa da linha de
// volta usa esta constante em vez de `.select()`.
export const PROFILE_SAFE_COLUMNS = 'id, username, phone, role, status, is_approved, subscription_expires_at, avatar_url, vehicle_model, vehicle_plate, vehicle_color, vehicle_type, lat, lng, wallet_coins, financial_balance, pix_key, whatsapp, cpf, address_street, address_number, address_neighborhood, address_city, address_zip, email, is_pip_active, unread_count, created_at, updated_at';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  db: {
    schema: SUPABASE_SCHEMA
  }
});

// Log seguro - sem expor nome do schema em produção
if ((import.meta as any).env?.DEV) {
  console.log('[Supabase] Inicializado com schema configurado');
}

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
export const handleDbError = (error: any, context: string): string => {
  // Log the full object for debugging
  console.error(`Detailed Error in ${context}: `, error);

  let msg = 'Erro desconhecido';

  if (error) {
    if (error.message === '' || error.message === undefined) {
      const status = (error as any)?.status;
      if (status === 406) {
        msg = `Schema '${SUPABASE_SCHEMA}' não está exposto na API do Supabase (HTTP 406). Ajuste no Supabase: Exposed schemas / PGRST_DB_SCHEMAS para incluir '${SUPABASE_SCHEMA}'.`;
      } else {
        msg = `Erro sem mensagem retornado pelo Supabase. Verifique se o schema '${SUPABASE_SCHEMA}' está exposto na API.`;
      }
    }
    // Erro específico de Tabela não encontrada (Postgres 42P01)
    else if (error.code === '42P01') {
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

  console.warn(`Database Error(${context}): ${msg}`);
  return msg;
};

// Nova função para buscar perfil individual (Útil para Auto-Open)
export const fetchUserProfile = async (userId: string): Promise<UserProfile | null> => {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_SAFE_COLUMNS)
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
    .select(PROFILE_SAFE_COLUMNS)
    .eq('role', UserRole.DRIVER)
    .eq('is_approved', true) // Only approved drivers
    .eq('status', DriverStatus.AVAILABLE)
    .order('created_at', { ascending: false }); // Mais recentes primeiro

  if (error) {
    handleDbError(error, "fetchOnlineDrivers");
    return [];
  }
  return data as UserProfile[];
};

export const fetchOnlineDriversWithinRadius = async (lat: number, lng: number, radiusKm: number = 15): Promise<UserProfile[]> => {
  // First attempt to use the PostGIS / Math RPC
  try {
    const { data, error } = await supabase.rpc('get_drivers_within_radius', {
      origin_lat: lat,
      origin_lng: lng,
      radius_km: radiusKm
    });

    if (!error && data && data.length > 0) {
      return data as UserProfile[];
    }
  } catch (err) {
    console.warn("RPC get_drivers_within_radius failed, falling back to client-side filtering", err);
  }

  // Fallback to client-side filtering if RPC fails or doesn't exist yet
  const drivers = await fetchOnlineDrivers();
  return drivers.filter(d => {
    if (!d.lat || !d.lng) return false;
    const R = 6371; // Earth radius in km
    const dLat = (d.lat - lat) * (Math.PI / 180);
    const dLng = (d.lng - lng) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat * (Math.PI / 180)) * Math.cos(d.lat * (Math.PI / 180)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return (R * c) <= radiusKm;
  });
};

export const fetchAllDriversForAdmin = async (): Promise<UserProfile[]> => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select(PROFILE_SAFE_COLUMNS)
      .eq('role', 'driver')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[fetchAllDriversForAdmin] Supabase error:', error);
      handleDbError(error, "fetchAllDriversForAdmin");
      return [];
    }

    console.log('[fetchAllDriversForAdmin] Successfully fetched', data?.length || 0, 'drivers');
    return data as UserProfile[];
  } catch (err) {
    console.error('[fetchAllDriversForAdmin] Exception:', err);
    return [];
  }
};

export const fetchAllProfilesForAdmin = async (): Promise<UserProfile[]> => {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_SAFE_COLUMNS)
    .order('created_at', { ascending: false });

  if (error) {
    handleDbError(error, "fetchAllProfilesForAdmin");
    return [];
  }
  return data as UserProfile[];
};

export const fetchAdminContact = async (): Promise<UserProfile | null> => {
  // Busca o primeiro admin disponível para o chat de suporte
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_SAFE_COLUMNS)
    .eq('role', UserRole.ADMIN)
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return data as UserProfile;
};

export const deleteDriver = async (driverId: string): Promise<boolean> => {
  const { error } = await supabase
    .rpc('admin_delete_user', { user_id_param: driverId });

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

export const updateDriverPipStatus = async (driverId: string, isPip: boolean): Promise<boolean> => {
  const { error } = await supabase
    .from('profiles')
    .update({ is_pip_active: isPip })
    .eq('id', driverId);

  if (error) {
    // Silent fail is okay for this status
    console.warn("Failed to update PiP status", error);
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
  vehicleData: Partial<UserProfile>
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

/**
 * Atualiza o perfil do usuário com qualquer campo fornecido.
 * @param userId ID do usuário no banco
 * @param profileData Objeto contendo os campos a serem atualizados (ex: cpf, whatsapp, address_street, etc)
 */
export const updateUserProfile = async (
  userId: string,
  profileData: Partial<UserProfile>
): Promise<boolean> => {
  const { error } = await supabase
    .from('profiles')
    .update(profileData)
    .eq('id', userId);

  if (error) {
    handleDbError(error, "updateUserProfile");
    return false;
  }
  return true;
};

export const updateDriverPassword = async (driverId: string, newPassword: string): Promise<boolean> => {
  const hashedPassword = await hashPassword(newPassword);
  const { error } = await supabase
    .from('profiles')
    .update({ password: hashedPassword })
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
      .or(`receiver_id.eq.${driverId}, sender_id.eq.${driverId}`)
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
      .select(PROFILE_SAFE_COLUMNS)
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
    console.log(`[DB] Buscando mensagens entre ${user1} e ${user2}`);
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${user1}, receiver_id.eq.${user2}), and(sender_id.eq.${user2}, receiver_id.eq.${user1})`)
      .order('created_at', { ascending: true });

    if (error) {
      handleDbError(error, "fetchMessages");
      return [];
    }
    console.log(`[DB] ${data?.length || 0} mensagens encontradas.`);
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
    night_car_base_price: 7.0,
    night_car_price_km: 3.5,
    night_car_price_min: 0.7,
    dawn_car_base_price: 10.0,
    dawn_car_price_km: 4.5,
    dawn_car_price_min: 1.0,
    night_moto_base_price: 5.0,
    night_moto_price_km: 2.5,
    night_moto_price_min: 0.5,
    dawn_moto_base_price: 7.5,
    dawn_moto_price_km: 3.5,
    dawn_moto_price_min: 0.8,
    night_start_time: '19:00',
    night_end_time: '23:59',
    dawn_start_time: '00:00',
    dawn_end_time: '05:00',
    marquee_text: 'ENTRE E CONCORRA A PRÊMIOS TODA SEMANA! - PRÊMIOS CHEGOJÁ',
    coin_value_brl: 1.0
  };

  if (error || !data) {
    return defaultSettings;
  }

  return {
    ...defaultSettings,
    ...data
  } as AppSettings;
};

export const updateAppSettings = async (settings: AppSettings): Promise<string | null> => {
  // Extract ID to prevent updating it manually
  const { id, ...updates } = settings;

  // 1. Check if exists row, if not insert, else update
  const { data: existing, error: fetchError } = await supabase.from('app_settings').select('id').limit(1);

  if (fetchError) {
    console.error("[updateAppSettings] Fetch Error:", fetchError);
    return handleDbError(fetchError, "updateAppSettings Fetch");
  }

  let dbError;

  if (existing && existing.length > 0) {
    const { error: upError } = await supabase
      .from('app_settings')
      .update(updates)
      .eq('id', existing[0].id);
    dbError = upError;
  } else {
    // If no record exists, insert a new one
    const { error: inError } = await supabase
      .from('app_settings')
      .insert([updates]);
    dbError = inError;
  }

  if (dbError) {
    console.error("[updateAppSettings] Save Error:", dbError);
    return handleDbError(dbError, "updateAppSettings Save");
  }

  return null;
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

// --- BANNER FUNCTIONS ---
export const fetchBanners = async (): Promise<Banner[]> => {
  console.log('[fetchBanners] Buscando banners do banco...');
  const { data, error } = await supabase
    .from('banners')
    .select('*')
    .order('order', { ascending: true });

  if (error) {
    console.error('[fetchBanners] Erro:', error);
    handleDbError(error, "fetchBanners");
    return [];
  }
  console.log('[fetchBanners] Dados recebidos:', data);
  return data as Banner[];
};

export const addBanner = async (imageUrl: string, linkUrl?: string, order: number = 0): Promise<boolean> => {
  const { error } = await supabase
    .from('banners')
    .insert([{ image_url: imageUrl, link_url: linkUrl || null, order, active: true }]);

  if (error) {
    console.error('[addBanner] Falha ao inserir banner:', error);
    handleDbError(error, "addBanner");
    return false;
  }
  return true;
};

export const deleteBanner = async (bannerId: string): Promise<boolean> => {
  const { error } = await supabase
    .from('banners')
    .delete()
    .eq('id', bannerId);

  if (error) {
    handleDbError(error, "deleteBanner");
    return false;
  }
  return true;
};

export const updateBannerOrder = async (bannerId: string, order: number): Promise<boolean> => {
  const { error } = await supabase
    .from('banners')
    .update({ order })
    .eq('id', bannerId);

  if (error) {
    handleDbError(error, "updateBannerOrder");
    return false;
  }
  return true;
};

// Upload genérico para o bucket chat-media em qualquer pasta
export const uploadImageToStorage = async (file: File, folder: string): Promise<string | null> => {
  try {
    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

    const { error } = await supabase.storage
      .from('chat-media')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type
      });

    if (error) {
      console.error(`[uploadImageToStorage] Erro ao enviar para ${folder}:`, error);
      handleDbError(error, `uploadImageToStorage(${folder})`);
      return null;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('chat-media')
      .getPublicUrl(fileName);

    return publicUrl;
  } catch (e) {
    handleDbError(e, `uploadImageToStorage(${folder})_EXCEPTION`);
    return null;
  }
};

// Upload Banner Image to Supabase Storage
export const uploadBannerImage = async (file: File): Promise<string | null> => {
  try {
    // Generate unique filename
    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const fileName = `banners/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('chat-media')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type
      });

    if (error) {
      handleDbError(error, "uploadBannerImage");
      return null;
    }

    // Get Public URL
    const { data: { publicUrl } } = supabase.storage
      .from('chat-media')
      .getPublicUrl(fileName);

    return publicUrl;
  } catch (e) {
    handleDbError(e, "uploadBannerImage_EXCEPTION");
    return null;
  }
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
  console.log('[getOrCreateBingoCard] Iniciando para userId:', userId);

  // 1. Check exists
  const { data, error } = await supabase.from('bingo_cards').select('*').eq('user_id', userId).maybeSingle();

  if (error) {
    console.error('[getOrCreateBingoCard] Erro ao buscar cartela:', error.message, error.code, error.details);
    handleDbError(error, "getBingoCard_check");
    // Se a tabela não existir, o erro já foi logado. Retornamos null para evitar crash.
    return null;
  }

  if (data) {
    console.log('[getOrCreateBingoCard] Cartela já existe:', data.id);
    return data as BingoCard;
  }

  console.log('[getOrCreateBingoCard] Cartela não existe, criando nova...');

  // 2. Create new card
  // Gera 25 números aleatórios únicos entre 1 e 75 para preencher o grid 5x5
  const numbers = new Set<number>();
  while (numbers.size < 25) {
    numbers.add(Math.floor(Math.random() * 75) + 1);
  }
  const numbersArray = Array.from(numbers).sort((a, b) => a - b);

  console.log('[getOrCreateBingoCard] Números gerados:', numbersArray.length);

  const { data: newCard, error: createError } = await supabase
    .from('bingo_cards')
    .insert([{ user_id: userId, numbers: numbersArray }])
    .select()
    .single();

  if (createError) {
    console.error('[getOrCreateBingoCard] Erro ao criar cartela via INSERT:', createError.message);

    // Fallback: Tentativa via RPC (Security Definer no banco)
    try {
      console.log('[getOrCreateBingoCard] Tentando fallback via RPC...');
      const { data: rpcCard, error: rpcError } = await supabase.rpc('ensure_bingo_card', {
        target_user_id: userId
      });

      if (rpcError) {
        console.error('[getOrCreateBingoCard] RPC falhou:', rpcError);
        handleDbError(createError, "createBingoCard");
        return null;
      }

      console.log('[getOrCreateBingoCard] Cartela obtida via RPC com sucesso.');
      return rpcCard as BingoCard;
    } catch (rpcEx) {
      console.error('[getOrCreateBingoCard] Erro inesperado no RPC:', rpcEx);
      handleDbError(createError, "createBingoCard");
      return null;
    }
  }

  console.log('[getOrCreateBingoCard] Cartela criada com sucesso:', newCard?.id);
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
    .channel(`${SUPABASE_SCHEMA}:bingo`)
    .on('postgres_changes', { event: '*', schema: SUPABASE_SCHEMA, table: 'bingo_settings' }, onUpdate)
    .on('postgres_changes', { event: '*', schema: SUPABASE_SCHEMA, table: 'bingo_cards' }, onUpdate)
    .subscribe();
};

// --- Storage Functions ---

export const uploadFile = async (file: Blob, folder: 'audio' | 'images' | 'attachments', extension?: string): Promise<string | null> => {
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
    fileExt = fileExt?.replace(/^\./, '');

    const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

    // Ensure we pass the correct content type if possible
    const options: any = {
      cacheControl: '3600',
      upsert: false
    };

    if (file instanceof File) {
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
  // Usamos um canal único por usuário para evitar conflitos de broadcast
  return supabase
    .channel(`chat_updates:${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: SUPABASE_SCHEMA,
        table: 'messages'
      },
      (payload) => {
        const msg = (payload.new || payload.old) as Message;
        if (!msg) return;

        // Filtro manual no cliente: Garante que a mensagem pertence a este usuário
        // Isso é mais robusto que o filtro do Postgres em alguns ambientes.
        if (msg.sender_id === userId || msg.receiver_id === userId) {
          onMessage(msg);
        }
      }
    )
    .subscribe((status) => {
      console.log(`[ChatSub:${userId}] Status:`, status);
    });
};

export const markMessagesAsRead = async (userId: string, senderId: string): Promise<boolean> => {
  const { error } = await supabase
    .from('messages')
    .update({ is_read: true })
    .eq('receiver_id', userId)
    .eq('sender_id', senderId)
    .eq('is_read', false);

  if (error) {
    handleDbError(error, "markMessagesAsRead");
    return false;
  }
  return true;
};

// --- SUPPORT CHAT (Admin Central de Atendimento) ---

/**
 * Lista as conversas de suporte do admin: agrupa todas as mensagens que
 * envolvem o admin por "outro participante" (motorista ou cliente),
 * trazendo a última mensagem e a contagem de não lidas de cada um.
 */
export const fetchSupportConversations = async (adminId: string): Promise<ChatContact[]> => {
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(`sender_id.eq.${adminId},receiver_id.eq.${adminId}`)
      .order('created_at', { ascending: false })
      .limit(1000);

    if (error) {
      handleDbError(error, "fetchSupportConversations");
      return [];
    }

    const msgs = (data || []) as Message[];
    const grouped = new Map<string, { last: Message; unread: number }>();

    for (const m of msgs) {
      const partnerId = m.sender_id === adminId ? m.receiver_id : m.sender_id;
      if (!partnerId || partnerId === adminId) continue;

      const entry = grouped.get(partnerId);
      const isUnreadForAdmin = m.receiver_id === adminId && !m.is_read;
      if (!entry) {
        grouped.set(partnerId, { last: m, unread: isUnreadForAdmin ? 1 : 0 });
      } else if (isUnreadForAdmin) {
        entry.unread++;
      }
    }

    const partnerIds = Array.from(grouped.keys());
    if (partnerIds.length === 0) return [];

    const { data: profiles, error: profError } = await supabase
      .from('profiles')
      .select(PROFILE_SAFE_COLUMNS)
      .in('id', partnerIds);

    if (profError) {
      handleDbError(profError, "fetchSupportConversations_profiles");
      return [];
    }

    const profileMap = new Map((profiles as UserProfile[]).map(p => [p.id, p]));
    const contacts: ChatContact[] = [];

    for (const [partnerId, entry] of grouped.entries()) {
      const user = profileMap.get(partnerId);
      if (!user) continue; // Perfil pode ter sido excluído
      contacts.push({ user, lastMessage: entry.last, unreadCount: entry.unread });
    }

    contacts.sort((a, b) => new Date(b.lastMessage?.created_at || 0).getTime() - new Date(a.lastMessage?.created_at || 0).getTime());
    return contacts;
  } catch (e) {
    handleDbError(e, "fetchSupportConversations_EXCEPTION");
    return [];
  }
};

/** Conta rapidamente quantas mensagens não lidas o admin tem no total (para badge do menu). */
export const fetchUnreadSupportCount = async (adminId: string): Promise<number> => {
  const { count, error } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('receiver_id', adminId)
    .eq('is_read', false);

  if (error) {
    handleDbError(error, "fetchUnreadSupportCount");
    return 0;
  }
  return count || 0;
};

// --- AUTH FUNCTIONS ---

export const registerClientWithPhoto = async (username: string, phone: string, avatarFile?: File): Promise<UserProfile | null> => {
  try {
    let finalUrl = null;
    if (avatarFile) {
      finalUrl = await uploadFile(avatarFile, 'images');
    }

    // Check if exists
    const { data: existing } = await supabase.from('profiles').select(PROFILE_SAFE_COLUMNS).eq('phone', phone).maybeSingle();
    if (existing) {
      // Auto login
      return existing as UserProfile;
    }

    const { data, error } = await supabase
      .from('profiles')
      .insert([{
        username,
        phone,
        role: UserRole.CLIENT,
        status: DriverStatus.AVAILABLE,
        avatar_url: finalUrl || `https://ui-avatars.com/api/?name=${username}`
      }])
      .select(PROFILE_SAFE_COLUMNS)
      .single();

    if (error) {
      handleDbError(error, "registerClientWithPhoto");
      return null;
    }
    return data as UserProfile;
  } catch (e) {
    handleDbError(e, "registerClientWithPhoto_EXCEPTION");
    return null;
  }
};

export const registerDriver = async (
  username: string,
  password?: string,
  vehicleType?: 'car' | 'motorcycle',
  vehicleModel?: string,
  vehiclePlate?: string,
  vehicleColor?: string,
  avatarFile?: File,
  phone?: string
): Promise<UserProfile | null> => {
  try {
    const cleanPhone = phone ? phone.replace(/\D/g, '') : undefined;
    const finalUsername = username.trim();
    if (!finalUsername) {
      throw new Error("Nome inválido.");
    }
    if (!password || password.trim().length < 4) {
      throw new Error("Senha muito curta.");
    }
    const hashedPassword = await hashPassword(password);
    const { data: rpcData, error: rpcError } = await supabase
      .rpc('register_driver', {
        p_username: finalUsername,
        p_password: hashedPassword,
        p_vehicle_type: vehicleType,
        p_vehicle_model: vehicleModel,
        p_vehicle_plate: vehiclePlate,
        p_vehicle_color: vehicleColor,
        p_phone: cleanPhone
      });
    if (rpcData && !rpcError) {
      return rpcData as unknown as UserProfile;
    }
    // Check if phone already exists
    if (cleanPhone) {
      const { data: existing } = await supabase
        .from('profiles')
        .select(PROFILE_SAFE_COLUMNS)
        .eq('phone', cleanPhone)
        .maybeSingle();

      if (existing) {
        // If it's a driver and we are trying to register, it should probably be a login instead
        // but we return the existing user as requested: "se tiver usuario e telefone entrara com ele"
        return existing as UserProfile;
      }
    }

    let avatar_url = null;
    if (avatarFile) {
      avatar_url = await uploadFile(avatarFile, 'images');
    }

    const { data, error } = await supabase
      .from('profiles')
      .insert([{
        username: finalUsername,
        password: hashedPassword,
        phone: cleanPhone,
        role: UserRole.DRIVER,
        status: DriverStatus.OFFLINE,
        is_approved: false, // Default pending
        vehicle_type: vehicleType,
        vehicle_model: vehicleModel,
        vehicle_plate: vehiclePlate,
        vehicle_color: vehicleColor,
        avatar_url: avatar_url || `https://ui-avatars.com/api/?name=${username}`
      }])
      .select(PROFILE_SAFE_COLUMNS)
      .single();

    if (error) {
      handleDbError(error, "registerDriver");
      return null;
    }
    return data as UserProfile;
  } catch (e) {
    handleDbError(e, "registerDriver_EXCEPTION");
    return null;
  }
};

export const loginUser = async (identifier: string, password?: string, role?: UserRole): Promise<UserProfile | null> => {
  try {
    // A verificação de senha roda inteira dentro do banco (RPC SECURITY DEFINER
    // chegoja.verify_login, ver supabase/migrations/20260819_login_rpc_and_password_lockdown.sql).
    // Antes disso, o hash de senha era buscado com a chave anon pública e
    // comparado aqui no navegador - qualquer um com a chave conseguia ler o
    // hash de qualquer usuário. Agora a coluna password nem é mais legível via
    // SELECT direto; só essa RPC tem acesso a ela, e nunca a devolve.
    //
    // De brinde, a RPC também valida senhas em formato bcrypt legado (via
    // pgcrypto), que verifyPassword() não reconhecia - eram ~12 contas que não
    // conseguiam mais logar de jeito nenhum antes desta correção.
    const { data, error } = await supabase.rpc('verify_login', {
      p_identifier: identifier,
      p_password: password ?? null,
      p_role: role ?? null
    });

    if (error) {
      console.error("[Login] Erro ao verificar login:", error);
      handleDbError(error, "loginUser");
      return null;
    }

    if (!data) {
      console.warn(`[Login] Usuário não encontrado ou senha inválida para: ${identifier} (Role: ${role})`);
      return null;
    }

    return data as UserProfile;
  } catch (e) {
    handleDbError(e, "loginUser_EXCEPTION");
    return null;
  }
};

export const loginDriver = async (username: string, password?: string): Promise<UserProfile | null> => {
  const data = await loginUser(username, password, UserRole.DRIVER);

  if (data) {
    // If logging in, ensure they are set to available IF approved
    if (data.is_approved) {
      updateDriverStatus(data.id, DriverStatus.AVAILABLE).catch(e =>
        console.warn("Non-critical: Failed to update status on login", e)
      );
      return { ...data, status: DriverStatus.AVAILABLE } as UserProfile;
    }
    return data;
  }

  return null;
};

// Formato único (em vez de união discriminada) porque este projeto compila com
// `strict` desligado, e nesse modo o TypeScript não estreita união por campo
// booleano - o consumidor checaria `result.reason` e receberia erro de tipo.
export interface AdminLoginResult {
  ok: boolean;
  profile?: UserProfile;
  reason?: 'invalid_credentials' | 'not_admin' | 'error';
  message?: string;
}

/**
 * Login do administrador via Supabase Auth.
 *
 * Diferente de cliente/motorista (que são validados contra a tabela `profiles`),
 * o admin autentica de verdade no Supabase. Isso faz o `auth.uid()` existir nas
 * requisições seguintes, que é o que as policies de RLS usam para liberar as
 * operações administrativas - ver supabase/migrations/20260801_admin_auth.sql.
 */
export const loginAdmin = async (email: string, password: string): Promise<AdminLoginResult> => {
  try {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });

    if (authError || !authData?.session) {
      return { ok: false, reason: 'invalid_credentials' };
    }

    // Autenticar não basta: a conta precisa estar registrada como admin.
    const { data: isAdmin, error: rpcError } = await supabase.rpc('is_admin');

    if (rpcError) {
      await supabase.auth.signOut();
      return { ok: false, reason: 'error', message: rpcError.message };
    }

    if (!isAdmin) {
      await supabase.auth.signOut();
      return { ok: false, reason: 'not_admin' };
    }

    // Perfil usado pela UI (nome, avatar, chat de suporte). Se ainda não existir
    // um perfil com role=admin, monta um objeto mínimo com o id do Auth.
    const profile = await fetchAdminContact();
    if (profile) {
      return { ok: true, profile };
    }

    return {
      ok: true,
      profile: {
        id: authData.user.id,
        username: authData.user.email ?? 'Administrador',
        role: UserRole.ADMIN,
        status: DriverStatus.AVAILABLE,
        avatar_url: 'https://ui-avatars.com/api/?name=Admin&background=0D8ABC&color=fff'
      } as UserProfile
    };
  } catch (e: any) {
    return { ok: false, reason: 'error', message: e?.message };
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

/**
 * Busca usuários duplicados pelo campo 'phone'.
 * Agrupa por telefone e retorna aqueles que aparecem mais de uma vez.
 */
export const fetchDuplicateUsers = async (): Promise<{ phone: string, count: number, ids: string[] }[]> => {
  try {
    // Como o Supabase JS não tem um GROUP BY direto que retorne os IDs,
    // buscamos todos os perfis com telefone e processamos localmente.
    // Para uma base muito grande, o ideal seria uma RPC no Postgres.
    const { data, error } = await supabase
      .from('profiles')
      .select('id, phone, username, created_at')
      .not('phone', 'is', null);

    if (error) throw error;

    const phoneMap: Record<string, { count: number, profiles: any[] }> = {};

    data.forEach(p => {
      if (!p.phone) return;
      if (!phoneMap[p.phone]) {
        phoneMap[p.phone] = { count: 0, profiles: [] };
      }
      phoneMap[p.phone].count++;
      phoneMap[p.phone].profiles.push(p);
    });

    const duplicates = Object.entries(phoneMap)
      .filter(([_, val]) => val.count > 1)
      .map(([phone, val]) => ({
        phone,
        count: val.count,
        // Ordenamos por data de criação para manter o mais antigo (ou mais novo dependendo da regra)
        // Aqui vamos retornar todos os IDs para o admin escolher ou para limpeza automática
        ids: val.profiles.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()).map(p => p.id)
      }));

    return duplicates;
  } catch (e) {
    handleDbError(e, "fetchDuplicateUsers");
    return [];
  }
};

/**
 * Remove usuários duplicados mantendo apenas o registro mais antigo.
 */
export const cleanupDuplicateUsers = async (): Promise<{ success: boolean, removedCount: number }> => {
  try {
    const duplicates = await fetchDuplicateUsers();
    let removedTotal = 0;

    for (const group of duplicates) {
      // O primeiro ID é o mais antigo (devido ao sort no fetchDuplicateUsers)
      const idsToRemove = group.ids.slice(1);

      if (idsToRemove.length > 0) {
        const { error } = await supabase
          .from('profiles')
          .delete()
          .in('id', idsToRemove);

        if (!error) {
          removedTotal += idsToRemove.length;
        } else {
          console.error(`Erro ao remover duplicatas para ${group.phone}:`, error);
        }
      }
    }

    return { success: true, removedCount: removedTotal };
  } catch (e) {
    handleDbError(e, "cleanupDuplicateUsers");
    return { success: false, removedCount: 0 };
  }
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

/**
 * CUPONS DE DESCONTO
 */

export const fetchAvailableCoupons = async (): Promise<Coupon[]> => {
  const { data, error } = await supabase
    .from('coupons')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    handleDbError(error, "fetchAvailableCoupons");
    return [];
  }

  // Filtrar apenas cupons que ainda têm estoque (para garantir)
  return (data as Coupon[]).filter(c => c.used_quantity < c.total_quantity);
};

export const fetchAllCoupons = async (): Promise<Coupon[]> => {
  const { data, error } = await supabase
    .from('coupons')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    handleDbError(error, "fetchAllCoupons");
    return [];
  }

  return data as Coupon[];
};

export const createCoupon = async (coupon: Partial<Coupon>, imageFile?: File): Promise<Coupon | null> => {
  try {
    let finalUrl = coupon.image_url;

    if (imageFile) {
      finalUrl = await uploadFile(imageFile, 'images');
    }

    const { data, error } = await supabase
      .from('coupons')
      .insert({
        ...coupon,
        image_url: finalUrl,
        used_quantity: 0,
        is_active: true
      })
      .select()
      .single();

    if (error) {
      handleDbError(error, "createCoupon");
      return null;
    }

    return data as Coupon;
  } catch (e) {
    handleDbError(e, "createCoupon_EXCEPTION");
    return null;
  }
};

export const deleteCoupon = async (id: string): Promise<{ ok: boolean; errorMsg?: string }> => {
  // Passo 1: anular rides.coupon_id para este cupom.
  // A FK rides_coupon_id_fkey impede DELETE enquanto houver corridas referenciando
  // o cupom; setar NULL preserva o histórico da corrida sem bloquear a exclusão.
  const { error: nullifyError } = await supabase
    .from('rides')
    .update({ coupon_id: null })
    .eq('coupon_id', id);

  if (nullifyError) {
    console.error('[deleteCoupon] Erro ao anular coupon_id nas corridas:', nullifyError);
    return { ok: false, errorMsg: 'Erro ao desvincular corridas do cupom: ' + nullifyError.message };
  }

  // Passo 2: deletar o cupom
  const { error, count } = await supabase
    .from('coupons')
    .delete({ count: 'exact' })
    .eq('id', id);

  if (error) {
    console.error('[deleteCoupon] Erro ao deletar cupom:', error);
    handleDbError(error, "deleteCoupon");
    return { ok: false, errorMsg: error.message };
  }

  // count === 0 significa que a linha existe mas RLS bloqueou silenciosamente
  if (count === 0) {
    console.error('[deleteCoupon] Cupom não encontrado ou RLS bloqueou (0 linhas afetadas). Verifique GRANT DELETE e a policy coupons_delete.');
    return { ok: false, errorMsg: 'Sem permissão para excluir (RLS bloqueou). Execute o SQL de correção no Supabase.' };
  }

  return { ok: true };
};

export const useCoupon = async (id: string): Promise<boolean> => {
  // RPC ou Incremento direto? RPC é melhor para atomicidade
  const { error } = await supabase.rpc('increment_coupon_usage', { coupon_id: id });

  if (error) {
    // Se a função RPC não existir, tentamos via update direto (menos seguro contra race conditions mas funciona para MVP)
    const { data: coupon } = await supabase.from('coupons').select('used_quantity, total_quantity').eq('id', id).single();
    if (coupon && coupon.used_quantity < coupon.total_quantity) {
      const { error: updateError } = await supabase
        .from('coupons')
        .update({ used_quantity: coupon.used_quantity + 1 })
        .eq('id', id);
      return !updateError;
    }
    return false;
  }

  return true;
};




// --- RIDES FUNCTIONS ---

export const createRideRequest = async (rideData: Partial<Ride>): Promise<{ data: Ride | null, error: string | null }> => {
  const { data, error } = await supabase
    .from('rides')
    .insert([rideData])
    .select()
    .single();

  if (error) {
    const msg = handleDbError(error, "createRideRequest");
    return { data: null, error: msg };
  }
  return { data: data as Ride, error: null };
};

export const cancelRide = async (rideId: string): Promise<boolean> => {
  const { error } = await supabase
    .from('rides')
    .update({
      status: 'cancelled',
      updated_at: new Date().toISOString()
    })
    .eq('id', rideId);

  if (error) {
    handleDbError(error, "cancelRide");
    return false;
  }
  return true;
};

export const acceptRide = async (rideId: string, driverId: string): Promise<boolean> => {
  try {
    // Usar RPC atômica com SELECT FOR UPDATE para evitar race conditions
    // Isso garante que apenas UM motorista consiga aceitar a corrida
    const { data, error } = await supabase.rpc('atomic_accept_ride', {
      p_ride_id: rideId,
      p_driver_id: driverId
    });

    if (error) {
      handleDbError(error, "acceptRide");
      return false;
    }

    const result = data as { success: boolean; message: string };

    if (!result?.success) {
      console.warn(`[acceptRide] Falha atômica: ${result?.message || 'Corrida já aceita por outro motorista'}`);
      return false;
    }

    console.log(`[acceptRide] ✅ Corrida ${rideId} aceita atomicamente pelo motorista ${driverId}`);
    return true;
  } catch (e) {
    handleDbError(e, "acceptRide_EXCEPTION");
    return false;
  }
};

export const updateRideStatus = async (rideId: string, status: Ride['status']): Promise<boolean> => {
  const { error } = await supabase
    .from('rides')
    .update({
      status,
      updated_at: new Date().toISOString()
    })
    .eq('id', rideId);

  if (error) {
    handleDbError(error, "updateRideStatus");
    return false;
  }
  return true;
};

export const completeRide = async (
  rideId: string,
  finalPrice: number,
  paymentMethod: 'pix' | 'card' | 'cash' | 'coins'
): Promise<boolean> => {
  const { error } = await supabase
    .from('rides')
    .update({
      status: 'finished',
      final_price: finalPrice,
      payment_method: paymentMethod,
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', rideId);

  if (error) {
    handleDbError(error, "completeRide");
    return false;
  }
  return true;
};

export const updateRidePayment = async (rideId: string, paymentData: any): Promise<boolean> => {
  const { error } = await supabase
    .from('rides')
    .update({
      ...paymentData,
      updated_at: new Date().toISOString()
    })
    .eq('id', rideId);

  if (error) {
    handleDbError(error, "updateRidePayment");
    return false;
  }
  return true;
};

export const fetchActiveRide = async (userId: string, role: 'client' | 'driver'): Promise<Ride | null> => {
  const field = role === 'client' ? 'client_id' : 'driver_id';
  let query = supabase
    .from('rides')
    .select('*, driver:driver_id(*), client:client_id(*)')
    .eq(field, userId)
    .not('status', 'in', '("finished","cancelled")')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Correção: Para motoristas, agora incluímos status 'searching' para que ao abrir o app
  // via notificação, a lógica 'init' detecte a corrida pendente.
  // A interface (UI) tratará 'searching' como uma chamada recebida.
  /* if (role === 'driver') {
    query = query.neq('status', 'searching');
  } */

  const { data, error } = await query;

  if (error) {
    handleDbError(error, "fetchActiveRide");
    return null;
  }
  return data as Ride;
};

export const fetchOpenBroadcastRide = async (vehicleType?: string): Promise<Ride | null> => {
  let query = supabase
    .from('rides')
    .select('*, driver:driver_id(*), client:client_id(*)')
    .is('driver_id', null)
    .eq('status', 'searching')
    .eq('is_broadcast', true);

  if (vehicleType) {
    console.log(`[fetchOpenBroadcastRide] Filtrando por veículo: ${vehicleType}`);
    query = query.eq('vehicle_type', vehicleType);
  } else {
    console.log(`[fetchOpenBroadcastRide] Sem filtro de veículo aplicado.`);
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  console.log(`[fetchOpenBroadcastRide] Resultado:`, data ? data.id : 'null', error);

  if (error) {
    handleDbError(error, "fetchOpenBroadcastRide");
    return null;
  }
  return data as Ride;
};

export const fetchDriverHistory = async (driverId: string, startDate: Date, endDate: Date): Promise<Ride[]> => {
  const { data, error } = await supabase
    .from('rides')
    .select('*')
    .eq('driver_id', driverId)
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString())
    .order('created_at', { ascending: false });

  if (error) {
    handleDbError(error, "fetchDriverHistory");
    return [];
  }
  return data as Ride[];
};

export const fetchDriverMonthlyStats = async (driverId: string): Promise<number> => {
  try {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const { count, error } = await supabase
      .from('rides')
      .select('id', { count: 'exact', head: true })
      .eq('driver_id', driverId)
      .eq('status', 'finished')
      .gte('created_at', firstDay);

    if (error) {
      console.warn("[fetchDriverMonthlyStats] Error:", error);
      return 0;
    }
    return count || 0;
  } catch (err) {
    console.error("[fetchDriverMonthlyStats] Exception:", err);
    return 0;
  }
};

export const fetchAllDriversWithStats = async (): Promise<(UserProfile & { monthly_rides: number })[]> => {
  const drivers = await fetchAllDriversForAdmin();
  const driversWithStats = await Promise.all(drivers.map(async (d) => {
    const stats = await fetchDriverMonthlyStats(d.id).catch(err => {
      console.warn(`[Stats] Erro ao buscar estatísticas para ${d.username}:`, err);
      return 0;
    });
    return { ...d, monthly_rides: stats };
  }));
  return driversWithStats;
};

/** Formata uma Date para "YYYY-MM-DD" usando o horário LOCAL do dispositivo
 *  (evita bug de UTC onde corridas após 21h BRT aparecem no dia seguinte no gráfico).
 */
const toLocalDateStr = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const fetchRevenueStats = async (days: number = 7): Promise<{ date: string, amount: number }[]> => {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (days - 1));
    startDate.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('rides')
      .select('created_at, final_price')
      .eq('status', 'finished')
      .gte('created_at', startDate.toISOString());

    if (error) throw error;

    const statsMap: Record<string, number> = {};

    // Initialize map with last N days usando data LOCAL (não UTC)
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      statsMap[toLocalDateStr(d)] = 0;
    }

    (data || []).forEach((ride: any) => {
      // Usar data local para evitar que corridas após 21h BRT apareçam no dia seguinte
      const localDate = new Date(ride.created_at);
      const dateStr = toLocalDateStr(localDate);
      if (statsMap[dateStr] !== undefined) {
        statsMap[dateStr] += Number(ride.final_price || 0);
      }
    });

    return Object.entries(statsMap)
      .map(([date, amount]) => ({ date, amount }))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch (e) {
    console.warn("Error fetching revenue stats", e);
    return [];
  }
};

export const fetchDashboardMetrics = async () => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const promises = [
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'driver'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'client'),
      // Conta apenas corridas FINALIZADAS hoje (exclui canceladas e em andamento)
      supabase.from('rides').select('*', { count: 'exact', head: true }).eq('status', 'finished').gte('created_at', today.toISOString()),
      supabase.from('rides').select('final_price').eq('status', 'finished').gte('created_at', today.toISOString())
    ];

    const results = await Promise.allSettled(promises);

    const totalDrivers = results[0].status === 'fulfilled' ? (results[0].value.count || 0) : 0;
    const totalClients = results[1].status === 'fulfilled' ? (results[1].value.count || 0) : 0;
    const todayRides = results[2].status === 'fulfilled' ? (results[2].value.count || 0) : 0;

    let todayEarnings = 0;
    if (results[3].status === 'fulfilled' && results[3].value.data) {
      todayEarnings = results[3].value.data.reduce((acc: number, ride: any) => acc + Number(ride.final_price || 0), 0);
    }

    if (results.some(r => r.status === 'rejected')) {
      console.warn("[Dashboard] Some metrics failed to load:", results.filter(r => r.status === 'rejected'));
    }

    return {
      totalDrivers,
      totalClients,
      todayRides,
      todayEarnings
    };
  } catch (e) {
    console.error("Error fetching dashboard metrics (Critical)", e);
    return {
      totalDrivers: 0,
      totalClients: 0,
      todayRides: 0,
      todayEarnings: 0
    };
  }
};

export const fetchRideHeatmapData = async (vehicleType?: 'car' | 'motorcycle'): Promise<{ lat: number; lng: number }[]> => {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    let query = supabase
      .from('rides')
      .select('origin_lat, origin_lng')
      .gte('created_at', twentyFourHoursAgo);

    if (vehicleType) {
      query = query.eq('vehicle_type', vehicleType);
    }

    const { data, error } = await query;

    if (error) {
      console.warn('Error fetching heatmap data:', error);
      return [];
    }

    return (data || [])
      .filter((r: any) => r.origin_lat && r.origin_lng)
      .map((r: any) => ({ lat: r.origin_lat, lng: r.origin_lng }));
  } catch (e) {
    console.error('Exception fetching heatmap data:', e);
    return [];
  }
};

export const fetchRideById = async (rideId: string): Promise<Ride | null> => {
  const { data, error } = await supabase
    .from('rides')
    .select('*, driver:driver_id(*), client:client_id(*)')
    .eq('id', rideId)
    .single();

  if (error) {
    handleDbError(error, "fetchRideById");
    return null;
  }
  return data as Ride;
};

export const subscribeToRides = (userId: string, role: 'client' | 'driver', callback: (ride: Ride) => void) => {

  const channel = supabase.channel(`rides_sub:${userId}:${Date.now()}`);

  if (role === 'client') {
    // Cliente só ouve suas próprias corridas
    channel.on(
      'postgres_changes',
      { event: '*', schema: SUPABASE_SCHEMA, table: 'rides', filter: `client_id=eq.${userId}` },
      (payload) => {
        const ride = (payload.new || payload.old) as Ride;
        if (ride) callback(ride);
      }
    );
  } else {
    // Motorista: antes ouvia TODA mudança na tabela rides (de todo motorista e
    // cliente da plataforma) e filtrava no App.tsx. Isso sobrecarregava o
    // canal com tráfego irrelevante e causava atraso perceptível pra chamada
    // chegar (medido em teste real: ~10s+ de atraso). Agora inscreve em 3
    // filtros no servidor, cobrindo exatamente os casos que o motorista
    // precisa ver:
    // 1. Corridas onde ele é o motorista da vez no rodízio sequencial
    // 2. Corridas diretas/da central endereçadas a ele (ou que ele já aceitou)
    // 3. Corridas de broadcast puro (central manda pra todos)
    const rideHandler = (payload: any) => {
      const ride = (payload.new || payload.old) as Ride;
      if (ride) callback(ride);
    };

    channel.on(
      'postgres_changes',
      { event: '*', schema: SUPABASE_SCHEMA, table: 'rides', filter: `current_notified_driver_id=eq.${userId}` },
      rideHandler
    );
    channel.on(
      'postgres_changes',
      { event: '*', schema: SUPABASE_SCHEMA, table: 'rides', filter: `driver_id=eq.${userId}` },
      rideHandler
    );
    channel.on(
      'postgres_changes',
      { event: '*', schema: SUPABASE_SCHEMA, table: 'rides', filter: `is_broadcast=eq.true` },
      rideHandler
    );
  }

  return channel.subscribe();
};

export const subscribeToProfiles = (callback: (payload?: any) => void) => {
  return supabase
    .channel('profiles-global')
    .on('postgres_changes', { event: '*', schema: SUPABASE_SCHEMA, table: 'profiles' }, (payload) => {
      callback(payload);
    })
    .subscribe();
};

export const subscribeToBroadcasts = (callback: (msg: BroadcastMessage) => void) => {
  return supabase
    .channel('broadcasts')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: SUPABASE_SCHEMA,
        table: 'broadcasts'
      },
      (payload) => {
        callback(payload.new as BroadcastMessage);
      }
    )
    .subscribe();
};

export const sendBroadcast = async (title: string, message: string, targetRole: 'client' | 'driver' | 'all'): Promise<boolean> => {
  const { error } = await supabase
    .from('broadcasts')
    .insert([{ title, message, target_role: targetRole }]);

  if (error) {
    handleDbError(error, "sendBroadcast");
    return false;
  }
  return true;
};

/**
 * CARTEIRA E LOJA (WALLETS & STORE)
 */

export const fetchWalletTransactions = async (userId: string): Promise<WalletTransaction[]> => {
  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    handleDbError(error, "fetchWalletTransactions");
    return [];
  }
  return (data || []) as WalletTransaction[];
};

// --- PAGAMENTOS E SAQUES ---

export const createPaymentRequest = async (
  userId: string,
  type: 'driver_payout' | 'client_withdrawal',
  amountMoney: number,
  amountCoins: number,
  pixKey: string
): Promise<{ success: boolean; message: string }> => {
  try {
    // 1. Check Balance and Deduct immediately
    const user = await fetchUserProfile(userId);
    if (!user) return { success: false, message: "Usuário não encontrado" };

    if (type === 'client_withdrawal') {
      if ((user.wallet_coins || 0) < amountCoins) {
        return { success: false, message: "Saldo de moedas insuficiente." };
      }
      // Deduct Coins
      const { error: deductError } = await supabase.rpc('increment_coins', {
        user_id_param: userId,
        amount_param: -amountCoins
      });
      if (deductError) return { success: false, message: "Erro ao debitar moedas." };
    } else {
      // Driver Payout - RPC atômica: checa saldo suficiente e debita num só
      // UPDATE no banco (evita corrida entre leitura em JS e escrita de volta)
      const { data: success, error: deductError } = await supabase.rpc('decrement_financial_balance_if_available', {
        user_id_param: userId,
        amount_param: amountMoney
      });
      if (deductError) return { success: false, message: "Erro ao debitar saldo financeiro." };
      if (!success) return { success: false, message: "Saldo financeiro insuficiente." };
    }

    // 2. Create Request
    const { error } = await supabase.from('payment_requests').insert({
      user_id: userId,
      type,
      amount_money: amountMoney,
      amount_coins: amountCoins,
      pix_key: pixKey,
      status: 'pending'
    });

    if (error) {
      // Rollback (Simplistic - ideally use transaction or RPC)
      // Since supabase-js doesn't simple transactions, we log critical error.
      // In production, use a single RPC for Check+Deduct+Insert.
      console.error("CRITICAL: Failed to create request after deduction", error);
      return { success: false, message: "Erro interno. Contate o suporte." };
    }

    // 3. Log Transaction
    await supabase.from('wallet_transactions').insert({
      user_id: userId,
      type: 'payout',
      amount_coins: type === 'client_withdrawal' ? -amountCoins : 0,
      amount_money: type === 'driver_payout' ? -amountMoney : 0, // Negative for history visualization? Or positive as 'payout' type? Let's use negative to show deduction.
      description: `Solicitação de Saque (${type === 'driver_payout' ? 'Motorista' : 'Cliente'})`
    });

    return { success: true, message: "Solicitação enviada com sucesso!" };
  } catch (e) {
    console.error("Exception in createPaymentRequest", e);
    return { success: false, message: "Erro ao processar solicitação." };
  }
};

export const fetchPaymentRequests = async (): Promise<AppPaymentRequest[]> => {
  const { data, error } = await supabase
    .from('payment_requests')
    .select('*, user:user_id(*)')
    .order('created_at', { ascending: false });

  if (error) {
    handleDbError(error, "fetchPaymentRequests");
    return [];
  }
  return data as AppPaymentRequest[];
};

export const fetchMyPaymentRequests = async (userId: string): Promise<AppPaymentRequest[]> => {
  const { data, error } = await supabase
    .from('payment_requests')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    handleDbError(error, "fetchMyPaymentRequests");
    return [];
  }
  return data as AppPaymentRequest[];
};

export const updatePaymentRequestStatus = async (
  requestId: string,
  status: 'paid' | 'rejected',
  adminNote?: string
): Promise<boolean> => {
  try {
    const { data: request, error: fetchError } = await supabase
      .from('payment_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (fetchError || !request) return false;

    if (status === 'rejected' && request.status === 'pending') {
      // Refund the user
      if (request.type === 'client_withdrawal') {
        await supabase.rpc('increment_coins', {
          user_id_param: request.user_id,
          amount_param: request.amount_coins
        });
      } else {
        // Driver refund - RPC atômica (mesmo motivo dos outros pontos: evita
        // perder o estorno se dois updates de saldo rodarem quase juntos)
        await supabase.rpc('increment_financial_balance', {
          user_id_param: request.user_id,
          amount_param: request.amount_money
        });
      }

      // Log Refund
      await supabase.from('wallet_transactions').insert({
        user_id: request.user_id,
        type: 'bonus', // or 'refund'
        amount_coins: request.type === 'client_withdrawal' ? request.amount_coins : 0,
        amount_money: request.type === 'driver_payout' ? request.amount_money : 0,
        description: `Estorno de Saque Rejeitado`
      });
    }

    const { error } = await supabase
      .from('payment_requests')
      .update({ status, admin_note: adminNote, updated_at: new Date().toISOString() })
      .eq('id', requestId);

    if (error) {
      handleDbError(error, "updatePaymentRequestStatus");
      return false;
    }
    return true;
  } catch (e) {
    console.error("Exception updatePaymentRequestStatus", e);
    return false;
  }
};

export const updatePaymentRequestPixKey = async (
  requestId: string,
  newPixKey: string
): Promise<boolean> => {
  const { error } = await supabase
    .from('payment_requests')
    .update({ pix_key: newPixKey })
    .eq('id', requestId);

  if (error) {
    handleDbError(error, "updatePaymentRequestPixKey");
    return false;
  }
  return true;
};


export const fetchAllWalletTransactions = async (): Promise<WalletTransaction[]> => {
  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('*, user:user_id(username, avatar_url, phone, whatsapp)')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    handleDbError(error, "fetchAllWalletTransactions");
    return [];
  }
  return data as any[];
};

export const fetchStoreProducts = async (): Promise<StoreProduct[]> => {
  const { data, error } = await supabase
    .from('store_products')
    .select('*')
    .eq('active', true)
    .order('created_at', { ascending: false });

  if (error) {
    handleDbError(error, "fetchStoreProducts");
    return [];
  }
  return data as StoreProduct[];
};

export const addCoinsToUser = async (userId: string, coins: number, description: string): Promise<{ success: boolean; message?: string }> => {
  try {
    // 1. Increment coins using a secure RPC (Function) to avoid RLS/mapping issues
    const { data: newBalance, error: rpcError } = await supabase
      .rpc('increment_coins', {
        user_id_param: userId,
        amount_param: coins
      });

    if (rpcError) {
      console.error("[addCoins] RPC Error:", rpcError);

      // Fallback: Tentativa direta se a RPC não existir
      const { data: user, error: fetchError } = await supabase.from('profiles').select('wallet_coins').eq('id', userId).single();

      if (fetchError) {
        return { success: false, message: `Erro ao buscar saldo (Possível falta da coluna wallet_coins): ${fetchError.message}` };
      }

      const currentCoins = Number(user?.wallet_coins || 0);
      const { error: upError } = await supabase.from('profiles').update({ wallet_coins: currentCoins + coins }).eq('id', userId);

      if (upError) {
        return { success: false, message: `Erro ao atualizar saldo (Fallback): ${upError.message}` };
      }
    }

    // 2. Record the transaction (Histórico)
    const { error: txError } = await supabase.from('wallet_transactions').insert({
      user_id: userId,
      type: 'earning',
      amount_coins: coins,
      description
    });

    if (txError) {
      console.warn("Transação de histórico falhou, mas saldo foi atualizado", txError);
      // Não retornamos false aqui pois o saldo JÁ foi dado.
    }

    console.log(`[addCoins] Sucesso para usuário ${userId}`);
    return { success: true };
  } catch (e: any) {
    console.error("[addCoins] Exception:", e);
    return { success: false, message: `Exceção: ${e.message || String(e)}` };
  }
};

export const purchaseStoreProduct = async (userId: string, product: StoreProduct, paymentType: 'coins' | 'pix' | 'card'): Promise<{ success: boolean, message: string }> => {
  try {
    // 1. Buscar dados do usuário e do produto atualizados
    const { data: user } = await supabase.from('profiles').select('wallet_coins').eq('id', userId).single();
    const { data: currentProduct } = await supabase.from('store_products').select('stock, active').eq('id', product.id).single();

    if (!currentProduct || !currentProduct.active) {
      return { success: false, message: "Produto não disponível no momento." };
    }

    if (currentProduct.stock <= 0) {
      return { success: false, message: "Produto esgotado!" };
    }

    if (paymentType === 'coins') {
      if ((user?.wallet_coins || 0) < product.price_coins) {
        return { success: false, message: "Moedas insuficientes!" };
      }

      // Decrementar moedas e estoque
      await supabase.from('profiles').update({ wallet_coins: (user?.wallet_coins || 0) - product.price_coins }).eq('id', userId);
      await supabase.from('store_products').update({ stock: currentProduct.stock - 1 }).eq('id', product.id);

      await supabase.from('wallet_transactions').insert({
        user_id: userId,
        type: 'purchase',
        amount_coins: -product.price_coins,
        description: `Compra (Moedas): ${product.name}`
      });

      // Registrar Pedido
      await supabase.from('store_orders').insert({
        user_id: userId,
        product_id: product.id,
        status: 'pending',
        payment_method: 'coins',
        amount_coins: product.price_coins,
        amount_money: 0
      });

      return { success: true, message: "Resgate realizado com sucesso! Verifique seu histórico." };
    } else {
      // Para PIX ou CARTÃO, esta função é chamada após a confirmação do pagamento externo

      // Decrementar estoque (Moedas já foram pagas externamente)
      await supabase.from('store_products').update({ stock: currentProduct.stock - 1 }).eq('id', product.id);

      await supabase.from('wallet_transactions').insert({
        user_id: userId,
        type: 'purchase',
        amount_money: product.price_brl,
        description: `Compra via ${paymentType.toUpperCase()}: ${product.name}`
      });

      // Registrar Pedido
      await supabase.from('store_orders').insert({
        user_id: userId,
        product_id: product.id,
        status: 'pending',
        payment_method: paymentType,
        amount_coins: 0,
        amount_money: product.price_brl
      });

      return { success: true, message: `Pagamento ${paymentType.toUpperCase()} confirmado! Seu pedido foi registrado.` };
    }
  } catch (e) {
    handleDbError(e, "purchaseStoreProduct");
    return { success: false, message: "Erro ao processar compra. Tente novamente." };
  }
};

export const fetchStoreOrders = async (): Promise<StoreOrder[]> => {
  const { data, error } = await supabase
    .from('store_orders')
    .select('*, product:store_products(*), user:profiles(*)')
    .order('created_at', { ascending: false });

  if (error) {
    handleDbError(error, "fetchStoreOrders");
    return [];
  }
  return data as any as StoreOrder[];
};

export const updateStoreOrderStatus = async (orderId: string, status: 'delivered'): Promise<boolean> => {
  const { error } = await supabase
    .from('store_orders')
    .update({
      status,
      delivered_at: status === 'delivered' ? new Date().toISOString() : null
    })
    .eq('id', orderId);

  if (error) {
    handleDbError(error, "updateStoreOrderStatus");
    return false;
  }
  return true;
};


export const payDriverBalance = async (driverId: string, amount: number): Promise<boolean> => {
  try {
    // RPC atômica (chegoja.decrement_financial_balance_if_available): faz o
    // check de saldo suficiente e o débito num único UPDATE no banco, evitando
    // a corrida de "ler saldo em JS, escrever de volta" que fazia dois débitos
    // concorrentes se sobrescreverem (um deles simplesmente desaparecia).
    const { data: success, error } = await supabase.rpc('decrement_financial_balance_if_available', {
      user_id_param: driverId,
      amount_param: amount
    });

    if (error || !success) return false;

    await supabase.from('wallet_transactions').insert({
      user_id: driverId,
      type: 'payout',
      amount_money: -amount,
      description: 'Resgate de saldo / Pagamento recebido'
    });

    return true;
  } catch (e) {
    return false;
  }
};

export const updateDriverBalanceForCoupon = async (driverId: string, amount: number, rideId: string): Promise<boolean> => {
  try {
    // RPC atômica (chegoja.increment_financial_balance): incrementa direto no
    // banco (financial_balance = financial_balance + amount_param) em vez de
    // ler o saldo em JS e escrever de volta - essa versão antiga perdia
    // crédito quando duas corridas com cupom terminavam quase juntas (as duas
    // liam o mesmo saldo antigo e a segunda escrita sobrescrevia a primeira).
    const { error } = await supabase.rpc('increment_financial_balance', {
      user_id_param: driverId,
      amount_param: amount
    });

    if (error) {
      console.error('[Wallet] Error updating driver balance (RPC):', error);
      return false;
    }

    await supabase.from('wallet_transactions').insert({
      user_id: driverId,
      type: 'bonus',
      amount_money: amount,
      description: `Bônus Cupom: Corrida #${rideId.slice(0, 6)}`
    });
    return true;
  } catch (e) {
    console.error('[Wallet] Error updating driver balance:', e);
    return false;
  }
};

// Helper: Send Push Notification via Edge Function
const sendPushNotification = async (params: {
  title: string;
  body: string;
  targetType: 'user' | 'drivers' | 'all';
  targetUserId?: string;
  data?: Record<string, string>;
  sound?: string;
}): Promise<boolean> => {
  try {
    const { data, error } = await supabase.functions.invoke('send-notification', {
      body: params
    });

    if (error) {
      console.error('[Push] Error sending notification:', error);
      return false;
    }

    console.log('[Push] Notification sent successfully:', data);
    return true;
  } catch (e) {
    console.error('[Push] Exception sending notification:', e);
    return false;
  }
};

export const createDispatchRide = async (dispatchData: any): Promise<{ ride: Ride | null, success: boolean, message: string }> => {
  try {
    // Se não houver motorista selecionado, é broadcast por padrão
    const isBroadcast = dispatchData.selectedDriverId ? !!dispatchData.isBroadcast : true;

    // SEMPRE usar 'searching' para que o app do motorista mostre a tela de chamada (incomingRide)
    // O driver_id preenchido indica que é direcionada (só aquele motorista vê)
    // Usar 'accepted' fazia o fetchActiveRide carregar como corrida ativa, pulando a tela de chamada
    const initialStatus = 'searching';

    const { data, error } = await supabase
      .from('rides')
      .insert([{
        client_id: '11111111-1111-1111-1111-111111111111',
        status: initialStatus,
        driver_id: dispatchData.selectedDriverId || null,
        vehicle_type: dispatchData.vehicleType,
        origin_lat: dispatchData.originLat,
        origin_lng: dispatchData.originLng,
        origin_address: dispatchData.originAddress,
        destination_lat: dispatchData.destinationLat,
        destination_lng: dispatchData.destinationLng,
        destination_address: dispatchData.destinationAddress,
        estimated_price: dispatchData.estimatedPrice,
        is_broadcast: isBroadcast,
        is_direct: !!dispatchData.selectedDriverId,
        last_driver_offered_at: dispatchData.selectedDriverId ? new Date().toISOString() : null,
        created_at: new Date().toISOString() // Force updated timestamp for ordering
      }])
      .select()
      .single();

    if (error) throw error;

    const createdRide = data as Ride;

    // NOVO: Enviar Push Notification
    const notificationTitle = dispatchData.selectedDriverId
      ? '📞 CENTRAL: Nova Corrida Direcionada!'
      : '🚗 Nova Corrida Disponível!';

    const notificationBody = `De: ${dispatchData.originAddress.substring(0, 40)}...\nPara: ${dispatchData.destinationAddress.substring(0, 40)}...\nValor: R$ ${dispatchData.estimatedPrice.toFixed(2)}`;

    const pushParams = {
      title: notificationTitle,
      body: notificationBody,
      targetType: dispatchData.selectedDriverId ? 'user' as const : 'drivers' as const,
      targetUserId: dispatchData.selectedDriverId || undefined,
      location: { lat: dispatchData.originLat, lng: dispatchData.originLng }, // Geographic filtering for max 15km radius
      data: {
        type: 'new_ride',
        ride_id: createdRide.id,
        is_direct: dispatchData.selectedDriverId ? 'true' : 'false',
        vehicle_type: dispatchData.vehicleType // Enviar tipo de veículo para ajudar na filtragem cliente-side se necessário
      },
      sound: 'ubb' // Som especial para corridas
    };

    // Enviar notificação (não bloqueante)
    sendPushNotification(pushParams).catch(err => {
      console.warn('[Dispatch] Push notification failed (non-critical):', err);
    });

    let msg = "Procurando motoristas...";
    if (dispatchData.selectedDriverId) msg = "Chamada enviada ao motorista selecionado. Notificação push disparada!";
    if (isBroadcast) msg = "Corrida disparada para TODOS os motoristas! Notificações enviadas.";

    return {
      ride: createdRide,
      success: true,
      message: msg
    };
  } catch (e: any) {
    const errorMsg = handleDbError(e, "createDispatchRide");
    return { ride: null, success: false, message: errorMsg };
  }
};

export const fetchAllRides = async (limit = 500): Promise<Ride[]> => {
  try {
    // Limite explícito para evitar truncamento silencioso do PostgREST
    // (o padrão PGRST_DB_MAX_ROWS pode ser 1000; sem .limit() o comportamento varia).
    // 500 cobre o monitor admin sem penalizar a performance.
    // Para histórico completo, use paginação com .range().
    const { data, error } = await supabase
      .from('rides')
      .select('*, driver:driver_id(*), client:client_id(*)')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data as Ride[];
  } catch (e) {
    handleDbError(e, "fetchAllRides");
    return [];
  }
};


/**
 * SISTEMA DE PREMIAÇÃO E RANKING SEMANAL
 */

export const fetchRewardsConfig = async (): Promise<RewardsConfig | null> => {
  try {
    const { data, error } = await supabase
      .from('rewards_config')
      .select('*')
      .eq('id', 1)
      .single();
    if (error) throw error;
    return data as RewardsConfig;
  } catch (e) {
    handleDbError(e, "fetchRewardsConfig");
    return null;
  }
};

export const updateRewardsConfig = async (updates: Partial<Omit<RewardsConfig, 'id' | 'updated_at'>>): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('rewards_config')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', 1);
    if (error) throw error;
    return true;
  } catch (e) {
    handleDbError(e, "updateRewardsConfig");
    return false;
  }
};

export const fetchRewardTiers = async (): Promise<RewardTier[]> => {
  try {
    const { data, error } = await supabase
      .from('reward_tiers')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });
    if (error) throw error;
    return (data || []) as RewardTier[];
  } catch (e) {
    handleDbError(e, "fetchRewardTiers");
    return [];
  }
};

export const fetchAllRewardTiers = async (): Promise<RewardTier[]> => {
  try {
    const { data, error } = await supabase
      .from('reward_tiers')
      .select('*')
      .order('display_order', { ascending: true });
    if (error) throw error;
    return (data || []) as RewardTier[];
  } catch (e) {
    handleDbError(e, "fetchAllRewardTiers");
    return [];
  }
};

export const upsertRewardTier = async (tier: Partial<RewardTier>): Promise<{ ok: boolean; errorMsg?: string }> => {
  try {
    const { error } = await supabase
      .from('reward_tiers')
      .upsert(tier, { onConflict: 'id' });
    if (error) return { ok: false, errorMsg: error.message };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, errorMsg: e?.message || String(e) };
  }
};

export const deleteRewardTier = async (id: string): Promise<{ ok: boolean; errorMsg?: string }> => {
  try {
    const { error } = await supabase
      .from('reward_tiers')
      .delete()
      .eq('id', id);
    if (error) return { ok: false, errorMsg: error.message };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, errorMsg: e?.message || String(e) };
  }
};

export const fetchWeeklyDriverRanking = async (limit = 10): Promise<DriverRankingEntry[]> => {
  try {
    const { data, error } = await supabase.rpc('get_weekly_driver_ranking', { limit_count: limit });
    if (error) throw error;
    return (data || []) as DriverRankingEntry[];
  } catch (e) {
    handleDbError(e, "fetchWeeklyDriverRanking");
    return [];
  }
};

export const fetchDriverWeeklyRides = async (driverId: string): Promise<number> => {
  try {
    const { data, error } = await supabase.rpc('get_driver_weekly_rides', { driver_id_param: driverId });
    if (error) throw error;
    return Number(data) || 0;
  } catch (e) {
    handleDbError(e, "fetchDriverWeeklyRides");
    return 0;
  }
};

/**
 * ADMIN: RELATÓRIO DE DESEMPENHO DE MOTORISTAS
 * Corridas recebidas (mesmo critério anti-fraude da premiação: só corrida de
 * cliente ou admin), saldo e tempo online desde `periodStart` - tudo num só
 * lugar pra facilitar identificar quem realmente está trabalhando.
 */
export interface DriverPerformanceEntry {
  driver_id: string;
  username: string;
  avatar_url: string | null;
  vehicle_type: string;
  is_approved: boolean;
  status: string;
  financial_balance: number;
  wallet_coins: number;
  rides_count: number;
  online_seconds: number;
}

export const fetchDriverPerformanceReport = async (periodStart: Date): Promise<DriverPerformanceEntry[]> => {
  try {
    const { data, error } = await supabase.rpc('get_driver_performance_report', {
      period_start: periodStart.toISOString()
    });
    if (error) throw error;
    return (data || []).map((d: any) => ({
      ...d,
      financial_balance: Number(d.financial_balance) || 0,
      wallet_coins: Number(d.wallet_coins) || 0,
      rides_count: Number(d.rides_count) || 0,
      online_seconds: Number(d.online_seconds) || 0,
    }));
  } catch (e) {
    handleDbError(e, "fetchDriverPerformanceReport");
    return [];
  }
};

/**
 * ADMIN: GESTÃO DE PRODUTOS (STORE MANAGEMENT)
 */

export const createStoreProduct = async (product: Partial<StoreProduct>): Promise<string | null> => {
  const { error } = await supabase
    .from('store_products')
    .insert([product]);

  if (error) {
    return handleDbError(error, "createStoreProduct");
  }
  return null;
};

export const updateStoreProduct = async (productId: string, updates: Partial<StoreProduct>): Promise<string | null> => {
  const { error } = await supabase
    .from('store_products')
    .update(updates)
    .eq('id', productId);

  if (error) {
    return handleDbError(error, "updateStoreProduct");
  }
  return null;
};

export const deleteStoreProduct = async (productId: string): Promise<string | null> => {
  const { error } = await supabase
    .from('store_products')
    .delete()
    .eq('id', productId);

  if (error) {
    return handleDbError(error, "deleteStoreProduct");
  }
  return null;
};

export const uploadStoreProductImage = async (file: File): Promise<string | null> => {
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
    const filePath = `products/${fileName}`;

    // Upload to 'chat-media' bucket (reusing existing public bucket)
    const { error: uploadError } = await supabase.storage
      .from('chat-media')
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from('chat-media')
      .getPublicUrl(filePath);

    return data.publicUrl;
  } catch (error) {
    console.error('Error uploading product image:', error);
    return null;
  }
};

/**
 * DINAMIC PRICING UTILITIES
 */

export const getTariffForTime = (settings: AppSettings, vehicleType: 'car' | 'motorcycle') => {
  const now = new Date();
  const hours = now.getHours();

  // Dawn: 00:00 - 05:00
  if (hours >= 0 && hours < 5) {
    if (vehicleType === 'car') {
      return {
        base: settings.dawn_car_base_price || settings.car_base_price,
        perKm: settings.dawn_car_price_km || settings.car_price_km,
        perMin: settings.dawn_car_price_min || settings.car_price_min,
        label: "Madrugada"
      };
    } else {
      return {
        base: settings.dawn_moto_base_price || settings.moto_base_price,
        perKm: settings.dawn_moto_price_km || settings.moto_price_km,
        perMin: settings.dawn_moto_price_min || settings.moto_price_min,
        label: "Madrugada"
      };
    }
  }

  // Night: 20:00 - 23:59
  if (hours >= 20 && hours <= 23) {
    if (vehicleType === 'car') {
      return {
        base: settings.night_car_base_price || settings.car_base_price,
        perKm: settings.night_car_price_km || settings.car_price_km,
        perMin: settings.night_car_price_min || settings.car_price_min,
        label: "Noite"
      };
    } else {
      return {
        base: settings.night_moto_base_price || settings.moto_base_price,
        perKm: settings.night_moto_price_km || settings.moto_price_km,
        perMin: settings.night_moto_price_min || settings.moto_price_min,
        label: "Noite"
      };
    }
  }

  // Standard
  if (vehicleType === 'car') {
    return {
      base: settings.car_base_price,
      perKm: settings.car_price_km,
      perMin: settings.car_price_min,
      label: "Padrão"
    };
  } else {
    return {
      base: settings.moto_base_price,
      perKm: settings.moto_price_km,
      perMin: settings.moto_price_min,
      label: "Padrão"
    };
  }
};

/**
 * ADMIN: ADVANCED DISPATCH
 */

export const findAndAssignNextDriver = async (rideId: string, currentDriverId: string): Promise<boolean> => {
  try {
    // 1. Get current ride to see ignored drivers and if it is DIRECT
    const { data: ride, error: rideError } = await supabase
      .from('rides')
      .select('*')
      .eq('id', rideId)
      .single();

    if (rideError || !ride) return false;

    // --- LÓGICA DE CHAMADA DIRETA ---
    // Se for uma chamada direta e o motorista rejeitou (ou timeout), NÃO passamos para outro.
    // Encerramos a busca e avisamos que foi cancelada/rejeitada.
    if (ride.is_direct) {
      console.log("[FindNext] Chamada direta rejeitada. Cancelando corrida.");
      await supabase.from('rides').update({
        status: 'cancelled',
        driver_id: null // Limpa o driver ID para que não pareça que ele "cancelou" depois de aceitar
      }).eq('id', rideId);
      return false;
    }


    // Convert to array of strings (UUIDs)
    const ignored: string[] = Array.isArray(ride.ignored_drivers) ? ride.ignored_drivers : [];
    if (currentDriverId && !ignored.includes(currentDriverId)) {
      ignored.push(currentDriverId);
    }

    // Helper function to try finding a driver within a radius
    const attemptFindDriver = async (radiusKm: number): Promise<string | null> => {
      console.log(`[FindNext] Tentando encontrar motorista num raio de ${radiusKm}km...`);
      const { data, error } = await supabase.rpc('get_nearest_driver', {
        p_lat: ride.origin_lat,
        p_lng: ride.origin_lng,
        p_radius_km: radiusKm,
        p_vehicle_type: ride.vehicle_type,
        p_ignored_ids: ignored
      });

      if (error) {
        console.error(`[FindNext] Erro ao buscar motoristas (${radiusKm}km):`, error);
        return null;
      }

      if (data && data.length > 0) {
        return data[0].id; // Retorna ID do motorista encontrado
      }
      return null;
    };

    // TIERED SEARCH: 3km -> 5km -> 10km -> 15km
    let foundDriverId = await attemptFindDriver(3);
    if (!foundDriverId) foundDriverId = await attemptFindDriver(5);
    if (!foundDriverId) foundDriverId = await attemptFindDriver(10);
    if (!foundDriverId) foundDriverId = await attemptFindDriver(15);

    if (foundDriverId) {
      // Assign to next - STATUS SEARCHING para o cliente ver "Procurando"
      await supabase
        .from('rides')
        .update({
          driver_id: foundDriverId,
          status: 'searching', // <--- Mantém status searching
          ignored_drivers: ignored,
          last_driver_offered_at: new Date().toISOString()
        })
        .eq('id', rideId);

      console.log(`[FindNext] Motorista encontrado: ${foundDriverId}`);
      return true;
    } else {
      // No more drivers available within 10km
      // RETRY LOGIC
      const currentAttempts = (ride as any).search_attempts || 0;
      const MAX_ATTEMPTS = 5; // Tenta 5 vezes (aprox. 25-30s antes de cancelar)

      if (currentAttempts < MAX_ATTEMPTS) {
        console.log(`[FindNext] Nenhum motorista encontrado. Tentativa ${currentAttempts + 1}/${MAX_ATTEMPTS}. Retrying next cycle...`);
        // Atualiza tentativas mas MANTÉM status 'searching' e driver_id nulo
        await supabase
          .from('rides')
          .update({
            search_attempts: currentAttempts + 1
          })
          .eq('id', rideId);

        return false;
      } else {
        // Esgotou tentativas - CANCELAR a corrida
        console.log("[FindNext] Nenhum motorista disponível após várias tentativas. Cancelando corrida.");
        await supabase
          .from('rides')
          .update({
            driver_id: null,
            status: 'cancelled',
            ignored_drivers: ignored
          })
          .eq('id', rideId);
        return false;
      }
    }
  } catch (e) {
    console.error("Error in findAndAssignNextDriver:", e);
    return false;
  }
};
